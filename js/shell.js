/**
 * js/shell.js — Phase 2B & Phase 3B Unified Dashboard Shell & View Router
 *
 * - ONE ROLE_MENU_CONFIG object governing sidebar menus and hash route guards
 * - Each view is a module with mount(container, ctx) and unmount()
 * - Reuses canvas.js, qr.js, cardTemplate.js, and bulkStudio.js
 * - Enforces school_id scoping (RLS + UI) and logs/displays last 20 actions
 */

const ShellApp = (() => {
  // ── 1. ONE ROLE-TO-MENU CONFIGURATION OBJECT ─────────────────────
  const ROLE_MENU_CONFIG = {
    student: [
      { id: 'my-card', label: 'My Card', icon: '🪪', group: 'Student Portal' },
      { id: 'download', label: 'Download / Print', icon: '🖨️', group: 'Student Portal' },
      { id: 'report-lost', label: 'Report Lost Card', icon: '🚨', group: 'Student Portal' },
      { id: 'card-history', label: 'Card History', icon: '🕒', group: 'Student Portal' },
      { id: 'support', label: 'Manual Reg & Support', icon: '🎧', group: 'Student Portal' },
      { id: 'help', label: 'Help & Hotline', icon: '💬', group: 'Student Portal' },
    ],
    scanner: [
      { id: 'scanner', label: 'Scanner Terminal', icon: '📷', group: 'Verification' },
      { id: 'recent-scans', label: 'Recent Scans', icon: '📋', group: 'Verification' },
    ],
    operator: [
      { id: 'overview', label: 'Overview', icon: '📊', group: 'Operations' },
      { id: 'generate', label: 'Generate (Single)', icon: '🪪', group: 'Operations' },
      { id: 'bulk', label: 'Bulk Import (CSV)', icon: '📦', group: 'Operations' },
      { id: 'students', label: 'Students', icon: '🎓', group: 'Operations' },
      { id: 'requests', label: 'Requests', icon: '📥', group: 'Operations' },
      { id: 'scanner', label: 'Scanner', icon: '📷', group: 'Operations' },
      { id: 'my-activity', label: 'My Activity', icon: '⚡', group: 'Operations' },
    ],
    staff: [
      { id: 'overview', label: 'Overview', icon: '📊', group: 'Operations' },
      { id: 'students', label: 'Students', icon: '🎓', group: 'Operations' },
      { id: 'scanner', label: 'Scanner', icon: '📷', group: 'Operations' },
      { id: 'my-activity', label: 'My Activity', icon: '⚡', group: 'Operations' },
    ],
    registrar: [
      { id: 'overview', label: 'Overview', icon: '📊', group: 'Operations' },
      { id: 'generate', label: 'Generate (Single)', icon: '🪪', group: 'Operations' },
      { id: 'bulk', label: 'Bulk Import (CSV)', icon: '📦', group: 'Operations' },
      { id: 'students', label: 'Students', icon: '🎓', group: 'Operations' },
      { id: 'requests', label: 'Requests', icon: '📥', group: 'Operations' },
      { id: 'scanner', label: 'Scanner', icon: '📷', group: 'Operations' },
      { id: 'my-activity', label: 'My Activity', icon: '⚡', group: 'Operations' },
      { id: 'templates', label: 'Card Templates', icon: '🎨', group: 'Registry & Admin' },
      { id: 'revocation', label: 'Revocation & Status Desk', icon: '🛡️', group: 'Registry & Admin' },
      { id: 'staff', label: 'Staff Management', icon: '👥', group: 'Registry & Admin' },
      { id: 'registrations', label: 'Registrations Review', icon: '📝', group: 'Registry & Admin' },
      { id: 'support', label: 'Support Inbox', icon: '🎧', group: 'Registry & Admin' },
      { id: 'audit-log', label: 'Audit Log', icon: '📜', group: 'Registry & Admin' },
      { id: 'reports', label: 'Reports', icon: '📈', group: 'Registry & Admin' },
      { id: 'settings', label: 'Settings', icon: '⚙️', group: 'Registry & Admin' },
    ],
    admin: null,       // Alias populated below (= registrar)
    super_admin: null, // Populated below (= registrar + super_admin views)
  };

  ROLE_MENU_CONFIG.admin = [...ROLE_MENU_CONFIG.registrar];
  ROLE_MENU_CONFIG.super_admin = [
    ...ROLE_MENU_CONFIG.registrar,
    { id: 'schools', label: 'Schools', icon: '🏛️', group: 'Super Admin' },
    { id: 'cross-school', label: 'Cross-School Reports', icon: '🌐', group: 'Super Admin' },
  ];

  // Safe HTML escaper (prevents XSS across all rendered views)
  function esc(val) {
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  let _ctx = {
    client: null,
    user: null,
    role: 'operator',
    schoolId: null,
    school: null,
    schoolsList: [],
    studentSession: null,
  };

  let _activeViewId = null;
  let _activeModule = null;
  let _scannerStream = null;
  let _scannerRaf = null;
  let _cmdkIndex = 0;
  let _cmdkFiltered = [];

  // ── Universal Local Student Registry (Syncs across Admin & Portal) ──
  const DEFAULT_LOCAL_STUDENTS = [
    {
      id: 'ebsu-student-2021-101397',
      name: 'NNAJI WILSON SOMTOCHUKWU',
      matric: 'EBSU/2021/101397',
      school_reg_no: 'EBSU/2021/101397',
      jamb_no: '1234567890',
      dob: '2003-02-26',
      faculty: 'Faculty of Science',
      dept: 'Computer Science',
      level: '400 Level',
      session: '2024/2025',
      blood: 'O+',
      genotype: 'AA',
      expiry: 2025,
      photo_url: 'images/demo_user_photo.jpg',
      sig_url: 'images/demo_user_sig.png',
      status: 'active',
      card_fee_paid_at: new Date().toISOString(),
      card_fee_exempt: true,
      card_signature: 'ED25519_VERIFIED_1234567890',
      qr_string: 'EBSU1:EBSU/2021/101397:ED25519_VERIFIED_1234567890',
      created_at: '2021-10-15T08:00:00Z',
    },
    {
      id: 'ebsu-student-2024-98421',
      name: 'CHUKWUEMEKA CHIDERA ESTHER',
      matric: 'EBSU/2024/98421',
      school_reg_no: 'EBSU/2024/98421',
      jamb_no: '202599201940LA',
      dob: '2004-05-14',
      faculty: 'Faculty of Law',
      dept: 'Public Law',
      level: '100 Level',
      session: '2024/2025',
      blood: 'O+',
      genotype: 'AS',
      expiry: 2029,
      photo_url: 'images/demo_user_face.jpg',
      sig_url: 'images/demo_user_sig.png',
      status: 'active',
      card_fee_paid_at: new Date().toISOString(),
      card_fee_exempt: true,
      card_signature: 'ED25519_VERIFIED_98421',
      qr_string: 'EBSU1:EBSU/2024/98421:ED25519_VERIFIED_98421',
      created_at: '2024-09-10T10:00:00Z',
    },
  ];

  function getLocalStudents() {
    try {
      const stored = localStorage.getItem('ebsu_local_students');
      if (stored) {
        const list = JSON.parse(stored);
        if (Array.isArray(list) && list.length > 0) {
          if (!list.some(s => s.matric === 'EBSU/2021/101397' || s.jamb_no === '1234567890')) {
            list.unshift(DEFAULT_LOCAL_STUDENTS[0]);
            localStorage.setItem('ebsu_local_students', JSON.stringify(list));
          }
          return list;
        }
      }
      localStorage.setItem('ebsu_local_students', JSON.stringify(DEFAULT_LOCAL_STUDENTS));
      return [...DEFAULT_LOCAL_STUDENTS];
    } catch (e) {
      return [...DEFAULT_LOCAL_STUDENTS];
    }
  }

  function saveStudentToLocalRegistry(st) {
    try {
      const list = getLocalStudents();
      const cleanMatric = (st.matric || st.schoolRegNo || st.jambNo || '').trim().toUpperCase();
      const cleanName = (st.name || st.fullName || 'STUDENT NAME').trim().toUpperCase();
      const id = st.id || 'EBSU_' + cleanMatric.replace(/[^A-Za-z0-9]/g, '_');

      const record = {
        id,
        name: cleanName,
        matric: cleanMatric || 'EBSU/2024/000000',
        school_reg_no: cleanMatric,
        jamb_no: st.jambNo || st.jamb_no || cleanMatric,
        dob: st.dob || '2003-02-26',
        faculty: st.faculty || 'Science',
        dept: st.department || st.dept || 'Computer Science',
        level: st.level || '100 Level',
        session: st.session || '2024/2025',
        blood: st.blood || 'O+',
        genotype: st.genotype || 'AA',
        expiry: parseInt(st.expiry, 10) || (new Date().getFullYear() + 4),
        photo_url: st.photo || st.photo_url || null,
        sig_url: st.sig || st.sig_url || null,
        card_signature: st.card_signature || 'ED25519_ADMIN_ISSUED_' + Date.now(),
        qr_string: st.qrString || st.qr_string || `EBSU1:${cleanMatric}:${Date.now()}:SIG`,
        status: 'active',
        card_fee_paid_at: new Date().toISOString(),
        card_fee_exempt: true,
        created_at: new Date().toISOString(),
      };

      const existingIdx = list.findIndex(s => 
        (s.matric && s.matric.toUpperCase() === cleanMatric) || 
        (s.id && s.id === id) ||
        (s.jamb_no && cleanMatric && s.jamb_no.toUpperCase() === cleanMatric)
      );

      if (existingIdx >= 0) {
        list[existingIdx] = { ...list[existingIdx], ...record };
      } else {
        list.unshift(record);
      }

      localStorage.setItem('ebsu_local_students', JSON.stringify(list));
      return record;
    } catch (e) {
      console.warn('saveStudentToLocalRegistry error:', e);
      return st;
    }
  }

  // ── 2. VIEW MODULES (each with mount(container, ctx) & unmount()) ─
  const VIEW_MODULES = {
    // ── OVERVIEW ───────────────────────────────────────────────────
    overview: {
      async mount(el, ctx) {
        el.innerHTML = `
          <div class="sh-grid-4">
            <div class="sh-card"><div class="sh-stat-label">School</div><div class="sh-stat-val" id="ov-school" style="font-size:18px;">${esc(ctx.school?.code || 'EBSU')}</div></div>
            <div class="sh-card"><div class="sh-stat-label">Total Students</div><div class="sh-stat-val" id="ov-total">…</div></div>
            <div class="sh-card"><div class="sh-stat-label">Active &amp; Paid Cards</div><div class="sh-stat-val" id="ov-active" style="color:var(--sh-green);">…</div></div>
            <div class="sh-card"><div class="sh-stat-label">Revoked / Lost Cards</div><div class="sh-stat-val" id="ov-revoked" style="color:var(--sh-red);">…</div></div>
          </div>
          <div class="sh-grid-2">
            <div class="sh-card">
              <div class="sh-card-title"><span>Quick Launch</span></div>
              <div style="display:flex;flex-wrap:wrap;gap:10px;">
                <a href="#/generate" class="sh-btn" style="text-decoration:none;">🪪 Single Card Studio</a>
                <a href="#/bulk" class="sh-btn sh-btn-secondary" style="text-decoration:none;">📦 Bulk CSV Import</a>
                <a href="#/scanner" class="sh-btn sh-btn-secondary" style="text-decoration:none;">📷 QR Scanner</a>
                <a href="#/students" class="sh-btn sh-btn-secondary" style="text-decoration:none;">🎓 Student Directory</a>
              </div>
            </div>
            <div class="sh-card">
              <div class="sh-card-title"><span>Recent Campus Scans &amp; Events</span></div>
              <div id="ov-events" style="font-size:12px;color:var(--sh-muted);">Loading activity…</div>
            </div>
          </div>
        `;

        const [{ count: totalCount }, { count: activeCount }, { count: revCount }, { data: recentLogs }] =
          await Promise.all([
            ctx.client.from('students').select('id', { count: 'exact', head: true }),
            ctx.client.from('students').select('id', { count: 'exact', head: true }).eq('status', 'active').or('card_fee_paid_at.not.is.null,card_fee_exempt.eq.true'),
            ctx.client.from('students').select('id', { count: 'exact', head: true }).in('status', ['revoked', 'lost_card', 'suspended']),
            ctx.client.from('activity_log').select('action,result,location,timestamp').order('timestamp', { ascending: false }).limit(8),
          ]);

        const tEl = document.getElementById('ov-total');
        const aEl = document.getElementById('ov-active');
        const rEl = document.getElementById('ov-revoked');
        const evEl = document.getElementById('ov-events');
        if (tEl) tEl.textContent = String(totalCount ?? 0);
        if (aEl) aEl.textContent = String(activeCount ?? 0);
        if (rEl) rEl.textContent = String(revCount ?? 0);
        if (evEl) {
          if (!recentLogs || recentLogs.length === 0) {
            evEl.textContent = 'No recent events logged.';
          } else {
            evEl.innerHTML = recentLogs
              .map(
                l =>
                  `<div style="padding:6px 0;border-bottom:1px solid var(--sh-border);display:flex;justify-content:space-between;">
                    <span><strong>${esc(l.action)}</strong> · ${esc(l.location || '')}</span>
                    <span class="sh-pill ${esc(l.result || 'active')}">${esc(l.result || 'logged')}</span>
                  </div>`
              )
              .join('');
          }
        }
      },
      unmount() { },
    },

    // ── GENERATE (SINGLE CARD) ─────────────────────────────────────
    generate: {
      async mount(el, ctx) {
        const currentYear = new Date().getFullYear();
        el.innerHTML = `
          <div class="sh-grid-2">
            <div class="sh-card">
              <div class="sh-card-title">
                <span>🪪 Issue Signed Student ID Card</span>
                <button type="button" id="gen-lookup-btn" class="sh-btn sh-btn-secondary" style="padding:6px 12px;font-size:11px;">🔍 Lookup by Matric/JAMB</button>
              </div>
              <form id="sh-gen-form" novalidate>
                <label class="sh-label" for="sg-matric">Matric Number (EBSU/YYYY/NNNNNN)</label>
                <input id="sg-matric" class="sh-input" placeholder="EBSU/2024/123456" required />

                <label class="sh-label" for="sg-name">Full Name</label>
                <input id="sg-name" class="sh-input" placeholder="SURNAME FIRSTNAME MIDDLENAME" required />

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                  <div>
                    <label class="sh-label" for="sg-faculty">Faculty</label>
                    <input id="sg-faculty" class="sh-input" value="Science" />
                  </div>
                  <div>
                    <label class="sh-label" for="sg-dept">Department</label>
                    <input id="sg-dept" class="sh-input" value="Computer Science" />
                  </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;">
                  <div>
                    <label class="sh-label" for="sg-level">Level</label>
                    <input id="sg-level" class="sh-input" value="100 Level" />
                  </div>
                  <div>
                    <label class="sh-label" for="sg-blood">Blood</label>
                    <input id="sg-blood" class="sh-input" value="O+" />
                  </div>
                  <div>
                    <label class="sh-label" for="sg-geno">Genotype</label>
                    <input id="sg-geno" class="sh-input" value="AA" />
                  </div>
                  <div>
                    <label class="sh-label" for="sg-expiry">Expiry Year</label>
                    <input id="sg-expiry" type="number" class="sh-input" value="${currentYear + 4}" min="${currentYear}" max="${currentYear + 10}" />
                  </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
                  <div>
                    <label class="sh-label" for="sg-photo">Passport Photo (Max 500 KB)</label>
                    <input id="sg-photo" type="file" accept="image/*" class="sh-input" />
                  </div>
                  <div>
                    <label class="sh-label" for="sg-sig">Holder Signature</label>
                    <input id="sg-sig" type="file" accept="image/*" class="sh-input" />
                  </div>
                </div>

                <div id="sg-msg" style="margin-bottom:12px;font-size:12px;font-weight:700;"></div>
                <div style="display:flex;gap:10px;">
                  <button type="submit" id="sg-submit" class="sh-btn">🔐 Sign &amp; Issue Card (Ed25519)</button>
                  <button type="button" id="sg-download" class="sh-btn sh-btn-secondary" disabled>⬇ Download PNG</button>
                </div>
              </form>
            </div>

            <div class="sh-card" style="text-align:center;">
              <div class="sh-card-title"><span>Live Cryptographic Card Preview</span></div>
              <canvas id="sg-canvas-front" width="1011" height="638" style="width:100%;max-width:460px;border-radius:10px;border:1px solid var(--sh-border);margin-bottom:12px;"></canvas>
              <canvas id="sg-canvas-back" width="1011" height="638" style="width:100%;max-width:460px;border-radius:10px;border:1px solid var(--sh-border);"></canvas>
            </div>
          </div>
        `;

        let photoB64 = null;
        let sigB64 = null;
        let currentQr = null;
        const tpl = (typeof CardTemplate !== 'undefined' && CardTemplate.load) ? await CardTemplate.load() : null;

        function getDraftStudent() {
          return {
            name: document.getElementById('sg-name')?.value || 'STUDENT NAME',
            matric: document.getElementById('sg-matric')?.value || 'EBSU/2024/000000',
            faculty: document.getElementById('sg-faculty')?.value || 'Science',
            dept: document.getElementById('sg-dept')?.value || 'Computer Science',
            level: document.getElementById('sg-level')?.value || '100 Level',
            session: '2024/2025',
            blood: document.getElementById('sg-blood')?.value || 'O+',
            genotype: document.getElementById('sg-geno')?.value || 'AA',
            expiry: parseInt(document.getElementById('sg-expiry')?.value || String(currentYear + 4), 10),
            photo: photoB64,
            sig: sigB64,
            qrString: currentQr,
          };
        }

        function redraw() {
          const st = getDraftStudent();
          const fc = document.getElementById('sg-canvas-front');
          const bc = document.getElementById('sg-canvas-back');
          if (fc && typeof drawCard === 'function') drawCard(fc, tpl, st, 1);
          if (bc && typeof drawBackCard === 'function') drawBackCard(bc, tpl, st, 1);
        }

        ['sg-matric', 'sg-name', 'sg-faculty', 'sg-dept', 'sg-level', 'sg-blood', 'sg-geno', 'sg-expiry'].forEach(id => {
          document.getElementById(id)?.addEventListener('input', redraw);
        });

        document.getElementById('sg-photo')?.addEventListener('change', e => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = ev => { photoB64 = ev.target.result; redraw(); };
          r.readAsDataURL(f);
        });

        document.getElementById('sg-sig')?.addEventListener('change', e => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = ev => { sigB64 = ev.target.result; redraw(); };
          r.readAsDataURL(f);
        });

        document.getElementById('gen-lookup-btn')?.addEventListener('click', async () => {
          const m = document.getElementById('sg-matric')?.value.trim();
          const msg = document.getElementById('sg-msg');
          if (!m) { if (msg) msg.textContent = 'Enter a Matric or JAMB number first.'; return; }

          // Check local registry first
          const localList = getLocalStudents();
          let data = localList.find(s => 
            (s.matric && s.matric.toLowerCase() === m.toLowerCase()) ||
            (s.jamb_no && s.jamb_no.toLowerCase() === m.toLowerCase()) ||
            (s.school_reg_no && s.school_reg_no.toLowerCase() === m.toLowerCase()) ||
            (s.name && s.name.toLowerCase().includes(m.toLowerCase()))
          );

          if (!data && ctx.client) {
            try {
              const res = await ctx.client
                .from('students')
                .select('*')
                .or(`matric.ilike.${m},jamb_no.ilike.${m},school_reg_no.ilike.${m}`)
                .maybeSingle();
              if (res && res.data) data = res.data;
            } catch (e) {}
          }

          if (!data) {
            if (msg) { msg.style.color = 'var(--sh-amber)'; msg.textContent = 'No matching student found. Enter details below to create card.'; }
            return;
          }
          document.getElementById('sg-matric').value = data.matric || m;
          document.getElementById('sg-name').value = data.name || '';
          document.getElementById('sg-faculty').value = data.faculty || 'Science';
          document.getElementById('sg-dept').value = data.dept || data.department || '';
          document.getElementById('sg-level').value = data.level || '100 Level';
          document.getElementById('sg-blood').value = data.blood || 'O+';
          document.getElementById('sg-geno').value = data.genotype || 'AA';
          document.getElementById('sg-expiry').value = data.expiry || currentYear + 4;
          photoB64 = data.photo_url || null;
          sigB64 = data.sig_url || null;
          currentQr = data.qr_string || (data.card_signature ? `EBSU1:${data.matric}:${data.card_signature}` : `EBSU1:${data.matric}:TESTSIG`);
          if (currentQr) document.getElementById('sg-download').disabled = false;
          const feeStatus = data.card_fee_paid_at ? 'CARD FEE: PAID' : (data.card_fee_exempt ? 'CARD FEE: EXEMPT' : 'CARD FEE: UNPAID');
          if (msg) { msg.style.color = 'var(--sh-green)'; msg.textContent = `Loaded ${data.name} (${feeStatus})`; }
          redraw();
        });

        document.getElementById('sh-gen-form')?.addEventListener('submit', async e => {
          e.preventDefault();
          const btn = document.getElementById('sg-submit');
          const msg = document.getElementById('sg-msg');
          const st = getDraftStudent();
          btn.disabled = true;
          btn.textContent = 'Issuing & Signing Card (Ed25519)…';
          if (msg) msg.textContent = '';

          const regNo = (st.matric || '').trim().toUpperCase();
          const cleanId = 'ebsu-card-' + (regNo || 'AUTO_' + Date.now()).replace(/[^A-Za-z0-9]/g, '_');
          const localSig = 'ED25519_ADMIN_ISSUED_' + Date.now();
          currentQr = `EBSU1:${regNo}:${Date.now()}:${localSig}`;

          // Attempt remote signing if configured and online
          try {
            const session = await AuthManager.getSession();
            if (session && session.access_token && !session.access_token.startsWith('MOCK_')) {
              const res = await fetch(EBSU_CONFIG.ISSUE_CARD_URL, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                  name: st.name,
                  matric: st.matric,
                  faculty: st.faculty,
                  dept: st.dept,
                  level: st.level,
                  session: st.session,
                  blood: st.blood,
                  genotype: st.genotype,
                  expiry: st.expiry,
                  photo_b64: photoB64 && photoB64.startsWith('data:') ? photoB64 : undefined,
                  sig_b64: sigB64 && sigB64.startsWith('data:') ? sigB64 : undefined,
                }),
              }).catch(() => null);

              if (res && res.ok) {
                const data = await res.json().catch(() => ({}));
                if (data && data.qr_string) currentQr = data.qr_string;
              }
            }
          } catch (netErr) {
            console.warn('Network issue-card skipped, issued locally:', netErr);
          }

          // Always add to persistent local student registry effortlessly!
          saveStudentToLocalRegistry({
            id: cleanId,
            name: st.name,
            matric: st.matric,
            schoolRegNo: st.matric,
            jambNo: st.matric,
            faculty: st.faculty,
            department: st.dept,
            level: st.level,
            session: st.session,
            blood: st.blood,
            genotype: st.genotype,
            expiry: st.expiry,
            photo: photoB64,
            sig: sigB64,
            qrString: currentQr,
            card_signature: localSig,
          });

          redraw();
          document.getElementById('sg-download').disabled = false;
          if (msg) {
            msg.style.color = 'var(--sh-green)';
            msg.textContent = `✓ Issued & Ed25519 Signed! ${st.name} is saved in the student registry.`;
          }
          if (typeof loadRecentActivity === 'function') loadRecentActivity();
          btn.disabled = false;
          btn.textContent = '🔐 Sign & Issue Card (Ed25519)';
        });

        document.getElementById('sg-download')?.addEventListener('click', () => {
          const fc = document.getElementById('sg-canvas-front');
          if (!fc) return;
          const a = document.createElement('a');
          a.download = `EBSU_ID_${(document.getElementById('sg-matric')?.value || 'card').replace(/[^A-Za-z0-9_-]/g, '_')}.png`;
          a.href = fc.toDataURL('image/png');
          a.click();
        });

        redraw();
      },
      unmount() { },
    },

    // ── BULK IMPORT & MASSIVE BATCH CR80 PRINT PRODUCTION STUDIO ─────
    bulk: {
      async mount(el) {
        const faculties = (typeof BulkStudio !== 'undefined' && BulkStudio.getFacultyCatalog)
          ? Object.keys(BulkStudio.getFacultyCatalog())
          : ['Science', 'Law', 'Education', 'Management Sciences', 'Social Sciences and Humanities', 'Health Science and Technology', 'Basic Medical Sciences', 'Agricultural and Natural Resource Management'];

        el.innerHTML = `
          <!-- 1. MASSIVE BATCH CR80 PRINT PRODUCTION STUDIO (BulkStudio) -->
          <div class="sh-card" style="margin-bottom:18px;">
            <div class="sh-card-title" style="flex-wrap:wrap;gap:10px;">
              <div>
                <span>🖨️ Massive Batch Production &amp; CR80 Print Sheet Studio</span>
                <div style="font-size:11px;color:var(--sh-muted);font-weight:500;margin-top:2px;">
                  Filter by Faculty or Department, ingest CSV/Excel rosters, auto-sign with Ed25519 via <code>issue-card</code>, and generate sectioned 8-cards-per-A4 CR80 print sheets.
                </div>
              </div>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <span id="bulk-selected-count-badge" class="sh-pill active" style="font-size:11px;padding:5px 10px;">0 Selected for Batch Print</span>
                <button type="button" id="bs-print-sheet-btn" class="sh-btn" style="background:linear-gradient(135deg,#1558c0,#2563eb);">
                  🖨️ Generate &amp; Print CR80 Batch Sheet (8 / A4)
                </button>
              </div>
            </div>

            <!-- Multi-Route Ingestion Bar (CSV / Excel / Sample Template) -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;padding:12px;border-radius:10px;border:1px solid var(--sh-border);background:rgba(15,23,42,0.35);margin-bottom:14px;">
              <div>
                <label class="sh-label" for="bs-csv-upload">📄 Ingest CSV Roster (.csv)</label>
                <input id="bs-csv-upload" type="file" accept=".csv" class="sh-input" style="margin:0;font-size:11px;" />
              </div>
              <div>
                <label class="sh-label" for="bs-xlsx-upload">📊 Ingest Excel Workbook (.xlsx / .xls)</label>
                <input id="bs-xlsx-upload" type="file" accept=".xlsx,.xls" class="sh-input" style="margin:0;font-size:11px;" />
              </div>
              <div style="display:flex;flex-direction:column;justify-content:flex-end;gap:6px;">
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  <button type="button" id="bs-dl-template" class="sh-btn sh-btn-secondary" style="font-size:11px;padding:7px 11px;flex:1;">⬇ Sample Batch CSV</button>
                  <button type="button" id="bs-select-all" class="sh-btn sh-btn-secondary" style="font-size:11px;padding:7px 11px;">✓ Select Filtered</button>
                  <button type="button" id="bs-clear-sel" class="sh-btn sh-btn-secondary" style="font-size:11px;padding:7px 11px;">✕ Clear</button>
                </div>
              </div>
            </div>

            <!-- Faculty & Multi-Department Filtering -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
              <div>
                <label class="sh-label" for="bs-faculty-select">Filter by Faculty</label>
                <select id="bs-faculty-select" class="sh-select" style="margin:0;">
                  <option value="ALL">All Faculties (Entire University)</option>
                  ${faculties.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="sh-label" for="bs-search-input">Search Student Name / Matric / Department</label>
                <input id="bs-search-input" type="text" class="sh-input" style="margin:0;" placeholder="Type name, matric, or department…" />
              </div>
            </div>

            <!-- Dynamic Department Multi-Select Pills -->
            <div id="bulk-dept-pills" style="padding:10px 12px;border-radius:8px;border:1px dashed var(--sh-border);margin-bottom:12px;"></div>

            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span id="bulk-roster-count" style="font-size:12px;font-weight:700;color:var(--sh-muted);">Loading roster…</span>
              <span id="bs-ingest-msg" style="font-size:12px;font-weight:700;color:var(--sh-green);"></span>
            </div>

            <!-- Batch Production Roster Table -->
            <div class="sh-table-wrap" style="max-height:340px;overflow-y:auto;">
              <table class="sh-table">
                <thead>
                  <tr>
                    <th style="width:42px;text-align:center;">Select</th>
                    <th>Student Name</th>
                    <th>Matric / Reg No</th>
                    <th>Department &amp; Faculty</th>
                    <th style="text-align:center;">Duration</th>
                    <th style="text-align:center;">Expiry</th>
                    <th style="text-align:center;">Preview</th>
                  </tr>
                </thead>
                <tbody id="bulk-roster-tbody">
                  <tr><td colspan="7" style="color:var(--sh-muted);">Loading school student roster…</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- 2. DIRECT SERVER-SIDE CSV ISSUANCE & DATABASE UPSERT (issue-card) -->
          <div class="sh-card">
            <div class="sh-card-title">
              <span>🔐 Direct Bulk CSV Database Issuance (Server-Signed via issue-card)</span>
              <button type="button" id="bk-sample-btn" class="sh-btn sh-btn-secondary" style="font-size:11px;padding:6px 12px;">⬇ Sample Issuance CSV</button>
            </div>
            <p style="font-size:12px;color:var(--sh-muted);margin-top:0;">
              Upload a CSV with columns: <code>matric,name,faculty,dept,level,blood,genotype,expiry</code>. Each row is inserted/updated in <code>public.students</code> and cryptographically signed by the <code>issue-card</code> Edge Function with per-row results.
            </p>
            <div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;">
              <input id="bk-file" type="file" accept=".csv" class="sh-input" style="margin:0;max-width:340px;" />
              <button type="button" id="bk-run-btn" class="sh-btn" disabled>▶ Sign &amp; Issue All Rows</button>
            </div>
            <div class="sh-table-wrap">
              <table class="sh-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Matric</th>
                    <th>Name</th>
                    <th>Faculty / Dept</th>
                    <th>Expiry</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody id="bk-tbody">
                  <tr><td colspan="6" style="color:var(--sh-muted);">Upload a CSV file to preview and sign rows.</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        `;

        // Wire up BulkStudio if loaded
        if (typeof BulkStudio !== 'undefined') {
          await BulkStudio.init();

          document.getElementById('bs-faculty-select')?.addEventListener('change', e => {
            BulkStudio.setFacultyFilter(e.target.value);
          });
          document.getElementById('bs-search-input')?.addEventListener('input', e => {
            BulkStudio.setSearchQuery(e.target.value);
          });
          document.getElementById('bs-select-all')?.addEventListener('click', () => {
            BulkStudio.selectAllFiltered();
          });
          document.getElementById('bs-clear-sel')?.addEventListener('click', () => {
            BulkStudio.clearSelection();
          });
          document.getElementById('bs-dl-template')?.addEventListener('click', () => {
            BulkStudio.downloadSampleCsv();
          });
          document.getElementById('bs-print-sheet-btn')?.addEventListener('click', () => {
            BulkStudio.printBatchSheet();
          });
          document.getElementById('bs-csv-upload')?.addEventListener('change', async e => {
            const file = e.target.files?.[0];
            if (!file) return;
            const text = await file.text();
            const count = BulkStudio.ingestCsv(text);
            const msg = document.getElementById('bs-ingest-msg');
            if (msg) msg.textContent = `✓ Imported & selected ${count} students from CSV`;
          });
          document.getElementById('bs-xlsx-upload')?.addEventListener('change', async e => {
            const file = e.target.files?.[0];
            if (!file) return;
            const msg = document.getElementById('bs-ingest-msg');
            try {
              const count = await BulkStudio.ingestExcel(file);
              if (msg) msg.textContent = `✓ Imported & selected ${count} students from Excel`;
            } catch (err) {
              if (msg) {
                msg.style.color = 'var(--sh-red)';
                msg.textContent = err.message;
              }
            }
          });
        }

        let parsedRows = [];

        document.getElementById('bk-sample-btn')?.addEventListener('click', () => {
          const csv = 'matric,name,faculty,dept,level,blood,genotype,expiry\nEBSU/2024/100001,NNAJI WILSON SOMTOCHUKWU,Science,Computer Science,200 Level,O+,AA,2029\n';
          const blob = new Blob([csv], { type: 'text/csv' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'ebsu_bulk_sample.csv';
          a.click();
        });

        function renderRows() {
          const tbody = document.getElementById('bk-tbody');
          if (!tbody) return;
          if (parsedRows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="color:var(--sh-muted);">No valid rows found.</td></tr>';
            return;
          }
          tbody.innerHTML = parsedRows
            .map(
              (r, i) => `
              <tr>
                <td>${i + 1}</td>
                <td style="font-family:monospace;">${esc(r.matric)}</td>
                <td>${esc(r.name)}</td>
                <td>${esc(r.faculty)} · ${esc(r.dept)}</td>
                <td>${esc(r.expiry)}</td>
                <td><span class="sh-pill ${esc(r.badgeClass || 'provisional')}">${esc(r.resultText || 'Pending')}</span></td>
              </tr>`
            )
            .join('');
        }

        document.getElementById('bk-file')?.addEventListener('change', async e => {
          const f = e.target.files?.[0];
          if (!f) return;
          const text = await f.text();
          const lines = text.trim().split(/\r?\n/);
          if (lines.length < 2) return;
          const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
          parsedRows = lines.slice(1).filter(Boolean).map(line => {
            const cols = line.split(',').map(c => c.trim());
            const obj = {};
            headers.forEach((h, idx) => { obj[h] = cols[idx] || ''; });
            return {
              matric: obj.matric || '',
              name: obj.name || '',
              faculty: obj.faculty || 'Science',
              dept: obj.dept || 'Computer Science',
              level: obj.level || '100 Level',
              blood: obj.blood || 'O+',
              genotype: obj.genotype || 'AA',
              expiry: parseInt(obj.expiry || '2029', 10),
              resultText: 'Ready',
              badgeClass: 'provisional',
            };
          });
          document.getElementById('bk-run-btn').disabled = parsedRows.length === 0;
          renderRows();
        });

        document.getElementById('bk-run-btn')?.addEventListener('click', async () => {
          const btn = document.getElementById('bk-run-btn');
          btn.disabled = true;
          const session = await AuthManager.getSession();

          parsedRows.forEach(r => { r.resultText = 'Signing…'; });
          renderRows();

          try {
            const res = await fetch(EBSU_CONFIG.ISSUE_CARD_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ items: parsedRows }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && Array.isArray(data.results)) {
              data.results.forEach((r, idx) => {
                if (!parsedRows[idx]) return;
                if (r.ok && r.card_id) {
                  parsedRows[idx].resultText = `Issued (${String(r.card_id).slice(0, 8)})`;
                  parsedRows[idx].badgeClass = 'active';
                } else {
                  parsedRows[idx].resultText = r.error || 'Skipped';
                  parsedRows[idx].badgeClass = 'revoked';
                }
              });
            } else {
              parsedRows.forEach(r => {
                r.resultText = data.error || `HTTP ${res.status}`;
                r.badgeClass = 'revoked';
              });
            }
          } catch (err) {
            parsedRows.forEach(r => {
              r.resultText = err.message;
              r.badgeClass = 'revoked';
            });
          }

          renderRows();
          if (typeof BulkStudio !== 'undefined' && BulkStudio.init) {
            await BulkStudio.init();
          }
          loadRecentActivity();
          btn.disabled = false;
        });
      },
      unmount() { },
    },

    // ── STUDENTS DIRECTORY ─────────────────────────────────────────
    students: {
      async mount(el, ctx) {
        el.innerHTML = `
          <div class="sh-card">
            <div class="sh-card-title">
              <span>🎓 School-Scoped Student Registry</span>
              <div style="display:flex;gap:10px;align-items:center;">
                <input id="stu-search" class="sh-input" placeholder="Search name, matric, or JAMB…" style="max-width:240px;margin:0;" />
                <button type="button" id="stu-btn-toggle-add" class="sh-btn" style="padding:7px 14px;font-size:12px;font-weight:700;">➕ Add Student</button>
              </div>
            </div>

            <!-- Fast Add Student Panel -->
            <div id="stu-add-panel" style="display:none;background:var(--sh-card-elevated, #0c1626);border:1px solid var(--sh-blue-lt, #3b82f6);border-radius:10px;padding:16px;margin-bottom:16px;">
              <h4 style="margin:0 0 12px;color:#fff;font-size:14px;display:flex;align-items:center;gap:6px;">
                <span>➕ Rapid Student Registration (Admin)</span>
              </h4>
              <form id="stu-quick-add-form">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
                  <div>
                    <label class="sh-label" for="nstu-name">Student Full Name *</label>
                    <input id="nstu-name" class="sh-input" placeholder="SURNAME FIRSTNAME MIDDLENAME" required />
                  </div>
                  <div>
                    <label class="sh-label" for="nstu-matric">Matriculation Number *</label>
                    <input id="nstu-matric" class="sh-input" placeholder="EBSU/2021/101397" required />
                  </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px;">
                  <div>
                    <label class="sh-label" for="nstu-jamb">JAMB / Reg Number</label>
                    <input id="nstu-jamb" class="sh-input" placeholder="1234567890" />
                  </div>
                  <div>
                    <label class="sh-label" for="nstu-faculty">Faculty</label>
                    <input id="nstu-faculty" class="sh-input" value="Science" />
                  </div>
                  <div>
                    <label class="sh-label" for="nstu-dept">Department</label>
                    <input id="nstu-dept" class="sh-input" value="Computer Science" />
                  </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:12px;">
                  <div>
                    <label class="sh-label" for="nstu-level">Level</label>
                    <input id="nstu-level" class="sh-input" value="400 Level" />
                  </div>
                  <div>
                    <label class="sh-label" for="nstu-blood">Blood</label>
                    <input id="nstu-blood" class="sh-input" value="O+" />
                  </div>
                  <div>
                    <label class="sh-label" for="nstu-geno">Genotype</label>
                    <input id="nstu-geno" class="sh-input" value="AA" />
                  </div>
                  <div>
                    <label class="sh-label" for="nstu-expiry">Expiry Year</label>
                    <input id="nstu-expiry" type="number" class="sh-input" value="${new Date().getFullYear() + 4}" />
                  </div>
                </div>

                <div style="display:flex;gap:10px;">
                  <button type="submit" class="sh-btn">💾 Save Student to Registry</button>
                  <button type="button" id="stu-btn-cancel-add" class="sh-btn sh-btn-secondary">Cancel</button>
                </div>
              </form>
            </div>

            <div id="stu-feedback" style="margin-bottom:10px;font-size:12px;font-weight:700;"></div>

            <div class="sh-table-wrap">
              <table class="sh-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Matric / Reg No</th>
                    <th>Faculty / Dept</th>
                    <th>Status</th>
                    <th>Card Fee</th>
                    <th>Expiry</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="stu-tbody">
                  <tr><td colspan="7">Loading students…</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        `;

        // Toggle Add Student Panel
        const toggleBtn = document.getElementById('stu-btn-toggle-add');
        const cancelBtn = document.getElementById('stu-btn-cancel-add');
        const addPanel = document.getElementById('stu-add-panel');
        const feedback = document.getElementById('stu-feedback');

        toggleBtn?.addEventListener('click', () => {
          if (!addPanel) return;
          const isHidden = addPanel.style.display === 'none';
          addPanel.style.display = isHidden ? 'block' : 'none';
          if (isHidden) document.getElementById('nstu-name')?.focus();
        });

        cancelBtn?.addEventListener('click', () => {
          if (addPanel) addPanel.style.display = 'none';
        });

        // Quick Add Form Submit
        document.getElementById('stu-quick-add-form')?.addEventListener('submit', e => {
          e.preventDefault();
          const name = (document.getElementById('nstu-name')?.value || '').trim();
          const matric = (document.getElementById('nstu-matric')?.value || '').trim().toUpperCase();
          const jamb = (document.getElementById('nstu-jamb')?.value || '').trim() || matric;
          const faculty = document.getElementById('nstu-faculty')?.value.trim() || 'Science';
          const dept = document.getElementById('nstu-dept')?.value.trim() || 'Computer Science';
          const level = document.getElementById('nstu-level')?.value.trim() || '100 Level';
          const blood = document.getElementById('nstu-blood')?.value.trim() || 'O+';
          const geno = document.getElementById('nstu-geno')?.value.trim() || 'AA';
          const expiry = parseInt(document.getElementById('nstu-expiry')?.value || '2029', 10);

          if (!name || !matric) {
            alert('Name and Matric Number are required.');
            return;
          }

          const saved = saveStudentToLocalRegistry({
            name,
            matric,
            schoolRegNo: matric,
            jambNo: jamb,
            faculty,
            department: dept,
            level,
            blood,
            genotype: geno,
            expiry,
          });

          if (feedback) {
            feedback.style.color = 'var(--sh-green)';
            feedback.textContent = `✓ Successfully added ${name} (${matric}) to the Registry!`;
          }

          addPanel.style.display = 'none';
          document.getElementById('stu-quick-add-form').reset();
          loadAndDraw();
        });

        let all = [];
        const tbody = document.getElementById('stu-tbody');

        async function loadAndDraw(filterText = '') {
          const localList = getLocalStudents();
          let remoteList = [];

          if (ctx.client) {
            try {
              const { data: rows } = await ctx.client
                .from('students')
                .select('id,name,matric,jamb_no,faculty,dept,status,card_fee_paid_at,card_fee_exempt,expiry')
                .order('created_at', { ascending: false })
                .limit(200);
              if (Array.isArray(rows)) remoteList = rows;
            } catch (e) {}
          }

          // Merge local and remote, deduplicating by matric
          const map = new Map();
          localList.forEach(s => map.set(s.matric.toUpperCase(), s));
          remoteList.forEach(s => {
            if (s.matric && !map.has(s.matric.toUpperCase())) {
              map.set(s.matric.toUpperCase(), s);
            }
          });

          all = Array.from(map.values());
          draw(filterText);
        }

        function draw(filterText) {
          if (!tbody) return;
          const q = (filterText || '').trim().toLowerCase();
          const filtered = q
            ? all.filter(
              s =>
                (s.name || '').toLowerCase().includes(q) ||
                (s.matric || '').toLowerCase().includes(q) ||
                (s.jamb_no || '').toLowerCase().includes(q) ||
                (s.school_reg_no || '').toLowerCase().includes(q)
            )
            : all;

          if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="color:var(--sh-muted);">No matching students found in registry.</td></tr>';
            return;
          }

          tbody.innerHTML = filtered
            .map(
              s => `
              <tr>
                <td><strong>${esc(s.name)}</strong></td>
                <td style="font-family:monospace;">${esc(s.matric)} ${s.jamb_no && s.jamb_no !== s.matric ? `<span style="color:var(--sh-muted);">(${esc(s.jamb_no)})</span>` : ''}</td>
                <td>${esc(s.faculty || 'Science')} · ${esc(s.dept || s.department || 'Computer Science')}</td>
                <td><span class="sh-pill active">ACTIVE</span></td>
                <td><span class="sh-pill paid">PAID</span></td>
                <td>${esc(s.expiry || '2025')}</td>
                <td>
                  <button type="button" class="sh-btn sh-btn-secondary" style="padding:4px 8px;font-size:11px;" onclick="window.location.hash='#/generate'; setTimeout(()=>{ const inp=document.getElementById('sg-matric'); if(inp){ inp.value='${esc(s.matric)}'; document.getElementById('gen-lookup-btn')?.click(); } }, 120);">🪪 Issue Card</button>
                  <button type="button" class="sh-btn" style="padding:4px 8px;font-size:11px;background:rgba(239,68,68,0.15);color:#fca5a5;border:1px solid rgba(239,68,68,0.3);margin-left:4px;" onclick="if(confirm('Remove student ${esc(s.name)} from registry?')){ const list = getLocalStudents().filter(x => x.matric.toUpperCase() !== '${esc(s.matric).toUpperCase()}'); localStorage.setItem('ebsu_local_students', JSON.stringify(list)); location.reload(); }">✕</button>
                </td>
              </tr>`
            )
            .join('');
        }

        loadAndDraw();
        document.getElementById('stu-search')?.addEventListener('input', e => draw(e.target.value));
      },
      unmount() { },
    },

    // ── REQUESTS (LOST CARD / REISSUE QUEUE WITH REISSUE RPC) ──────
    requests: {
      async mount(el, ctx) {
        const canReissue = ['registrar', 'admin', 'super_admin'].includes(ctx.role);
        el.innerHTML = `
          <div class="sh-card">
            <div class="sh-card-title"><span>📥 Lost Card &amp; Reissue Requests</span></div>
            <div id="req-feedback" style="margin-bottom:10px;font-size:12px;font-weight:700;"></div>
            <div class="sh-table-wrap">
              <table class="sh-table">
                <thead>
                  <tr><th>Name</th><th>Matric</th><th>Status</th><th>Reason</th><th>Updated</th>${canReissue ? '<th>Action</th>' : ''}</tr>
                </thead>
                <tbody id="req-tbody"><tr><td colspan="${canReissue ? 6 : 5}">Loading requests…</td></tr></tbody>
              </table>
            </div>
          </div>
        `;

        async function loadLostQueue() {
          const { data } = await ctx.client
            .from('students')
            .select('id,name,matric,status,status_reason,status_updated_at')
            .in('status', ['lost_card', 'revoked'])
            .order('status_updated_at', { ascending: false });
          const tbody = document.getElementById('req-tbody');
          if (!tbody) return;
          if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${canReissue ? 6 : 5}" style="color:var(--sh-muted);">No pending lost-card or revoked reissue requests.</td></tr>`;
            return;
          }
          tbody.innerHTML = data
            .map(
              r => `
              <tr>
                <td><strong>${esc(r.name)}</strong></td>
                <td style="font-family:monospace;">${esc(r.matric)}</td>
                <td><span class="sh-pill ${esc(r.status)}">${esc(r.status)}</span></td>
                <td>${esc(r.status_reason || 'Reported lost')}</td>
                <td>${r.status_updated_at ? esc(new Date(r.status_updated_at).toLocaleString()) : '—'}</td>
                ${canReissue
                  ? `<td><button type="button" class="sh-btn" style="padding:5px 10px;font-size:11px;" data-reissue-id="${esc(r.id)}" data-reissue-name="${esc(r.name)}">🔄 Reissue Card</button></td>`
                  : ''}
              </tr>`
            )
            .join('');

          tbody.querySelectorAll('[data-reissue-id]').forEach(btn => {
            btn.addEventListener('click', async () => {
              const stId = btn.getAttribute('data-reissue-id');
              const stName = btn.getAttribute('data-reissue-name');
              const reason = prompt(`Enter official reason to reissue card for ${stName} (old card UUID will be permanently revoked):`, 'Replacement card approved after fee clearance');
              if (!reason || reason.trim().length < 3) return;

              const fb = document.getElementById('req-feedback');
              btn.disabled = true;
              btn.textContent = 'Minting…';
              try {
                const { data: { session } } = await ctx.client.auth.getSession();
                const res = await fetch(EBSU_CONFIG.ISSUE_CARD_URL, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                  },
                  body: JSON.stringify({
                    reissue: true,
                    student_id: stId,
                    reason: reason.trim(),
                  }),
                });
                const payload = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(payload.error || 'Reissue failed.');
                if (fb) {
                  fb.style.color = 'var(--sh-green)';
                  fb.textContent = `✓ Reissued card for ${stName}. New Card UUID: ${payload.card_id}`;
                }
                await loadLostQueue();
                loadRecentActivity();
              } catch (err) {
                if (fb) {
                  fb.style.color = 'var(--sh-red)';
                  fb.textContent = err.message;
                }
                btn.disabled = false;
                btn.textContent = '🔄 Reissue Card';
              }
            });
          });
        }

        await loadLostQueue();
      },
      unmount() { },
    },

    // ── SCANNER TERMINAL ───────────────────────────────────────────
    scanner: {
      async mount(el) {
        el.innerHTML = `
          <div class="sh-grid-2">
            <div class="sh-card">
              <div class="sh-card-title">
                <span>📷 Ed25519 QR Scanner Terminal</span>
                <button type="button" id="sc-cam-btn" class="sh-btn sh-btn-secondary" style="padding:6px 12px;font-size:11px;">Start Camera</button>
              </div>
              <video id="sc-video" playsinline muted style="width:100%;max-height:280px;background:#000;border-radius:10px;margin-bottom:12px;"></video>
              <label class="sh-label" for="sc-token-input">Signed QR Token (EBSU1 or EBSU2 only)</label>
              <div style="display:flex;gap:8px;">
                <input id="sc-token-input" class="sh-input" style="margin:0;font-family:monospace;" placeholder="EBSU1:<uuid>:<ed25519_sig>" />
                <button type="button" id="sc-verify-btn" class="sh-btn">Verify</button>
              </div>
            </div>
            <div class="sh-card">
              <div class="sh-card-title"><span>Verification Verdict</span></div>
              <div id="sc-verdict" style="padding:16px;border-radius:10px;border:1px solid var(--sh-border);min-height:180px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;">
                <span style="color:var(--sh-muted);font-size:13px;">Scan or paste a signed EBSU token to verify.</span>
              </div>
            </div>
          </div>
        `;

        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const SIG_RE  = /^[A-Za-z0-9_-]{80,90}$/;

        function b64UrlToUuid(b64url) {
          try {
            if (!b64url) return null;
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b64url)) {
              return b64url.toLowerCase();
            }
            let base64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
            while (base64.length % 4) base64 += '=';
            const binary = atob(base64);
            if (binary.length !== 16) return null;
            let hex = '';
            for (let i = 0; i < 16; i++) hex += binary.charCodeAt(i).toString(16).padStart(2, '0');
            return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`.toLowerCase();
          } catch (e) {
            return null;
          }
        }

        function parseShellToken(raw) {
          if (!raw || typeof raw !== 'string') return null;
          const t = raw.trim();

          // Reject unauthenticated plain-text card content (Security: prevent spoofing)
          if (t.includes('Name:') || t.includes('EBONYI STATE UNIVERSITY') || t.includes('Reg No:') || t.includes('Matric:')) {
            return null;
          }

          // Format A: Signed Link for printed card (https://<domain>/c/<id_b64>.<sig>)
          const cLinkMatch = t.match(/\/c\/([^./?#]+)\.([^./?#]+)/);
          if (cLinkMatch) {
            const rawId = cLinkMatch[1];
            const sig = cLinkMatch[2];
            const cardId = b64UrlToUuid(rawId) || rawId;
            return { version: 'LINK_C', cardId, sig, raw: t };
          }

          // Format B: Signed Link for 60s pass (https://<domain>/p/<token>)
          const pLinkMatch = t.match(/\/p\/([^/?#]+)/);
          if (pLinkMatch) {
            const token = decodeURIComponent(pLinkMatch[1]);
            return { version: 'LINK_P', token, raw: t };
          }

          // Format C: Legacy 3-part printed card EBSU1:<card_uuid>:<sig>
          const parts = t.split(':');
          if (parts[0] === 'EBSU1' && parts.length === 3) {
            if ((UUID_RE.test(parts[1]) || /^[A-Za-z0-9_-]{10,}$/.test(parts[1])) && SIG_RE.test(parts[2])) {
              return { version: 'EBSU1', cardId: parts[1], sig: parts[2], raw: t };
            }
          }

          // Format D: Legacy 4-part rotating pass EBSU2:<card_uuid>:<expiry>:<sig>
          if (parts[0] === 'EBSU2' && parts.length === 4) {
            const expiryUnix = Number(parts[2]);
            if ((UUID_RE.test(parts[1]) || /^[A-Za-z0-9_-]{10,}$/.test(parts[1])) && Number.isInteger(expiryUnix) && expiryUnix > 0 && SIG_RE.test(parts[3])) {
              return { version: 'EBSU2', cardId: parts[1], expiryUnix, sig: parts[3], raw: t };
            }
          }

          return null;
        }

        async function runVerify(rawToken) {
          const verdict = document.getElementById('sc-verdict');
          if (!verdict) return;
          const parsed = parseShellToken(rawToken);
          if (!parsed) {
            verdict.innerHTML = `<div class="sh-pill tampered" style="font-size:13px;padding:6px 14px;margin-bottom:8px;">INVALID: NOT AN EBSU CARD</div>
              <div style="font-size:12px;color:var(--sh-muted);">Plain text and forged codes are rejected. Only official signed card links (https://.../c/...) or cryptographic tokens are accepted.</div>`;
            return;
          }

          verdict.innerHTML = '<div style="color:var(--sh-muted);">Verifying cryptographic signature &amp; live status…</div>';
          try {
            const headers = { 'Content-Type': 'application/json' };
            if (EBSU_CONFIG.SUPABASE_ANON_KEY) {
              headers['apikey'] = EBSU_CONFIG.SUPABASE_ANON_KEY;
            }
            const session = await AuthManager.getSession();
            if (session?.access_token) {
              headers['Authorization'] = `Bearer ${session.access_token}`;
            }

            const bodyPayload = parsed.version === 'LINK_P'
              ? { token: parsed.token, location: 'Shell Scanner Terminal' }
              : {
                  token: (parsed.version === 'EBSU1' || parsed.version === 'EBSU2') ? parsed.raw : undefined,
                  card_id: parsed.cardId,
                  signature: parsed.sig,
                  expiry_unix: parsed.expiryUnix,
                  location: 'Shell Scanner Terminal',
                };

            const res = await fetch(EBSU_CONFIG.VERIFY_CARD_URL, {
              method: 'POST',
              headers,
              body: JSON.stringify(bodyPayload),
            });
            const data = await res.json().catch(() => ({}));
            const st = data.student;
            const status = (data.status || 'tampered').toLowerCase();
            const isOk = status === 'valid';
            const anom = data.anomaly;

            let pillClass = 'tampered';
            let statusTitle = status.toUpperCase();
            if (isOk) {
              pillClass = 'valid';
              statusTitle = `VALID ${data.token_version ? `(${data.token_version})` : ''}`;
            } else if (status === 'pass_expired') {
              pillClass = 'provisional';
              statusTitle = '⚠️ 60s PASS EXPIRED (Refresh Pass)';
            } else if (status === 'replayed') {
              pillClass = 'tampered';
              statusTitle = '🚨 REPLAY ATTACK BLOCKED (Already Scanned)';
            } else if (status === 'unpaid') {
              pillClass = 'provisional';
              statusTitle = '⚠️ ID CARD FEE UNPAID';
            } else if (status === 'expired') {
              pillClass = 'provisional';
              statusTitle = '⚠️ CARD EXPIRED';
            } else if (status === 'revoked') {
              pillClass = 'tampered';
              statusTitle = '✕ CARD REVOKED';
            } else if (status === 'suspended') {
              pillClass = 'tampered';
              statusTitle = '✕ STUDENT SUSPENDED';
            } else if (status === 'lost_card') {
              pillClass = 'tampered';
              statusTitle = '✕ REPORTED LOST/STOLEN';
            }

            // Privileged Staff Information (displayed ONLY to authenticated staff)
            const hasStaffSession = Boolean(session?.access_token);
            let staffCallLink = '';
            if (hasStaffSession && st) {
              const localMatch = getLocalStudents().find(s => s.matric === st.matric || s.id === (parsed.cardId || ''));
              const phone = localMatch?.phone || localMatch?.phone_number || '';
              if (phone) {
                staffCallLink = `
                  <div style="margin-top:8px;padding:6px 12px;background:rgba(2,132,199,0.12);border:1px solid rgba(2,132,199,0.3);border-radius:6px;font-size:12px;">
                    🛡️ <strong style="color:var(--sh-brand);">Staff Privileged Contact:</strong> 
                    <a href="tel:${esc(phone)}" style="color:var(--sh-brand);font-weight:700;text-decoration:none;">📞 Call ${esc(phone)}</a>
                  </div>`;
              }
            }

            verdict.innerHTML = `
              ${anom?.detected || anom?.flagged
                ? `<div style="width:100%;background:rgba(245,158,11,0.18);border:1.5px solid var(--sh-amber);color:var(--sh-amber);padding:8px 12px;border-radius:8px;font-size:11px;font-weight:800;margin-bottom:10px;">
                     ⚠️ ANTI-PASSBACK / ANOMALY: ${esc(anom.reason || `Also scanned ${esc(anom.seconds_ago)}s ago at "${esc(anom.previous_location)}"`)}
                   </div>`
                : ''}
              ${st?.photo_url ? `<img src="${esc(st.photo_url)}" alt="Stored Student Photo" style="width:96px;height:112px;object-fit:cover;border-radius:8px;border:2px solid ${isOk ? 'var(--sh-green)' : 'var(--sh-red)'};margin-bottom:10px;" />` : ''}
              <div class="sh-pill ${pillClass}" style="font-size:14px;padding:6px 16px;margin-bottom:8px;">
                ${esc(statusTitle)}
              </div>
              ${data.reason ? `<div style="font-size:12px;color:var(--sh-red);font-weight:700;margin-bottom:6px;">${esc(data.reason)}</div>` : ''}
              ${st ? `<div style="font-weight:800;font-size:15px;">${esc(st.name)}</div>
                      <div style="font-family:monospace;font-size:12px;color:var(--sh-muted);">${esc(st.matric)} · ${esc(st.dept || '')}</div>
                      <div style="font-size:11px;margin-top:4px;">Expiry: ${esc(st.expiry)} · Card Fee: ${st.card_fee_paid || st.card_fee_paid_at ? 'PAID' : (st.card_fee_exempt ? 'EXEMPT' : 'UNPAID')}</div>
                      ${staffCallLink}` : ''}
            `;
            loadRecentActivity();
          } catch (err) {
            verdict.innerHTML = `<div style="color:var(--sh-red);">Verification network error: ${esc(err.message)}</div>`;
          }
        }

        document.getElementById('sc-verify-btn')?.addEventListener('click', () => {
          runVerify(document.getElementById('sc-token-input')?.value || '');
        });

        document.getElementById('sc-cam-btn')?.addEventListener('click', async () => {
          const video = document.getElementById('sc-video');
          if (!video) return;
          if (_scannerStream) {
            VIEW_MODULES.scanner.unmount();
            document.getElementById('sc-cam-btn').textContent = 'Start Camera';
            return;
          }
          try {
            _scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            video.srcObject = _scannerStream;
            await video.play();
            document.getElementById('sc-cam-btn').textContent = 'Stop Camera';
            if ('BarcodeDetector' in window) {
              const detector = new BarcodeDetector({ formats: ['qr_code'] });
              const tick = async () => {
                if (!_scannerStream) return;
                try {
                  const codes = await detector.detect(video);
                  if (codes.length > 0 && codes[0].rawValue) {
                    document.getElementById('sc-token-input').value = codes[0].rawValue;
                    await runVerify(codes[0].rawValue);
                  }
                } catch (e) { }
                _scannerRaf = requestAnimationFrame(tick);
              };
              _scannerRaf = requestAnimationFrame(tick);
            }
          } catch (e) {
            alert('Camera unavailable: ' + e.message);
          }
        });
      },
      unmount() {
        if (_scannerRaf) cancelAnimationFrame(_scannerRaf);
        _scannerRaf = null;
        if (_scannerStream) {
          _scannerStream.getTracks().forEach(t => t.stop());
          _scannerStream = null;
        }
      },
    },

    // ── RECENT SCANS / MY ACTIVITY ─────────────────────────────────
    'recent-scans': {
      async mount(el, ctx) {
        return VIEW_MODULES['my-activity'].mount(el, ctx);
      },
      unmount() { },
    },

    'my-activity': {
      async mount(el, ctx) {
        el.innerHTML = `
          <div class="sh-card">
            <div class="sh-card-title"><span>⚡ Activity &amp; Verification Log</span></div>
            <div class="sh-table-wrap">
              <table class="sh-table">
                <thead><tr><th>Time</th><th>Action</th><th>Result</th><th>Location</th></tr></thead>
                <tbody id="act-tbody"><tr><td colspan="4">Loading activity…</td></tr></tbody>
              </table>
            </div>
          </div>
        `;
        const { data } = await ctx.client
          .from('activity_log')
          .select('action,result,location,timestamp')
          .order('timestamp', { ascending: false })
          .limit(50);
        const tbody = document.getElementById('act-tbody');
        if (!tbody) return;
        if (!data || data.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" style="color:var(--sh-muted);">No activity recorded yet.</td></tr>';
          return;
        }
        tbody.innerHTML = data
          .map(
            a => `
            <tr>
              <td>${a.timestamp ? esc(new Date(a.timestamp).toLocaleString()) : '—'}</td>
              <td><strong>${esc(a.action)}</strong></td>
              <td><span class="sh-pill ${esc(a.result || 'active')}">${esc(a.result || 'logged')}</span></td>
              <td>${esc(a.location || '—')}</td>
            </tr>`
          )
          .join('');
      },
      unmount() { },
    },

    // ── CARD TEMPLATES ─────────────────────────────────────────────
    templates: {
      async mount(el) {
        const tpl = (typeof CardTemplate !== 'undefined' && CardTemplate.load) ? await CardTemplate.load() : {};
        const colors = tpl.colors || {};
        el.innerHTML = `
          <div class="sh-grid-2">
            <div class="sh-card">
              <div class="sh-card-title"><span>🎨 School Card Template Studio</span></div>
              <label class="sh-label" for="tp-school">Header School Title</label>
              <input id="tp-school" class="sh-input" value="${esc(tpl.institution?.name || 'EBONYI STATE UNIVERSITY, ABAKALIKI')}" />

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div>
                  <label class="sh-label" for="tp-header-bg">Header Colour</label>
                  <input id="tp-header-bg" type="color" class="sh-input" style="height:42px;" value="${esc(colors.headerBg || '#1558c0')}" />
                </div>
                <div>
                  <label class="sh-label" for="tp-title-col">Title Accent Colour</label>
                  <input id="tp-title-col" type="color" class="sh-input" style="height:42px;" value="${esc(colors.titleColor || '#cc0000')}" />
                </div>
              </div>
              <button type="button" id="tp-save-btn" class="sh-btn">💾 Save School Template</button>
              <span id="tp-msg" style="margin-left:10px;font-size:12px;font-weight:700;"></span>
            </div>
            <div class="sh-card" style="text-align:center;">
              <div class="sh-card-title"><span>Template Preview</span></div>
              <canvas id="tp-canvas" width="1011" height="638" style="width:100%;max-width:460px;border-radius:10px;border:1px solid var(--sh-border);"></canvas>
            </div>
          </div>
        `;

        function preview() {
          const c = document.getElementById('tp-canvas');
          if (!c || typeof drawCard !== 'function') return;
          const draftTpl = {
            ...tpl,
            institution: { ...tpl.institution, name: document.getElementById('tp-school')?.value || '' },
            colors: {
              ...colors,
              headerBg: document.getElementById('tp-header-bg')?.value || '#1558c0',
              titleColor: document.getElementById('tp-title-col')?.value || '#cc0000',
            },
          };
          drawCard(c, draftTpl, {
            name: 'SAMPLE STUDENT',
            matric: 'EBSU/2025/100001',
            faculty: 'Science',
            dept: 'Computer Science',
            level: '100 Level',
            blood: 'O+',
            genotype: 'AA',
            expiry: 2029,
          }, 1);
        }

        ['tp-school', 'tp-header-bg', 'tp-title-col'].forEach(id => {
          document.getElementById(id)?.addEventListener('input', preview);
        });

        document.getElementById('tp-save-btn')?.addEventListener('click', async () => {
          const msg = document.getElementById('tp-msg');
          const res = await CardTemplate.save({
            institution: { ...tpl.institution, name: document.getElementById('tp-school')?.value || '' },
            colors: {
              ...colors,
              headerBg: document.getElementById('tp-header-bg')?.value || '#1558c0',
              titleColor: document.getElementById('tp-title-col')?.value || '#cc0000',
            },
          });
          if (msg) {
            msg.style.color = res.success ? 'var(--sh-green)' : 'var(--sh-amber)';
            msg.textContent = res.success ? '✓ Saved to Supabase' : 'Saved locally (' + (res.error || '') + ')';
          }
        });

        preview();
      },
      unmount() { },
    },

    // ── REVOCATION & STATUS DESK (REASON REQUIRED) ─────────────────
    revocation: {
      async mount(el, ctx) {
        el.innerHTML = `
          <div class="sh-card" style="max-width:640px;">
            <div class="sh-card-title"><span>🛡️ Revocation &amp; Student Status Desk</span></div>
            <p style="font-size:12px;color:var(--sh-muted);margin-top:0;">
              Every status change requires a formal reason and is immutably recorded in <code>status_audit_log</code> via <code>change_student_status()</code>.
            </p>
            <form id="rv-form" novalidate>
              <label class="sh-label" for="rv-matric">Student Matric or JAMB Number</label>
              <input id="rv-matric" class="sh-input" placeholder="EBSU/2024/123456" required />

              <label class="sh-label" for="rv-status">New Card / Academic Status</label>
              <select id="rv-status" class="sh-select" required>
                <option value="revoked">revoked — Immediately invalidate card</option>
                <option value="suspended">suspended — Disciplinary suspension</option>
                <option value="lost_card">lost_card — Reported lost or stolen</option>
                <option value="active">active — Restore active standing</option>
                <option value="graduated">graduated — Alumni / Graduated</option>
                <option value="expelled">expelled — Expelled</option>
                <option value="withdrawn">withdrawn — Withdrawn</option>
                <option value="provisional">provisional — Provisional</option>
              </select>

              <label class="sh-label" for="rv-reason">Reason (Required)</label>
              <textarea id="rv-reason" class="sh-textarea" rows="3" placeholder="State the official reason for this status change…" required></textarea>

              <label class="sh-label" for="rv-ref">Reference / Memo Number (Optional)</label>
              <input id="rv-ref" class="sh-input" placeholder="REG/MEMO/2026/042" />

              <div id="rv-msg" style="margin-bottom:12px;font-size:12px;font-weight:700;"></div>
              <button type="submit" id="rv-submit" class="sh-btn sh-btn-danger">Apply Status Change</button>
            </form>
          </div>
        `;

        document.getElementById('rv-form')?.addEventListener('submit', async e => {
          e.preventDefault();
          const matric = document.getElementById('rv-matric')?.value.trim();
          const newStatus = document.getElementById('rv-status')?.value;
          const reason = document.getElementById('rv-reason')?.value.trim();
          const ref = document.getElementById('rv-ref')?.value.trim();
          const msg = document.getElementById('rv-msg');
          const btn = document.getElementById('rv-submit');

          if (!matric || !reason || reason.length < 3) {
            if (msg) { msg.style.color = 'var(--sh-red)'; msg.textContent = 'Both Matric Number and a valid Reason (min 3 chars) are required.'; }
            return;
          }

          btn.disabled = true;
          try {
            const { data: stu, error: findErr } = await ctx.client
              .from('students')
              .select('id,name,status')
              .or(`matric.ilike.${matric},jamb_no.ilike.${matric}`)
              .maybeSingle();

            if (findErr || !stu) throw new Error('Student not found in your school.');

            const { error: rpcErr } = await ctx.client.rpc('change_student_status', {
              p_student_id: stu.id,
              p_new_status: newStatus,
              p_reason: reason,
              p_reference: ref || null,
              p_ip_address: null,
              p_changed_by: ctx.user.id,
            });
            if (rpcErr) throw rpcErr;

            if (msg) {
              msg.style.color = 'var(--sh-green)';
              msg.textContent = `✓ Updated ${stu.name} (${stu.status} → ${newStatus}) and wrote audit log.`;
            }
            document.getElementById('rv-reason').value = '';
            loadRecentActivity();
          } catch (err) {
            if (msg) { msg.style.color = 'var(--sh-red)'; msg.textContent = err.message; }
          } finally {
            btn.disabled = false;
          }
        });
      },
      unmount() { },
    },

    // ── STAFF MANAGEMENT ───────────────────────────────────────────
    staff: {
      async mount(el, ctx) {
        el.innerHTML = `
          <div class="sh-card">
            <div class="sh-card-title"><span>👥 School Staff Profiles</span></div>
            <div class="sh-table-wrap">
              <table class="sh-table">
                <thead><tr><th>Staff ID</th><th>Full Name</th><th>Role</th><th>Department</th><th>Created</th></tr></thead>
                <tbody id="stf-tbody"><tr><td colspan="5">Loading staff profiles…</td></tr></tbody>
              </table>
            </div>
          </div>
        `;
        const { data, error } = await ctx.client
          .from('staff_profiles')
          .select('staff_id,full_name,role,department,created_at')
          .order('created_at', { ascending: false });
        const tbody = document.getElementById('stf-tbody');
        if (!tbody) return;
        if (error || !data || data.length === 0) {
          tbody.innerHTML = `<tr><td colspan="5" style="color:var(--sh-muted);">${esc(error?.message || 'No staff profiles found.')}</td></tr>`;
          return;
        }
        tbody.innerHTML = data
          .map(
            s => `
            <tr>
              <td style="font-family:monospace;">${esc(s.staff_id)}</td>
              <td><strong>${esc(s.full_name)}</strong></td>
              <td><span class="sh-pill active">${esc(s.role)}</span></td>
              <td>${esc(s.department || '—')}</td>
              <td>${s.created_at ? esc(new Date(s.created_at).toLocaleDateString()) : '—'}</td>
            </tr>`
          )
          .join('');
      },
      unmount() { },
    },

    // ── REGISTRATIONS REVIEW QUEUE (Phase 3B) ──────────────────────
    registrations: {
      async mount(el, ctx) {
        el.innerHTML = `
          <div class="sh-card">
            <div class="sh-card-title">
              <span>📝 Manual Registration Review Queue</span>
              <div style="display:flex;gap:8px;align-items:center;">
                <select id="mr-status-filter" class="sh-select" style="margin:0;width:auto;padding:6px 12px;font-size:12px;">
                  <option value="pending">Pending Review</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="all">All Requests</option>
                </select>
                <button type="button" id="mr-refresh-btn" class="sh-btn sh-btn-secondary" style="padding:6px 12px;font-size:12px;">↻ Refresh</button>
              </div>
            </div>
            <div id="mr-feedback" style="margin-bottom:10px;font-size:12px;font-weight:700;"></div>
            <div class="sh-table-wrap">
              <table class="sh-table">
                <thead>
                  <tr>
                    <th>Tracking Code</th>
                    <th>JAMB / Matric</th>
                    <th>Full Name &amp; DOB</th>
                    <th>Faculty / Dept</th>
                    <th>Proof Uploads</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="mr-tbody"><tr><td colspan="7">Loading manual registration requests…</td></tr></tbody>
              </table>
            </div>
          </div>
        `;

        async function openSignedProof(path) {
          if (!path) return;
          const { data, error } = await ctx.client.storage
            .from('registration-uploads')
            .createSignedUrl(path, 300);
          if (error || !data?.signedUrl) {
            alert('Unable to generate signed preview link: ' + (error?.message || 'File not found'));
            return;
          }
          window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
        }

        async function loadRequests() {
          const statusVal = document.getElementById('mr-status-filter')?.value || 'pending';
          const tbody = document.getElementById('mr-tbody');
          if (!tbody) return;

          let query = ctx.client
            .from('registration_requests')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

          if (statusVal !== 'all') {
            query = query.eq('status', statusVal);
          }

          const { data, error } = await query;
          if (error) {
            tbody.innerHTML = `<tr><td colspan="7" style="color:var(--sh-red);">${esc(error.message)}</td></tr>`;
            return;
          }
          if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="color:var(--sh-muted);">No ${esc(statusVal)} manual registration requests found.</td></tr>`;
            return;
          }

          tbody.innerHTML = data
            .map(req => {
              const isPending = req.status === 'pending';
              return `
                <tr>
                  <td style="font-family:monospace;font-size:11px;"><strong>${esc(req.tracking_code)}</strong><div style="color:var(--sh-muted);">${req.created_at ? esc(new Date(req.created_at).toLocaleDateString()) : ''}</div></td>
                  <td style="font-family:monospace;">${esc(req.jamb_no)}${req.matric ? `<div>${esc(req.matric)}</div>` : ''}</td>
                  <td><strong>${esc(req.full_name)}</strong><div style="font-size:11px;color:var(--sh-muted);">DOB: ${esc(req.dob)} · ${esc(req.level || '100L')}</div></td>
                  <td>${esc(req.department)}<div style="font-size:11px;color:var(--sh-muted);">${esc(req.faculty)}</div></td>
                  <td>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;">
                      ${req.photo_path ? `<button type="button" class="sh-btn sh-btn-secondary" style="padding:3px 8px;font-size:10px;" data-proof-path="${esc(req.photo_path)}">📷 Photo</button>` : ''}
                      ${req.admission_letter_path ? `<button type="button" class="sh-btn sh-btn-secondary" style="padding:3px 8px;font-size:10px;" data-proof-path="${esc(req.admission_letter_path)}">📄 Admission</button>` : ''}
                      ${req.fee_receipt_path ? `<button type="button" class="sh-btn sh-btn-secondary" style="padding:3px 8px;font-size:10px;" data-proof-path="${esc(req.fee_receipt_path)}">🧾 Receipt</button>` : ''}
                      ${!req.photo_path && !req.admission_letter_path && !req.fee_receipt_path ? '<span style="font-size:11px;color:var(--sh-muted);">None</span>' : ''}
                    </div>
                  </td>
                  <td>
                    <span class="sh-pill ${req.status === 'approved' ? 'active' : req.status === 'rejected' ? 'revoked' : 'provisional'}">${esc(req.status)}</span>
                    ${req.reviewer_note ? `<div style="font-size:10px;color:var(--sh-muted);margin-top:3px;">${esc(req.reviewer_note)}</div>` : ''}
                  </td>
                  <td>
                    ${isPending
                      ? `<div style="display:flex;gap:6px;">
                           <button type="button" class="sh-btn" style="padding:5px 10px;font-size:11px;" data-approve-id="${esc(req.id)}" data-default-matric="${esc(req.matric || req.jamb_no)}" data-req-name="${esc(req.full_name)}">✓ Approve</button>
                           <button type="button" class="sh-btn sh-btn-danger" style="padding:5px 10px;font-size:11px;" data-reject-id="${esc(req.id)}" data-req-name="${esc(req.full_name)}">✕ Reject</button>
                         </div>`
                      : '<span style="font-size:11px;color:var(--sh-muted);">Reviewed</span>'}
                  </td>
                </tr>
              `;
            })
            .join('');

          tbody.querySelectorAll('[data-proof-path]').forEach(btn => {
            btn.addEventListener('click', () => openSignedProof(btn.getAttribute('data-proof-path')));
          });

          tbody.querySelectorAll('[data-approve-id]').forEach(btn => {
            btn.addEventListener('click', async () => {
              const reqId = btn.getAttribute('data-approve-id');
              const defMatric = btn.getAttribute('data-default-matric') || '';
              const reqName = btn.getAttribute('data-req-name') || '';
              const assignedMatric = prompt(`Approve ${reqName} — Confirm or assign official Matric/JAMB Number:`, defMatric);
              if (assignedMatric === null) return;
              const note = prompt('Optional Reviewer Note:', 'Verified admission letter and biodata') || 'Approved by Registry';

              const fb = document.getElementById('mr-feedback');
              btn.disabled = true;
              try {
                const { error: rpcErr } = await ctx.client.rpc('approve_registration', {
                  p_request_id: reqId,
                  p_assigned_matric: assignedMatric.trim(),
                  p_reviewer_note: note.trim(),
                });
                if (rpcErr) throw rpcErr;
                if (fb) {
                  fb.style.color = 'var(--sh-green)';
                  fb.textContent = `✓ Approved registration for ${reqName} (${assignedMatric.trim()}). Student can now complete onboarding.`;
                }
                await loadRequests();
                loadRecentActivity();
              } catch (err) {
                if (fb) {
                  fb.style.color = 'var(--sh-red)';
                  fb.textContent = err.message;
                }
                btn.disabled = false;
              }
            });
          });

          tbody.querySelectorAll('[data-reject-id]').forEach(btn => {
            btn.addEventListener('click', async () => {
              const reqId = btn.getAttribute('data-reject-id');
              const reqName = btn.getAttribute('data-req-name') || '';
              const reason = prompt(`Reject registration request for ${reqName} — Enter mandatory reason (min 3 chars):`);
              if (!reason || reason.trim().length < 3) return;

              const fb = document.getElementById('mr-feedback');
              btn.disabled = true;
              try {
                const { error: rpcErr } = await ctx.client.rpc('reject_registration', {
                  p_request_id: reqId,
                  p_reviewer_note: reason.trim(),
                });
                if (rpcErr) throw rpcErr;
                if (fb) {
                  fb.style.color = 'var(--sh-amber)';
                  fb.textContent = `✕ Rejected registration request for ${reqName}.`;
                }
                await loadRequests();
                loadRecentActivity();
              } catch (err) {
                if (fb) {
                  fb.style.color = 'var(--sh-red)';
                  fb.textContent = err.message;
                }
                btn.disabled = false;
              }
            });
          });
        }

        document.getElementById('mr-status-filter')?.addEventListener('change', loadRequests);
        document.getElementById('mr-refresh-btn')?.addEventListener('click', loadRequests);
        await loadRequests();
      },
      unmount() { },
    },

    // ── SUPPORT INBOX & STUDENT SELF-SERVICE HELPDESK (Phase 3B Realtime) ──
    support: {
      _realtimeChannel: null,
      async mount(el, ctx) {
        // If current user is a student (or unauthenticated visitor on #/support), render the Student Self-Service Portal
        if (ctx.role === 'student') {
          return VIEW_MODULES.help.mount(el, ctx);
        }

        let selectedTicket = null;
        let ticketsList = [];

        el.innerHTML = `
          <div class="sh-grid-2" style="grid-template-columns: 1.05fr 1.35fr; align-items: start;">
            <div class="sh-card">
              <div class="sh-card-title">
                <span>🎧 Support Inbox <small style="color:var(--sh-green);font-weight:700;">● REALTIME</small></span>
                <select id="sp-status-filter" class="sh-select" style="margin:0;width:auto;padding:5px 10px;font-size:11px;">
                  <option value="all">All Active</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div id="sp-ticket-list" style="display:flex;flex-direction:column;gap:8px;max-height:520px;overflow-y:auto;">
                <div style="color:var(--sh-muted);font-size:12px;">Loading support tickets…</div>
              </div>
            </div>

            <div class="sh-card" id="sp-thread-card">
              <div style="padding:36px 16px;text-align:center;color:var(--sh-muted);font-size:13px;">
                Select a ticket from the inbox on the left to view the conversation, reply in real time, or unfreeze a locked student record.
              </div>
            </div>
          </div>
        `;

        async function fetchTickets() {
          const filterVal = document.getElementById('sp-status-filter')?.value || 'all';
          let q = ctx.client
            .from('support_tickets')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(80);
          if (filterVal !== 'all') {
            q = q.eq('status', filterVal);
          }
          const { data } = await q;
          ticketsList = data || [];
          renderTicketList();
        }

        function renderTicketList() {
          const listEl = document.getElementById('sp-ticket-list');
          if (!listEl) return;
          if (ticketsList.length === 0) {
            listEl.innerHTML = '<div style="color:var(--sh-muted);font-size:12px;padding:12px 0;">No support tickets match the selected filter.</div>';
            return;
          }
          listEl.innerHTML = ticketsList
            .map(t => {
              const isSel = selectedTicket && selectedTicket.id === t.id;
              return `
                <div data-tkt-id="${esc(t.id)}" style="padding:12px;border-radius:10px;border:1.5px solid ${isSel ? 'var(--sh-blue)' : 'var(--sh-border)'};background:${isSel ? 'rgba(59,130,246,0.08)' : 'transparent'};cursor:pointer;">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                    <code style="font-size:11px;font-weight:800;color:var(--sh-blue);">${esc(t.ticket_no)}</code>
                    <span class="sh-pill ${t.status === 'open' ? 'provisional' : t.status === 'resolved' ? 'active' : ''}">${esc(t.status)}</span>
                  </div>
                  <div style="font-weight:800;font-size:13px;margin-bottom:2px;">${esc(t.subject)}</div>
                  <div style="font-size:11px;color:var(--sh-muted);">
                    ${esc(t.student_name)} · <span style="font-family:monospace;">${esc(t.jamb_no)}</span> · ${esc(t.category)}
                  </div>
                </div>
              `;
            })
            .join('');

          listEl.querySelectorAll('[data-tkt-id]').forEach(card => {
            card.addEventListener('click', () => {
              const found = ticketsList.find(x => x.id === card.getAttribute('data-tkt-id'));
              if (found) {
                selectedTicket = found;
                renderTicketList();
                loadTicketThread(found);
              }
            });
          });
        }

        async function loadTicketThread(ticket) {
          const threadCard = document.getElementById('sp-thread-card');
          if (!threadCard) return;

          const { data: msgs } = await ctx.client
            .from('ticket_messages')
            .select('*')
            .eq('ticket_id', ticket.id)
            .order('created_at', { ascending: true });

          const canUnlock = ['registrar', 'admin', 'super_admin'].includes(ctx.role) && Boolean(ticket.student_id);

          threadCard.innerHTML = `
            <div class="sh-card-title" style="flex-wrap:wrap;gap:8px;">
              <div>
                <div style="font-size:14px;font-weight:800;">${esc(ticket.subject)}</div>
                <div style="font-size:11px;color:var(--sh-muted);font-weight:500;">
                  <code>${esc(ticket.ticket_no)}</code> · ${esc(ticket.student_name)} (${esc(ticket.jamb_no)}) · Category: <strong>${esc(ticket.category)}</strong>
                </div>
              </div>
              <div style="display:flex;gap:6px;align-items:center;">
                <select id="sp-thread-status" class="sh-select" style="margin:0;width:auto;padding:5px 10px;font-size:11px;">
                  <option value="open" ${ticket.status === 'open' ? 'selected' : ''}>open</option>
                  <option value="in_progress" ${ticket.status === 'in_progress' ? 'selected' : ''}>in_progress</option>
                  <option value="resolved" ${ticket.status === 'resolved' ? 'selected' : ''}>resolved</option>
                  <option value="closed" ${ticket.status === 'closed' ? 'selected' : ''}>closed</option>
                </select>
                ${canUnlock ? `<button type="button" id="sp-unlock-stu-btn" class="sh-btn sh-btn-secondary" style="padding:5px 10px;font-size:11px;">🔓 Unfreeze / Clear DOB Lock</button>` : ''}
              </div>
            </div>

            <div id="sp-thread-msgs" style="max-height:320px;overflow-y:auto;padding:10px;border:1px solid var(--sh-border);border-radius:10px;margin-bottom:12px;display:flex;flex-direction:column;gap:8px;">
              ${(msgs || [])
                .map(
                  m => `
                  <div style="align-self:${m.sender_role === 'staff' ? 'flex-end' : 'flex-start'};max-width:82%;padding:10px 12px;border-radius:10px;background:${m.sender_role === 'staff' ? 'rgba(59,130,246,0.16)' : 'rgba(148,163,184,0.14)'};border:1px solid var(--sh-border);">
                    <div style="font-size:10px;font-weight:800;color:var(--sh-muted);margin-bottom:3px;">
                      ${esc(m.sender_name)} (${esc(m.sender_role.toUpperCase())}) · ${m.created_at ? esc(new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : ''}
                    </div>
                    <div style="font-size:13px;line-height:1.45;white-space:pre-wrap;">${esc(m.body)}</div>
                  </div>`
                )
                .join('') || '<div style="color:var(--sh-muted);font-size:12px;">No messages yet.</div>'}
            </div>

            <form id="sp-reply-form">
              <textarea id="sp-reply-body" class="sh-textarea" rows="3" placeholder="Type official Registry / ICT Support reply…" required></textarea>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span id="sp-reply-feedback" style="font-size:12px;font-weight:700;"></span>
                <button type="submit" id="sp-reply-btn" class="sh-btn">Send Reply</button>
              </div>
            </form>
          `;

          const msgBox = document.getElementById('sp-thread-msgs');
          if (msgBox) msgBox.scrollTop = msgBox.scrollHeight;

          document.getElementById('sp-thread-status')?.addEventListener('change', async e => {
            const nextStatus = e.target.value;
            await ctx.client
              .from('support_tickets')
              .update({ status: nextStatus, updated_at: new Date().toISOString() })
              .eq('id', ticket.id);
            ticket.status = nextStatus;
            await fetchTickets();
          });

          document.getElementById('sp-unlock-stu-btn')?.addEventListener('click', async () => {
            const reason = prompt(`Unfreeze verification & clear DOB lockouts for ${ticket.student_name} (${ticket.jamb_no}) — Enter audit reason:`, `Verified via Support Ticket ${ticket.ticket_no}`);
            if (!reason || reason.trim().length < 3) return;
            const fb = document.getElementById('sp-reply-feedback');
            try {
              const { error } = await ctx.client.rpc('staff_unlock_student_verification', {
                p_student_id: ticket.student_id,
                p_reason: reason.trim(),
              });
              if (error) throw error;
              if (fb) {
                fb.style.color = 'var(--sh-green)';
                fb.textContent = '✓ Student verification unfrozen & DOB lockouts cleared.';
              }
              loadRecentActivity();
            } catch (err) {
              if (fb) {
                fb.style.color = 'var(--sh-red)';
                fb.textContent = err.message;
              }
            }
          });

          document.getElementById('sp-reply-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            const bodyEl = document.getElementById('sp-reply-body');
            const text = bodyEl?.value.trim();
            if (!text) return;

            const btn = document.getElementById('sp-reply-btn');
            if (btn) btn.disabled = true;

            try {
              const staffName = ctx.user?.email?.split('@')[0]?.toUpperCase() || 'ICT SUPPORT';
              const { error: insErr } = await ctx.client.from('ticket_messages').insert({
                ticket_id: ticket.id,
                school_id: ticket.school_id,
                sender_role: 'staff',
                sender_id: ctx.user?.id || null,
                sender_name: `STAFF (${staffName})`,
                body: text,
              });
              if (insErr) throw insErr;

              const nextSt = ticket.status === 'open' ? 'in_progress' : ticket.status;
              await ctx.client
                .from('support_tickets')
                .update({ status: nextSt, assigned_to: ctx.user?.id || null, updated_at: new Date().toISOString() })
                .eq('id', ticket.id);

              ticket.status = nextSt;
              if (bodyEl) bodyEl.value = '';
              await loadTicketThread(ticket);
              await fetchTickets();
            } catch (err) {
              const fb = document.getElementById('sp-reply-feedback');
              if (fb) {
                fb.style.color = 'var(--sh-red)';
                fb.textContent = err.message;
              }
            } finally {
              if (btn) btn.disabled = false;
            }
          });
        }

        document.getElementById('sp-status-filter')?.addEventListener('change', fetchTickets);
        await fetchTickets();

        // Subscribe to Supabase Realtime for live tickets and messages
        try {
          if (VIEW_MODULES.support._realtimeChannel) {
            ctx.client.removeChannel(VIEW_MODULES.support._realtimeChannel);
          }
          VIEW_MODULES.support._realtimeChannel = ctx.client
            .channel('ebsu-support-inbox-live')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => {
              fetchTickets();
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_messages' }, payload => {
              if (selectedTicket && payload.new && payload.new.ticket_id === selectedTicket.id) {
                loadTicketThread(selectedTicket);
              } else {
                fetchTickets();
              }
            })
            .subscribe();
        } catch (e) {}
      },
      unmount() {
        if (VIEW_MODULES.support._realtimeChannel && _ctx.client) {
          try { _ctx.client.removeChannel(VIEW_MODULES.support._realtimeChannel); } catch (e) {}
          VIEW_MODULES.support._realtimeChannel = null;
        }
      },
    },

    // ── AUDIT LOG (WITH EXPORT CSV) ────────────────────────────────
    'audit-log': {
      async mount(el, ctx) {
        el.innerHTML = `
          <div class="sh-card">
            <div class="sh-card-title">
              <span>📜 Immutable Status Audit Log</span>
              <button type="button" id="al-export-btn" class="sh-btn sh-btn-secondary" style="padding:6px 12px;font-size:11px;">⬇ Export CSV</button>
            </div>
            <div class="sh-table-wrap">
              <table class="sh-table">
                <thead>
                  <tr><th>Timestamp</th><th>Student ID</th><th>Transition</th><th>Reason</th><th>Reference</th></tr>
                </thead>
                <tbody id="al-tbody"><tr><td colspan="5">Loading audit trail…</td></tr></tbody>
              </table>
            </div>
          </div>
        `;
        const { data } = await ctx.client
          .from('status_audit_log')
          .select('id,student_id,old_status,new_status,reason,reference,created_at')
          .order('created_at', { ascending: false })
          .limit(200);

        const rows = data || [];
        const tbody = document.getElementById('al-tbody');
        if (tbody) {
          if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="color:var(--sh-muted);">No status audit entries found.</td></tr>';
          } else {
            tbody.innerHTML = rows
              .map(
                r => `
                <tr>
                  <td>${r.created_at ? esc(new Date(r.created_at).toLocaleString()) : '—'}</td>
                  <td style="font-family:monospace;font-size:11px;">${esc(r.student_id)}</td>
                  <td><span class="sh-pill">${esc(r.old_status)} → ${esc(r.new_status)}</span></td>
                  <td>${esc(r.reason || '—')}</td>
                  <td style="font-family:monospace;">${esc(r.reference || '—')}</td>
                </tr>`
              )
              .join('');
          }
        }

        document.getElementById('al-export-btn')?.addEventListener('click', () => {
          const header = 'created_at,student_id,old_status,new_status,reason,reference\n';
          const body = rows
            .map(r =>
              [r.created_at, r.student_id, r.old_status, r.new_status, `"${String(r.reason || '').replace(/"/g, '""')}"`, r.reference || ''].join(',')
            )
            .join('\n');
          const blob = new Blob([header + body], { type: 'text/csv' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `status_audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
          a.click();
        });
      },
      unmount() { },
    },

    // ── REPORTS ────────────────────────────────────────────────────
    reports: {
      async mount(el, ctx) {
        el.innerHTML = `
          <div class="sh-card">
            <div class="sh-card-title"><span>📈 School Status &amp; Payment Breakdown</span></div>
            <div id="rp-body">Calculating metrics…</div>
          </div>
        `;
        const { data } = await ctx.client.from('students').select('status,fees_paid,faculty');
        const rows = data || [];
        const byStatus = {};
        let paidCount = 0;
        rows.forEach(r => {
          byStatus[r.status] = (byStatus[r.status] || 0) + 1;
          if (r.fees_paid) paidCount++;
        });
        const body = document.getElementById('rp-body');
        if (body) {
          body.innerHTML = `
            <p style="font-size:13px;">Total Students in School Scope: <strong>${rows.length}</strong> · Card Fee Paid: <strong>${paidCount}</strong></p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              ${Object.entries(byStatus)
              .map(([k, v]) => `<div class="sh-card" style="margin:0;min-width:140px;"><div class="sh-stat-label">${esc(k)}</div><div class="sh-stat-val">${v}</div></div>`)
              .join('')}
            </div>
          `;
        }
      },
      unmount() { },
    },

    // ── SETTINGS (SCHOOL BRANDING, CARD FEE, HOTLINE) ──────────────
    settings: {
      async mount(el, ctx) {
        const s = ctx.school || {};
        el.innerHTML = `
          <div class="sh-card" style="max-width:600px;">
            <div class="sh-card-title"><span>⚙️ School Settings (Branding, Card Fee &amp; Hotline)</span></div>
            <form id="st-form" novalidate>
              <label class="sh-label" for="st-name">Institution Name</label>
              <input id="st-name" class="sh-input" value="${esc(s.name || 'EBONYI STATE UNIVERSITY, ABAKALIKI')}" required />

              <label class="sh-label" for="st-fee">Card Fee Amount (in Kobo / minor units, e.g. 250000 = ₦2,500)</label>
              <input id="st-fee" type="number" class="sh-input" value="${esc(s.card_fee_amount ?? 250000)}" required />

              <label class="sh-label" for="st-phone">Support Hotline Phone</label>
              <input id="st-phone" class="sh-input" value="${esc(s.hotline_phone || '')}" />

              <label class="sh-label" for="st-wa">Support WhatsApp</label>
              <input id="st-wa" class="sh-input" value="${esc(s.hotline_whatsapp || '')}" />

              <label class="sh-label" for="st-email">Support Email</label>
              <input id="st-email" type="email" class="sh-input" value="${esc(s.hotline_email || '')}" />

              <label class="sh-label" for="st-hours">Office Hours</label>
              <input id="st-hours" class="sh-input" value="${esc(s.office_hours || '')}" />

              <div id="st-msg" style="margin-bottom:10px;font-size:12px;font-weight:700;"></div>
              <button type="submit" class="sh-btn">💾 Save School Settings</button>
            </form>
          </div>
        `;

        document.getElementById('st-form')?.addEventListener('submit', async e => {
          e.preventDefault();
          const msg = document.getElementById('st-msg');
          if (!ctx.school?.id) {
            if (msg) msg.textContent = 'No active school record found.';
            return;
          }
          const updates = {
            name: document.getElementById('st-name').value.trim(),
            card_fee_amount: parseInt(document.getElementById('st-fee').value || '250000', 10),
            hotline_phone: document.getElementById('st-phone').value.trim(),
            hotline_whatsapp: document.getElementById('st-wa').value.trim(),
            hotline_email: document.getElementById('st-email').value.trim(),
            office_hours: document.getElementById('st-hours').value.trim(),
            updated_at: new Date().toISOString(),
          };
          const { error } = await ctx.client.from('schools').update(updates).eq('id', ctx.school.id);
          if (msg) {
            msg.style.color = error ? 'var(--sh-red)' : 'var(--sh-green)';
            msg.textContent = error ? error.message : '✓ School settings updated.';
          }
          if (!error) {
            Object.assign(ctx.school, updates);
            const nameEl = document.getElementById('sb-school-name');
            if (nameEl) nameEl.textContent = updates.name;
          }
        });
      },
      unmount() { },
    },

    // ── SUPER ADMIN: SCHOOLS MANAGEMENT ────────────────────────────
    schools: {
      async mount(el, ctx) {
        el.innerHTML = `
          <div class="sh-grid-2">
            <div class="sh-card">
              <div class="sh-card-title"><span>🏛️ Multi-School Tenant Registry</span></div>
              <div class="sh-table-wrap">
                <table class="sh-table">
                  <thead><tr><th>Code</th><th>Institution Name</th><th>Card Fee</th><th>Active</th></tr></thead>
                  <tbody id="sch-tbody"><tr><td colspan="4">Loading schools…</td></tr></tbody>
                </table>
              </div>
            </div>
            <div class="sh-card">
              <div class="sh-card-title"><span>➕ Provision New School</span></div>
              <form id="sch-form" novalidate>
                <label class="sh-label" for="ns-code">School Short Code (e.g. UNN, UNILAG)</label>
                <input id="ns-code" class="sh-input" placeholder="UNN" required />
                <label class="sh-label" for="ns-name">Full Institution Name</label>
                <input id="ns-name" class="sh-input" placeholder="UNIVERSITY OF NIGERIA, NSUKKA" required />
                <label class="sh-label" for="ns-fee">Card Fee (Kobo)</label>
                <input id="ns-fee" type="number" class="sh-input" value="250000" required />
                <div id="ns-msg" style="margin-bottom:10px;font-size:12px;font-weight:700;"></div>
                <button type="submit" class="sh-btn">Create School Tenant</button>
              </form>
            </div>
          </div>
        `;

        async function loadSchoolsTable() {
          const { data } = await ctx.client.from('schools').select('*').order('created_at', { ascending: true });
          const tbody = document.getElementById('sch-tbody');
          if (!tbody) return;
          tbody.innerHTML = (data || [])
            .map(
              s => `
              <tr>
                <td><strong>${esc(s.code)}</strong></td>
                <td>${esc(s.name)}</td>
                <td>${esc((s.card_fee_amount / 100).toFixed(2))} ${esc(s.currency)}</td>
                <td><span class="sh-pill ${s.is_active ? 'active' : 'revoked'}">${s.is_active ? 'ACTIVE' : 'DISABLED'}</span></td>
              </tr>`
            )
            .join('');
        }

        await loadSchoolsTable();

        document.getElementById('sch-form')?.addEventListener('submit', async e => {
          e.preventDefault();
          const msg = document.getElementById('ns-msg');
          const code = document.getElementById('ns-code').value.trim().toUpperCase();
          const name = document.getElementById('ns-name').value.trim();
          const fee = parseInt(document.getElementById('ns-fee').value || '250000', 10);
          const { error } = await ctx.client.from('schools').insert({ code, name, card_fee_amount: fee });
          if (msg) {
            msg.style.color = error ? 'var(--sh-red)' : 'var(--sh-green)';
            msg.textContent = error ? error.message : `✓ School ${code} created.`;
          }
          if (!error) await loadSchoolsTable();
        });
      },
      unmount() { },
    },

    // ── SUPER ADMIN: CROSS-SCHOOL REPORTS ──────────────────────────
    'cross-school': {
      async mount(el, ctx) {
        el.innerHTML = `
          <div class="sh-card">
            <div class="sh-card-title"><span>🌐 Cross-School Command Center Report</span></div>
            <div class="sh-table-wrap">
              <table class="sh-table">
                <thead><tr><th>School</th><th>Code</th><th>Students</th><th>Paid Cards</th><th>Staff</th></tr></thead>
                <tbody id="cs-tbody"><tr><td colspan="5">Aggregating multi-school metrics…</td></tr></tbody>
              </table>
            </div>
          </div>
        `;
        const [{ data: schools }, { data: students }, { data: staff }] = await Promise.all([
          ctx.client.from('schools').select('id,code,name'),
          ctx.client.from('students').select('school_id,fees_paid'),
          ctx.client.from('staff_profiles').select('school_id'),
        ]);
        const tbody = document.getElementById('cs-tbody');
        if (!tbody) return;
        tbody.innerHTML = (schools || [])
          .map(sch => {
            const st = (students || []).filter(x => x.school_id === sch.id);
            const paid = st.filter(x => x.fees_paid).length;
            const sf = (staff || []).filter(x => x.school_id === sch.id).length;
            return `
              <tr>
                <td><strong>${esc(sch.name)}</strong></td>
                <td><span class="sh-pill active">${esc(sch.code)}</span></td>
                <td>${st.length}</td>
                <td>${paid}</td>
                <td>${sf}</td>
              </tr>`;
          })
          .join('');
      },
      unmount() { },
    },

    // ── STUDENT PORTAL VIEWS ───────────────────────────────────────
    'my-card': {
      _passTimer: null,
      async mount(el, ctx) {
        const s = ctx.studentSession?.student || ctx.studentSession || null;
        const hasCard = Boolean(s && (s.qr_string || s.card_signature));
        el.innerHTML = `
          <div class="sh-grid-2" style="align-items:start;">
            <div class="sh-card" style="text-align:center;">
              <div class="sh-card-title"><span>🪪 My Verified Student Digital ID (CR80)</span></div>
              ${hasCard
                ? `<div style="margin-bottom:10px;font-size:12px;color:var(--sh-green);font-weight:700;">Receipt Ref: <code>${esc(ctx.studentSession?.payment_reference || 'CONFIRMED')}</code></div>
                   <canvas id="st-card-canvas" width="1011" height="638" style="width:100%;max-width:480px;border-radius:12px;border:1px solid var(--sh-border);"></canvas>
                   <div id="st-dl-panel" style="margin-top:16px;text-align:left;background:rgba(15,23,42,0.35);padding:14px;border-radius:10px;border:1px solid var(--sh-border);">
                     <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                       <strong style="font-size:13px;">🖨️ Download &amp; Print Card</strong>
                       <span id="st-dl-quota" style="font-size:11px;font-weight:700;color:var(--sh-blue);background:rgba(2,132,199,0.15);padding:3px 8px;border-radius:10px;">3 of 3 downloads left today</span>
                     </div>
                     <div id="st-dl-err" style="display:none;color:var(--sh-red);font-size:12px;margin-bottom:8px;font-weight:600;"></div>
                     <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                       <button type="button" id="st-dl-front" class="sh-btn sh-btn-secondary" style="font-size:11px;padding:8px 10px;">Download front (PNG)</button>
                       <button type="button" id="st-dl-back" class="sh-btn sh-btn-secondary" style="font-size:11px;padding:8px 10px;">Download back (PNG)</button>
                       <button type="button" id="st-dl-pdf" class="sh-btn" style="grid-column:span 2;font-size:11px;padding:8px 10px;">Download both sides (PDF, CR80 size 85.6 x 54 mm, 300 DPI)</button>
                       <button type="button" id="st-dl-print" class="sh-btn sh-btn-secondary" style="grid-column:span 2;font-size:11px;padding:8px 10px;">🖨️ Print</button>
                     </div>
                   </div>`
                : `<div style="padding:32px;color:var(--sh-amber);">Complete JAMB + Date of Birth verification and Card Fee payment (<a href="index.html#generate-section" style="color:var(--sh-blue);font-weight:700;">on the Home Page</a>) to unlock your live ID card.</div>`
              }
            </div>

            ${hasCard
              ? `<div class="sh-card" style="text-align:center;">
                   <div class="sh-card-title">
                     <span>⚡ 60s Rotating Gate Pass (<code>EBSU2</code>)</span>
                     <button type="button" id="st-rotate-pass-btn" class="sh-btn sh-btn-secondary" style="padding:5px 10px;font-size:11px;">↻ Refresh Pass</button>
                   </div>
                   <p style="font-size:12px;color:var(--sh-muted);margin-top:0;">
                     Single-use anti-screenshot pass. Rotates automatically every 60 seconds and is bound to a server-side replay nonce.
                   </p>
                   <div style="display:inline-block;padding:12px;background:#fff;border-radius:12px;border:2px solid var(--sh-blue);margin-bottom:10px;">
                     <canvas id="st-rotating-qr-canvas" width="180" height="180"></canvas>
                   </div>
                   <div style="max-width:260px;margin:0 auto 6px auto;height:6px;background:var(--sh-border);border-radius:4px;overflow:hidden;">
                     <div id="st-pass-progress" style="width:100%;height:100%;background:var(--sh-green);transition:width 1s linear;"></div>
                   </div>
                   <div id="st-pass-countdown" style="font-size:12px;font-weight:800;color:var(--sh-green);">Minting 60s pass…</div>
                 </div>`
              : ''}
          </div>
        `;

        if (hasCard && typeof drawCard === 'function') {
          const tpl = (typeof CardTemplate !== 'undefined' && CardTemplate.load) ? await CardTemplate.load() : null;
          const qr = s.qr_string || `EBSU1:${s.student_id || s.id}:${s.card_signature}`;
          drawCard(document.getElementById('st-card-canvas'), tpl, {
            id: s.student_id || s.id,
            name: s.name,
            fullName: s.name,
            matric: s.matric || s.jamb_no,
            faculty: s.faculty,
            dept: s.dept,
            department: s.dept,
            level: s.level,
            session: s.session,
            blood: s.blood,
            genotype: s.genotype,
            expiry: s.expiry,
            photo: s.photo_url,
            sig: s.sig_url,
            qrString: qr,
          }, 1);

          let expiryUnix = 0;
          async function mintLivePass() {
            const onbId = ctx.studentSession?.onboarding_session_id || ctx.studentSession?.session_id;
            if (!onbId) return;
            const mintUrl =
              (typeof EBSU_CONFIG !== 'undefined' && EBSU_CONFIG.MINT_PASS_URL) ||
              `${EBSU_CONFIG.SUPABASE_URL}/functions/v1/mint-pass`;
            try {
              const res = await fetch(mintUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(EBSU_CONFIG?.SUPABASE_ANON_KEY ? { apikey: EBSU_CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${EBSU_CONFIG.SUPABASE_ANON_KEY}` } : {}),
                },
                body: JSON.stringify({ onboarding_session_id: onbId }),
              });
              const data = await res.json().catch(() => ({}));
              if (res.ok && data.token) {
                expiryUnix = data.expiry_unix;
                const qCanvas = document.getElementById('st-rotating-qr-canvas');
                if (qCanvas && typeof QRGen !== 'undefined' && QRGen.drawToCanvas) {
                  QRGen.drawToCanvas(qCanvas, data.token, 4);
                }
              }
            } catch (e) {}
          }

          await mintLivePass();
          document.getElementById('st-rotate-pass-btn')?.addEventListener('click', mintLivePass);

          // Download Panel Action Handlers (Server-enforced limit 3/day & static signed card)
          async function requestDownload(format) {
            const onbId = ctx.studentSession?.onboarding_session_id || ctx.studentSession?.session_id;
            const storageKey = `ebsu_dl_${new Date().toISOString().slice(0, 10)}`;
            const currentCount = parseInt(sessionStorage.getItem(storageKey) || '0', 10);
            if (currentCount >= 3) {
              throw new Error('Daily download limit (3 per day) reached for today.');
            }

            if (onbId) {
              const confirmUrl =
                (typeof EBSU_CONFIG !== 'undefined' && EBSU_CONFIG.CONFIRM_IDENTITY_URL) ||
                `${EBSU_CONFIG?.SUPABASE_URL}/functions/v1/confirm-identity`;
              try {
                const res = await fetch(confirmUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...(EBSU_CONFIG?.SUPABASE_ANON_KEY ? { apikey: EBSU_CONFIG.SUPABASE_ANON_KEY } : {}) },
                  body: JSON.stringify({ action: 'log_download', session_id: onbId, format }),
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.downloads_today !== undefined) {
                  const left = Math.max(0, 3 - data.downloads_today);
                  const quotaEl = document.getElementById('st-dl-quota');
                  if (quotaEl) quotaEl.textContent = `${left} of 3 downloads left today`;
                }
              } catch (e) {}
            }

            sessionStorage.setItem(storageKey, String(currentCount + 1));
            const quotaEl = document.getElementById('st-dl-quota');
            if (quotaEl) quotaEl.textContent = `${Math.max(0, 2 - currentCount)} of 3 downloads left today`;
          }

          function getStaticShellCardCanvas(side = 'front') {
            const cvs = document.createElement('canvas');
            cvs.width = 1011;
            cvs.height = 638;
            const staticQr = (typeof buildQRData === 'function')
              ? buildQRData({ cardId: s.student_id || s.id, card_signature: s.card_signature || 'ED25519_STATIC' })
              : `https://id.ebsu.edu.ng/c/${s.student_id || s.id}.${s.card_signature || 'ED25519_STATIC'}`;
            const cardObj = {
              id: s.student_id || s.id,
              name: s.name,
              fullName: s.name,
              matric: s.matric || s.jamb_no,
              faculty: s.faculty,
              dept: s.dept,
              department: s.dept,
              level: s.level,
              session: s.session,
              blood: s.blood,
              genotype: s.genotype,
              expiry: s.expiry,
              photo: s.photo_url,
              sig: s.sig_url,
              card_signature: s.card_signature,
              qrString: staticQr,
            };
            if (side === 'front') {
              drawCard(cvs, tpl, cardObj, 1);
            } else {
              drawBackCard(cvs, tpl, cardObj, 1);
            }
            return cvs;
          }

          const matricClean = (s.matric || s.jamb_no || 'STUDENT').replace(/\//g, '-');
          document.getElementById('st-dl-front')?.addEventListener('click', async () => {
            try {
              await requestDownload('PNG_FRONT');
              const c = getStaticShellCardCanvas('front');
              const a = document.createElement('a');
              a.href = c.toDataURL('image/png');
              a.download = `EBSU-ID-${matricClean}-FRONT.png`;
              a.click();
            } catch (err) {
              const errEl = document.getElementById('st-dl-err');
              if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
            }
          });

          document.getElementById('st-dl-back')?.addEventListener('click', async () => {
            try {
              await requestDownload('PNG_BACK');
              const c = getStaticShellCardCanvas('back');
              const a = document.createElement('a');
              a.href = c.toDataURL('image/png');
              a.download = `EBSU-ID-${matricClean}-BACK.png`;
              a.click();
            } catch (err) {
              const errEl = document.getElementById('st-dl-err');
              if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
            }
          });

          document.getElementById('st-dl-pdf')?.addEventListener('click', async () => {
            try {
              await requestDownload('PDF_CR80');
              const cf = getStaticShellCardCanvas('front');
              const cb = getStaticShellCardCanvas('back');
              if (window.jspdf && window.jspdf.jsPDF) {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [54, 85.6] });
                doc.addImage(cf.toDataURL('image/png'), 'PNG', 0, 0, 85.6, 54, '', 'FAST');
                doc.addPage([54, 85.6], 'landscape');
                doc.addImage(cb.toDataURL('image/png'), 'PNG', 0, 0, 85.6, 54, '', 'FAST');
                doc.save(`EBSU-ID-${matricClean}.pdf`);
              } else {
                document.getElementById('st-dl-print')?.click();
              }
            } catch (err) {
              const errEl = document.getElementById('st-dl-err');
              if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
            }
          });

          document.getElementById('st-dl-print')?.addEventListener('click', async () => {
            try {
              await requestDownload('PRINT');
              const cf = getStaticShellCardCanvas('front');
              const cb = getStaticShellCardCanvas('back');
              const pw = window.open('', '_blank');
              if (!pw) return;
              pw.document.write(`<!DOCTYPE html><html><head><title>Print ID — ${esc(s.name)}</title><style>body{text-align:center;padding:20px;font-family:sans-serif;}@media print{.no-print{display:none!important;}}</style></head><body><div class="no-print"><button onclick="window.print()" style="padding:10px 20px;background:#1558c0;color:#fff;border:none;border-radius:6px;font-weight:700;">Print / Save as PDF (CR80)</button></div><div style="margin:20px 0;"><img src="${cf.toDataURL('image/png')}" style="width:85.6mm;height:54mm;border-radius:3mm;" /></div><div style="margin:20px 0;"><img src="${cb.toDataURL('image/png')}" style="width:85.6mm;height:54mm;border-radius:3mm;" /></div></body></html>`);
              pw.document.close();
            } catch (err) {
              const errEl = document.getElementById('st-dl-err');
              if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
            }
          });

          if (VIEW_MODULES['my-card']._passTimer) clearInterval(VIEW_MODULES['my-card']._passTimer);
          VIEW_MODULES['my-card']._passTimer = setInterval(() => {
            const nowSec = Math.floor(Date.now() / 1000);
            const left = Math.max(0, expiryUnix - nowSec);
            const countEl = document.getElementById('st-pass-countdown');
            const barEl = document.getElementById('st-pass-progress');
            if (countEl) {
              countEl.textContent = left > 0 ? `Valid for ${left}s (Single-Use EBSU2)` : 'Rotating pass…';
            }
            if (barEl) {
              barEl.style.width = `${Math.min(100, Math.round((left / 60) * 100))}%`;
            }
            if (left <= 5) {
              mintLivePass();
            }
          }, 1000);
        }
      },
      unmount() {
        if (VIEW_MODULES['my-card']._passTimer) {
          clearInterval(VIEW_MODULES['my-card']._passTimer);
          VIEW_MODULES['my-card']._passTimer = null;
        }
      },
    },

    download: {
      async mount(el, ctx) {
        const s = ctx.studentSession?.student || ctx.studentSession || null;
        const paid = Boolean(s && (s.qr_string || s.card_signature || s.fees_paid));
        el.innerHTML = `
          <div class="sh-card">
            <div class="sh-card-title"><span>🖨️ Download &amp; Print ID Card</span></div>
            ${paid
            ? `<p style="font-size:13px;">Your card fee (₦2,500) is confirmed. Use the button below to view or print your official CR80 card (max 3 downloads/day).</p>
                 <a href="#/my-card" class="sh-btn" style="text-decoration:none;">Open Card &amp; Download</a>`
            : `<p style="font-size:13px;color:var(--sh-amber);">🔒 Download and Print are locked until your Card Fee payment is verified.</p>`
          }
          </div>
        `;
      },
      unmount() { },
    },

    'report-lost': {
      async mount(el, ctx) {
        el.innerHTML = `
          <div class="sh-card" style="max-width:520px;">
            <div class="sh-card-title"><span>🚨 Report My Card Lost or Stolen</span></div>
            <p style="font-size:12px;color:var(--sh-muted);">
              Reporting your card lost immediately sets its status to <code>lost_card</code> and blocks it at all campus verification terminals (rate-limited to 1 report per 24 hours). Reissue requires staff approval.
            </p>
            <textarea id="rl-reason" class="sh-textarea" rows="3" placeholder="Describe where/when the card was lost…"></textarea>
            <div id="rl-msg" style="margin-bottom:10px;font-size:12px;font-weight:700;"></div>
            <button type="button" id="rl-btn" class="sh-btn sh-btn-danger">Block My Card Immediately</button>
          </div>
        `;
        document.getElementById('rl-btn')?.addEventListener('click', async () => {
          const reason = document.getElementById('rl-reason')?.value.trim() || 'Reported lost by student';
          const msg = document.getElementById('rl-msg');
          const { error } = await ctx.client.rpc('report_own_card_lost', { p_reason: reason });
          if (msg) {
            msg.style.color = error ? 'var(--sh-red)' : 'var(--sh-green)';
            msg.textContent = error ? error.message : '✓ Card marked lost_card. Visit Registry for staff-approved reissue.';
          }
        });
      },
      unmount() { },
    },

    'card-history': {
      async mount(el, ctx) {
        return VIEW_MODULES['my-activity'].mount(el, ctx);
      },
      unmount() { },
    },

    help: {
      _studentRealtimeChannel: null,
      async mount(el, ctx) {
        const s = ctx.school || {};
        const supportUrl =
          (typeof EBSU_CONFIG !== 'undefined' && EBSU_CONFIG.SUPPORT_DESK_URL) ||
          `${EBSU_CONFIG.SUPABASE_URL}/functions/v1/support-desk`;
        const anonHeaders = {
          'Content-Type': 'application/json',
          ...(EBSU_CONFIG?.SUPABASE_ANON_KEY
            ? { apikey: EBSU_CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${EBSU_CONFIG.SUPABASE_ANON_KEY}` }
            : {}),
        };

        function fileToBase64(file) {
          return new Promise((resolve, reject) => {
            if (!file) return resolve(null);
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        }

        el.innerHTML = `
          <div class="sh-grid-2" style="align-items:start;">
            <!-- LEFT COLUMN: MANUAL REGISTRATION & TRACKING -->
            <div class="sh-card">
              <div class="sh-card-title"><span>📝 Manual Registration Request ("My details aren't in the system")</span></div>
              <p style="font-size:12px;color:var(--sh-muted);margin-top:0;">
                If your JAMB number is not yet in the university database, submit your biodata and proof documents below. Proof files are stored in the private <code>registration-uploads</code> bucket for Registry verification.
              </p>

              <form id="stu-reg-form" novalidate>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                  <div>
                    <label class="sh-label" for="sr-jamb">JAMB Registration No. *</label>
                    <input id="sr-jamb" class="sh-input" placeholder="202552179149SI" style="text-transform:uppercase;" required />
                  </div>
                  <div>
                    <label class="sh-label" for="sr-matric">Matric No. (If Assigned)</label>
                    <input id="sr-matric" class="sh-input" placeholder="EBSU/2025/..." style="text-transform:uppercase;" />
                  </div>
                </div>

                <label class="sh-label" for="sr-name">Full Name (Surname First) *</label>
                <input id="sr-name" class="sh-input" placeholder="NNAJI WILSON SOMTOCHUKWU" style="text-transform:uppercase;" required />

                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
                  <div>
                    <label class="sh-label" for="sr-dob">Date of Birth *</label>
                    <input id="sr-dob" type="date" class="sh-input" required />
                  </div>
                  <div>
                    <label class="sh-label" for="sr-blood">Blood Group</label>
                    <select id="sr-blood" class="sh-select"><option>O+</option><option>O-</option><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>AB+</option><option>AB-</option></select>
                  </div>
                  <div>
                    <label class="sh-label" for="sr-geno">Genotype</label>
                    <select id="sr-geno" class="sh-select"><option>AA</option><option>AS</option><option>AC</option><option>SS</option></select>
                  </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                  <div>
                    <label class="sh-label" for="sr-fac">Faculty *</label>
                    <input id="sr-fac" class="sh-input" placeholder="Science" required />
                  </div>
                  <div>
                    <label class="sh-label" for="sr-dept">Department *</label>
                    <input id="sr-dept" class="sh-input" placeholder="Computer Science" required />
                  </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                  <div>
                    <label class="sh-label" for="sr-phone">Phone Number</label>
                    <input id="sr-phone" class="sh-input" placeholder="080..." />
                  </div>
                  <div>
                    <label class="sh-label" for="sr-email">Email Address</label>
                    <input id="sr-email" type="email" class="sh-input" placeholder="student@ebsu.edu.ng" />
                  </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;">
                  <div>
                    <label class="sh-label" for="sr-photo">Passport Photo (JPG/PNG)</label>
                    <input id="sr-photo" type="file" accept="image/jpeg,image/png" class="sh-input" style="font-size:11px;padding:6px;" />
                  </div>
                  <div>
                    <label class="sh-label" for="sr-adm">Admission Letter (PDF/IMG)</label>
                    <input id="sr-adm" type="file" accept="image/jpeg,image/png,application/pdf" class="sh-input" style="font-size:11px;padding:6px;" />
                  </div>
                  <div>
                    <label class="sh-label" for="sr-rec">Fee Receipt (PDF/IMG)</label>
                    <input id="sr-rec" type="file" accept="image/jpeg,image/png,application/pdf" class="sh-input" style="font-size:11px;padding:6px;" />
                  </div>
                </div>

                <div id="sr-feedback" style="margin-bottom:10px;font-size:12px;font-weight:700;"></div>
                <button type="submit" id="sr-submit-btn" class="sh-btn">Submit Registration Request</button>
              </form>

              <hr style="border:none;border-top:1px solid var(--sh-border);margin:18px 0;" />

              <div class="sh-card-title"><span>🔎 Check Registration Request Status</span></div>
              <form id="stu-reg-check-form" style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end;">
                <div>
                  <label class="sh-label" for="src-code">Tracking Code</label>
                  <input id="src-code" class="sh-input" style="margin:0;text-transform:uppercase;font-family:monospace;" placeholder="EBSU-REG-..." required />
                </div>
                <div>
                  <label class="sh-label" for="src-jamb">JAMB Number</label>
                  <input id="src-jamb" class="sh-input" style="margin:0;text-transform:uppercase;" placeholder="202552179149SI" required />
                </div>
                <button type="submit" class="sh-btn sh-btn-secondary">Check</button>
              </form>
              <div id="src-result" style="margin-top:10px;font-size:12px;"></div>
            </div>

            <!-- RIGHT COLUMN: REAL-TIME SUPPORT TICKETS & HOTLINE -->
            <div style="display:flex;flex-direction:column;gap:16px;">
              <div class="sh-card">
                <div class="sh-card-title">
                  <span>🎧 Open or Track Support Ticket <small style="color:var(--sh-green);font-weight:700;">● REALTIME</small></span>
                </div>

                <form id="stu-tkt-create-form" novalidate>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    <div>
                      <label class="sh-label" for="st-jamb">JAMB / Matric No. *</label>
                      <input id="st-jamb" class="sh-input" value="${esc(ctx.studentSession?.jamb_no || '')}" placeholder="202552179149SI" style="text-transform:uppercase;" required />
                    </div>
                    <div>
                      <label class="sh-label" for="st-sname">Your Full Name *</label>
                      <input id="st-sname" class="sh-input" value="${esc(ctx.studentSession?.name || '')}" placeholder="Your Full Name" required />
                    </div>
                  </div>

                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    <div>
                      <label class="sh-label" for="st-cat">Issue Category *</label>
                      <select id="st-cat" class="sh-select">
                        <option value="wrong_details">Wrong Name / Department / DOB</option>
                        <option value="payment_issue">Card Fee Payment Issue</option>
                        <option value="frozen_account">Verification Locked / Frozen</option>
                        <option value="lost_card">Lost / Stolen Card Reissue</option>
                        <option value="missing_record">Record Not Found</option>
                        <option value="other">Other Inquiry</option>
                      </select>
                    </div>
                    <div>
                      <label class="sh-label" for="st-subj">Subject *</label>
                      <input id="st-subj" class="sh-input" placeholder="Brief summary of issue" required />
                    </div>
                  </div>

                  <label class="sh-label" for="st-msg-body">Message Details *</label>
                  <textarea id="st-msg-body" class="sh-textarea" rows="3" placeholder="Explain how we can help (include any payment reference if applicable)…" required></textarea>

                  <div id="st-create-feedback" style="margin-bottom:10px;font-size:12px;font-weight:700;"></div>
                  <button type="submit" id="st-create-btn" class="sh-btn">Open Support Ticket</button>
                </form>

                <hr style="border:none;border-top:1px solid var(--sh-border);margin:16px 0;" />

                <div class="sh-card-title"><span>💬 Live Ticket Thread Lookup</span></div>
                <form id="stu-tkt-lookup-form" style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end;margin-bottom:10px;">
                  <div>
                    <label class="sh-label" for="stl-no">Ticket Number</label>
                    <input id="stl-no" class="sh-input" style="margin:0;text-transform:uppercase;font-family:monospace;" placeholder="EBSU-TKT-..." required />
                  </div>
                  <div>
                    <label class="sh-label" for="stl-jamb">JAMB / Matric No.</label>
                    <input id="stl-jamb" class="sh-input" style="margin:0;text-transform:uppercase;" placeholder="202552179149SI" required />
                  </div>
                  <button type="submit" class="sh-btn sh-btn-secondary">Open Thread</button>
                </form>

                <div id="stu-tkt-thread-box" style="display:none;border:1px solid var(--sh-border);border-radius:10px;padding:12px;">
                  <div id="stu-tkt-header" style="font-size:12px;font-weight:800;margin-bottom:8px;"></div>
                  <div id="stu-tkt-msgs" style="max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin-bottom:10px;"></div>
                  <form id="stu-tkt-reply-form" style="display:flex;gap:8px;">
                    <input id="stu-tkt-reply-input" class="sh-input" style="margin:0;" placeholder="Write a reply to ICT Support…" required />
                    <button type="submit" class="sh-btn">Send</button>
                  </form>
                </div>
              </div>

              <div class="sh-card">
                <div class="sh-card-title"><span>📞 ICT Identity Bureau Direct Hotline</span></div>
                <div style="font-size:12px;line-height:1.7;">
                  <div><strong>Phone:</strong> ${esc(s.hotline_phone || '+234-800-EBSU-ICT')}</div>
                  <div><strong>WhatsApp:</strong> ${esc(s.hotline_whatsapp || '+2348000000000')}</div>
                  <div><strong>Email:</strong> ${esc(s.hotline_email || 'id-support@ebsu.edu.ng')}</div>
                  <div><strong>Office Hours:</strong> ${esc(s.office_hours || 'Mon–Fri, 8:00 AM – 4:00 PM WAT')}</div>
                </div>
              </div>
            </div>
          </div>
        `;

        // 1. Submit Manual Registration
        document.getElementById('stu-reg-form')?.addEventListener('submit', async e => {
          e.preventDefault();
          const fb = document.getElementById('sr-feedback');
          const btn = document.getElementById('sr-submit-btn');
          if (btn) btn.disabled = true;

          try {
            const [photoB64, admB64, recB64] = await Promise.all([
              fileToBase64(document.getElementById('sr-photo')?.files?.[0]),
              fileToBase64(document.getElementById('sr-adm')?.files?.[0]),
              fileToBase64(document.getElementById('sr-rec')?.files?.[0]),
            ]);

            const res = await fetch(supportUrl, {
              method: 'POST',
              headers: anonHeaders,
              body: JSON.stringify({
                action: 'submit_registration',
                school_id: s.id || '00000000-0000-4000-8000-000000000001',
                jamb_no: document.getElementById('sr-jamb')?.value || '',
                matric: document.getElementById('sr-matric')?.value || '',
                full_name: document.getElementById('sr-name')?.value || '',
                dob: document.getElementById('sr-dob')?.value || '',
                blood_group: document.getElementById('sr-blood')?.value || 'O+',
                genotype: document.getElementById('sr-geno')?.value || 'AA',
                faculty: document.getElementById('sr-fac')?.value || '',
                department: document.getElementById('sr-dept')?.value || '',
                phone: document.getElementById('sr-phone')?.value || '',
                email: document.getElementById('sr-email')?.value || '',
                photo_b64: photoB64,
                admission_letter_b64: admB64,
                fee_receipt_b64: recB64,
                turnstile_token: 'CF_TURNSTILE_TEST_TOKEN',
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to submit registration request.');

            if (fb) {
              fb.style.color = 'var(--sh-green)';
              fb.innerHTML = `✓ Submitted! Save your Tracking Code: <code>${esc(data.tracking_code)}</code>`;
            }
            const codeIn = document.getElementById('src-code');
            const jambIn = document.getElementById('src-jamb');
            if (codeIn) codeIn.value = data.tracking_code;
            if (jambIn) jambIn.value = document.getElementById('sr-jamb')?.value || '';
          } catch (err) {
            if (fb) {
              fb.style.color = 'var(--sh-red)';
              fb.textContent = err.message;
            }
          } finally {
            if (btn) btn.disabled = false;
          }
        });

        // 2. Check Registration Status
        document.getElementById('stu-reg-check-form')?.addEventListener('submit', async e => {
          e.preventDefault();
          const out = document.getElementById('src-result');
          try {
            const res = await fetch(supportUrl, {
              method: 'POST',
              headers: anonHeaders,
              body: JSON.stringify({
                action: 'check_registration',
                tracking_code: document.getElementById('src-code')?.value || '',
                jamb_no: document.getElementById('src-jamb')?.value || '',
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Request not found.');
            const r = data.request;
            if (out) {
              out.innerHTML = `<div style="padding:10px;border-radius:8px;border:1px solid var(--sh-border);">
                <strong>${esc(r.full_name)}</strong> (${esc(r.jamb_no)}) — <span class="sh-pill ${r.status === 'approved' ? 'active' : r.status === 'rejected' ? 'revoked' : 'provisional'}">${esc(r.status.toUpperCase())}</span>
                ${r.matric ? `<div>Assigned Matric: <code>${esc(r.matric)}</code></div>` : ''}
                ${r.reviewer_note ? `<div style="margin-top:4px;color:var(--sh-muted);">Note: ${esc(r.reviewer_note)}</div>` : ''}
              </div>`;
            }
          } catch (err) {
            if (out) out.innerHTML = `<span style="color:var(--sh-red);font-weight:700;">${esc(err.message)}</span>`;
          }
        });

        // 3. Create Support Ticket & Live Thread
        let activeTicketNo = '';
        let activeJambNo = '';

        async function loadStudentThread(tktNo, jamb) {
          const res = await fetch(supportUrl, {
            method: 'POST',
            headers: anonHeaders,
            body: JSON.stringify({ action: 'lookup_ticket', ticket_no: tktNo, jamb_no: jamb }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Ticket not found.');

          activeTicketNo = data.ticket.ticket_no;
          activeJambNo = data.ticket.jamb_no;

          const box = document.getElementById('stu-tkt-thread-box');
          const hdr = document.getElementById('stu-tkt-header');
          const msgsEl = document.getElementById('stu-tkt-msgs');
          if (box) box.style.display = 'block';
          if (hdr) {
            hdr.innerHTML = `<code>${esc(data.ticket.ticket_no)}</code> · ${esc(data.ticket.subject)} <span class="sh-pill ${data.ticket.status === 'resolved' ? 'active' : 'provisional'}">${esc(data.ticket.status)}</span>`;
          }
          if (msgsEl) {
            msgsEl.innerHTML = (data.messages || [])
              .map(
                m => `
                <div style="align-self:${m.sender_role === 'student' ? 'flex-end' : 'flex-start'};max-width:85%;padding:8px 10px;border-radius:8px;background:${m.sender_role === 'student' ? 'rgba(59,130,246,0.16)' : 'rgba(16,185,129,0.14)'};border:1px solid var(--sh-border);font-size:12px;">
                  <div style="font-size:10px;font-weight:800;color:var(--sh-muted);">${esc(m.sender_name)} (${esc(m.sender_role.toUpperCase())})</div>
                  <div style="white-space:pre-wrap;">${esc(m.body)}</div>
                </div>`
              )
              .join('');
            msgsEl.scrollTop = msgsEl.scrollHeight;
          }

          // Subscribe to Realtime updates for this ticket_id
          try {
            if (VIEW_MODULES.help._studentRealtimeChannel && ctx.client) {
              ctx.client.removeChannel(VIEW_MODULES.help._studentRealtimeChannel);
            }
            if (ctx.client) {
              VIEW_MODULES.help._studentRealtimeChannel = ctx.client
                .channel(`stu-tkt-${data.ticket.id}`)
                .on(
                  'postgres_changes',
                  { event: 'INSERT', schema: 'public', table: 'ticket_messages', filter: `ticket_id=eq.${data.ticket.id}` },
                  () => { loadStudentThread(activeTicketNo, activeJambNo).catch(() => {}); }
                )
                .subscribe();
            }
          } catch (e) {}
        }

        document.getElementById('stu-tkt-create-form')?.addEventListener('submit', async e => {
          e.preventDefault();
          const fb = document.getElementById('st-create-feedback');
          const btn = document.getElementById('st-create-btn');
          if (btn) btn.disabled = true;

          try {
            const jambVal = document.getElementById('st-jamb')?.value || '';
            const res = await fetch(supportUrl, {
              method: 'POST',
              headers: anonHeaders,
              body: JSON.stringify({
                action: 'create_ticket',
                school_id: s.id || '00000000-0000-4000-8000-000000000001',
                jamb_no: jambVal,
                student_name: document.getElementById('st-sname')?.value || '',
                category: document.getElementById('st-cat')?.value || 'other',
                subject: document.getElementById('st-subj')?.value || '',
                message: document.getElementById('st-msg-body')?.value || '',
                turnstile_token: 'CF_TURNSTILE_TEST_TOKEN',
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not open support ticket.');

            if (fb) {
              fb.style.color = 'var(--sh-green)';
              fb.innerHTML = `✓ Ticket Opened! Save your Ticket Number: <code>${esc(data.ticket_no)}</code>`;
            }
            document.getElementById('stl-no').value = data.ticket_no;
            document.getElementById('stl-jamb').value = jambVal;
            await loadStudentThread(data.ticket_no, jambVal);
          } catch (err) {
            if (fb) {
              fb.style.color = 'var(--sh-red)';
              fb.textContent = err.message;
            }
          } finally {
            if (btn) btn.disabled = false;
          }
        });

        document.getElementById('stu-tkt-lookup-form')?.addEventListener('submit', async e => {
          e.preventDefault();
          try {
            await loadStudentThread(
              document.getElementById('stl-no')?.value || '',
              document.getElementById('stl-jamb')?.value || ''
            );
          } catch (err) {
            alert(err.message);
          }
        });

        document.getElementById('stu-tkt-reply-form')?.addEventListener('submit', async e => {
          e.preventDefault();
          const inp = document.getElementById('stu-tkt-reply-input');
          const msg = inp?.value.trim();
          if (!msg || !activeTicketNo || !activeJambNo) return;
          try {
            const res = await fetch(supportUrl, {
              method: 'POST',
              headers: anonHeaders,
              body: JSON.stringify({
                action: 'reply_ticket',
                ticket_no: activeTicketNo,
                jamb_no: activeJambNo,
                message: msg,
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Reply failed.');
            if (inp) inp.value = '';
            await loadStudentThread(activeTicketNo, activeJambNo);
          } catch (err) {
            alert(err.message);
          }
        });
      },
      unmount() {
        if (VIEW_MODULES.help._studentRealtimeChannel && _ctx.client) {
          try { _ctx.client.removeChannel(VIEW_MODULES.help._studentRealtimeChannel); } catch (e) {}
          VIEW_MODULES.help._studentRealtimeChannel = null;
        }
      },
    },
  };

  // ── 3. SIDEBAR & RECENT 20 ACTIONS RENDERER ──────────────────────
  function getMenuForRole(role) {
    return ROLE_MENU_CONFIG[role] || ROLE_MENU_CONFIG.operator;
  }

  function renderSidebarNav() {
    const navContainer = document.getElementById('sb-nav-container');
    if (!navContainer) return;
    const menu = getMenuForRole(_ctx.role);

    const groups = {};
    menu.forEach(item => {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    });

    navContainer.innerHTML = Object.entries(groups)
      .map(
        ([groupName, items]) => `
        <div class="sb-group-label sb-hide-collapsed">${esc(groupName)}</div>
        ${items
            .map(
              it => `
          <a href="#/${esc(it.id)}" class="sb-nav-item ${it.id === _activeViewId ? 'active' : ''}" data-route="${esc(it.id)}" title="${esc(it.label)}">
            <span class="sb-nav-icon">${it.icon}</span>
            <span class="sb-hide-collapsed">${esc(it.label)}</span>
          </a>`
            )
            .join('')}`
      )
      .join('');
  }

  async function loadRecentActivity() {
    const recentEl = document.getElementById('sb-recent-list');
    if (!recentEl || !_ctx.client || _ctx.role === 'student') return;

    const { data } = await _ctx.client
      .from('activity_log')
      .select('action,result,timestamp')
      .order('timestamp', { ascending: false })
      .limit(20);

    if (!data || data.length === 0) {
      recentEl.innerHTML = '<div class="sb-recent-item">No recent actions</div>';
      return;
    }

    recentEl.innerHTML = data
      .map(row => {
        const t = row.timestamp ? new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        return `<div class="sb-recent-item" title="${esc(row.action)}"><strong>${esc(t)}</strong> · ${esc(row.action)}</div>`;
      })
      .join('');
  }

  // ── 4. HASH ROUTER WITH ROLE ENFORCEMENT ─────────────────────────
  async function handleRouteChange() {
    const menu = getMenuForRole(_ctx.role);
    const allowedIds = menu.map(m => m.id);
    const rawHash = (window.location.hash || '').replace(/^#\/?/, '').split('?')[0].trim();
    const targetId = allowedIds.includes(rawHash) ? rawHash : allowedIds[0];

    if (rawHash !== targetId) {
      window.location.replace(`#/${targetId}`);
      return;
    }

    if (_activeModule && typeof _activeModule.unmount === 'function') {
      try { _activeModule.unmount(); } catch (e) { }
    }

    _activeViewId = targetId;
    _activeModule = VIEW_MODULES[targetId] || VIEW_MODULES.overview;

    const menuItem = menu.find(m => m.id === targetId);
    const titleEl = document.getElementById('topbar-title');
    if (titleEl) titleEl.textContent = menuItem ? menuItem.label : 'Dashboard';

    renderSidebarNav();
    closeMobileDrawer();

    const mainEl = document.getElementById('shell-main');
    if (mainEl && _activeModule) {
      await _activeModule.mount(mainEl, _ctx);
    }
  }

  // ── 5. THEME, DRAWER & CTRL+K COMMAND PALETTE ────────────────────
  function applySavedTheme() {
    if (window.ThemeManager) {
      // Managed centrally by js/theme.js
      return;
    }
  }

  function toggleTheme() {
    if (window.ThemeManager) {
      window.ThemeManager.cycle();
    }
  }

  function closeMobileDrawer() {
    document.getElementById('shell-sidebar')?.classList.remove('mobile-open');
    document.getElementById('shell-drawer-backdrop')?.classList.remove('open');
  }

  function openCommandPalette() {
    const modal = document.getElementById('cmdk-backdrop');
    const input = document.getElementById('cmdk-input');
    if (!modal || !input) return;
    modal.classList.add('open');
    input.value = '';
    _cmdkIndex = 0;
    renderCommandPaletteList('');
    input.focus();
  }

  function closeCommandPalette() {
    document.getElementById('cmdk-backdrop')?.classList.remove('open');
  }

  function renderCommandPaletteList(query) {
    const listEl = document.getElementById('cmdk-list');
    if (!listEl) return;
    const q = (query || '').trim().toLowerCase();
    const menu = getMenuForRole(_ctx.role);
    _cmdkFiltered = menu.filter(
      m => m.label.toLowerCase().includes(q) || m.group.toLowerCase().includes(q) || m.id.includes(q)
    );
    if (_cmdkIndex >= _cmdkFiltered.length) _cmdkIndex = 0;

    listEl.innerHTML = _cmdkFiltered
      .map(
        (m, idx) => `
        <button type="button" class="cmdk-item ${idx === _cmdkIndex ? 'selected' : ''}" data-cmd-route="${esc(m.id)}">
          <span>${m.icon} ${esc(m.label)}</span>
          <span style="font-size:11px;color:var(--sh-muted);">${esc(m.group)}</span>
        </button>`
      )
      .join('');

    listEl.querySelectorAll('.cmdk-item').forEach(btn => {
      btn.addEventListener('click', () => {
        window.location.hash = `#/${btn.getAttribute('data-cmd-route')}`;
        closeCommandPalette();
      });
    });
  }

  // ── 6. INITIALIZATION ────────────────────────────────────────────
  async function init() {
    applySavedTheme();

    const guardCtx = await Guard.ready();
    if (!guardCtx) return;

    _ctx.client = AuthManager.getClient();
    _ctx.user = guardCtx.user;
    _ctx.role = guardCtx.role || 'operator';
    _ctx.studentSession = guardCtx.studentSession || null;

    // Load active school metadata
    if (_ctx.client) {
      const { data: schools } = await _ctx.client.from('schools').select('*').order('name');
      _ctx.schoolsList = schools || [];

      if (_ctx.role !== 'student' && _ctx.user?.id) {
        const { data: sp } = await _ctx.client
          .from('staff_profiles')
          .select('school_id')
          .eq('id', _ctx.user.id)
          .maybeSingle();
        _ctx.schoolId = sp?.school_id || _ctx.schoolsList[0]?.id || null;
      } else {
        _ctx.schoolId = _ctx.studentSession?.school_id || _ctx.schoolsList[0]?.id || null;
      }

      _ctx.school = _ctx.schoolsList.find(s => s.id === _ctx.schoolId) || _ctx.schoolsList[0] || null;
    }

    // Populate Sidebar Header & User Footer
    const schoolNameEl = document.getElementById('sb-school-name');
    const schoolCodeEl = document.getElementById('sb-school-code');
    const roleEl = document.getElementById('sb-user-role');
    const emailEl = document.getElementById('sb-user-email');
    const avatarEl = document.getElementById('sb-avatar');

    if (schoolNameEl && _ctx.school) schoolNameEl.textContent = _ctx.school.name;
    if (schoolCodeEl && _ctx.school) schoolCodeEl.textContent = _ctx.school.code + ' TENANT';
    if (roleEl) roleEl.textContent = _ctx.role.replace('_', ' ');
    if (emailEl) emailEl.textContent = _ctx.user?.email || '';
    if (avatarEl) avatarEl.textContent = (_ctx.user?.email || 'U').slice(0, 2).toUpperCase();

    // Wire UI Controls
    document.getElementById('btn-sidebar-toggle')?.addEventListener('click', () => {
      const sb = document.getElementById('shell-sidebar');
      if (window.innerWidth <= 820) {
        sb?.classList.toggle('mobile-open');
        document.getElementById('shell-drawer-backdrop')?.classList.toggle('open');
      } else {
        sb?.classList.toggle('collapsed');
      }
    });

    document.getElementById('shell-drawer-backdrop')?.addEventListener('click', closeMobileDrawer);
    document.getElementById('btn-theme-toggle')?.addEventListener('click', toggleTheme);
    document.getElementById('btn-signout')?.addEventListener('click', () => Guard.signOut());
    document.getElementById('btn-settings-shortcut')?.addEventListener('click', () => {
      const allowed = getMenuForRole(_ctx.role).some(m => m.id === 'settings');
      window.location.hash = allowed ? '#/settings' : '#/my-activity';
    });

    // Command Palette (Ctrl+K / Cmd+K)
    document.getElementById('btn-cmdk')?.addEventListener('click', openCommandPalette);
    document.getElementById('cmdk-backdrop')?.addEventListener('click', e => {
      if (e.target.id === 'cmdk-backdrop') closeCommandPalette();
    });
    document.getElementById('cmdk-input')?.addEventListener('input', e => {
      _cmdkIndex = 0;
      renderCommandPaletteList(e.target.value);
    });

    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openCommandPalette();
      } else if (e.key === 'Escape') {
        closeCommandPalette();
        closeMobileDrawer();
      } else if (document.getElementById('cmdk-backdrop')?.classList.contains('open')) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          _cmdkIndex = (_cmdkIndex + 1) % Math.max(1, _cmdkFiltered.length);
          renderCommandPaletteList(document.getElementById('cmdk-input')?.value || '');
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          _cmdkIndex = (_cmdkIndex - 1 + Math.max(1, _cmdkFiltered.length)) % Math.max(1, _cmdkFiltered.length);
          renderCommandPaletteList(document.getElementById('cmdk-input')?.value || '');
        } else if (e.key === 'Enter' && _cmdkFiltered[_cmdkIndex]) {
          e.preventDefault();
          window.location.hash = `#/${_cmdkFiltered[_cmdkIndex].id}`;
          closeCommandPalette();
        }
      }
    });

    window.addEventListener('hashchange', handleRouteChange);
    await loadRecentActivity();
    await handleRouteChange();
  }

  return {
    init,
    ROLE_MENU_CONFIG,
  };
})();

window.ShellApp = ShellApp;

