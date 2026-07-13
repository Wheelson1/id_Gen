/**
 * ui.js — DOM interactions, event handlers, and UI utilities.
 * All DOM manipulation lives here; no other module touches the DOM directly.
 */
const UI = (() => {

  // ── TOAST ────────────────────────────────────────────────────
  let toastTimer = null;

  function showToast(msg, duration = 2500, isError = false) {
    const toast = document.getElementById('status-toast');
    const text  = document.getElementById('status-text');
    if (!toast || !text) return;
    text.textContent = msg;
    toast.style.borderColor = isError ? '#ff5252' : '#cc0000';
    toast.style.display = 'block';
    clearTimeout(toastTimer);
    if (duration > 0) toastTimer = setTimeout(() => hideToast(), duration);
  }

  function hideToast() {
    const toast = document.getElementById('status-toast');
    if (toast) toast.style.display = 'none';
  }

  // ── PAGE NAVIGATION ──────────────────────────────────────────
  function showPage(pg) {
    AppState.setPage(pg);
    // In the new split layout, both pages are visible side-by-side.
    // Toggling 'hidden' or tab classes is no longer needed.
    // If on mobile, you could add logic to scroll here.
  }

  // ── STUDENT TABS ─────────────────────────────────────────────
  function renderTabs() {
    const container = document.getElementById('student-tabs');
    container.innerHTML = '';
    const students = AppState.get('students');
    const active   = AppState.get('activeIdx');

    students.forEach((st, i) => {
      const btn = document.createElement('button');
      btn.className = 'stab';
      btn.style.background = i === active ? '#cc0000' : '#162030';
      btn.textContent = st.name ? st.name.split(' ')[0] : 'Student ' + (i + 1);
      btn.addEventListener('click', () => {
        saveCurrentFields();
        AppState.switchStudent(i);
        loadFields();
        renderTabs();
      });
      container.appendChild(btn);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'btn-outline';
    addBtn.textContent = '+ Add Student';
    addBtn.addEventListener('click', () => {
      saveCurrentFields();
      AppState.addStudent();
      loadFields();
      renderTabs();
    });
    container.appendChild(addBtn);

    if (students.length > 1) {
      const rmBtn = document.createElement('button');
      rmBtn.className = 'btn-dark';
      rmBtn.textContent = '✕';
      rmBtn.title = 'Remove current student';
      rmBtn.addEventListener('click', () => {
        saveCurrentFields();
        AppState.removeStudent();
        loadFields();
        renderTabs();
      });
      container.appendChild(rmBtn);
    }
  }

  // ── FIELD SYNC ───────────────────────────────────────────────
  function saveCurrentFields() {
    const st = AppState.currentStudent();
    st.name     = document.getElementById('f-name').value;
    st.matric   = document.getElementById('f-matric').value;
    st.email    = document.getElementById('f-email').value;
    st.faculty  = document.getElementById('f-faculty').value;
    st.dept     = document.getElementById('f-dept').value;
    st.level    = document.getElementById('f-level').value;
    st.session  = document.getElementById('f-session').value;
    st.blood    = document.getElementById('f-blood').value;
    st.genotype = document.getElementById('f-genotype').value;
  }

  function loadFields() {
    const st = AppState.currentStudent();
    document.getElementById('f-name').value    = st.name    || '';
    document.getElementById('f-matric').value  = st.matric  || '';
    document.getElementById('f-email').value   = st.email   || '';
    document.getElementById('f-faculty').value = st.faculty || '';
    document.getElementById('f-dept').value    = st.dept    || '';
    document.getElementById('f-level').value   = st.level   || '100 Level';
    document.getElementById('f-session').value = st.session || '2024/2025';
    document.getElementById('f-blood').value   = st.blood   || 'O+';
    document.getElementById('f-genotype').value= st.genotype|| 'AA';

    // Photo preview
    const pp = document.getElementById('photo-preview');
    const rmPhoto = document.getElementById('rm-photo');
    if (st.photo) {
      pp.innerHTML = '';
      const img = document.createElement('img');
      img.src = st.photo;
      img.className = 'preview-img';
      pp.appendChild(img);
      rmPhoto.style.display = 'block';
    } else {
      pp.innerHTML = '<span class="preview-placeholder">👤</span>';
      rmPhoto.style.display = 'none';
    }

    // Signature preview
    const sp = document.getElementById('sig-preview');
    const rmSig = document.getElementById('rm-sig');
    if (st.sig) {
      sp.innerHTML = '';
      const img = document.createElement('img');
      img.src = st.sig;
      img.className = 'preview-img-sig';
      sp.appendChild(img);
      rmSig.style.display = 'block';
    } else {
      sp.innerHTML = '<span class="sig-placeholder">Signature</span>';
      rmSig.style.display = 'none';
    }
  }

  // ── LAYOUT TOGGLE ────────────────────────────────────────────
  function setLayout(l) {
    AppState.setLayout(l);
    ['single', 'single-back', 'double', 'batch'].forEach(x => {
      document.getElementById('ly-' + x).className = 'layout-btn ' + (x === l ? 'on' : 'off');
    });
    renderPreview();
  }

  // ── PREVIEW RENDER ───────────────────────────────────────────
  function renderPreview() {
    const container = document.getElementById('cards-container');
    container.innerHTML = '';

    const layout    = AppState.get('layout');
    const students  = AppState.get('students');
    const toRender  = layout === 'batch'
      ? students.filter(s => s.name && s.matric)
      : [AppState.currentStudent()];

    toRender.forEach(st => {
      const wrap = document.createElement('div');
      wrap.className = 'card-wrapper';

      if (layout === 'double') {
        const row = document.createElement('div');
        row.className = 'double-card-row';
        const fc = document.createElement('canvas');
        const bc = document.createElement('canvas');
        row.appendChild(fc); row.appendChild(bc);
        wrap.appendChild(row);
        drawCard(fc, st, 0.38);
        drawBackCard(bc, st, 0.38);
      } else if (layout === 'single-back') {
        const cvs = document.createElement('canvas');
        wrap.appendChild(cvs);
        drawBackCard(cvs, st, 0.42);
      } else {
        const cvs = document.createElement('canvas');
        wrap.appendChild(cvs);
        drawCard(cvs, st, layout === 'batch' ? 0.34 : 0.42);
      }

      const dlBtn = document.createElement('button');
      dlBtn.className = 'btn-red dl-btn';
      dlBtn.textContent = '⬇ Download PNG — ' + (st.name || 'Student');
      dlBtn.addEventListener('click', () => downloadStudentCard(st));
      wrap.appendChild(dlBtn);
      container.appendChild(wrap);
    });
  }

  // ── GENERATE ─────────────────────────────────────────────────
  // Calls the issue-card Edge Function to register the card server-side,
  // receive a signed QR token, then renders the preview.
  async function generate() {
    saveCurrentFields();
    AppState.set('schoolName', document.getElementById('schoolName').value);
    AppState.set('expiry',     document.getElementById('expiry').value);

    const st = AppState.currentStudent();
    if (!st.name || !st.matric) {
      showToast('Please enter at least Name and Matric Number.', 3000, true);
      return;
    }

    // ── Client-side matric validation (mirrors server validation)
    const MATRIC_RE = /^EBSU\/\d{4}\/\d{6,8}$/;
    if (!MATRIC_RE.test(st.matric)) {
      showToast('Matric must match EBSU/YYYY/NNNNNN format.', 3500, true);
      return;
    }

    // ── Client-side expiry validation
    const expiryYear = parseInt(AppState.get('expiry'), 10);
    const currentYear = new Date().getFullYear();
    if (isNaN(expiryYear) || expiryYear < currentYear || expiryYear > currentYear + 10) {
      showToast('Expiry year is out of range.', 3000, true);
      return;
    }

    // ── Check config
    if (typeof EBSU_CONFIG === 'undefined' || !EBSU_CONFIG.ISSUE_CARD_URL) {
      showToast('config.js missing — see config.example.js', 4000, true);
      return;
    }

    showToast('Issuing card…', 0);

    try {
      // ── Get auth session (operator must be logged in)
      const session = ebsuSupabase
        ? (await ebsuSupabase.auth.getSession()).data.session
        : null;

      if (!session) {
        hideToast();
        showToast('Please log in before issuing a card.', 3500, true);
        showAuthGate();
        return;
      }

      // ── Build request payload
      const payload = {
        name:     st.name,
        matric:   st.matric,
        email:    st.email    || '',
        faculty:  st.faculty  || '',
        dept:     st.dept     || '',
        level:    st.level    || '',
        session:  st.session  || '',
        blood:    st.blood    || '',
        genotype: st.genotype || '',
        expiry:   expiryYear,
        // Include base64 photos so the edge function can upload them to Storage
        ...(st.photo && { photo_b64: st.photo }),
        ...(st.sig   && { sig_b64:   st.sig   }),
      };

      const res = await fetch(EBSU_CONFIG.ISSUE_CARD_URL, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        hideToast();
        const msg = data?.details?.join('; ') || data?.error || 'Server error';
        showToast('Issue failed: ' + msg, 4000, true);
        return;
      }

      // ── Store the issued card data in student state
      st.cardId   = data.card_id;
      st.qrString = data.qr_string;

      hideToast();
      showPage('preview');
      renderPreview();

    } catch (err) {
      hideToast();
      showToast('Network error — could not reach server.', 4000, true);
      console.error('generate() error:', err);
    }
  }

  // ── DOWNLOAD ─────────────────────────────────────────────────
  function downloadStudentCard(st) {
    const layout = AppState.get('layout');
    showToast('Preparing download…', 0);

    const baseName = 'ID_Card_' +
      (st.name   || 'student').replace(/\s+/g, '_') + '_' +
      (st.matric || '').replace(/\//g, '-');

    if (layout === 'double') {
      // Combine front and back side-by-side into one PNG
      const fc = document.createElement('canvas');
      const bc = document.createElement('canvas');
      drawCard(fc, st, 1);
      drawBackCard(bc, st, 1);
      setTimeout(() => {
        try {
          const combined = document.createElement('canvas');
          combined.width  = fc.width + bc.width;
          combined.height = Math.max(fc.height, bc.height);
          const ctx = combined.getContext('2d');
          ctx.drawImage(fc, 0, 0);
          ctx.drawImage(bc, fc.width, 0);
          const link = document.createElement('a');
          link.download = baseName + '_Front+Back.png';
          link.href = combined.toDataURL('image/png', 1.0);
          link.click();
          hideToast();
        } catch (err) {
          showToast('Download failed.', 3000, true);
        }
      }, 1400);
    } else if (layout === 'single-back') {
      const hiCvs = document.createElement('canvas');
      drawBackCard(hiCvs, st, 1);
      setTimeout(() => {
        try {
          const link = document.createElement('a');
          link.download = baseName + '_Back.png';
          link.href = hiCvs.toDataURL('image/png', 1.0);
          link.click();
          hideToast();
        } catch (err) {
          showToast('Download failed.', 3000, true);
        }
      }, 1200);
    } else {
      const hiCvs = document.createElement('canvas');
      drawCard(hiCvs, st, 1);
      setTimeout(() => {
        try {
          const link = document.createElement('a');
          link.download = baseName + '_Front.png';
          link.href = hiCvs.toDataURL('image/png', 1.0);
          link.click();
          hideToast();
        } catch (err) {
          showToast('Download failed.', 3000, true);
        }
      }, 1200);
    }
  }

  function downloadCard() { downloadStudentCard(AppState.currentStudent()); }

  // ── PRINT ────────────────────────────────────────────────────
  function doPrint() {
    const container = document.getElementById('cards-container');
    if (!container.children.length) {
      showToast('Please generate a card first.', 3000, true);
      return;
    }
    const canvases = container.querySelectorAll('canvas');
    let imgs = '';
    canvases.forEach(cv => {
      imgs += '<img src="' + cv.toDataURL('image/png') + '" style="max-width:100%;margin:10px auto;display:block"/>';
    });
    const w = window.open('', '_blank');
    w.document.write(
      '<html><head><title>ID Card Print</title><style>' +
      '*{margin:0;padding:0;box-sizing:border-box}' +
      'body{background:#fff;padding:20px;display:flex;flex-wrap:wrap;gap:16px;justify-content:center}' +
      '@media print{body{background:#fff}}' +
      'img{max-width:360px}' +
      '</style></head><body>' + imgs + '</body></html>'
    );
    w.document.close();
    setTimeout(() => w.print(), 600);
  }

  // ── COLOUR MANAGEMENT ────────────────────────────────────────
  const THEMES = {
    ebsu:    { headerBg:'#1558c0',headerText:'#ffffff',bodyBg:'#ffffff',borderColor:'#6ab0e0',titleColor:'#cc0000',matricLabel:'#1a3a9a',labelColor:'#000000',valueColor:'#222222',photoBackground:'#aa1111' },
    green:   { headerBg:'#1a7a3a',headerText:'#ffffff',bodyBg:'#f8fff8',borderColor:'#4aaa6a',titleColor:'#1a7a3a',matricLabel:'#0e4d22',labelColor:'#1a4a1a',valueColor:'#2a5a2a',photoBackground:'#0e4d22' },
    maroon:  { headerBg:'#8b0000',headerText:'#ffffff',bodyBg:'#fffafa',borderColor:'#cc4444',titleColor:'#8b0000',matricLabel:'#5a0000',labelColor:'#2a0000',valueColor:'#440000',photoBackground:'#5a0000' },
    purple:  { headerBg:'#5a1a9a',headerText:'#ffffff',bodyBg:'#fdf8ff',borderColor:'#9a6acc',titleColor:'#5a1a9a',matricLabel:'#3a0e6a',labelColor:'#2a0050',valueColor:'#3a0070',photoBackground:'#3a0e6a' },
    gold:    { headerBg:'#b8860b',headerText:'#ffffff',bodyBg:'#fffdf0',borderColor:'#d4a820',titleColor:'#7a5800',matricLabel:'#5a4000',labelColor:'#3a2800',valueColor:'#4a3800',photoBackground:'#7a5800' },
    classic: { headerBg:'#333333',headerText:'#ffffff',bodyBg:'#ffffff',borderColor:'#999999',titleColor:'#333333',matricLabel:'#444444',labelColor:'#000000',valueColor:'#333333',photoBackground:'#555555' }
  };

  function updateColor(key, val) {
    AppState.updateColor(key, val);

    const picker = document.getElementById('c-' + key);
    const textEl = document.getElementById('ct-' + key);
    if (picker) picker.value = val;
    if (textEl) textEl.value = val.toUpperCase();

    const elBg    = id => { const e = document.getElementById(id); if (e) e.style.background   = val; };
    const elBc    = id => { const e = document.getElementById(id); if (e) e.style.borderColor  = val; };
    const elColor = id => { const e = document.getElementById(id); if (e) e.style.color        = val; };
    const colors  = AppState.get('colors');

    if (key === 'headerBg')   { elBg('prev-headerBg'); elBg('prev-headerText'); elColor('prevTxt-headerBg', colors.headerText); elColor('prevTxt-headerText', colors.headerText); }
    if (key === 'headerText') { elColor('prevTxt-headerBg'); elColor('prevTxt-headerText'); }
    if (key === 'bodyBg')         elBg('prev-bodyBg');
    if (key === 'borderColor')    elBc('prev-borderColor');
    if (key === 'titleColor')     elColor('prevTxt-titleColor');
    if (key === 'matricLabel')    elColor('prevTxt-matricLabel');
    if (key === 'labelColor')     elColor('prevTxt-labelColor');
    if (key === 'valueColor')   { elColor('prevTxt-valueColor'); elColor('prevTxt-valueColor2'); }
    if (key === 'photoBackground') elBg('prev-photoBackground');
  }

  function syncColorText(key, val) {
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) updateColor(key, val);
    else { const el = document.getElementById('ct-' + key); if (el) el.value = val.toUpperCase(); }
  }

  function applyTheme(name) {
    const t = THEMES[name];
    if (!t) return;
    Object.keys(t).forEach(k => updateColor(k, t[k]));
  }

  // ── LOGO ─────────────────────────────────────────────────────
  function pickLogo() {
    const inp = document.createElement('input');
    inp.type   = 'file';
    inp.accept = 'image/*';
    inp.onchange = e => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = ev => {
        AppState.set('customLogo', ev.target.result);
        showToast('Crest uploaded! Click Generate to apply.', 2500);
      };
      reader.readAsDataURL(f);
    };
    inp.click();
  }

  // ── IMAGE REMOVE ─────────────────────────────────────────────
  function removeImg(field) {
    const st = AppState.currentStudent();
    st[field] = null;
    if (field === 'photo') {
      document.getElementById('photo-preview').innerHTML = '<span class="preview-placeholder">👤</span>';
      document.getElementById('rm-photo').style.display = 'none';
    } else {
      document.getElementById('sig-preview').innerHTML = '<span class="sig-placeholder">Signature</span>';
      document.getElementById('rm-sig').style.display = 'none';
    }
  }

  // ── PUBLIC ───────────────────────────────────────────────────
  return {
    init() {
      renderTabs();
      loadFields();
    },
    showPage, showToast, hideToast,
    renderTabs, saveCurrentFields, loadFields,
    generate, renderPreview, setLayout,
    downloadCard, downloadStudentCard, doPrint,
    updateColor, syncColorText, applyTheme,
    pickLogo, removeImg
  };
})();

// ── Auth gate bridge (called from generate() when session is missing) ────────
// Implemented in index.html's inline <script> which has access to the overlay.
function showAuthGate() {
  const gate = document.getElementById('auth-gate');
  if (gate) gate.style.display = 'flex';
}
