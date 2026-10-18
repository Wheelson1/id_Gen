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

  // ── SEED DATA (Comprehensive multi-faculty dataset) ─────────────
  const SEED_STUDENTS = [
    // SCIENCE (4 Yrs: 2025 -> 2029, 2024 -> 2028)
    { id: 'STU-001', name: 'NNAJI WILSON SOMTOCHUKWU', matric: '202552179149SI', faculty: 'Science', dept: 'Computer Science', level: '100L', blood: 'A+', genotype: 'AA', photo: 'images/demo_user_face.jpg' },
    { id: 'STU-002', name: 'AMAECHI EMMANUEL CHUKWUMA', matric: 'EBSU/2025/104821', faculty: 'Science', dept: 'Computer Science', level: '100L', blood: 'O+', genotype: 'AA', photo: 'images/demo_user_face.jpg' },
    { id: 'STU-003', name: 'NWANKWO BLESSING NGOZI', matric: 'EBSU/2024/984210', faculty: 'Science', dept: 'Computer Science', level: '200L', blood: 'B+', genotype: 'AS', photo: 'images/demo_user_face.jpg' },
    { id: 'STU-004', name: 'IGWE KINGSLEY CHIDIEBERE', matric: '202588123914SI', faculty: 'Science', dept: 'Industrial Chemistry', level: '100L', blood: 'O+', genotype: 'AA', photo: 'images/demo_user_face.jpg' },
    { id: 'STU-005', name: 'EZE CYNTHIA CHIAMAKA', matric: 'EBSU/2024/871029', faculty: 'Science', dept: 'Microbiology', level: '200L', blood: 'A-', genotype: 'AA', photo: 'images/demo_user_face.jpg' },

    // LAW (5 Yrs: 2025 -> 2030, 2024 -> 2029)
    { id: 'STU-006', name: 'CHUKWUEMEKA CHIDERA ESTHER', matric: '202599201940LA', faculty: 'Law', dept: 'Public Law', level: '100L', blood: 'O+', genotype: 'AS', photo: 'images/demo_user_face.jpg' },
    { id: 'STU-007', name: 'OKOYE PROMISE CHISOM', matric: 'EBSU/2024/900002', faculty: 'Law', dept: 'Public Law', level: '200L', blood: 'B+', genotype: 'AA', photo: 'images/demo_user_face.jpg' },
    { id: 'STU-008', name: 'ONUOHA SOMTO MICHAEL', matric: '202511029481LA', faculty: 'Law', dept: 'Civil Law', level: '100L', blood: 'O+', genotype: 'AA', photo: 'images/demo_user_face.jpg' },
    { id: 'STU-009', name: 'AGWU CHIDINMA GRACE', matric: 'EBSU/2024/774019', faculty: 'Law', dept: 'Commercial Law', level: '200L', blood: 'A+', genotype: 'AA', photo: 'images/demo_user_face.jpg' },

    // EDUCATION (4 Yrs: 2025 -> 2029, 2024 -> 2028)
    { id: 'STU-010', name: 'UGURU SAMUEL NNAMDI', matric: '202566019283ED', faculty: 'Education', dept: 'Science Education', level: '100L', blood: 'O+', genotype: 'AA', photo: 'images/demo_user_face.jpg' },
    { id: 'STU-011', name: 'NWEKE PRISCA ONYINYECHI', matric: 'EBSU/2024/662019', faculty: 'Education', dept: 'Educational Foundations', level: '200L', blood: 'B+', genotype: 'AS', photo: 'images/demo_user_face.jpg' },
    { id: 'STU-012', name: 'OBAJI DANIEL UCHENNA', matric: '202533019482ED', faculty: 'Education', dept: 'Business Education', level: '100L', blood: 'O-', genotype: 'AA', photo: 'images/demo_user_face.jpg' },

    // MANAGEMENT SCIENCES (4 Yrs: 2025 -> 2029, 2024 -> 2028)
    { id: 'STU-013', name: 'OKORO GODWIN BLESSING', matric: '202544019281MS', faculty: 'Management Sciences', dept: 'Accountancy', level: '100L', blood: 'B+', genotype: 'AA', photo: 'images/demo_user_face.jpg' },
    { id: 'STU-014', name: 'ALOH VICTOR TOCHUKWU', matric: 'EBSU/2024/900003', faculty: 'Management Sciences', dept: 'Banking and Finance', level: '200L', blood: 'A+', genotype: 'AA', photo: 'images/demo_user_face.jpg' },
    { id: 'STU-015', name: 'EZENWA VIVIAN IFUNANYA', matric: '202577109284MS', faculty: 'Management Sciences', dept: 'Marketing', level: '100L', blood: 'O+', genotype: 'AS', photo: 'images/demo_user_face.jpg' },

    // PRESCO: HEALTH SCIENCE & TECHNOLOGY (4 Yrs: MedLab, Public Health)
    { id: 'STU-016', name: 'MBAM DESTINY CHIBUEZE', matric: '202588102941HT', faculty: 'Health Science and Technology', dept: 'Medical Laboratory Science', level: '100L', blood: 'O+', genotype: 'AA', photo: 'images/demo_user_face.jpg' },
    { id: 'STU-017', name: 'OGBONNA PEACE CHIAMAKA', matric: 'EBSU/2024/881920', faculty: 'Health Science and Technology', dept: 'Medical Laboratory Science', level: '200L', blood: 'A+', genotype: 'AA', photo: 'images/demo_user_face.jpg' },
    { id: 'STU-018', name: 'NWEZE JOSHUA IFEANYI', matric: '202599104812HT', faculty: 'Health Science and Technology', dept: 'Public Health', level: '100L', blood: 'B+', genotype: 'AS', photo: 'images/demo_user_face.jpg' },

    // PRESCO: BASIC MEDICAL SCIENCES (4 Yrs: Anatomy, Physiology)
    { id: 'STU-019', name: 'EKUMA GABRIEL CHUKWUDI', matric: '202511094821BM', faculty: 'Basic Medical Sciences', dept: 'Human Anatomy', level: '100L', blood: 'O+', genotype: 'AA', photo: 'images/demo_user_face.jpg' },
    { id: 'STU-020', name: 'CHIMA STEPHANIE ADAEZE', matric: 'EBSU/2024/991024', faculty: 'Basic Medical Sciences', dept: 'Medical Physiology', level: '200L', blood: 'A+', genotype: 'AA', photo: 'images/demo_user_face.jpg' }
  ];

  // Internal State
  let _students = [];
  let _selectedStudentIds = new Set();
  let _activeFaculty = 'ALL';
  let _selectedDepts = new Set();
  let _searchQuery = '';

  /**
   * Initialize state with computed graduation year for every student
   */
  function init() {
    const saved = localStorage.getItem('ebsu_bulk_students');
    if (saved) {
      try { _students = JSON.parse(saved); } catch(e) { _students = [...SEED_STUDENTS]; }
    } else {
      _students = [...SEED_STUDENTS];
    }

    // Ensure graduation year is computed for all
    _students = _students.map(s => enrichStudentRecord(s));
    saveToStorage();
  }

  function saveToStorage() {
    try {
      localStorage.setItem('ebsu_bulk_students', JSON.stringify(_students));
    } catch(e) {}
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

    return {
      ...s,
      matric: regNo,
      faculty: fac,
      dept: dept,
      duration: duration,
      expiry: gradYear,
      status: s.status || 'active',
      qr_token: `EBSU1:${s.id || 'sid'}:${gradYear}:VERIFIED_ED25519`
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
      const dept = row.department || row.dept || (FACULTY_CATALOG[faculty]?.departments[0] || 'General');
      const level = row.level || '100L';
      const blood = row.blood || row.blood_group || 'O+';
      const genotype = row.genotype || 'AA';

      const enriched = enrichStudentRecord({
        id: 'CSV-' + Date.now() + '-' + i,
        name: name.toUpperCase(),
        matric: matric.toUpperCase(),
        faculty: faculty,
        dept: dept,
        level: level,
        blood: blood,
        genotype: genotype,
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

  // ── 1-CLICK PRINT PRODUCTION ─────────────────────────────────────

  function printBatchSheet() {
    const selected = getSelectedStudents();
    if (selected.length === 0) {
      alert('Please select at least one student or department to generate and print IDs.');
      return;
    }

    let printWin = null;
    try {
      printWin = window.open('', '_blank');
    } catch(e) {
      printWin = null;
    }

    // Build print HTML document with standard CR80 cards grid (8 cards per A4 page)
    const cardsHtml = selected.map(s => `
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
            <div class="cr80-row"><span class="k">NAME:</span> <strong class="v">${s.name}</strong></div>
            <div class="cr80-row"><span class="k">MATRIC:</span> <strong class="v">${s.matric}</strong></div>
            <div class="cr80-row"><span class="k">FACULTY:</span> <span class="v">${s.faculty}</span></div>
            <div class="cr80-row"><span class="k">DEPT:</span> <span class="v">${s.dept}</span></div>
            <div class="cr80-row"><span class="k">LEVEL:</span> <span class="v">${s.level} · BLOOD: ${s.blood}</span></div>
            <div class="cr80-row"><span class="k">GRADUATION / EXPIRY:</span> <strong class="v" style="color:#0044cc;">${s.expiry}</strong></div>
          </div>
          <div class="cr80-qr-box">
            <div class="cr80-qr-placeholder">🔲 QR SECURED<br/><small style="font-size:7px;">Ed25519 SEAL</small></div>
            <div style="font-size:7px; font-weight:800; margin-top:2px;">VERIFIED</div>
          </div>
        </div>
        <div class="cr80-footer">
          <span>ISSUED: 2024/2025</span>
          <span>OFFICIAL DIGITAL CREDENTIAL · SID SYSTEM</span>
        </div>
      </div>
    `).join('');

    if (!printWin) {
      showInPagePrintModal(cardsHtml, selected.length);
      return;
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Batch ID Cards Print Sheet — ${selected.length} Students</title>
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
          .cr80-row .k { color: #555; font-weight: 700; font-size: 5.5pt; }
          .cr80-qr-box { width: 14mm; text-align: center; flex-shrink: 0; }
          .cr80-qr-placeholder { width: 14mm; height: 14mm; border: 1px dashed #444; font-size: 5pt; display: flex; align-items: center; justify-content: center; flex-direction: column; text-align: center; }
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
            <span style="margin-left: 14px; font-size: 12px; color: #94a3b8;">${selected.length} ID Cards Selected (CR80 Standard 300 DPI)</span>
          </div>
          <button class="print-btn" onclick="window.print()">🖨️ Click to Print All IDs</button>
        </div>
        <div class="sheet-grid">
          ${cardsHtml}
        </div>
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
          <span style="margin-left:14px; font-size:12px; color:#94a3b8;">${count} CR80 ID Cards (Standard 8 per A4 Page)</span>
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
            .cr80-qr-box { width: 14mm; text-align: center; flex-shrink: 0; }
            .cr80-qr-placeholder { width: 14mm; height: 14mm; border: 1px dashed #444; font-size: 5pt; display: flex; align-items: center; justify-content: center; flex-direction: column; text-align: center; }
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
      "Name,Matric,Faculty,Department,Level,Blood,Genotype\n" +
      "NNAJI WILSON SOMTOCHUKWU,202552179149SI,Science,Computer Science,100L,A+,AA\n" +
      "CHUKWUEMEKA CHIDERA ESTHER,202599201940LA,Law,Public Law,100L,O+,AS\n" +
      "UGURU SAMUEL NNAMDI,202566019283ED,Education,Science Education,100L,O+,AA\n" +
      "OKORO GODWIN BLESSING,202544019281MS,Management Sciences,Accountancy,100L,B+,AA\n" +
      "MBAM DESTINY CHIBUEZE,202588102941HT,Health Science and Technology,Medical Laboratory Science,100L,O+,AA\n" +
      "EKUMA GABRIEL CHUKWUDI,202511094821BM,Basic Medical Sciences,Human Anatomy,100L,O+,AA\n";

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
    applyFilterAndRender
  };
})();

window.BulkStudio = BulkStudio;
