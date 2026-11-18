/**
 * js/onboarding.js — Passwordless Student Onboarding & Card Fee Checkout
 *
 * The public student flow on index.html. Every step is decided by the server:
 *   1-2. School + JAMB/Matric number + Turnstile      -> start-verification (action: start)
 *   3.   Masked name + department: "Is this you?"       -> start-verification (confirm_yes / not_me)
 *   4.   Date of birth (compared on the server only)    -> confirm-identity   (verify_dob)
 *   5.   Redacted preview + card fee payment            -> card-payment       (init / confirm)
 *   6.   Ed25519-signed card + 60-second live pass      -> issue-card, mint-pass
 *
 * The browser never invents a student, a payment or a signature.
 *
 * DEMO MODE: only on localhost / private LAN addresses AND with
 * EBSU_CONFIG.DEMO_MODE === true, the same screens run against canned sample
 * answers so the flow can be presented offline. On any public hostname demo
 * mode is impossible, whatever config.js says.
 */

const StudentOnboarding = (() => {
  const DEFAULT_EBSU_SCHOOL_ID = '00000000-0000-4000-8000-000000000001';
  const PROGRESS_KEY = 'ebsu_onb_progress';
  const DEMO_SESSION_ID = 'test-session-1234567890';

  function cfg() {
    // try/catch: if config.js has a typo, EBSU_CONFIG is unusable and even `typeof` throws.
    try {
      return (typeof EBSU_CONFIG !== 'undefined') ? EBSU_CONFIG : (window.EBSU_CONFIG || null);
    } catch (e) {
      return null;
    }
  }

  // Same rule as Guard.isPrivateDemoHost() (guard.js is not loaded on this page).
  function isDemoMode() {
    try {
      const h = window.location.hostname;
      const isPrivate = (
        h === 'localhost' ||
        h === '127.0.0.1' ||
        h === '::1' ||
        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h) ||
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h) ||
        /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)
      );
      const c = cfg();
      return isPrivate && Boolean(c && c.DEMO_MODE === true);
    } catch (e) {
      return false;
    }
  }
  const DEMO = isDemoMode();

  const _state = {
    step: 1, // 1..6, 30 = "not me"
    schools: [],
    selectedSchoolId: DEFAULT_EBSU_SCHOOL_ID,
    selectedSchoolName: 'Ebonyi State University (EBSU)',
    jambNo: '',
    sessionId: null,
    expiresAt: null,
    maskedName: '',
    department: '',
    redactedSvg: '',
    feeAmount: null,      // naira, always from the server
    currency: 'NGN',
    paymentReference: '',
    authUrl: null,
    alreadyPaid: false,
    demoPaid: false,
    issuedCard: null,     // { card_id, signature, qr_string, student }
    tokens: { step2: null, step4: null, restore: null },
  };

  // ── Small helpers ──────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function publicBaseUrl() {
    const c = cfg();
    return (c && c.PUBLIC_BASE_URL) ? c.PUBLIC_BASE_URL : 'https://ebsu-id-card.vercel.app';
  }

  function formatNaira(n) {
    const v = Number(n);
    return Number.isFinite(v) && v > 0 ? `₦${v.toLocaleString('en-NG')}` : '—';
  }

  function uuidToB64Url(uuid) {
    try {
      const clean = String(uuid || '').replace(/-/g, '').toLowerCase();
      if (!/^[0-9a-f]{32}$/.test(clean)) return null;
      let binary = '';
      for (let i = 0; i < 32; i += 2) binary += String.fromCharCode(parseInt(clean.substr(i, 2), 16));
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    } catch (e) {
      return null;
    }
  }

  function getEndpoint(key, fallbackPath) {
    const c = cfg();
    if (c && c[key]) return c[key];
    const base = (c && c.SUPABASE_URL) ? c.SUPABASE_URL : '';
    return `${base}/functions/v1/${fallbackPath}`;
  }

  function getAnonHeaders() {
    const c = cfg();
    const anonKey = (c && c.SUPABASE_ANON_KEY) || '';
    return {
      'Content-Type': 'application/json',
      ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
    };
  }

  /**
   * One door to the server. Returns { ok, status, data }.
   * Throws only when the server cannot be reached at all.
   */
  async function api(configKey, path, body) {
    if (DEMO) return demoApi(path, body);
    let res;
    try {
      res = await fetch(getEndpoint(configKey, path), {
        method: 'POST',
        headers: getAnonHeaders(),
        body: JSON.stringify(body),
      });
    } catch (netErr) {
      throw new Error('Could not reach the server. Check your internet connection and try again.');
    }
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  // ── Alerts (one alert box per panel) ───────────────────────────
  const ALERT_IDS = {
    1: 'onb-alert-step12', 2: 'onb-alert-step12', 3: 'onb-alert-step3',
    4: 'onb-alert-step4', 5: 'onb-alert-step5', 6: 'onb-alert-step6',
  };

  function setBanner(msg, type = 'error', step = _state.step) {
    Object.values(ALERT_IDS).forEach(id => {
      const el = $(id);
      if (el) { el.style.display = 'none'; el.textContent = ''; }
    });
    if (!msg) return;
    const el = $(ALERT_IDS[step] || ALERT_IDS[1]);
    if (!el) return;
    el.className = `onb-alert onb-alert-${type}`;
    el.textContent = msg;
    el.style.display = 'block';
    try { el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
  }

  function setBusy(btnId, busy, busyText) {
    const btn = $(btnId);
    if (!btn) return;
    if (busy) {
      if (!btn.dataset.label) btn.dataset.label = btn.textContent;
      btn.disabled = true;
      btn.textContent = busyText;
    } else {
      btn.disabled = false;
      if (btn.dataset.label) btn.textContent = btn.dataset.label;
    }
  }

  // ── Schools (Step 1) ───────────────────────────────────────────
  async function loadSchools() {
    const selectEl = $('onb-school-select');
    let schoolsList = [
      { id: DEFAULT_EBSU_SCHOOL_ID, code: 'EBSU', name: 'Ebonyi State University, Abakaliki (EBSU)' },
    ];
    try {
      const c = cfg();
      if (!DEMO && typeof supabase !== 'undefined' && c) {
        const client = window.ebsuSupabase || supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY);
        window.ebsuSupabase = client;
        const { data } = await client
          .from('schools')
          .select('id, code, name')
          .eq('is_active', true)
          .order('name', { ascending: true });
        if (Array.isArray(data) && data.length > 0) schoolsList = data;
      }
    } catch (e) { /* keep the EBSU default */ }

    _state.schools = schoolsList;
    if (!selectEl) return;
    selectEl.textContent = '';
    schoolsList.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.code && !String(s.name || '').includes(`(${s.code})`) ? `${s.name} (${s.code})` : s.name;
      selectEl.appendChild(opt);
    });
    selectEl.value = _state.selectedSchoolId;
    selectEl.addEventListener('change', () => {
      _state.selectedSchoolId = selectEl.value || DEFAULT_EBSU_SCHOOL_ID;
      const found = _state.schools.find(s => s.id === _state.selectedSchoolId);
      if (found) _state.selectedSchoolName = found.name;
    });
  }

  // ── Date of birth dropdowns (Step 4) ───────────────────────────
  function initDobSelectors() {
    const yearEl = $('onb-dob-year');
    const monthEl = $('onb-dob-month');
    const dayEl = $('onb-dob-day');
    if (!yearEl || !monthEl || !dayEl) return;

    const currentYear = new Date().getFullYear();
    let yearHtml = '<option value="">Year</option>';
    for (let y = currentYear - 14; y >= currentYear - 65; y--) yearHtml += `<option value="${y}">${y}</option>`;
    yearEl.innerHTML = yearHtml;

    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    monthEl.innerHTML = '<option value="">Month</option>' +
      months.map((m, i) => `<option value="${String(i + 1).padStart(2, '0')}">${m}</option>`).join('');

    function updateDays() {
      const y = parseInt(yearEl.value, 10) || 2004;
      const m = parseInt(monthEl.value, 10) || 1;
      const maxDays = new Date(y, m, 0).getDate();
      const prev = dayEl.value;
      let html = '<option value="">Day</option>';
      for (let d = 1; d <= maxDays; d++) {
        const s = String(d).padStart(2, '0');
        html += `<option value="${s}">${s}</option>`;
      }
      dayEl.innerHTML = html;
      if (prev && parseInt(prev, 10) <= maxDays) dayEl.value = prev;
    }
    yearEl.addEventListener('change', updateDays);
    monthEl.addEventListener('change', updateDays);
    updateDays();
  }

  // ── Cloudflare Turnstile ───────────────────────────────────────
  // A token can be used once, so each server call that needs one takes it
  // and the widget is reset for the next attempt.
  const TS_BOX = { step2: 'onb-turnstile-step2', step4: 'onb-turnstile-step4', restore: 'onb-turnstile-restore' };
  const _widgetIds = { step2: null, step4: null, restore: null };

  function renderTurnstile(which, attempt = 0) {
    if (DEMO) return;
    const box = $(TS_BOX[which]);
    if (!box) return;
    if (typeof window.turnstile === 'undefined') {
      // api.js is loaded async; wait for it (up to ~15s).
      if (attempt < 30) setTimeout(() => renderTurnstile(which, attempt + 1), 500);
      return;
    }
    const c = cfg();
    const siteKey = c && c.TURNSTILE_SITE_KEY;
    if (!siteKey) return;
    const theme = (window.ThemeManager && window.ThemeManager.getResolvedTheme && window.ThemeManager.getResolvedTheme()) || 'auto';
    try {
      if (_widgetIds[which] !== null) {
        window.turnstile.remove(_widgetIds[which]);
        _widgetIds[which] = null;
      }
      _state.tokens[which] = null;
      box.innerHTML = '';
      _widgetIds[which] = window.turnstile.render(box, {
        sitekey: siteKey,
        theme,
        callback: token => { _state.tokens[which] = token; },
        'expired-callback': () => { _state.tokens[which] = null; },
        'error-callback': () => { _state.tokens[which] = null; },
      });
    } catch (e) {
      console.warn(`Turnstile (${which}) render error:`, e);
    }
  }

  function takeToken(which) {
    if (DEMO) return 'DEMO_MODE_NO_CAPTCHA';
    const token = _state.tokens[which];
    if (!token) {
      if (typeof window.turnstile === 'undefined') {
        throw new Error('The security check could not load. Please refresh the page and try again.');
      }
      throw new Error('Please complete the security check, then try again.');
    }
    _state.tokens[which] = null; // single use
    return token;
  }

  // ── Step navigation ────────────────────────────────────────────
  function goToStep(stepNum) {
    _state.step = stepNum;
    setBanner('');

    const pillStep = stepNum === 30 ? 3 : stepNum;
    for (let i = 1; i <= 6; i++) {
      const pill = $(`onb-step-pill-${i}`);
      if (!pill) continue;
      pill.classList.remove('active', 'completed');
      if (i < pillStep) pill.classList.add('completed');
      else if (i === pillStep) pill.classList.add('active');
    }

    const panels = {
      'onb-panel-1-2': stepNum === 1 || stepNum === 2,
      'onb-panel-3': stepNum === 3,
      'onb-panel-not-me': stepNum === 30,
      'onb-panel-4': stepNum === 4,
      'onb-panel-5': stepNum === 5,
      'onb-panel-6': stepNum === 6,
    };
    Object.entries(panels).forEach(([id, visible]) => {
      const el = $(id);
      if (el) el.style.display = visible ? 'block' : 'none';
    });

    if (stepNum === 1 || stepNum === 2) renderTurnstile('step2');
    if (stepNum === 4) renderTurnstile('step4');
    if (stepNum !== 6) stopLivePass();
  }

  function sessionGone(status) {
    return status === 404 || status === 410;
  }

  // ── Progress (so a reload or payment redirect does not lose Step 5) ──
  function saveProgress() {
    try {
      sessionStorage.setItem(PROGRESS_KEY, JSON.stringify({
        sessionId: _state.sessionId,
        jambNo: _state.jambNo,
        expiresAt: _state.expiresAt,
        redactedSvg: _state.redactedSvg,
        demo: DEMO,
      }));
    } catch (e) {}
  }

  function clearProgress() {
    try { sessionStorage.removeItem(PROGRESS_KEY); } catch (e) {}
  }

  async function restoreProgress() {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(PROGRESS_KEY) || 'null'); } catch (e) {}
    if (!saved || !saved.sessionId || saved.demo !== DEMO) return false;
    if (!saved.expiresAt || new Date(saved.expiresAt).getTime() <= Date.now()) {
      clearProgress();
      return false;
    }
    _state.sessionId = saved.sessionId;
    _state.jambNo = saved.jambNo || '';
    _state.expiresAt = saved.expiresAt;
    _state.redactedSvg = saved.redactedSvg || '';
    showPaymentPanel();
    goToStep(5);
    try {
      await initializeCardPayment();
      if (_state.alreadyPaid) await unlockAndIssueCard();
    } catch (err) {
      setBanner(err.message, 'error');
    }
    return true;
  }

  // ── STEP 1-2: start verification ───────────────────────────────
  async function handleLookupSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    setBanner('');

    const jambInput = $('onb-jamb-input');
    const rawJamb = (jambInput?.value || '').trim().toUpperCase();
    if (rawJamb.length < 6 || rawJamb.length > 32) {
      setBanner('Please enter your JAMB Registration Number or Matric Number.', 'error', 1);
      jambInput?.focus();
      return;
    }

    let token;
    try { token = takeToken('step2'); } catch (err) { setBanner(err.message, 'warn', 1); return; }

    setBusy('onb-btn-lookup', true, 'Checking the registry…');
    try {
      const { ok, data } = await api('START_VERIFICATION_URL', 'start-verification', {
        action: 'start',
        school_id: _state.selectedSchoolId,
        jamb_no: rawJamb,
        turnstile_token: token,
      });
      if (!ok || !data.session_id) {
        throw new Error(data.error || 'Could not start verification. Please try again.');
      }

      _state.jambNo = rawJamb;
      _state.sessionId = data.session_id;
      _state.expiresAt = data.expires_at;
      _state.maskedName = data.masked_name || '';
      _state.department = data.department || '';

      const nameEl = $('onb-masked-name');
      const deptEl = $('onb-masked-dept');
      const jambEl = $('onb-masked-jamb');
      if (nameEl) nameEl.textContent = _state.maskedName || '—';
      if (deptEl) deptEl.textContent = _state.department || '—';
      if (jambEl) jambEl.textContent = _state.jambNo;

      goToStep(3);
    } catch (err) {
      setBanner(err.message || 'Could not start verification.', 'error', 1);
      renderTurnstile('step2');
    } finally {
      setBusy('onb-btn-lookup', false);
    }
  }

  // ── STEP 3: "Yes, this is me" / "No, this is not me" ───────────
  async function handleConfirmIdentity(isYes) {
    setBanner('');
    if (!_state.sessionId) { resetFlow(); return; }

    if (!isYes) {
      // Best effort: tell the Registry, then stop. Never continue on someone else's record.
      try {
        await api('START_VERIFICATION_URL', 'start-verification', {
          action: 'not_me',
          session_id: _state.sessionId,
        });
      } catch (e) {}
      _state.sessionId = null;
      clearProgress();
      goToStep(30);
      return;
    }

    setBusy('onb-btn-confirm-yes', true, 'Confirming…');
    try {
      const { ok, status, data } = await api('START_VERIFICATION_URL', 'start-verification', {
        action: 'confirm_yes',
        session_id: _state.sessionId,
      });
      if (!ok) {
        if (sessionGone(status)) { resetFlow(); setBanner(data.error || 'Your session expired. Please start again.', 'warn', 1); return; }
        throw new Error(data.error || 'Could not confirm. Please try again.');
      }
      _state.expiresAt = data.expires_at || _state.expiresAt;
      goToStep(4);
    } catch (err) {
      setBanner(err.message, 'error', 3);
    } finally {
      setBusy('onb-btn-confirm-yes', false);
    }
  }

  // ── STEP 4: date of birth (compared on the server) ─────────────
  async function submitVerifyDob(e) {
    if (e && e.preventDefault) e.preventDefault();
    setBanner('');

    const year = $('onb-dob-year')?.value || '';
    const month = $('onb-dob-month')?.value || '';
    const day = $('onb-dob-day')?.value || '';
    if (!year || !month || !day) {
      setBanner('Please select your birth year, month and day.', 'error', 4);
      return;
    }

    let token;
    try { token = takeToken('step4'); } catch (err) { setBanner(err.message, 'warn', 4); return; }

    setBusy('onb-btn-step4', true, 'Verifying date of birth…');
    try {
      const { ok, status, data } = await api('CONFIRM_IDENTITY_URL', 'confirm-identity', {
        action: 'verify_dob',
        session_id: _state.sessionId,
        dob: `${year}-${month}-${day}`,
        turnstile_token: token,
      });
      if (!ok) {
        if (sessionGone(status)) { resetFlow(); setBanner(data.error || 'Your session expired. Please start again.', 'warn', 1); return; }
        throw new Error(data.error || 'Date of birth verification failed.');
      }

      _state.redactedSvg = data.redacted_svg || '';
      _state.feeAmount = data.fee_amount ?? null;
      _state.currency = data.currency || 'NGN';
      _state.alreadyPaid = Boolean(data.already_paid);
      _state.paymentReference = data.payment_reference || '';
      _state.expiresAt = data.expires_at || _state.expiresAt;

      saveProgress();
      showPaymentPanel();

      if (_state.alreadyPaid) {
        // Fee already settled earlier: go straight to the signed card.
        await unlockAndIssueCard();
        return;
      }
      goToStep(5);
      await initializeCardPayment();
    } catch (err) {
      // _state.step tells us which panel is showing when the error happened.
      setBanner(err.message || 'Verification failed.', 'error');
      if (_state.step === 4) renderTurnstile('step4');
    } finally {
      setBusy('onb-btn-step4', false);
    }
  }

  // ── STEP 5: card fee ───────────────────────────────────────────
  function showPaymentPanel() {
    const svgImg = $('onb-redacted-svg-img');
    if (svgImg) {
      if (_state.redactedSvg) { svgImg.src = _state.redactedSvg; svgImg.style.display = 'block'; }
      else svgImg.style.display = 'none';
    }
    const refEl = $('onb-pay-ref-display');
    const amtEl = $('onb-pay-amount-display');
    if (refEl) refEl.textContent = _state.paymentReference || '—';
    if (amtEl) amtEl.textContent = formatNaira(_state.feeAmount);

    const payBtn = $('onb-btn-pay-now');
    const note = $('onb-pay-unavailable-note');
    const canPay = DEMO || Boolean(_state.authUrl);
    if (payBtn) {
      payBtn.disabled = !canPay;
      payBtn.textContent = DEMO
        ? `Simulate ${formatNaira(_state.feeAmount)} payment (demo only)`
        : `Pay the ${formatNaira(_state.feeAmount)} ID card fee online`;
    }
    if (note) note.style.display = (!canPay && _state.paymentReference) ? 'block' : 'none';
  }

  async function initializeCardPayment() {
    const { ok, status, data } = await api('CARD_PAYMENT_URL', 'card-payment', {
      action: 'init',
      session_id: _state.sessionId,
    });
    if (!ok || !data.reference) {
      if (sessionGone(status)) { resetFlow(); throw new Error(data.error || 'Your session expired. Please start again.'); }
      throw new Error(data.error || 'Could not set up the card fee payment. Please try again.');
    }
    _state.paymentReference = data.reference;
    _state.feeAmount = data.amount ?? _state.feeAmount;
    _state.alreadyPaid = Boolean(data.already_paid);
    _state.authUrl = data.authorization_url || null;
    showPaymentPanel();
  }

  function handlePayNow() {
    setBanner('');
    if (DEMO) {
      _state.demoPaid = true;
      setBanner('Demo payment recorded. Now click “I have paid” to unlock the card.', 'success', 5);
      return;
    }
    if (!_state.authUrl) {
      setBanner('Online payment is not available right now. Please try again later.', 'warn', 5);
      return;
    }
    saveProgress();
    const win = window.open(_state.authUrl, '_blank', 'noopener');
    if (!win) {
      // Pop-up blocked: pay in this tab. Progress is saved, so coming back resumes here.
      window.location.href = _state.authUrl;
      return;
    }
    setBanner('The secure payment page opened in a new tab. When you finish paying, come back here and click “I have paid”.', 'info', 5);
  }

  async function handleConfirmPaymentClick() {
    setBanner('');
    setBusy('onb-btn-pay-confirm', true, 'Checking your payment…');
    try {
      if (!_state.paymentReference) await initializeCardPayment();

      const { ok, status, data } = await api('CARD_PAYMENT_URL', 'card-payment', {
        action: 'confirm',
        session_id: _state.sessionId,
        reference: _state.paymentReference,
      });
      if (!ok) {
        const refNotFound = status === 404 && String(data.error || '').toLowerCase().includes('reference');
        if (sessionGone(status) && !refNotFound) {
          resetFlow();
          setBanner(data.error || 'Your session expired. Please start again.', 'warn', 1);
          return;
        }
        if (status === 402) {
          throw new Error('We could not find a successful payment for this reference yet. If you have just paid, wait a minute and try again.');
        }
        throw new Error(data.error || 'Payment confirmation failed. Please try again.');
      }

      _state.paymentReference = data.reference || _state.paymentReference;
      _state.alreadyPaid = true;
      _state.expiresAt = data.expires_at || _state.expiresAt;
      await unlockAndIssueCard();
    } catch (err) {
      setBanner(err.message || 'Could not confirm payment.', 'error');
    } finally {
      setBusy('onb-btn-pay-confirm', false);
    }
  }

  // ── STEP 6: signed card ────────────────────────────────────────
  function buildStaticQrLink(card) {
    const qr = card.qr_string || '';
    if (/^https?:\/\//.test(qr)) return qr;
    let cardId = card.card_id;
    let sig = card.signature;
    if (qr.startsWith('EBSU1:')) {
      const parts = qr.split(':');
      if (parts.length === 3) { cardId = parts[1]; sig = parts[2]; }
    }
    if (!cardId || !sig) return '';
    const idPart = uuidToB64Url(cardId) || String(cardId).replace(/[^A-Za-z0-9_-]/g, '');
    return `${publicBaseUrl()}/c/${idPart}.${sig}`;
  }

  function drawQr(container, text, size, dark) {
    if (!container) return;
    container.innerHTML = '';
    if (!text || typeof QRCode === 'undefined') return;
    new QRCode(container, { text, width: size, height: size, colorDark: dark, colorLight: '#ffffff', correctLevel: 2 });
  }

  async function unlockAndIssueCard() {
    const { ok, status, data } = await api('ISSUE_CARD_URL', 'issue-card', {
      onboarding_session_id: _state.sessionId,
    });
    if (!ok || !data.student || !data.signature) {
      if (sessionGone(status) || status === 401) {
        resetFlow();
        throw new Error(data.error || 'Your session expired. Please start again.');
      }
      throw new Error(data.error || 'Could not issue your signed ID card.');
    }

    _state.issuedCard = data;
    _state.paymentReference = data.payment_reference || _state.paymentReference;
    _state.expiresAt = data.expires_at || _state.expiresAt;

    const st = data.student;
    const qrLink = buildStaticQrLink(data);

    // Short-lived student session (sessionStorage only) for student-portal.html.
    const sess = {
      onboarding_session_id: _state.sessionId,
      student_id: data.card_id,
      school_id: st.school_id || _state.selectedSchoolId,
      jamb_no: st.jamb_no || _state.jambNo,
      matric: st.matric || _state.jambNo,
      name: st.name || '',
      dept: st.dept || 'N/A',
      faculty: st.faculty || 'N/A',
      level: st.level || 'N/A',
      session: st.session || 'N/A',
      blood: st.blood || 'N/A',
      genotype: st.genotype || 'N/A',
      expiry: st.expiry,
      photo_url: st.photo_url || null,
      sig_url: st.sig_url || null,
      card_signature: data.signature,
      qr_string: data.qr_string || qrLink,
      payment_reference: _state.paymentReference,
      expires_at: _state.expiresAt,
    };
    if (typeof AuthManager !== 'undefined' && AuthManager.setStudentSession) {
      AuthManager.setStudentSession(sess);
    } else {
      try { sessionStorage.setItem('ebsu_student_session', JSON.stringify(sess)); } catch (e) {}
    }
    if (DEMO) demoSaveToLocalRegistry(st, data.signature, qrLink);

    clearProgress();
    renderIssuedCard(data, qrLink);
    goToStep(6);
    setTimeout(mintLivePass, 150);
  }

  function renderIssuedCard(data, qrLink) {
    const st = data.student;
    const set = (id, val) => { const el = $(id); if (el) el.textContent = (val === null || val === undefined || val === '') ? '—' : String(val); };
    set('onb-card-name', st.name);
    set('onb-card-matric', st.matric);
    set('onb-card-dept', st.dept);
    set('onb-card-faculty', st.faculty);
    set('onb-card-level', st.level);
    set('onb-card-expiry', st.expiry);
    set('onb-final-payment-ref', _state.paymentReference);

    const photo = $('onb-card-photo');
    const photoNote = $('onb-photo-missing-note');
    if (photo && st.photo_url) photo.src = st.photo_url;
    if (photoNote) photoNote.style.display = st.photo_url ? 'none' : 'block';

    const badge = $('onb-card-badge');
    if (badge && DEMO) badge.textContent = 'DEMO SAMPLE — NOT SIGNED';

    drawQr($('onb-static-qr-box'), qrLink, 140, '#0F172A');
  }

  function copyPaymentReference(btn) {
    if (!_state.paymentReference) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(_state.paymentReference).catch(() => {});
    }
    if (btn && btn.textContent !== undefined) {
      const orig = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    }
  }

  // ── 60-second live pass (signed by mint-pass) ──────────────────
  let _livePassTimer = null;

  function stopLivePass() {
    if (_livePassTimer) { clearInterval(_livePassTimer); _livePassTimer = null; }
  }

  async function mintLivePass() {
    const box = $('onb-live-pass-box');
    const timerEl = $('onb-live-pass-timer');
    const qrEl = $('onb-live-qr-canvas');
    if (!box || !qrEl || !_state.sessionId) return;
    stopLivePass();

    let result;
    try {
      result = await api('MINT_PASS_URL', 'mint-pass', { onboarding_session_id: _state.sessionId });
    } catch (err) {
      box.style.display = 'none';
      setBanner(err.message, 'warn', 6);
      return;
    }
    if (!result.ok || !result.data.token) {
      box.style.display = 'none';
      setBanner(result.data.error || 'Could not create a live pass right now.', 'warn', 6);
      return;
    }

    box.style.display = 'flex';
    drawQr(qrEl, `${publicBaseUrl()}/p/${encodeURIComponent(result.data.token)}`, 130, '#047857');

    let left = Number(result.data.ttl_seconds) || 60;
    if (timerEl) timerEl.textContent = `Live pass valid: ${left}s`;
    _livePassTimer = setInterval(() => {
      left--;
      if (left <= 0) {
        stopLivePass();
        if (_state.step === 6) mintLivePass();
      } else if (timerEl) {
        timerEl.textContent = `Live pass valid: ${left}s`;
      }
    }, 1000);
  }

  // ── "Find my payment" (restore_by_reference) ───────────────────
  function findPaymentError(msg) {
    const el = $('onb-alert-find-payment');
    if (!el) return;
    if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
    el.className = 'onb-alert onb-alert-error';
    el.textContent = msg;
    el.style.display = 'block';
  }

  function openFindPaymentModal() {
    const modal = $('onb-find-payment-modal');
    if (modal) modal.style.display = 'flex';
    findPaymentError('');
    renderTurnstile('restore');
  }

  function closeFindPaymentModal() {
    const modal = $('onb-find-payment-modal');
    if (modal) modal.style.display = 'none';
  }

  async function handleFindPaymentSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    findPaymentError('');

    const jamb = ($('onb-find-payment-jamb')?.value || '').trim().toUpperCase();
    const dob = ($('onb-find-payment-dob')?.value || '').trim();
    const ref = ($('onb-find-payment-ref')?.value || '').trim().toUpperCase();
    if (!jamb || !dob || !ref) {
      findPaymentError('Please enter your JAMB/Matric Number, Date of Birth and Payment Reference.');
      return;
    }

    let token;
    try { token = takeToken('restore'); } catch (err) { findPaymentError(err.message); return; }

    setBusy('onb-btn-find-payment', true, 'Checking your payment…');
    try {
      const { ok, data } = await api('CONFIRM_IDENTITY_URL', 'confirm-identity', {
        action: 'restore_by_reference',
        school_id: _state.selectedSchoolId,
        jamb_no: jamb,
        dob,
        reference: ref,
        turnstile_token: token,
      });
      if (!ok || !data.session_id) {
        throw new Error(data.error || 'Could not verify payment with those details.');
      }

      _state.sessionId = data.session_id;
      _state.jambNo = jamb;
      _state.paymentReference = data.payment_reference || ref;
      _state.alreadyPaid = true;
      _state.expiresAt = data.expires_at;

      await unlockAndIssueCard();
      closeFindPaymentModal();
      try { $('student-onboarding-portal')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e2) {}
    } catch (err) {
      findPaymentError(err.message || 'Verification failed.');
      renderTurnstile('restore');
    } finally {
      setBusy('onb-btn-find-payment', false);
    }
  }

  function resetFlow() {
    stopLivePass();
    clearProgress();
    _state.sessionId = null;
    _state.issuedCard = null;
    _state.paymentReference = '';
    _state.authUrl = null;
    _state.alreadyPaid = false;
    _state.demoPaid = false;
    _state.redactedSvg = '';
    goToStep(1);
  }

  // ══════════════════════════════════════════════════════════════
  // DEMO MODE ONLY (private host + DEMO_MODE: true). Canned answers
  // shaped like the real server responses. Nothing here is reachable
  // on a public hostname because api() only calls demoApi when DEMO.
  // ══════════════════════════════════════════════════════════════
  function demoRedactedSvg() {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="265" viewBox="0 0 420 265">' +
      '<rect width="420" height="265" rx="14" fill="#1558c0"/>' +
      '<text x="210" y="46" fill="#fff" font-family="Arial" font-size="15" font-weight="700" text-anchor="middle">EBONYI STATE UNIVERSITY</text>' +
      '<text x="210" y="120" fill="#fff" font-family="Arial" font-size="20" font-weight="700" text-anchor="middle">DEMO STUDENT ONE</text>' +
      '<text x="210" y="150" fill="#dbeafe" font-family="Arial" font-size="14" text-anchor="middle">Computer Science</text>' +
      '<text x="210" y="215" fill="#fde68a" font-family="Arial" font-size="13" text-anchor="middle">LOCKED - DEMO PREVIEW</text></svg>';
    return 'data:image/svg+xml;base64,' + btoa(svg);
  }

  async function demoApi(path, body) {
    await sleep(350);
    const okRes = data => ({ ok: true, status: 200, data });
    const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const action = body && body.action;

    if (path === 'start-verification') {
      if (action === 'confirm_yes') return okRes({ session_id: DEMO_SESSION_ID, step: 'confirmed_name', expires_at });
      if (action === 'not_me') return okRes({ ok: true });
      return okRes({ session_id: DEMO_SESSION_ID, step: 'started', masked_name: 'DEM* STU**** O**', department: 'Computer Science', expires_at });
    }
    if (path === 'confirm-identity') {
      if (action === 'restore_by_reference') {
        return okRes({ session_id: DEMO_SESSION_ID, step: 'paid', already_paid: true, payment_reference: body.reference, expires_at });
      }
      return okRes({ session_id: DEMO_SESSION_ID, step: 'verified_dob', already_paid: false, fee_amount: 2500, currency: 'NGN', redacted_svg: demoRedactedSvg(), payment_reference: null, expires_at });
    }
    if (path === 'card-payment') {
      if (action === 'confirm') {
        if (!_state.demoPaid) return { ok: false, status: 402, data: { error: 'No payment found.' } };
        return okRes({ ok: true, status: 'paid', reference: 'EBSU-CARD-DEMO-0001', amount: 2500, expires_at });
      }
      return okRes({ already_paid: false, status: 'pending', reference: 'EBSU-CARD-DEMO-0001', amount: 2500, currency: 'NGN', provider: 'demo', authorization_url: null });
    }
    if (path === 'issue-card') {
      return okRes({
        card_id: 'ebsu-student-2021-101397',
        signature: 'ED25519_TEST_SIG_1234567890',
        qr_string: null,
        payment_reference: _state.paymentReference || 'EBSU-CARD-DEMO-0001',
        expires_at,
        student: {
          id: 'ebsu-student-2021-101397',
          name: 'DEMO STUDENT ONE',
          matric: 'EBSU/2021/101397',
          jamb_no: _state.jambNo || '1234567890',
          faculty: 'Faculty of Science',
          dept: 'Computer Science',
          level: '400 Level',
          session: '2024/2025',
          blood: 'N/A',
          genotype: 'N/A',
          expiry: 2029,
          photo_url: 'images/demo_user_photo.jpg',
          sig_url: 'images/demo_user_sig.png',
          status: 'active',
          school_id: DEFAULT_EBSU_SCHOOL_ID,
        },
      });
    }
    if (path === 'mint-pass') {
      const now = Math.floor(Date.now() / 1000);
      return okRes({ token: `EBSU2:00000000-0000-4000-8000-000000000001:${now + 60}:PASSSIG_${now}`, ttl_seconds: 60 });
    }
    return { ok: false, status: 404, data: { error: 'Unknown demo endpoint.' } };
  }

  // Keeps the offline presentation working: the demo console and demo scanner
  // read this local list. Never written outside demo mode.
  function demoSaveToLocalRegistry(st, signature, qrLink) {
    try {
      const existing = JSON.parse(localStorage.getItem('ebsu_local_students') || '[]');
      const rec = {
        id: st.id, name: st.name, matric: st.matric, school_reg_no: st.matric, jamb_no: st.jamb_no,
        phone: '08000000001', phone_number: '08000000001',
        faculty: st.faculty, dept: st.dept, level: st.level, session: st.session,
        blood: st.blood, genotype: st.genotype, expiry: parseInt(st.expiry, 10) || 2029,
        photo_url: st.photo_url, sig_url: st.sig_url, status: 'active',
        card_fee_paid_at: new Date().toISOString(), card_fee_exempt: false,
        card_signature: signature, qr_string: qrLink, created_at: new Date().toISOString(),
      };
      const idx = existing.findIndex(s => s.matric && s.matric.toUpperCase() === String(st.matric).toUpperCase());
      if (idx >= 0) existing[idx] = rec; else existing.unshift(rec);
      localStorage.setItem('ebsu_local_students', JSON.stringify(existing));
    } catch (e) {}
  }

  function initDemoBox() {
    const box = $('onb-demo-box');
    if (!box) return;
    if (!DEMO) { box.remove(); return; }
    box.hidden = false;
    $('btn-quick-fill-onboarding')?.addEventListener('click', () => {
      const inp = $('onb-jamb-input');
      if (inp) inp.value = '1234567890';
      handleLookupSubmit();
    });
  }

  // ── Init ───────────────────────────────────────────────────────
  function init() {
    initDemoBox();
    loadSchools();
    initDobSelectors();

    $('onb-form-lookup')?.addEventListener('submit', handleLookupSubmit);
    $('onb-btn-confirm-yes')?.addEventListener('click', () => handleConfirmIdentity(true));
    $('onb-btn-confirm-no')?.addEventListener('click', () => handleConfirmIdentity(false));
    $('onb-form-dob')?.addEventListener('submit', submitVerifyDob);
    $('onb-btn-pay-now')?.addEventListener('click', handlePayNow);
    $('onb-btn-pay-confirm')?.addEventListener('click', handleConfirmPaymentClick);
    $('onb-btn-copy-ref')?.addEventListener('click', ev => copyPaymentReference(ev.currentTarget));
    $('onb-btn-copy-ref-final')?.addEventListener('click', ev => copyPaymentReference(ev.currentTarget));
    $('onb-btn-mint-pass')?.addEventListener('click', mintLivePass);
    $('onb-form-find-payment')?.addEventListener('submit', handleFindPaymentSubmit);

    if (window.ThemeManager && window.ThemeManager.onThemeChange) {
      window.ThemeManager.onThemeChange(() => {
        if (_state.step === 1 || _state.step === 2) renderTurnstile('step2');
        if (_state.step === 4) renderTurnstile('step4');
      });
    }

    goToStep(1);
    restoreProgress();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

  return {
    isDemoMode: () => DEMO,
    goToStep,
    resetFlow,
    resetToStart: resetFlow,
    handleLookupSubmit,
    handleConfirmIdentity,
    openFindPaymentModal,
    closeFindPaymentModal,
    handleFindPaymentSubmit,
    mintLivePass,
  };
})();

window.StudentOnboarding = StudentOnboarding;
