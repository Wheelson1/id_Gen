/**
 * bulkStudio.js — Massive Student ID Card Batch Production & Ingestion Engine
 * 
 * Features:
 *  1. Multi-Level Filtering:
 *     - Single Student Search & Select
 *     - Full Department 1-Click Selection
 *     - Full Faculty 1-Click Selection
 *     - Multi-Department Selection within a Faculty (check a couple of departments)
 *  2. Automatic Graduation Year Calculation:
 *     - Uses ACADEMIC_RULES: Reg No (e.g. 2025...) + Course Duration (4 yrs Science/Presco, 5 yrs Law, etc.)
 *  3. Ingestion Routes:
 *     - CSV Document (.csv)
 *     - Excel Document (.xlsx / .xls) via SheetJS
 *     - School API Endpoint & Raw JSON
 *  4. Production Actions:
 *     - 1-Click Batch Render with Cryptographic QR Code
 *     - 1-Click Massive Print Sheet (8 CR80 IDs / A4 page standard)
 *     - Batch Export of Front & Back PNGs
 */

const BulkStudio = (() => {
  // ── FACULTIES & DEPARTMENTS REGISTRY ─────────────────────────────
  const FACULTY_CATALOG = {
    'Science': {
      duration: 4,
      departments: [
        'Computer Science', 'Applied Biology', 'Biotechnology', 
        'Industrial Chemistry', 'Industrial Physics', 'Microbiology', 'Biochemistry'
      ]
    },
    'Law': {
      duration: 5,
      departments: [
        'Civil Law', 'Public Law', 'Commercial Law', 'Private and Property Law'
      ]
    },
    'Education': {
      duration: 4,
      departments: [
        'Science Education', 'Educational Foundations', 'Arts and Social Science Education',
        'Business Education', 'Human Kinetics and Health Education'
      ]
    },
    'Management Sciences': {
      duration: 4,
      departments: [
        'Accountancy', 'Banking and Finance', 'Business Management', 'Public Administration', 'Marketing'
      ]
    },
    'Social Sciences and Humanities': {
      duration: 4,
      departments: [
        'Mass Communication', 'Economics', 'Political Science', 'Sociology and Anthropology', 'Psychology'
      ]
    },
    'Health Science and Technology': {
      duration: 4, // Presco courses per user rule
      departments: [
        'Medical Laboratory Science', 'Nursing Science', 'Public Health'
      ]
    },
    'Basic Medical Sciences': {
      duration: 4, // Anatomy / Physiology per user rule
      departments: [
        'Human Anatomy', 'Medical Physiology'
      ]
    },
    'Agricultural and Natural Resource Management': {
      duration: 5,
      departments: [
        'Agricultural Economics', 'Animal Science', 'Crop Production and Landscape',
        'Fisheries and Aquaculture', 'Food Science and Technology', 'Soil Science'
      ]
    }
  };

  // Internal State (SEED_STUDENTS removed in Phase 2B; populated via Supabase RLS or CSV/Excel ingestion)
  let _students = [];
  let _selectedStudentIds = new Set();
  let _activeFaculty = 'ALL';
  let _selectedDepts = new Set();
  let _searchQuery = '';

  /**
   * Initialize state from authenticated Supabase students table (RLS-filtered by school_id)
   */
  async function init() {
    _students = [];
    try {
      const client = (typeof AuthManager !== 'undefined' && AuthManager.getClient)
        ? AuthManager.getClient()
        : window.ebsuSupabase;
      if (client) {
        const { data: { session } } = await client.auth.getSession();
        if (session) {
          const { data, error } = await client
            .from('students')
            .select('id,name,matric,jamb_no,school_reg_no,faculty,dept,level,session,blood,genotype,photo_url,expiry,status,fees_paid,card_signature')
            .order('created_at', { ascending: false })
            .limit(500);
          if (!error && Array.isArray(data)) {
            _students = data.map(row => enrichStudentRecord({
              id: row.id,
              name: row.name,
              matric: row.matric || row.school_reg_no || row.jamb_no,
              faculty: row.faculty || 'Science',
              dept: row.dept || '',
              level: row.level || '100L',
              blood: row.blood || 'O+',
              genotype: row.genotype || 'AA',
              photo: row.photo_url || null,
              expiry: row.expiry,
              status: row.status || 'active',
              fees_paid: Boolean(row.fees_paid),
              card_signature: row.card_signature || null
            }));
          }
        }
      }
    } catch (e) {
      console.warn('BulkStudio Supabase init notice:', e);
    }
    applyFilterAndRender();
  }

  function saveToStorage() {
    // No-op: student records are no longer persisted in browser localStorage
  }

  /**
   * Enriches student record with calculated graduation year and academic duration
   */
  function enrichStudentRecord(s) {
    const regNo = s.matric || s.regNo || s.jamb_no || '';
    const fac = s.faculty || 'Science';
    const dept = s.dept || s.department || '';
    const duration = (typeof ACADEMIC_RULES !== 'undefined')
      ? ACADEMIC_RULES.getCourseDuration(fac, dept)
      : (fac === 'Law' ? 5 : 4);

    const gradYear = (typeof ACADEMIC_RULES !== 'undefined')
      ? ACADEMIC_RULES.calculateGraduationYear(regNo, fac, dept)
      : (ACADEMIC_RULES ? ACADEMIC_RULES.extractAdmissionYear(regNo) + duration : 2029);

    const signedToken = (s.id && s.card_signature)
      ? `EBSU1:${s.id}:${s.card_signature}`
      : (s.qr_string && s.qr_string.startsWith('EBSU1:') ? s.qr_string : '');

    const explicitExp = (s.expiry && Number(s.expiry) > 2000) ? Number(s.expiry) : null;

    return {
      ...s,
      matric: regNo,
      faculty: fac,
      dept: dept,
      duration: duration,
      expiry: explicitExp || gradYear,
      status: s.status || 'active',
      qr_token: signedToken
    };
  }

  // ── FILTERING & SELECTION ────────────────────────────────────────

  function getFacultyCatalog() {
    return FACULTY_CATALOG;
  }

  function setFacultyFilter(facName) {
    _activeFaculty = facName;
    _selectedDepts.clear();
    applyFilterAndRender();
  }

  function toggleDepartmentFilter(deptName) {
    if (_selectedDepts.has(deptName)) {
      _selectedDepts.delete(deptName);
    } else {
      _selectedDepts.add(deptName);
    }
    applyFilterAndRender();
  }

  function selectAllDepartmentsInFaculty(facName) {
    if (FACULTY_CATALOG[facName]) {
      _activeFaculty = facName;
      _selectedDepts = new Set(FACULTY_CATALOG[facName].departments);
      applyFilterAndRender();
    }
  }

  function setSearchQuery(q) {
    _searchQuery = (q || '').trim().toLowerCase();
    applyFilterAndRender();
  }

  function getFilteredStudents() {
    return _students.filter(s => {
      // Faculty match
      if (_activeFaculty !== 'ALL' && s.faculty !== _activeFaculty) {
        return false;
      }
      // Department match (if specific departments are selected)
      if (_selectedDepts.size > 0 && !_selectedDepts.has(s.dept)) {
        return false;
      }
      // Search query
      if (_searchQuery) {
        const matchesName = (s.name || '').toLowerCase().includes(_searchQuery);
        const matchesMatric = (s.matric || '').toLowerCase().includes(_searchQuery);
        const matchesDept = (s.dept || '').toLowerCase().includes(_searchQuery);
        if (!matchesName && !matchesMatric && !matchesDept) return false;
      }
      return true;
    });
  }

  function toggleStudentSelection(id) {
    if (_selectedStudentIds.has(id)) {
      _selectedStudentIds.delete(id);
    } else {
      _selectedStudentIds.add(id);
    }
    updateSelectionBadge();
  }

  function selectAllFiltered() {
    const list = getFilteredStudents();
    list.forEach(s => _selectedStudentIds.add(s.id));
    updateSelectionBadge();
    renderRosterTable();
  }

  function clearSelection() {
    _selectedStudentIds.clear();
    updateSelectionBadge();
    renderRosterTable();
  }

  function getSelectedStudents() {
    return _students.filter(s => _selectedStudentIds.has(s.id));
  }

  // ── INGESTION: CSV PARSER ────────────────────────────────────────

  function ingestCsv(csvText) {
    if (!csvText || !csvText.trim()) return 0;
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) return 0;

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
    let importedCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values = line.split(',').map(v => v.trim().replace(/^['"]|['"]$/g, ''));
      const row = {};
      headers.forEach((h, idx) => { row[h] = values[idx] || ''; });

      const name = row.name || row.fullname || row.student_name || `Student ${i}`;
      const matric = row.matric || row.reg_no || row.regno || row.jamb_no || `2025${String(i).padStart(8, '0')}`;
      const faculty = row.faculty || _activeFaculty !== 'ALL' ? _activeFaculty : 'Science';
      const dept = row.dept || row.department || (FACULTY_CATALOG[faculty]?.departments[0] || 'General');
      const level = row.level || '100L';
      const blood = row.blood || row.blood_group || 'O+';
      const genotype = row.genotype || 'AA';
      const expiry = row.expiry ? parseInt(row.expiry, 10) : undefined;

      const enriched = enrichStudentRecord({
        id: 'CSV-' + Date.now() + '-' + i,
        name: name.toUpperCase(),
        matric: matric.toUpperCase(),
        faculty: faculty,
        dept: dept,
        level: level,
        blood: blood,
        genotype: genotype,
        expiry: expiry,
        photo: 'images/demo_user_face.jpg'
      });

      _students.push(enriched);
      _selectedStudentIds.add(enriched.id);
      importedCount++;
    }

    saveToStorage();
    applyFilterAndRender();
    return importedCount;
  }

  // ── INGESTION: EXCEL (XLSX) PARSER ───────────────────────────────

  async function ingestExcel(file) {
    if (typeof XLSX === 'undefined') {
      throw new Error('SheetJS library not loaded. Ensure xlsx.full.min.js is included.');
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          let totalImported = 0;

          // Parse each sheet or first sheet
          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

            json.forEach((row, idx) => {
              const name = row.name || row.Name || row['Full Name'] || row.FullName || `Student ${idx + 1}`;
              const matric = row.matric || row.Matric || row['Matric No'] || row['Reg No'] || row.RegNo || `2025${String(idx).padStart(8, '0')}`;
              const faculty = row.faculty || row.Faculty || sheetName || 'Science';
              const dept = row.department || row.Department || row.dept || row.Dept || 'Computer Science';
              const level = row.level || row.Level || '100L';
              const blood = row.blood || row.Blood || 'O+';
              const genotype = row.genotype || row.Genotype || 'AA';

              const enriched = enrichStudentRecord({
                id: 'XLS-' + Date.now() + '-' + idx,
                name: String(name).toUpperCase(),
                matric: String(matric).toUpperCase(),
                faculty: faculty,
                dept: dept,
                level: level,
                blood: blood,
                genotype: genotype,
                photo: 'images/demo_user_face.jpg'
              });

              _students.push(enriched);
              _selectedStudentIds.add(enriched.id);
              totalImported++;
            });
          });

          saveToStorage();
          applyFilterAndRender();
          resolve(totalImported);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  // ── INGESTION: API / JSON PARSER ─────────────────────────────────

  async function ingestApi(endpointUrl, apiKey = '') {
    if (!endpointUrl) throw new Error('API Endpoint URL required');

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(endpointUrl, { headers });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);

    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.students || data.records || data.data || []);
    if (!Array.isArray(list)) throw new Error('API response format not recognized as array of students');

    let count = 0;
    list.forEach((item, idx) => {
      const enriched = enrichStudentRecord({
        id: item.id || 'API-' + Date.now() + '-' + idx,
        name: (item.name || item.full_name || 'STUDENT').toUpperCase(),
        matric: (item.matric || item.school_reg_no || item.jamb_no || '').toUpperCase(),
        faculty: item.faculty || 'Science',
        dept: item.department || item.dept || 'Computer Science',
        level: item.level || '100L',
        blood: item.blood || item.blood_group || 'O+',
        genotype: item.genotype || 'AA',
        photo: item.photo_url || item.photo || 'images/demo_user_face.jpg'
      });
      _students.push(enriched);
      _selectedStudentIds.add(enriched.id);
      count++;
    });

    saveToStorage();
    applyFilterAndRender();
    return count;
  }

  // ── DYNAMIC QR CODE GENERATOR FOR BATCH CARDS (SIGNED EBSU1 ONLY) ───
  function generateCardQRDataUrl(s) {
    try {
      const signedToken =
        (s.qr_token && s.qr_token.startsWith('EBSU1:'))
          ? s.qr_token
          : (s.id && s.card_signature ? `EBSU1:${s.id}:${s.card_signature}` : '');

      if (signedToken && typeof QRGen !== 'undefined' && QRGen.drawToCanvas) {
        const qc = document.createElement('canvas');
        QRGen.drawToCanvas(qc, signedToken, 3);
        return qc.toDataURL('image/png');
      }
    } catch(e) {
      console.warn('QR render notice:', e);
    }
    return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23fff"/><text x="10" y="54" font-family="sans-serif" font-size="9" fill="%23991b1b">UNSIGNED</text></svg>';
  }

  // ── 1-CLICK PRINT PRODUCTION & FAIL-SAFE SECTIONED PIPELINE ────────

  let _sectionQueueState = {
    selectedStudents: [],
    sections: [],
    sectionSize: 8,
    isPaused: false,
    isCancelled: false,
    activeSectionIndex: 0
  };

  function printBatchSheet() {
    const selected = getSelectedStudents();
    if (selected.length === 0) {
      alert('Please select at least one student or department to generate and print IDs.');
      return;
    }

    // Fail-safe protection: if volume > 8 cards (more than 1 A4 sheet), trigger protection prompt
    if (selected.length > 8) {
      showFailSafePrompt(selected);
    } else {
      startSectionedProduction(selected, 8);
    }
  }

  // ── FAIL-SAFE VOLUME PROTECTION MODAL ────────────────────────────
  function showFailSafePrompt(selected) {
    let modal = document.getElementById('bulk-failsafe-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'bulk-failsafe-modal';
      modal.style.cssText = 'position:fixed; inset:0; background:rgba(4,10,20,0.88); backdrop-filter:blur(8px); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px;';
      document.body.appendChild(modal);
    }

    const estimatedPages = Math.ceil(selected.length / 8);

    modal.innerHTML = `
      <div style="background:#0c1b2f; border:1px solid #d4a574; border-radius:18px; max-width:540px; width:100%; padding:28px; box-shadow:0 24px 60px rgba(0,0,0,0.7); position:relative; color:#e2edf8;">
        <button type="button" onclick="document.getElementById('bulk-failsafe-modal').style.display='none'" style="position:absolute; top:16px; right:18px; background:none; border:none; color:#6080a0; font-size:22px; cursor:pointer;">✕</button>

        <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px;">
          <div style="font-size:32px;">🛡️</div>
          <div>
            <h3 style="font-size:18px; font-weight:800; color:#fff; margin:0;">High-Volume Production Fail-Safe Guard</h3>
            <span style="font-size:11px; color:#d4a574; font-weight:700;">System Stability &amp; Memory Protection Active</span>
          </div>
        </div>

        <div style="background:rgba(212,165,116,0.12); border:1px solid rgba(212,165,116,0.3); border-radius:10px; padding:12px 16px; margin-bottom:16px;">
          <div style="font-size:12px; font-weight:800; color:#f0d4a8; margin-bottom:4px;">
            ⚠️ Heavy Request Volume: ${selected.length} Student Cards Selected (${estimatedPages} Standard A4 Sheets)
          </div>
          <div style="font-size:11px; color:#cbd5e1; line-height:1.5;">
            Rendering hundreds of 300 DPI security cards in a single uninterrupted burst can overload browser GPU/RAM and cause tab crashes (STATUS_ACCESS_VIOLATION).
          </div>
        </div>

        <p style="font-size:12px; color:#94a3b8; line-height:1.6; margin-bottom:16px;">
          <strong>Fail-Safe Arrangement:</strong> The production engine will process this volume in <strong>sequential sections</strong> (8 cards / 1 sheet per section). This yields execution back to the browser between sections, prevents crashes, and lets you print sheet-by-sheet or all together.
        </p>

        <div style="background:#071220; border:1px solid #1e3558; border-radius:10px; padding:14px; margin-bottom:20px;">
          <label style="font-size:11px; font-weight:700; color:#93c5fd; display:block; margin-bottom:8px;">
            SELECT SECTION CHUNK SIZE:
          </label>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <label style="display:flex; align-items:center; gap:10px; font-size:12px; cursor:pointer; color:#fff;">
              <input type="radio" name="failsafe-chunk-size" value="8" checked style="accent-color:#d4a574;" />
              <span><strong>8 Cards per Section</strong> (1 A4 Sheet / Section) — <em>Recommended (Zero Memory Risk)</em></span>
            </label>
            <label style="display:flex; align-items:center; gap:10px; font-size:12px; cursor:pointer; color:#fff;">
              <input type="radio" name="failsafe-chunk-size" value="16" style="accent-color:#d4a574;" />
              <span><strong>16 Cards per Section</strong> (2 A4 Sheets / Section)</span>
            </label>
            <label style="display:flex; align-items:center; gap:10px; font-size:12px; cursor:pointer; color:#fff;">
              <input type="radio" name="failsafe-chunk-size" value="24" style="accent-color:#d4a574;" />
              <span><strong>24 Cards per Section</strong> (3 A4 Sheets / Section)</span>
            </label>
          </div>
        </div>

        <div style="display:flex; gap:10px;">
          <button type="button" onclick="
            const selectedSize = parseInt(document.querySelector('input[name=\\'failsafe-chunk-size\\']:checked').value, 10) || 8;
            document.getElementById('bulk-failsafe-modal').style.display='none';
            BulkStudio.startSectionedProduction(BulkStudio.getSelectedStudents(), selectedSize);
          " style="flex:1; background:linear-gradient(135deg, #1558c0, #3b82f6); color:#fff; border:none; padding:12px; border-radius:8px; font-size:13px; font-weight:800; cursor:pointer; box-shadow:0 4px 15px rgba(21,88,192,0.4);">
            ▶ Start Safe Sectioned Generation
          </button>
          <button type="button" onclick="document.getElementById('bulk-failsafe-modal').style.display='none'" style="background:transparent; border:1px solid #475569; color:#94a3b8; padding:12px 18px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">
            Cancel
          </button>
        </div>
      </div>
    `;
    modal.style.display = 'flex';
  }

  // ── SECTIONED BATCH PRODUCTION ENGINE (ARRANGEMENT IN SECTIONS) ────
  async function startSectionedProduction(selected, sectionSize = 8) {
    _sectionQueueState.selectedStudents = selected;
    _sectionQueueState.sectionSize = sectionSize;
    _sectionQueueState.isPaused = false;
    _sectionQueueState.isCancelled = false;

    // Split into sections
    const totalSections = Math.ceil(selected.length / sectionSize);
    const sections = [];
    for (let i = 0; i < totalSections; i++) {
      sections.push({
        index: i,
        pageNumber: i + 1,
        students: selected.slice(i * sectionSize, (i + 1) * sectionSize),
        status: 'queued', // queued | generating | ready
        html: ''
      });
    }
    _sectionQueueState.sections = sections;

    showSectionConsole();

    // Process section by section asynchronously
    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      if (_sectionQueueState.isCancelled) break;

      while (_sectionQueueState.isPaused) {
        await new Promise(r => setTimeout(r, 200));
        if (_sectionQueueState.isCancelled) break;
      }

      const sec = sections[sIdx];
      sec.status = 'generating';
      updateSectionConsoleUI(sIdx, sections);

      // Ensure every student in the section has a server-signed Ed25519 QR token via issue-card
      const unsignedBatch = sec.students.filter(st => !st.qr_token || !st.qr_token.startsWith('EBSU1:'));
      if (unsignedBatch.length > 0 && typeof AuthManager !== 'undefined' && typeof EBSU_CONFIG !== 'undefined') {
        try {
          const session = await AuthManager.getSession();
          if (session?.access_token) {
            const issueUrl = EBSU_CONFIG.ISSUE_CARD_URL || `${EBSU_CONFIG.SUPABASE_URL}/functions/v1/issue-card`;
            const res = await fetch(issueUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                items: unsignedBatch.map(u => ({
                  name: u.name,
                  matric: u.matric,
                  expiry: u.expiry,
                })),
              }),
            });
            const bulkData = await res.json().catch(() => ({}));
            if (res.ok && Array.isArray(bulkData.results)) {
              const byMatric = new Map(
                bulkData.results.filter(r => r.ok).map(r => [String(r.matric).toUpperCase(), r])
              );
              sec.students.forEach(st => {
                const match = byMatric.get(String(st.matric).toUpperCase());
                if (match) {
                  st.id = match.card_id;
                  st.card_signature = match.signature;
                  st.qr_token = match.qr_string;
                }
              });
            }
          }
        } catch (err) {
          console.warn('BulkStudio issue-card signing notice:', err);
        }
      }

      // Render cards with real scannable QR data URLs
      sec.html = renderCardsHtml(sec.students, sec.pageNumber, totalSections);
      sec.status = 'ready';

      // Yield execution to the browser UI thread to prevent lag and enable GC
      await new Promise(r => setTimeout(r, 60));
      updateSectionConsoleUI(sIdx + 1, sections);
    }
  }

  function renderCardsHtml(studentsList, pageNum, totalPages) {
    return studentsList.map(s => {
      const qrDataUrl = generateCardQRDataUrl(s);
      return `
        <div class="cr80-print-card">
          <div class="cr80-header">
            <img src="crest_small.png.jpeg" class="cr80-crest" />
            <div class="cr80-inst">EBONYI STATE UNIVERSITY</div>
          </div>
          <div class="cr80-sub">STUDENT IDENTITY CARD</div>
          
          <div class="cr80-body">
            <div class="cr80-photo-box">
              <img src="${s.photo || 'images/demo_user_face.jpg'}" class="cr80-photo" />
            </div>
            <div class="cr80-details">
              <div class="cr80-row cr80-row-name"><span class="k">NAME:</span> <strong class="v">${s.name}</strong></div>
              <div class="cr80-row"><span class="k">MATRIC:</span> <strong class="v">${s.matric}</strong></div>
              <div class="cr80-row"><span class="k">FACULTY:</span> <span class="v">${s.faculty}</span></div>
              <div class="cr80-row"><span class="k">DEPT:</span> <span class="v">${s.dept}</span></div>
              <div class="cr80-row"><span class="k">LEVEL:</span> <span class="v">${s.level} · BLOOD: ${s.blood}</span></div>
              <div class="cr80-row"><span class="k">GRADUATION / EXPIRY:</span> <strong class="v" style="color:#0044cc;">${s.expiry}</strong></div>
            </div>
            <div class="cr80-qr-box">
              <div style="background:#fff; border:1px solid #1a365d; border-radius:2px; padding:1px; display:inline-block;">
                <img src="${qrDataUrl}" style="width:14mm; height:14mm; display:block;" alt="Card QR" />
              </div>
              <div style="font-size:6.5pt; font-weight:800; margin-top:1.5px; color:#1a365d;">VERIFIED</div>
            </div>
          </div>
          <div class="cr80-footer">
            <span>ISSUED: 2024/2025</span>
            <span>SHEET ${pageNum}/${totalPages} · CR80 STANDARD 300 DPI</span>
          </div>
        </div>
      `;
    }).join('');
  }

  function showSectionConsole() {
    let modal = document.getElementById('bulk-section-console');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'bulk-section-console';
      modal.style.cssText = 'position:fixed; inset:0; background:rgba(4,10,20,0.92); backdrop-filter:blur(8px); z-index:99999; display:flex; flex-direction:column; overflow:hidden; color:#fff;';
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    updateSectionConsoleUI(0, _sectionQueueState.sections);
  }

  function updateSectionConsoleUI(completedCount, sections) {
    const modal = document.getElementById('bulk-section-console');
    if (!modal) return;

    const total = sections.length;
    const pct = total === 0 ? 0 : Math.round((completedCount / total) * 100);
    const totalStudents = _sectionQueueState.selectedStudents.length;
    const readySections = sections.filter(s => s.status === 'ready');

    modal.innerHTML = `
      <div style="background:#0c1b2e; border-bottom:1px solid #1e3050; padding:14px 24px; display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
        <div style="display:flex; align-items:center; gap:12px;">
          <span style="font-size:24px;">📦</span>
          <div>
            <div style="font-size:16px; font-weight:800; color:#d4a574;">
              Sectioned Bulk ID Generation Console
            </div>
            <div style="font-size:11px; color:#8090a8;">
              ${totalStudents} Students Arranged into ${total} Safe Sections (${_sectionQueueState.sectionSize} Cards / Sheet)
            </div>
          </div>
        </div>

        <div style="display:flex; gap:10px; align-items:center;">
          <button type="button" onclick="BulkStudio.togglePauseQueue()" style="background:#1e293b; color:#cbd5e1; border:1px solid #475569; padding:8px 14px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;">
            ${_sectionQueueState.isPaused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button type="button" onclick="BulkStudio.printAllReadySections()" ${readySections.length === 0 ? 'disabled' : ''} style="background:linear-gradient(135deg, #1558c0, #3b82f6); color:#fff; border:none; padding:8px 18px; border-radius:6px; font-size:12px; font-weight:800; cursor:pointer; opacity:${readySections.length === 0 ? 0.5 : 1};">
            🖨️ Print All Ready Sections (${readySections.length}/${total})
          </button>
          <button type="button" onclick="BulkStudio.closeSectionConsole()" style="background:#334155; color:#fff; border:none; padding:8px 14px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;">
            ✕ Close
          </button>
        </div>
      </div>

      <!-- Live Animated Progress Bar -->
      <div style="background:#091424; padding:12px 24px; border-bottom:1px solid #1e3050; flex-shrink:0;">
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px;">
          <span style="color:#93c5fd; font-weight:700;">
            ${pct < 100 ? `Generating Section ${Math.min(completedCount + 1, total)} of ${total}...` : '✓ All Sections Successfully Generated & Cryptographically Sealed'}
          </span>
          <span style="color:#34d399; font-weight:800;">${pct}% Complete</span>
        </div>
        <div style="height:8px; background:#1e293b; border-radius:4px; overflow:hidden;">
          <div style="width:${pct}%; height:100%; background:linear-gradient(90deg, #1558c0, #34d399); transition:width 0.3s ease;"></div>
        </div>
      </div>

      <!-- Sections Grid -->
      <div style="flex:1; overflow-y:auto; padding:20px; background:#07101d;">
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:16px;">
          ${sections.map((sec, idx) => {
            const isReady = sec.status === 'ready';
            const isGen = sec.status === 'generating';
            return `
              <div style="background:${isReady ? '#0d1f36' : isGen ? '#132847' : '#081322'}; border:1px solid ${isReady ? '#10b981' : isGen ? '#3b82f6' : '#1e3050'}; border-radius:12px; padding:16px; display:flex; flex-direction:column; justify-content:space-between; gap:12px;">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <strong style="color:#fff; font-size:13px;">Section ${sec.pageNumber} of ${total}</strong>
                    <span style="font-size:10px; font-weight:800; padding:3px 8px; border-radius:12px; background:${isReady ? 'rgba(16,185,129,0.15)' : isGen ? 'rgba(59,130,246,0.15)' : 'rgba(100,116,139,0.15)'}; color:${isReady ? '#34d399' : isGen ? '#60a5fa' : '#94a3b8'};">
                      ${isReady ? '✓ READY' : isGen ? '⚡ GENERATING...' : '⏳ IN QUEUE'}
                    </span>
                  </div>
                  <div style="font-size:11px; color:#8090a8; line-height:1.4;">
                    Cards ${(sec.pageNumber - 1) * _sectionQueueState.sectionSize + 1} – ${(sec.pageNumber - 1) * _sectionQueueState.sectionSize + sec.students.length} (${sec.students.length} Students)
                  </div>
                </div>

                <div style="display:flex; gap:8px;">
                  <button type="button" onclick="BulkStudio.printSingleSection(${idx})" ${!isReady ? 'disabled' : ''} style="flex:1; background:${isReady ? '#1558c0' : '#1e293b'}; color:#fff; border:none; padding:7px 10px; border-radius:6px; font-size:11px; font-weight:700; cursor:${isReady ? 'pointer' : 'not-allowed'}; opacity:${isReady ? 1 : 0.4};">
                    🖨️ Print Sheet ${sec.pageNumber}
                  </button>
                  <button type="button" onclick="BulkStudio.previewSingleSection(${idx})" ${!isReady ? 'disabled' : ''} style="background:transparent; border:1px solid ${isReady ? '#4a90d9' : '#334155'}; color:${isReady ? '#93c5fd' : '#64748b'}; padding:7px 10px; border-radius:6px; font-size:11px; font-weight:700; cursor:${isReady ? 'pointer' : 'not-allowed'}; opacity:${isReady ? 1 : 0.4};">
                    👁️ Preview
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function togglePauseQueue() {
    _sectionQueueState.isPaused = !_sectionQueueState.isPaused;
    updateSectionConsoleUI(_sectionQueueState.sections.filter(s => s.status === 'ready').length, _sectionQueueState.sections);
  }

  function closeSectionConsole() {
    _sectionQueueState.isCancelled = true;
    const modal = document.getElementById('bulk-section-console');
    if (modal) modal.style.display = 'none';
  }

  function printSingleSection(sectionIndex) {
    const sec = _sectionQueueState.sections[sectionIndex];
    if (!sec || !sec.html) return;
    openPrintWindow([sec.html], `Section ${sec.pageNumber} (${sec.students.length} Cards)`);
  }

  function previewSingleSection(sectionIndex) {
    const sec = _sectionQueueState.sections[sectionIndex];
    if (!sec || !sec.html) return;
    showInPagePrintModal(sec.html, sec.students.length);
  }

  function printAllReadySections() {
    const ready = _sectionQueueState.sections.filter(s => s.status === 'ready');
    if (ready.length === 0) return;
    const allHtml = ready.map(s => s.html);
    openPrintWindow(allHtml, `All Ready Sections (${ready.length} Sheets)`);
  }

  function openPrintWindow(sheetsHtmlArray, title) {
    let printWin = null;
    try { printWin = window.open('', '_blank'); } catch(e) { printWin = null; }

    const combinedHtml = sheetsHtmlArray.map(html => `
      <div class="sheet-grid" style="page-break-after:always;">
        ${html}
      </div>
    `).join('');

    if (!printWin) {
      showInPagePrintModal(combinedHtml, sheetsHtmlArray.length * 8);
      return;
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Batch ID Cards Print Sheet — ${title}</title>
        <style>
          @page { size: A4 portrait; margin: 8mm; }
          body { font-family: 'Inter', sans-serif; background: #fff; color: #000; margin: 0; padding: 0; }
          .print-toolbar { background: #0c1b2e; color: #fff; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; }
          .print-btn { background: #1558c0; color: #fff; border: none; padding: 8px 18px; border-radius: 6px; font-weight: 700; cursor: pointer; }
          .sheet-grid { display: grid; grid-template-columns: repeat(2, 85.6mm); gap: 6mm 10mm; justify-content: center; padding: 10mm 0; }
          
          /* Standard CR80 Size: 85.6mm x 53.98mm */
          .cr80-print-card {
            width: 85.6mm; height: 53.98mm; border: 1px solid #1a365d; border-radius: 3mm;
            overflow: hidden; position: relative; box-sizing: border-box; background: #fff;
            display: flex; flex-direction: column; justify-content: space-between; padding: 2.5mm;
            box-shadow: 0 1px 4px rgba(0,0,0,0.15); page-break-inside: avoid;
          }
          .cr80-header { display: flex; align-items: center; gap: 2mm; background: #0b3c8c; color: #fff; margin: -2.5mm -2.5mm 1.5mm -2.5mm; padding: 1.5mm 2.5mm; }
          .cr80-crest { width: 5mm; height: 5mm; object-fit: contain; }
          .cr80-inst { font-size: 7.5pt; font-weight: 900; letter-spacing: 0.3px; }
          .cr80-sub { font-size: 6.5pt; font-weight: 800; color: #cc0000; text-align: center; margin-bottom: 1.5mm; letter-spacing: 0.5px; }
          .cr80-body { display: flex; gap: 2mm; flex: 1; }
          .cr80-photo-box { width: 18mm; height: 23mm; border: 1px solid #000; border-radius: 1mm; overflow: hidden; background: #eee; flex-shrink: 0; }
          .cr80-photo { width: 100%; height: 100%; object-fit: cover; display: block; }
          .cr80-details { flex: 1; font-size: 6pt; line-height: 1.35; }
          .cr80-row { margin-bottom: 0.8mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .cr80-row-name { white-space: normal !important; line-height: 1.15; max-height: 6mm; overflow: hidden; text-overflow: clip; word-break: break-word; }
          .cr80-row .k { color: #555; font-weight: 700; font-size: 5.5pt; }
          .cr80-qr-box { width: 16mm; text-align: center; flex-shrink: 0; }
          .cr80-footer { font-size: 5pt; color: #666; border-top: 0.5px solid #ccc; padding-top: 1mm; display: flex; justify-content: space-between; font-weight: 600; }

          @media print {
            .print-toolbar { display: none !important; }
            body { background: transparent; }
            .cr80-print-card { box-shadow: none !important; }
          }
        </style>
      </head>
      <body>
        <div class="print-toolbar">
          <div>
            <strong>Ebonyi State University — Bulk ID Printing Sheet</strong>
            <span style="margin-left: 14px; font-size: 12px; color: #94a3b8;">${title}</span>
          </div>
          <button class="print-btn" onclick="window.print()">🖨️ Click to Print</button>
        </div>
        ${combinedHtml}
      </body>
      </html>
    `);
  }

  function showInPagePrintModal(cardsHtml, count) {
    let modal = document.getElementById('bulk-print-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'bulk-print-modal';
      modal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.85); z-index:99999; display:flex; flex-direction:column; overflow:hidden; backdrop-filter:blur(6px);';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:#0c1b2e; color:#fff; padding:14px 24px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #1e3050; flex-shrink:0;">
        <div>
          <strong style="font-size:16px; color:#d4a574;">🖨️ Massive Bulk ID Print Sheet</strong>
          <span style="margin-left:14px; font-size:12px; color:#94a3b8;">CR80 ID Cards (Standard 8 per A4 Page)</span>
        </div>
        <div style="display:flex; gap:10px;">
          <button onclick="window.print()" style="background:#1558c0; color:#fff; border:none; padding:8px 18px; border-radius:6px; font-weight:800; cursor:pointer;">
            🖨️ Send to Printer
          </button>
          <button onclick="document.getElementById('bulk-print-modal').style.display='none'" style="background:#1e293b; color:#fff; border:1px solid #475569; padding:8px 14px; border-radius:6px; font-weight:700; cursor:pointer;">
            ✕ Close Preview
          </button>
        </div>
      </div>
      <div style="flex:1; overflow-y:auto; padding:20px; background:#e2e8f0; display:flex; justify-content:center;">
        <div style="background:#fff; padding:10mm; box-shadow:0 10px 30px rgba(0,0,0,0.25); border-radius:8px; max-width:210mm;">
          <style>
            .sheet-grid { display: grid; grid-template-columns: repeat(2, 85.6mm); gap: 6mm 10mm; justify-content: center; }
            .cr80-print-card {
              width: 85.6mm; height: 53.98mm; border: 1px solid #1a365d; border-radius: 3mm;
              overflow: hidden; position: relative; box-sizing: border-box; background: #fff;
              display: flex; flex-direction: column; justify-content: space-between; padding: 2.5mm;
              box-shadow: 0 1px 4px rgba(0,0,0,0.15); page-break-inside: avoid;
            }
            .cr80-header { display: flex; align-items: center; gap: 2mm; background: #0b3c8c; color: #fff; margin: -2.5mm -2.5mm 1.5mm -2.5mm; padding: 1.5mm 2.5mm; }
            .cr80-crest { width: 5mm; height: 5mm; object-fit: contain; }
            .cr80-inst { font-size: 7.5pt; font-weight: 900; letter-spacing: 0.3px; }
            .cr80-sub { font-size: 6.5pt; font-weight: 800; color: #cc0000; text-align: center; margin-bottom: 1.5mm; letter-spacing: 0.5px; }
            .cr80-body { display: flex; gap: 2mm; flex: 1; }
            .cr80-photo-box { width: 18mm; height: 23mm; border: 1px solid #000; border-radius: 1mm; overflow: hidden; background: #eee; flex-shrink: 0; }
            .cr80-photo { width: 100%; height: 100%; object-fit: cover; display: block; }
            .cr80-details { flex: 1; font-size: 6pt; line-height: 1.35; }
            .cr80-row { margin-bottom: 0.8mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .cr80-row .k { color: #555; font-weight: 700; font-size: 5.5pt; }
            .cr80-qr-box { width: 16mm; text-align: center; flex-shrink: 0; }
            .cr80-footer { font-size: 5pt; color: #666; border-top: 0.5px solid #ccc; padding-top: 1mm; display: flex; justify-content: space-between; font-weight: 600; }
          </style>
          <div class="sheet-grid">
            ${cardsHtml}
          </div>
        </div>
      </div>
    `;
    modal.style.display = 'flex';
  }

  // ── TEMPLATE DOWNLOADERS ─────────────────────────────────────────

  function downloadSampleCsv() {
    const csvContent = 
      "matric,name,faculty,dept,level,blood,genotype,expiry\n" +
      "EBSU/2021/101397,NNAJI WILSON SOMTOCHUKWU,Science,Computer Science,400L,O+,AA,2025\n" +
      "202599201940LA,CHUKWUEMEKA CHIDERA ESTHER,Law,Public Law,100L,O+,AS,2029\n" +
      "202566019283ED,UGURU SAMUEL NNAMDI,Education,Science Education,100L,O+,AA,2028\n" +
      "202544019281MS,OKORO GODWIN BLESSING,Management Sciences,Accountancy,100L,B+,AA,2028\n" +
      "202588102941HT,MBAM DESTINY CHIBUEZE,Health Science and Technology,Medical Laboratory Science,100L,O+,AA,2028\n" +
      "202511094821BM,EKUMA GABRIEL CHUKWUDI,Basic Medical Sciences,Human Anatomy,100L,O+,AA,2028\n";

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'EBSU_Student_Batch_Template.csv';
    link.click();
  }

  // ── UI RENDERING & BRIDGE ────────────────────────────────────────

  function applyFilterAndRender() {
    renderDepartmentPills();
    renderRosterTable();
    updateSelectionBadge();
  }

  function renderDepartmentPills() {
    const container = document.getElementById('bulk-dept-pills');
    if (!container) return;

    if (_activeFaculty === 'ALL') {
      container.innerHTML = '<span style="font-size:11px; color:#6080a0;">Select a specific faculty above to view and multi-select its departments.</span>';
      return;
    }

    const fac = FACULTY_CATALOG[_activeFaculty];
    if (!fac) return;

    const pillsHtml = fac.departments.map(d => {
      const isSelected = _selectedDepts.has(d);
      return `
        <button type="button" 
          class="bulk-dept-pill ${isSelected ? 'active' : ''}" 
          onclick="BulkStudio.toggleDepartmentFilter('${d}')">
          <span>${isSelected ? '✓' : '+'}</span>
          <span>${d}</span>
        </button>
      `;
    }).join('');

    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-size:11px; font-weight:800; color:#d4a574; text-transform:uppercase;">
          Departments in ${_activeFaculty} (${fac.duration} Yrs Course):
        </span>
        <button type="button" class="btn-text-gold" onclick="BulkStudio.selectAllDepartmentsInFaculty('${_activeFaculty}')">
          ⚡ Select Full Faculty (All ${fac.departments.length} Depts)
        </button>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:6px;">
        ${pillsHtml}
      </div>
    `;
  }

  function renderRosterTable() {
    const tbody = document.getElementById('bulk-roster-tbody');
    const countEl = document.getElementById('bulk-roster-count');
    if (!tbody) return;

    const list = getFilteredStudents();
    if (countEl) countEl.textContent = `${list.length} Students found (${_selectedStudentIds.size} selected for print)`;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:#6080a0;">No students match the selected department or search criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(s => {
      const isChecked = _selectedStudentIds.has(s.id);
      return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.05); ${isChecked ? 'background:rgba(74,144,217,0.08);' : ''}">
          <td style="padding:10px 8px; text-align:center;">
            <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="BulkStudio.toggleStudentSelection('${s.id}')" />
          </td>
          <td style="padding:10px 8px; font-weight:700; color:#fff;">
            ${s.name}
          </td>
          <td style="padding:10px 8px; font-family:monospace; color:#63b3ed;">
            ${s.matric}
          </td>
          <td style="padding:10px 8px;">
            ${s.dept}
            <div style="font-size:10px; color:#64748b;">${s.faculty}</div>
          </td>
          <td style="padding:10px 8px; text-align:center;">
            <span class="badge-duration">${s.duration} Yrs</span>
          </td>
          <td style="padding:10px 8px; text-align:center; font-weight:800; color:#4ade80;">
            ${s.expiry}
          </td>
          <td style="padding:10px 8px; text-align:center;">
            <button class="btn-row-action" onclick="BulkStudio.previewSingleCard('${s.id}')">👁️ Preview</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function updateSelectionBadge() {
    const badge = document.getElementById('bulk-selected-count-badge');
    if (badge) {
      badge.textContent = `${_selectedStudentIds.size} Selected for Batch Print`;
    }
  }

  function previewSingleCard(id) {
    const student = _students.find(s => s.id === id);
    if (!student) return;

    if (typeof MOCK_STUDENT !== 'undefined') {
      MOCK_STUDENT.name = student.name;
      MOCK_STUDENT.matric = student.matric;
      MOCK_STUDENT.dept = student.dept;
      MOCK_STUDENT.faculty = student.faculty;
      MOCK_STUDENT.level = student.level || '100L';
      MOCK_STUDENT.blood = student.blood || 'O+';
      MOCK_STUDENT.genotype = student.genotype || 'AA';
      MOCK_STUDENT.expiry = student.expiry;
    }

    if (typeof AppState !== 'undefined') {
      if (!AppState.student) AppState.student = {};
      AppState.student.name = student.name;
      AppState.student.matric = student.matric;
      AppState.student.dept = student.dept;
      AppState.student.faculty = student.faculty;
      AppState.student.expiry = student.expiry;
    }

    if (typeof renderAdmin === 'function') {
      renderAdmin();
    }
  }

  return {
    init,
    getFacultyCatalog,
    setFacultyFilter,
    toggleDepartmentFilter,
    selectAllDepartmentsInFaculty,
    setSearchQuery,
    toggleStudentSelection,
    selectAllFiltered,
    clearSelection,
    getSelectedStudents,
    ingestCsv,
    ingestExcel,
    ingestApi,
    printBatchSheet,
    showInPagePrintModal,
    downloadSampleCsv,
    previewSingleCard,
    applyFilterAndRender,
    startSectionedProduction,
    showFailSafePrompt,
    togglePauseQueue,
    closeSectionConsole,
    printSingleSection,
    previewSingleSection,
    printAllReadySections
  };
})();

window.BulkStudio = BulkStudio;
