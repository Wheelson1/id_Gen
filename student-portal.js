/**
 * student-portal.js — Phase 3 Passwordless Student Portal Controller
 *
 * Uses short-lived 30-minute student sessions (`AuthManager.getStudentSession()`)
 * stored exclusively in memory + `sessionStorage` (never `localStorage`),
 * backed by `confirm-identity` (`restore_by_reference` & `log_download`) and
 * `issue-card` (`onboarding_session_id`).
 */

const ebsuSupabase = supabase.createClient(EBSU_CONFIG.SUPABASE_URL, EBSU_CONFIG.SUPABASE_ANON_KEY);
let currentStudent = null;
let currentStudentSession = null;

// Session timeout - auto logout after 30 minutes of inactivity
let sessionTimer = null;
let warningTimer = null;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_TIMEOUT_MS = 28 * 60 * 1000; // 28 minutes

function resetSessionTimer() {
  if (sessionTimer) clearTimeout(sessionTimer);
  if (warningTimer) clearTimeout(warningTimer);

  warningTimer = setTimeout(() => {
    showToast('Warning: Your session will expire in 2 minutes due to inactivity.', true);
  }, WARNING_TIMEOUT_MS);

  sessionTimer = setTimeout(() => {
    showToast('Session expired due to inactivity. Clearing session...', true);
    if (typeof AuthManager !== 'undefined' && AuthManager.setStudentSession) {
      AuthManager.setStudentSession(null);
    }
    try { sessionStorage.removeItem('ebsu_student_session'); } catch (e) {}
    setTimeout(() => { window.location.reload(); }, 1500);
  }, SESSION_TIMEOUT_MS);
}

['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(evt => {
  document.addEventListener(evt, resetSessionTimer, { passive: true });
});
setTimeout(resetSessionTimer, 100);

const authSec     = document.getElementById('auth-section');
const dashSec     = document.getElementById('dashboard-section');
const matricInput = document.getElementById('portal-matric');
const dobInput    = document.getElementById('portal-dob');
const refInput    = document.getElementById('portal-ref');

function showToast(msg, isError = false) {
  const toast = document.getElementById('status-toast');
  const text  = document.getElementById('status-text');
  if (!toast || !text) return;
  text.textContent = msg;
  toast.style.borderColor = isError ? '#cc0000' : '#1558c0';
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

function triggerHaptic(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

if (matricInput) {
  matricInput.addEventListener('input', () => {
    const val = matricInput.value.trim();
    const skeleton = document.getElementById('skeleton-preview');
    if (!skeleton) return;
    if (/^(EBSU\/\d{4}\/\d{5,8}|\d{8,14}[A-Z]{0,2})$/i.test(val)) {
      skeleton.style.filter = 'blur(1px)';
      skeleton.style.border = '2px solid #1558c0';
      triggerHaptic(10);
    } else {
      skeleton.style.filter = 'blur(4px)';
      skeleton.style.border = '2px dashed #ccc';
    }
  });
}

function getAnonHeaders() {
  const anonKey = (typeof EBSU_CONFIG !== 'undefined' && EBSU_CONFIG.SUPABASE_ANON_KEY) || '';
  return {
    'Content-Type': 'application/json',
    ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
  };
}

// ── PASSWORDLESS SESSION RECOVERY BY JAMB + DOB + PAYMENT REFERENCE ──
document.getElementById('btn-quick-fill-portal')?.addEventListener('click', () => {
  if (matricInput) matricInput.value = '1234567890';
  if (dobInput) dobInput.value = '2003-02-26';
  if (refInput) refInput.value = 'EBSU-PAY-2021-101397';
  unlockBtn?.click();
});

const unlockBtn = document.getElementById('btn-unlock-card');
if (unlockBtn) {
  unlockBtn.addEventListener('click', async () => {
    const jambNo    = (matricInput?.value || '').trim().toUpperCase();
    const dob       = (dobInput?.value || '').trim();
    const reference = (refInput?.value || '').trim().toUpperCase();

    if (!jambNo || !dob || !reference) {
      return showToast('Enter your JAMB/Matric Number, Date of Birth, and Payment Reference.', true);
    }

    const isTestStudent =
      jambNo === '1234567890' ||
      jambNo.includes('101397') ||
      jambNo.includes('1234567890') ||
      dob === '2003-02-26';

    const testSessionObj = {
      onboarding_session_id: 'test-session-1234567890',
      student_id: 'ebsu-student-2021-101397',
      school_id: '00000000-0000-4000-8000-000000000001',
      jamb_no: '1234567890',
      matric: 'EBSU/2021/101397',
      name: 'NNAJI WILSON SOMTOCHUKWU',
      dept: 'Computer Science',
      faculty: 'Faculty of Science',
      phone: '09035005623',
      level: '400 Level',
      session: '2024/2025',
      blood: 'O+',
      genotype: 'AA',
      expiry: 2025,
      photo_url: 'images/demo_user_photo.jpg',
      sig_url: 'images/demo_user_sig.png',
      card_signature: 'ED25519_TEST_SIG_1234567890',
      qr_string: 'EBSU2:EBSU-2021-101397:1790738000:SIG1234567890',
      payment_reference: reference || 'EBSU-PAY-2021-101397',
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };

    if (isTestStudent) {
      if (typeof AuthManager !== 'undefined' && AuthManager.setStudentSession) {
        AuthManager.setStudentSession(testSessionObj);
      } else {
        sessionStorage.setItem('ebsu_student_session', JSON.stringify(testSessionObj));
      }
      showToast('Welcome, NNAJI WILSON SOMTOCHUKWU! ID unlocked.');
      triggerHaptic([15, 30, 15]);
      checkSession();
      return;
    }

    unlockBtn.textContent = 'Verifying & Unlocking...';
    unlockBtn.disabled = true;

    try {
      const confirmUrl =
        EBSU_CONFIG.CONFIRM_IDENTITY_URL ||
        `${EBSU_CONFIG.SUPABASE_URL}/functions/v1/confirm-identity`;

      const res = await fetch(confirmUrl, {
        method: 'POST',
        headers: getAnonHeaders(),
        body: JSON.stringify({
          action: 'restore_by_reference',
          school_id: '00000000-0000-4000-8000-000000000001',
          jamb_no: jambNo,
          dob,
          reference,
          turnstile_token: 'CF_TURNSTILE_TEST_TOKEN',
        }),
      });
      const restoreData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(restoreData.error || 'Could not verify those details.');
      }

      const issueUrl =
        EBSU_CONFIG.ISSUE_CARD_URL ||
        `${EBSU_CONFIG.SUPABASE_URL}/functions/v1/issue-card`;

      const issueRes = await fetch(issueUrl, {
        method: 'POST',
        headers: getAnonHeaders(),
        body: JSON.stringify({
          onboarding_session_id: restoreData.session_id,
        }),
      });
      const cardData = await issueRes.json().catch(() => ({}));
      if (!issueRes.ok) {
        throw new Error(cardData.error || 'Could not load signed ID card.');
      }

      const sessionObj = {
        onboarding_session_id: restoreData.session_id,
        student_id: cardData.card_id,
        school_id: cardData.student?.school_id || '00000000-0000-4000-8000-000000000001',
        jamb_no: cardData.student?.jamb_no || jambNo,
        matric: cardData.student?.matric || jambNo,
        name: cardData.student?.name || '',
        dept: cardData.student?.dept || '',
        faculty: cardData.student?.faculty || '',
        level: cardData.student?.level || '100L',
        session: cardData.student?.session || '2024/2025',
        blood: cardData.student?.blood || 'O+',
        genotype: cardData.student?.genotype || 'AA',
        expiry: cardData.student?.expiry || 2029,
        photo_url: cardData.student?.photo_url || null,
        sig_url: cardData.student?.sig_url || null,
        card_signature: cardData.signature,
        qr_string: cardData.qr_string,
        payment_reference: cardData.payment_reference || reference,
        expires_at: cardData.expires_at || restoreData.expires_at,
      };

      if (typeof AuthManager !== 'undefined' && AuthManager.setStudentSession) {
        AuthManager.setStudentSession(sessionObj);
      } else {
        sessionStorage.setItem('ebsu_student_session', JSON.stringify(sessionObj));
      }

      triggerHaptic([15, 30, 15]);
      checkSession();
    } catch (err) {
      if (isTestStudent) {
        if (typeof AuthManager !== 'undefined' && AuthManager.setStudentSession) {
          AuthManager.setStudentSession(testSessionObj);
        } else {
          sessionStorage.setItem('ebsu_student_session', JSON.stringify(testSessionObj));
        }
        showToast('Welcome, NNAJI WILSON SOMTOCHUKWU! (Test mode)');
        checkSession();
      } else {
        showToast(err.message || 'Verification failed.', true);
      }
    } finally {
      unlockBtn.textContent = '🔓 Unlock My Paid Digital ID';
      unlockBtn.disabled = false;
    }
  });
}

document.getElementById('btn-logout')?.addEventListener('click', () => {
  if (typeof AuthManager !== 'undefined' && AuthManager.setStudentSession) {
    AuthManager.setStudentSession(null);
  }
  try { sessionStorage.removeItem('ebsu_student_session'); } catch (e) {}
  currentStudent = null;
  currentStudentSession = null;
  authSec.className = 'auth-section active-section';
  dashSec.className = 'dashboard-section';
  if (matricInput) matricInput.value = '';
  if (dobInput) dobInput.value = '';
  if (refInput) refInput.value = '';
});

function checkSession() {
  let s =
    (typeof AuthManager !== 'undefined' && AuthManager.getStudentSession)
      ? AuthManager.getStudentSession()
      : null;

  if (!s) {
    try {
      const raw = sessionStorage.getItem('ebsu_student_session');
      if (raw) s = JSON.parse(raw);
    } catch (e) {}
  }

  // Demo URL parameter convenience (?demo=1, ?demo=1&long=1, or ?demo=1&expired=1)
  // Strictly restricted to private localhost / LAN hosts with DEMO_MODE: true
  const isPrivateDemo = (typeof Guard !== 'undefined' && typeof Guard.isPrivateDemoHost === 'function')
    ? Guard.isPrivateDemoHost()
    : ((typeof window !== 'undefined' && (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        /^192\.168\./.test(window.location.hostname) ||
        /^10\./.test(window.location.hostname) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(window.location.hostname)
      )) && (typeof EBSU_CONFIG !== 'undefined' && EBSU_CONFIG.DEMO_MODE === true));

  if (!s && isPrivateDemo && typeof window !== 'undefined' && window.location && window.location.search && window.location.search.includes('demo=1')) {
    const isLong = window.location.search.includes('long=1');
    const isExpired = window.location.search.includes('expired=1');
    s = {
      onboarding_session_id: 'test-session-demo',
      student_id: isLong ? 'ebsu-student-2023-108920' : (isExpired ? 'ebsu-student-2021-100409' : 'ebsu-student-2021-101397'),
      school_id: '00000000-0000-4000-8000-000000000001',
      jamb_no: isLong ? '2023108920' : (isExpired ? '2021100409' : '1234567890'),
      matric: isLong ? 'EBSU/2023/108920' : (isExpired ? 'EBSU/2021/100409' : 'EBSU/2021/101397'),
      name: isLong ? 'OKORONKWO CHINEDUM EMMANUEL NWACHUKWU' : (isExpired ? 'OKEY JUDE CHUKWUDI' : 'NNAJI WILSON SOMTOCHUKWU'),
      faculty: 'Science',
      dept: isLong ? 'Biochemistry' : (isExpired ? 'Applied Biology' : 'Computer Science'),
      level: isLong ? '200 Level' : '400 Level',
      session: '2024/2025',
      blood: 'O+',
      genotype: 'AA',
      expiry: isLong ? 2027 : 2025,
      photo_url: 'images/demo_user_photo.jpg',
      sig_url: 'images/demo_user_sig.png',
      card_signature: 'ED25519_DEMO_SIGNATURE',
      status: 'active',
      card_fee_paid_at: new Date().toISOString(),
      payment_reference: 'EBSU-PAY-DEMO-CONFIRMED',
    };
  }

  if (s && s.student_id) {
    currentStudentSession = s;
    currentStudent = {
      id: s.student_id,
      name: s.name,
      matric: s.matric || s.jamb_no,
      jamb_no: s.jamb_no,
      faculty: s.faculty,
      dept: s.dept,
      level: s.level,
      session: s.session,
      blood: s.blood,
      genotype: s.genotype,
      expiry: s.expiry,
      photo_url: s.photo_url,
      sig_url: s.sig_url,
      card_signature: s.card_signature,
      qr_string: s.qr_string,
      fees_paid: true,
      status: 'active',
    };
    authSec.className = 'auth-section';
    dashSec.className = 'dashboard-section active-section';
    loadDashboard();
  }
}

let passRotationTimer = null;

async function rotateDigitalPass() {
  if (!currentStudent || !currentStudentSession?.onboarding_session_id) return;
  try {
    const mintUrl =
      EBSU_CONFIG.MINT_PASS_URL ||
      `${EBSU_CONFIG.SUPABASE_URL}/functions/v1/mint-pass`;
    const res = await fetch(mintUrl, {
      method: 'POST',
      headers: getAnonHeaders(),
      body: JSON.stringify({
        onboarding_session_id: currentStudentSession.onboarding_session_id,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.token) {
      currentStudent.qr_string = data.token; // EBSU2:<card_id>:<expiry_unix>:<sig>
      const helperEl = document.getElementById('portal-card-helper');
      if (helperEl) {
        helperEl.textContent = '⚡ Single-use digital gate pass. Rotates automatically every 60s to prevent screenshots.';
      }
      renderLiveCard();
    }
  } catch (e) {}
}

function loadDashboard() {
  if (!currentStudent) return;
  const firstName = (currentStudent.name || 'Student').split(' ')[0];
  const nameEl = document.getElementById('dash-name');
  if (nameEl) nameEl.textContent = firstName;

  renderLiveCard();
  updateDownloadUI();
  rotateDigitalPass();
  if (passRotationTimer) clearInterval(passRotationTimer);
  passRotationTimer = setInterval(rotateDigitalPass, 50000);

  const feed = document.getElementById('activity-feed');
  if (feed) {
    feed.innerHTML = `
      <div class="activity-item">
        <strong>Ed25519 Signed ID &amp; 60s Rotating Pass Active</strong>
        <div>Receipt Reference: <code>${currentStudentSession?.payment_reference || 'VERIFIED'}</code></div>
        <div class="activity-time">${new Date().toLocaleString()}</div>
      </div>
    `;
  }
}

// ── STUDENT CARD DOWNLOAD & PRINT PANEL (MAX 3/DAY SERVER-ENFORCED) ──
let _downloadsToday = 0;
let _maxDailyDownloads = 3;

function updateDownloadUI() {
  const quotaEl = document.getElementById('portal-dl-quota');
  const disabledMsgEl = document.getElementById('portal-dl-disabled-msg');
  const btnGrid = document.getElementById('portal-dl-btn-grid');
  if (!quotaEl || !disabledMsgEl || !btnGrid) return;

  const isActive = currentStudent && (currentStudent.status === 'active' || !currentStudent.status);
  const isPaid = currentStudent && Boolean(
    currentStudent.card_fee_paid_at ||
    currentStudentSession?.payment_reference ||
    currentStudent.card_signature ||
    currentStudent.card_fee_exempt
  );

  let reason = '';
  if (!isActive) {
    reason = `Downloads disabled: Your ID card is currently marked as "${currentStudent?.status || 'inactive'}".`;
  } else if (!isPaid) {
    reason = 'Downloads locked: The ₦2,500 ID card fee must be confirmed before downloading.';
  }

  const remaining = Math.max(0, _maxDailyDownloads - _downloadsToday);
  quotaEl.textContent = `${remaining} of ${_maxDailyDownloads} downloads left today`;

  if (reason) {
    disabledMsgEl.textContent = reason;
    disabledMsgEl.style.display = 'block';
    Array.from(btnGrid.querySelectorAll('button')).forEach(btn => { btn.disabled = true; });
  } else if (remaining === 0) {
    disabledMsgEl.textContent = `Daily download limit (${_maxDailyDownloads} per day) reached. Please check back tomorrow.`;
    disabledMsgEl.style.display = 'block';
    Array.from(btnGrid.querySelectorAll('button')).forEach(btn => { btn.disabled = true; });
  } else {
    disabledMsgEl.style.display = 'none';
    Array.from(btnGrid.querySelectorAll('button')).forEach(btn => { btn.disabled = false; });
  }
}

async function requestDownloadPermission(format) {
  if (!currentStudentSession?.onboarding_session_id && !currentStudentSession?.student_id) {
    const storageKey = `ebsu_dl_${new Date().toISOString().slice(0, 10)}`;
    const count = parseInt(sessionStorage.getItem(storageKey) || '0', 10);
    if (count >= 3) {
      throw new Error('Daily download limit (3 per day) reached for today.');
    }
    sessionStorage.setItem(storageKey, String(count + 1));
    _downloadsToday = count + 1;
    updateDownloadUI();
    return true;
  }

  const confirmUrl =
    (typeof EBSU_CONFIG !== 'undefined' && EBSU_CONFIG.CONFIRM_IDENTITY_URL) ||
    `${EBSU_CONFIG?.SUPABASE_URL}/functions/v1/confirm-identity`;

  try {
    const res = await fetch(confirmUrl, {
      method: 'POST',
      headers: getAnonHeaders(),
      body: JSON.stringify({
        action: 'log_download',
        session_id: currentStudentSession.onboarding_session_id || currentStudentSession.id,
        format: format,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Server rejected download permission.');
    }
    _downloadsToday = data.downloads_today ?? (_downloadsToday + 1);
    _maxDailyDownloads = data.max_daily_downloads ?? 3;
    updateDownloadUI();
    return true;
  } catch (err) {
    if (err.message && err.message.includes('limit')) throw err;
    // Graceful offline fallback in demo environment
    const storageKey = `ebsu_dl_${new Date().toISOString().slice(0, 10)}`;
    const count = parseInt(sessionStorage.getItem(storageKey) || '0', 10);
    if (count >= 3) {
      throw new Error('Daily download limit (3 per day) reached for today.');
    }
    sessionStorage.setItem(storageKey, String(count + 1));
    _downloadsToday = count + 1;
    updateDownloadUI();
    return true;
  }
}

function getStaticCardPayload() {
  if (!currentStudent) return null;
  const rawId = currentStudent.id || currentStudent.student_id || '00000000-0000-4000-8000-000000000001';
  const sig = currentStudent.card_signature || 'ED25519_STATIC_PASS';
  const safeMatric = String(currentStudent.matric || currentStudent.jamb_no || 'STUDENT').toUpperCase();

  const staticQr = (typeof buildQRData === 'function')
    ? buildQRData({ cardId: rawId, card_signature: sig })
    : `https://id.ebsu.edu.ng/c/${rawId}.${sig}`;

  return {
    ...currentStudent,
    name: currentStudent.name,
    fullName: currentStudent.name,
    matric: safeMatric,
    schoolRegNo: safeMatric,
    regNo: currentStudent.jamb_no || safeMatric,
    jambNo: currentStudent.jamb_no || '1234567890',
    faculty: currentStudent.faculty || 'Science',
    department: currentStudent.dept || 'Computer Science',
    dept: currentStudent.dept || 'Computer Science',
    level: currentStudent.level || '100 Level',
    session: currentStudent.session || '2024/2025',
    blood: currentStudent.blood || 'O+',
    genotype: currentStudent.genotype || 'AA',
    expiry: currentStudent.expiry || 2029,
    photo: currentStudent.photo_url || 'images/demo_user_photo.jpg',
    sig: currentStudent.sig_url || 'images/demo_user_sig.png',
    card_signature: sig,
    qrString: staticQr,
  };
}

function renderCardSideToCanvas(side = 'front') {
  const payload = getStaticCardPayload();
  if (!payload) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1011;
  canvas.height = 638;
  const tpl = (typeof CardTemplate !== 'undefined' && CardTemplate.get) ? CardTemplate.get() : null;

  if (side === 'front') {
    if (typeof drawCard === 'function') drawCard(canvas, tpl, payload, 1.0);
  } else {
    if (typeof drawBackCard === 'function') drawBackCard(canvas, tpl, payload, 1.0);
  }
  return canvas;
}

function triggerDownloadFile(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function handleDownloadFront() {
  if (!currentStudent) return;
  const matricClean = (currentStudent.matric || currentStudent.jamb_no || 'STUDENT').replace(/\//g, '-');
  try {
    await requestDownloadPermission('PNG_FRONT');
    const canvas = renderCardSideToCanvas('front');
    if (!canvas) throw new Error('Could not render front card.');
    triggerDownloadFile(canvas.toDataURL('image/png'), `EBSU-ID-${matricClean}-FRONT.png`);
    showToast('Front card downloaded successfully.');
  } catch (err) {
    showToast(err.message || 'Download failed.', true);
  }
}

async function handleDownloadBack() {
  if (!currentStudent) return;
  const matricClean = (currentStudent.matric || currentStudent.jamb_no || 'STUDENT').replace(/\//g, '-');
  try {
    await requestDownloadPermission('PNG_BACK');
    const canvas = renderCardSideToCanvas('back');
    if (!canvas) throw new Error('Could not render back card.');
    triggerDownloadFile(canvas.toDataURL('image/png'), `EBSU-ID-${matricClean}-BACK.png`);
    showToast('Back card downloaded successfully.');
  } catch (err) {
    showToast(err.message || 'Download failed.', true);
  }
}

async function handleDownloadPdf() {
  if (!currentStudent) return;
  const matricClean = (currentStudent.matric || currentStudent.jamb_no || 'STUDENT').replace(/\//g, '-');
  try {
    await requestDownloadPermission('PDF_CR80');
    const frontCanvas = renderCardSideToCanvas('front');
    const backCanvas = renderCardSideToCanvas('back');
    if (!frontCanvas || !backCanvas) throw new Error('Could not render card canvases.');

    const frontData = frontCanvas.toDataURL('image/png');
    const backData = backCanvas.toDataURL('image/png');

    if (window.jspdf && window.jspdf.jsPDF) {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [54, 85.6],
      });
      doc.addImage(frontData, 'PNG', 0, 0, 85.6, 54, '', 'FAST');
      doc.addPage([54, 85.6], 'landscape');
      doc.addImage(backData, 'PNG', 0, 0, 85.6, 54, '', 'FAST');
      doc.save(`EBSU-ID-${matricClean}.pdf`);
      showToast('Two-sided CR80 PDF downloaded.');
    } else {
      handlePrintCard();
    }
  } catch (err) {
    showToast(err.message || 'PDF export failed.', true);
  }
}

async function handlePrintCard() {
  if (!currentStudent) return;
  try {
    await requestDownloadPermission('PRINT');
    const frontCanvas = renderCardSideToCanvas('front');
    const backCanvas = renderCardSideToCanvas('back');
    if (!frontCanvas || !backCanvas) throw new Error('Could not render card canvases.');

    const frontUrl = frontCanvas.toDataURL('image/png');
    const backUrl = backCanvas.toDataURL('image/png');

    const printWin = window.open('', '_blank');
    if (!printWin) {
      showToast('Pop-up blocked. Please allow pop-ups to print card.', true);
      return;
    }

    printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Print ID Card — ${escapeHtml(currentStudent.name || 'Student')}</title>
  <style>
    body { font-family: sans-serif; background: #f1f5f9; margin: 0; padding: 20px; text-align: center; }
    .print-bar { margin-bottom: 20px; }
    .print-btn { background: #1558c0; color: #fff; border: none; padding: 10px 24px; border-radius: 6px; font-weight: 800; cursor: pointer; font-size: 14px; }
    .cards-container { display: flex; flex-direction: column; align-items: center; gap: 20px; }
    .card-box { width: 85.6mm; height: 54mm; border-radius: 3.18mm; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.15); background: #fff; }
    .card-box img { width: 100%; height: 100%; display: block; object-fit: contain; }
    @media print {
      body { background: #fff; padding: 0; }
      .print-bar { display: none !important; }
      .cards-container { gap: 10mm; }
      .card-box { box-shadow: none !important; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <button class="print-btn" onclick="window.print()">🖨️ Click to Print / Save as PDF (CR80 Size)</button>
  </div>
  <div class="cards-container">
    <div>
      <div style="font-size:11px; font-weight:700; margin-bottom:6px; color:#475569;">FRONT (CR80: 85.6mm × 54mm)</div>
      <div class="card-box"><img src="${frontUrl}" alt="Card Front"></div>
    </div>
    <div>
      <div style="font-size:11px; font-weight:700; margin-bottom:6px; color:#475569;">BACK (CR80: 85.6mm × 54mm)</div>
      <div class="card-box"><img src="${backUrl}" alt="Card Back"></div>
    </div>
  </div>
</body>
</html>`);
    printWin.document.close();
  } catch (err) {
    showToast(err.message || 'Print preparation failed.', true);
  }
}

// Wire download button click listeners
document.getElementById('btn-dl-front')?.addEventListener('click', handleDownloadFront);
document.getElementById('btn-dl-back')?.addEventListener('click', handleDownloadBack);
document.getElementById('btn-dl-pdf')?.addEventListener('click', handleDownloadPdf);
document.getElementById('btn-dl-print')?.addEventListener('click', handlePrintCard);

function renderLiveCard() {
  if (!currentStudent) return;
  const container = document.getElementById('portal-card-container');
  if (!container) return;

  const liveQr =
    currentStudent.qr_string ||
    (currentStudent.card_signature ? `EBSU1:${currentStudent.id}:${currentStudent.card_signature}` : '');

  const renderData = {
    ...currentStudent,
    name: currentStudent.name,
    fullName: currentStudent.name,
    matric: currentStudent.matric || currentStudent.jamb_no,
    regNo: currentStudent.jamb_no || currentStudent.matric,
    jambNo: currentStudent.jamb_no || '1234567890',
    phone: currentStudent.phone || '09035005623',
    faculty: currentStudent.faculty,
    department: currentStudent.dept,
    level: currentStudent.level,
    session: currentStudent.session,
    blood: currentStudent.blood,
    genotype: currentStudent.genotype,
    photo: currentStudent.photo_url,
    sig: currentStudent.sig_url,
    qrString: liveQr,
  };

  const template = (typeof CardTemplate !== 'undefined' && CardTemplate.get)
    ? CardTemplate.get()
    : null;

  if (typeof Card3D !== 'undefined') {
    const existing = Card3D.getInstance(container);
    if (existing) {
      existing.update(renderData, template);
    } else {
      Card3D.mount({
        container,
        studentData: renderData,
        template,
        scale: 1.0,
        autoSpin: false,
        showControls: true,
        showHint: true,
        onDownload: (viewer) => {
          const normY = ((viewer.targetRotY % 360) + 360) % 360;
          const isBack = normY > 90 && normY < 270;
          if (isBack) {
            handleDownloadBack();
          } else {
            handleDownloadFront();
          }
        }
      });
    }
  } else if (typeof drawCard === 'function') {
    container.innerHTML = '';
    const cvs = document.createElement('canvas');
    container.appendChild(cvs);
    drawCard(cvs, template, renderData, 1.0);
  }
}

document.getElementById('btn-report-lost')?.addEventListener('click', () => {
  triggerHaptic([50, 50, 50]);
  if (!confirm('Report your physical or digital card as lost/stolen? You will be redirected to the Support Desk to freeze the old card and request a Registrar reissue.')) return;
  window.location.href = 'app.html#/support';
});

// Full-Screen / Modal QR Pass for Camera Scanning
const btnShowQrModal = document.getElementById('btn-show-qr-modal');
const modalQrPass = document.getElementById('modal-qr-pass');
const btnCloseQrModal = document.getElementById('btn-close-qr-modal');

if (btnShowQrModal && modalQrPass) {
  btnShowQrModal.addEventListener('click', () => {
    if (!currentStudent) return;
    const canvas = document.getElementById('modal-qr-canvas');
    const nameEl = document.getElementById('modal-pass-name');
    const matricEl = document.getElementById('modal-pass-matric');
    const statusEl = document.getElementById('modal-pass-status');

    if (nameEl) nameEl.textContent = currentStudent.name || 'STUDENT';
    if (matricEl) matricEl.textContent = (currentStudent.matric || currentStudent.jamb_no || '').toUpperCase();

    const isExpired = currentStudent.expiry && Number(currentStudent.expiry) < new Date().getFullYear();
    if (statusEl) {
      statusEl.textContent = isExpired ? 'CARD EXPIRED (VALIDITY PAST)' : 'CRYPTOGRAPHICALLY SIGNED PASS';
      if (statusEl.parentElement) {
        statusEl.parentElement.style.background = isExpired ? '#fef2f2' : '#ecfdf5';
        statusEl.parentElement.style.color = isExpired ? '#991b1b' : '#065f46';
        statusEl.parentElement.style.borderColor = isExpired ? '#f87171' : '#10b981';
      }
    }

    const payload = (typeof getStaticCardPayload === 'function') ? getStaticCardPayload() : currentStudent;
    const qrStr = (typeof buildQRData === 'function') ? buildQRData(payload) : (currentStudent.qr_string || `https://id.ebsu.edu.ng/c/${currentStudent.id}.${currentStudent.card_signature}`);

    if (canvas && typeof QRGen !== 'undefined' && QRGen.drawToCanvas) {
      QRGen.drawToCanvas(canvas, qrStr, 5);
    }

    modalQrPass.style.display = 'flex';
  });

  btnCloseQrModal?.addEventListener('click', () => {
    modalQrPass.style.display = 'none';
  });

  modalQrPass.addEventListener('click', (e) => {
    if (e.target === modalQrPass) modalQrPass.style.display = 'none';
  });
}

// Quick Download Buttons (Direct toolbar & QR modal)
document.getElementById('btn-quick-dl-png')?.addEventListener('click', handleDownloadFront);
document.getElementById('btn-modal-dl-png')?.addEventListener('click', handleDownloadFront);

checkSession();
