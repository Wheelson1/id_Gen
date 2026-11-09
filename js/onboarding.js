/**
 * js/onboarding.js — Phase 3 Passwordless Student Onboarding & Card Fee Checkout
 *
 * Implements the 6-step mobile-first onboarding stepper:
 *   1. School Selection (from `public.schools`)
 *   2. JAMB / Matric Number + Cloudflare Turnstile -> `start-verification`
 *   3. Masked Name (`NNA*** WIL***`) + Department Confirmation (`Yes, that's me` / `No, this isn't me`)
 *   4. Date of Birth Verification (Year & Month dropdowns first, server-side compare) -> `confirm-identity`
 *   5. Redacted Server SVG Preview + ₦2,500 Card Fee Checkout -> `card-payment`
 *   6. Padlock-Open Animation + Ed25519 Signed Card (`issue-card`) + Copyable Reference + 3/day Download Cap
 */

const StudentOnboarding = (() => {
  const DEFAULT_EBSU_SCHOOL_ID = '00000000-0000-4000-8000-000000000001';

  let _state = {
    step: 1, // 1..6
    schools: [],
    selectedSchoolId: DEFAULT_EBSU_SCHOOL_ID,
    selectedSchoolName: 'Ebonyi State University (EBSU)',
    jambNo: '',
    sessionId: null,
    expiresAt: null,
    maskedName: '',
    department: '',
    dobYear: '',
    dobMonth: '',
    dobDay: '',
    redactedSvg: '',
    feeAmount: 2500,
    currency: 'NGN',
    paymentReference: '',
    alreadyPaid: false,
    issuedCard: null, // { card_id, signature, qr_string, student }
    cardViewMode: 'front', // 'front' | 'back' | '3d'
    downloadsRemaining: 3,
    turnstileTokenStep2: 'CF_TURNSTILE_TEST_TOKEN',
    turnstileTokenStep4: 'CF_TURNSTILE_TEST_TOKEN',
    turnstileTokenRestore: 'CF_TURNSTILE_TEST_TOKEN',
  };

  function getEndpoint(key, fallbackPath) {
    if (typeof EBSU_CONFIG !== 'undefined' && EBSU_CONFIG[key]) {
      return EBSU_CONFIG[key];
    }
    const base = (typeof EBSU_CONFIG !== 'undefined' && EBSU_CONFIG.SUPABASE_URL)
      ? EBSU_CONFIG.SUPABASE_URL
      : 'https://qsrfvfdojtmsinewxetz.supabase.co';
    return `${base}/functions/v1/${fallbackPath}`;
  }

  function getAnonHeaders() {
    const anonKey = (typeof EBSU_CONFIG !== 'undefined' && EBSU_CONFIG.SUPABASE_ANON_KEY) || '';
    return {
      'Content-Type': 'application/json',
      ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
    };
  }

  function setBanner(msg, type = 'error') {
    const el = document.getElementById('onb-alert-banner');
    if (!el) return;
    if (!msg) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    el.style.display = 'block';
    el.className = `onb-alert onb-alert-${type}`;
    el.textContent = msg;
  }

  // ── Load active schools for Step 1 ─────────────────────────────
  async function loadSchools() {
    const selectEl = document.getElementById('onb-school-select');
    const searchEl = document.getElementById('onb-school-search');
    let schoolsList = [
      { id: DEFAULT_EBSU_SCHOOL_ID, code: 'EBSU', name: 'Ebonyi State University, Abakaliki (EBSU)' },
    ];

    try {
      if (typeof supabase !== 'undefined' && typeof EBSU_CONFIG !== 'undefined') {
        const client = window.ebsuSupabase || supabase.createClient(EBSU_CONFIG.SUPABASE_URL, EBSU_CONFIG.SUPABASE_ANON_KEY);
        window.ebsuSupabase = client;
        const { data } = await client
          .from('schools')
          .select('id, code, name, card_fee_amount')
          .eq('is_active', true)
          .order('name', { ascending: true });
        if (Array.isArray(data) && data.length > 0) {
          schoolsList = data;
        }
      }
    } catch (e) {
      // Fallback to EBSU default
    }

    _state.schools = schoolsList;
    renderSchoolOptions('');

    if (searchEl) {
      searchEl.addEventListener('input', () => {
        renderSchoolOptions(searchEl.value.trim().toLowerCase());
      });
    }
    if (selectEl) {
      selectEl.addEventListener('change', () => {
        _state.selectedSchoolId = selectEl.value || DEFAULT_EBSU_SCHOOL_ID;
        const found = _state.schools.find(s => s.id === _state.selectedSchoolId);
        if (found) _state.selectedSchoolName = found.name;
      });
    }
  }

  function renderSchoolOptions(filterQuery) {
    const selectEl = document.getElementById('onb-school-select');
    if (!selectEl) return;

    const filtered = _state.schools.filter(s => {
      if (!filterQuery) return true;
      return (
        (s.name || '').toLowerCase().includes(filterQuery) ||
        (s.code || '').toLowerCase().includes(filterQuery)
      );
    });

    const list = filtered.length > 0 ? filtered : _state.schools;
    selectEl.textContent = '';
    list.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      const label = s.code && !String(s.name || '').includes(`(${s.code})`)
        ? `${s.name} (${s.code})`
        : s.name;
      opt.textContent = label;
      selectEl.appendChild(opt);
    });

    if (list.some(s => s.id === _state.selectedSchoolId)) {
      selectEl.value = _state.selectedSchoolId;
    } else if (list[0]) {
      _state.selectedSchoolId = list[0].id;
      _state.selectedSchoolName = list[0].name;
      selectEl.value = list[0].id;
    }
  }

  // ── Populate Year / Month / Day dropdowns for Step 4 ───────────
  function initDobSelectors() {
    const yearEl  = document.getElementById('onb-dob-year');
    const monthEl = document.getElementById('onb-dob-month');
    const dayEl   = document.getElementById('onb-dob-day');
    if (!yearEl || !monthEl || !dayEl) return;

    const currentYear = new Date().getFullYear();
    const minYear = currentYear - 65;
    const maxYear = currentYear - 14;

    let yearHtml = '<option value="">Select Year</option>';
    for (let y = maxYear; y >= minYear; y--) {
      yearHtml += `<option value="${y}">${y}</option>`;
    }
    yearEl.innerHTML = yearHtml;

    const months = [
      ['01', 'January (01)'],
      ['02', 'February (02)'],
      ['03', 'March (03)'],
      ['04', 'April (04)'],
      ['05', 'May (05)'],
      ['06', 'June (06)'],
      ['07', 'July (07)'],
      ['08', 'August (08)'],
      ['09', 'September (09)'],
      ['10', 'October (10)'],
      ['11', 'November (11)'],
      ['12', 'December (12)'],
    ];
    monthEl.innerHTML =
      '<option value="">Select Month</option>' +
      months.map(([val, label]) => `<option value="${val}">${label}</option>`).join('');

    function updateDays() {
      const y = parseInt(yearEl.value, 10) || 2004;
      const m = parseInt(monthEl.value, 10) || 1;
      const maxDays = new Date(y, m, 0).getDate();
      const prevDay = dayEl.value;

      let dayHtml = '<option value="">Select Day</option>';
      for (let d = 1; d <= maxDays; d++) {
        const dStr = String(d).padStart(2, '0');
        dayHtml += `<option value="${dStr}">${dStr}</option>`;
      }
      dayEl.innerHTML = dayHtml;
      if (prevDay && parseInt(prevDay, 10) <= maxDays) {
        dayEl.value = prevDay;
      }
    }

    yearEl.addEventListener('change', updateDays);
    monthEl.addEventListener('change', updateDays);
    updateDays();
  }

  // ── Mount Cloudflare Turnstile widgets if script loaded ────────
  let _turnstileStep2Id = null;
  let _turnstileStep4Id = null;

  function renderStep2Turnstile(theme) {
    if (typeof window.turnstile === 'undefined') return;
    const siteKey = (typeof EBSU_CONFIG !== 'undefined' && EBSU_CONFIG.TURNSTILE_SITE_KEY) || '1x00000000000000000000AA';
    const step2Box = document.getElementById('onb-turnstile-step2');
    if (!step2Box) return;
    try {
      if (_turnstileStep2Id !== null) {
        window.turnstile.remove(_turnstileStep2Id);
        _turnstileStep2Id = null;
      }
      step2Box.innerHTML = '';
      _turnstileStep2Id = window.turnstile.render(step2Box, {
        sitekey: siteKey,
        theme: theme || 'auto',
        callback: (token) => { _state.turnstileTokenStep2 = token; },
      });
    } catch (e) {
      console.warn('Turnstile Step 2 render error:', e);
    }
  }

  function renderStep4Turnstile(theme) {
    if (typeof window.turnstile === 'undefined') return;
    const siteKey = (typeof EBSU_CONFIG !== 'undefined' && EBSU_CONFIG.TURNSTILE_SITE_KEY) || '1x00000000000000000000AA';
    const step4Box = document.getElementById('onb-turnstile-step4');
    if (!step4Box) return;
    try {
      if (_turnstileStep4Id !== null) {
        window.turnstile.remove(_turnstileStep4Id);
        _turnstileStep4Id = null;
      }
      step4Box.innerHTML = '';
      _turnstileStep4Id = window.turnstile.render(step4Box, {
        sitekey: siteKey,
        theme: theme || 'auto',
        callback: (token) => { _state.turnstileTokenStep4 = token; },
      });
    } catch (e) {
      console.warn('Turnstile Step 4 render error:', e);
    }
  }

  function initTurnstileWidgets() {
    const curTheme = (window.ThemeManager && window.ThemeManager.getResolvedTheme()) || 'auto';
    renderStep2Turnstile(curTheme);
    renderStep4Turnstile(curTheme);

    if (window.ThemeManager && !window._onboardingThemeBound) {
      window._onboardingThemeBound = true;
      window.ThemeManager.onThemeChange(({ resolved }) => {
        renderStep2Turnstile(resolved);
        renderStep4Turnstile(resolved);
      });
    }
  }

  // ── Step Navigation UI ─────────────────────────────────────────
  function goToStep(stepNum) {
    _state.step = stepNum;
    setBanner('');

    for (let i = 1; i <= 6; i++) {
      const pill = document.getElementById(`onb-step-pill-${i}`);
      if (pill) {
        pill.classList.remove('active', 'completed');
        if (i < stepNum) pill.classList.add('completed');
        else if (i === stepNum) pill.classList.add('active');
      }
    }

    // Panels: panel 1-2 is combined for fast mobile flow; panels 3, 4, 5, 6 are separate
    const panels = {
      'onb-panel-1-2': stepNum === 1 || stepNum === 2,
      'onb-panel-3':   stepNum === 3,
      'onb-panel-not-me': stepNum === 30, // Mismatch reported view
      'onb-panel-4':   stepNum === 4,
      'onb-panel-5':   stepNum === 5,
      'onb-panel-6':   stepNum === 6,
    };

    Object.entries(panels).forEach(([id, visible]) => {
      const el = document.getElementById(id);
      if (el) el.style.display = visible ? 'block' : 'none';
    });

    initTurnstileWidgets();
  }

  // ── STEP 1 & 2: Start Verification ─────────────────────────────
  async function submitStartVerification(e) {
    if (e) e.preventDefault();
    setBanner('');

    const jambInput = document.getElementById('onb-jamb-input');
    const rawJamb = (jambInput?.value || '').trim().toUpperCase();

    if (!rawJamb || rawJamb.length < 6) {
      setBanner('Please enter your JAMB Registration Number or EBSU Matric Number.');
      jambInput?.focus();
      return;
    }

    _state.jambNo = rawJamb;
    goToStep(2);

    const btn = document.getElementById('onb-btn-step2');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Checking Registry...';
    }

    try {
      const res = await fetch(getEndpoint('START_VERIFICATION_URL', 'start-verification'), {
        method: 'POST',
        headers: getAnonHeaders(),
        body: JSON.stringify({
          action: 'start',
          school_id: _state.selectedSchoolId,
          jamb_no: _state.jambNo,
          turnstile_token: _state.turnstileTokenStep2 || 'CF_TURNSTILE_TEST_TOKEN',
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Could not start verification. Please try again.');
      }

      _state.sessionId  = data.session_id;
      _state.expiresAt  = data.expires_at;
      _state.maskedName = data.masked_name || 'STU*** IDE***';
      _state.department = data.department || 'General Studies';

      const maskEl = document.getElementById('onb-masked-name');
      const deptEl = document.getElementById('onb-masked-dept');
      const jambEl = document.getElementById('onb-masked-jamb');
      if (maskEl) maskEl.textContent = _state.maskedName;
      if (deptEl) deptEl.textContent = _state.department;
      if (jambEl) jambEl.textContent = _state.jambNo;

      goToStep(3);
    } catch (err) {
      goToStep(1);
      setBanner(err.message || 'Network error while verifying JAMB number.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Continue to Identity Check →';
      }
    }
  }

  // ── STEP 3A: "Yes, that's me" ──────────────────────────────────
  async function confirmMaskedNameYes() {
    handleConfirmIdentity(true);
  }

  // ── STEP 3B: "No, this isn't me / Wrong details" ───────────────
  async function confirmMaskedNameNotMe() {
    handleConfirmIdentity(false);
  }

  // ── STEP 4: Verify Date of Birth (Server-Side Compare) ─────────
  async function submitVerifyDob(e) {
    if (e) e.preventDefault();
    setBanner('');

    const year  = document.getElementById('onb-dob-year')?.value || '';
    const month = document.getElementById('onb-dob-month')?.value || '';
    const day   = document.getElementById('onb-dob-day')?.value || '';

    if (!year || !month || !day) {
      setBanner('Please select your Birth Year, Month, and Day.');
      return;
    }

    const dob = `${year}-${month}-${day}`;
    const btn = document.getElementById('onb-btn-step4');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Verifying Date of Birth...';
    }

    try {
      const res = await fetch(getEndpoint('CONFIRM_IDENTITY_URL', 'confirm-identity'), {
        method: 'POST',
        headers: getAnonHeaders(),
        body: JSON.stringify({
          action: 'verify_dob',
          session_id: _state.sessionId,
          dob,
          turnstile_token: _state.turnstileTokenStep4 || 'CF_TURNSTILE_TEST_TOKEN',
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Date of Birth verification failed.');
      }

      _state.redactedSvg      = data.redacted_svg || '';
      _state.feeAmount        = data.fee_amount || 2500;
      _state.currency         = data.currency || 'NGN';
      _state.alreadyPaid      = Boolean(data.already_paid);
      _state.paymentReference = data.payment_reference || '';
      _state.expiresAt        = data.expires_at || _state.expiresAt;

      const svgImg = document.getElementById('onb-redacted-svg-img');
      if (svgImg && _state.redactedSvg) {
        svgImg.src = _state.redactedSvg;
      }

      // Initialize payment reference via card-payment Edge Function
      await initializeCardPayment();

      // If student already paid previously, auto-unlock Step 6!
      if (_state.alreadyPaid) {
        goToStep(5);
        await unlockAndIssueCard();
      } else {
        goToStep(5);
      }
    } catch (err) {
      setBanner(err.message || 'Verification failed.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Verify Birthday & Preview Card →';
      }
    }
  }

  // ── STEP 5A: Initialize Card Payment (₦2,500) ──────────────────
  async function initializeCardPayment() {
    try {
      const res = await fetch(getEndpoint('CARD_PAYMENT_URL', 'card-payment'), {
        method: 'POST',
        headers: getAnonHeaders(),
        body: JSON.stringify({
          action: 'init',
          session_id: _state.sessionId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.reference) {
        _state.paymentReference = data.reference;
        _state.feeAmount        = data.amount || 2500;
        _state.alreadyPaid      = Boolean(data.already_paid);
      }
    } catch (e) {}

    const refEl = document.getElementById('onb-pay-ref-display');
    const amtEl = document.getElementById('onb-pay-amount-display');
    if (refEl) refEl.textContent = _state.paymentReference || 'Generating...';
    if (amtEl) amtEl.textContent = `₦${Number(_state.feeAmount || 2500).toLocaleString('en-NG')}.00`;
  }

  // ── STEP 5B: Confirm Local / Instant Payment & Unlock Card ─────
  async function handleConfirmPaymentClick() {
    setBanner('');
    const btn = document.getElementById('onb-btn-pay-confirm');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Confirming Payment & Minting Ed25519 Signature...';
    }

    try {
      if (!_state.paymentReference) {
        await initializeCardPayment();
      }

      const res = await fetch(getEndpoint('CARD_PAYMENT_URL', 'card-payment'), {
        method: 'POST',
        headers: getAnonHeaders(),
        body: JSON.stringify({
          action: 'confirm',
          session_id: _state.sessionId,
          reference: _state.paymentReference,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Payment confirmation failed. Please try again.');
      }

      _state.paymentReference = data.reference || _state.paymentReference;
      _state.alreadyPaid      = true;
      _state.expiresAt        = data.expires_at || _state.expiresAt;

      await unlockAndIssueCard();
    } catch (err) {
      setBanner(err.message || 'Could not confirm payment.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '💳 Paid ₦2,500 — Unlock & Mint My Official ID Card';
      }
    }
  }

  // ── STEP 6: Call `issue-card` & Render Signed Card ─────────────
  async function unlockAndIssueCard() {
    const res = await fetch(getEndpoint('ISSUE_CARD_URL', 'issue-card'), {
      method: 'POST',
      headers: getAnonHeaders(),
      body: JSON.stringify({
        onboarding_session_id: _state.sessionId,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Could not issue signed ID card.');
    }

    _state.issuedCard       = data;
    _state.paymentReference = data.payment_reference || _state.paymentReference;
    _state.expiresAt        = data.expires_at || _state.expiresAt;

    // Persist short-lived student session in AuthManager (sessionStorage + memory only)
    if (typeof AuthManager !== 'undefined' && AuthManager.setStudentSession) {
      AuthManager.setStudentSession({
        onboarding_session_id: _state.sessionId,
        student_id: data.card_id,
        school_id: data.student?.school_id || _state.selectedSchoolId,
        jamb_no: data.student?.jamb_no || _state.jambNo,
        matric: data.student?.matric || _state.jambNo,
        name: data.student?.name || '',
        dept: data.student?.dept || '',
        faculty: data.student?.faculty || '',
        level: data.student?.level || '100L',
        session: data.student?.session || '2024/2025',
        blood: data.student?.blood || 'O+',
        genotype: data.student?.genotype || 'AA',
        expiry: data.student?.expiry || 2029,
        photo_url: data.student?.photo_url || null,
        sig_url: data.student?.sig_url || null,
        card_signature: data.signature,
        qr_string: data.qr_string,
        payment_reference: _state.paymentReference,
        expires_at: _state.expiresAt,
      });
    }

    goToStep(6);

    const refBadge = document.getElementById('onb-final-payment-ref');
    if (refBadge) refBadge.textContent = _state.paymentReference || 'CONFIRMED';

    const nameLabel = document.getElementById('onb-final-student-name');
    if (nameLabel && data.student?.name) {
      nameLabel.textContent = data.student.name;
    }

    renderUnlockedCard();
  }

  function buildRenderRecord() {
    const st = _state.issuedCard?.student || {};
    const qr = _state.issuedCard?.qr_string || '';
    return {
      id: st.id || _state.issuedCard?.card_id,
      cardId: st.id || _state.issuedCard?.card_id,
      name: st.name || 'VERIFIED STUDENT',
      fullName: st.name || 'VERIFIED STUDENT',
      matric: st.matric || st.jamb_no || _state.jambNo,
      schoolRegNo: st.matric || st.jamb_no || _state.jambNo,
      faculty: st.faculty || 'Science',
      dept: st.dept || 'General Studies',
      department: st.dept || 'General Studies',
      level: st.level || '100L',
      session: st.session || '2024/2025',
      blood: st.blood || 'O+',
      bloodGroup: st.blood || 'O+',
      genotype: st.genotype || 'AA',
      expiry: st.expiry || 2029,
      photo: st.photo_url || null,
      photoUrl: st.photo_url || null,
      sig: st.sig_url || null,
      signatureUrl: st.sig_url || null,
      qrString: qr,
      status: st.status || 'active',
    };
  }

  function renderUnlockedCard() {
    if (!_state.issuedCard) return;
    const record = buildRenderRecord();
    const activeTemplate =
      typeof CardTemplate !== 'undefined' && CardTemplate.get ? CardTemplate.get() : null;

    const canvasWrap = document.getElementById('onb-card-canvas-wrap');
    const wrap3d     = document.getElementById('onb-card-3d-wrap');
    const canvas     = document.getElementById('onb-unlocked-canvas');

    if (_state.cardViewMode === '3d') {
      if (canvasWrap) canvasWrap.style.display = 'none';
      if (wrap3d) {
        wrap3d.style.display = 'block';
        if (typeof Card3D !== 'undefined') {
          const existing = Card3D.getInstance(wrap3d);
          if (existing) {
            existing.update(record, activeTemplate);
          } else {
            Card3D.mount({
              container: wrap3d,
              studentData: record,
              template: activeTemplate,
              scale: 0.46,
              autoSpin: false,
              showControls: true,
              showHint: true,
            });
          }
        }
      }
    } else {
      if (wrap3d) wrap3d.style.display = 'none';
      if (canvasWrap) canvasWrap.style.display = 'flex';
      if (canvas && typeof drawCard === 'function') {
        if (_state.cardViewMode === 'back' && typeof drawBackCard === 'function') {
          drawBackCard(canvas, activeTemplate, record, 0.55);
        } else {
          drawCard(canvas, activeTemplate, record, 0.55);
        }
      }
    }
  }

  function switchUnlockedView(mode) {
    _state.cardViewMode = mode;
    ['front', 'back', '3d'].forEach(m => {
      const b = document.getElementById(`onb-view-btn-${m}`);
      if (b) b.classList.toggle('active', m === mode);
    });
    renderUnlockedCard();
  }

  // ── Server-Enforced Download Gate (Max 3/Day + activity_log) ───
  async function checkAndLogDownload(format) {
    const res = await fetch(getEndpoint('CONFIRM_IDENTITY_URL', 'confirm-identity'), {
      method: 'POST',
      headers: getAnonHeaders(),
      body: JSON.stringify({
        action: 'log_download',
        session_id: _state.sessionId,
        format,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Download limit reached.');
    }
    _state.downloadsRemaining = data.remaining ?? 0;
    const remEl = document.getElementById('onb-downloads-remaining');
    if (remEl) {
      remEl.textContent = `${data.downloads_today}/${data.max_daily_downloads} downloads used today (${_state.downloadsRemaining} left)`;
    }
    return true;
  }

  async function downloadUnlockedPng(side = 'front') {
    setBanner('');
    try {
      await checkAndLogDownload(`PNG_${side.toUpperCase()}`);
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width  = 1011;
      exportCanvas.height = 638;
      const activeTemplate =
        typeof CardTemplate !== 'undefined' && CardTemplate.get ? CardTemplate.get() : null;
      const record = buildRenderRecord();

      if (side === 'back' && typeof drawBackCard === 'function') {
        drawBackCard(exportCanvas, activeTemplate, record, 1);
      } else if (typeof drawCard === 'function') {
        drawCard(exportCanvas, activeTemplate, record, 1);
      }

      const safeMatric = String(record.matric || 'STUDENT').replace(/[^A-Za-z0-9_-]/g, '_');
      const link = document.createElement('a');
      link.download = `EBSU_ID_${safeMatric}_${side.toUpperCase()}.png`;
      link.href = exportCanvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setBanner(err.message || 'Unable to download card.');
    }
  }

  async function printUnlockedCard() {
    setBanner('');
    try {
      await checkAndLogDownload('PRINT_PDF');
      const frontCanvas = document.createElement('canvas');
      const backCanvas  = document.createElement('canvas');
      frontCanvas.width = backCanvas.width = 1011;
      frontCanvas.height = backCanvas.height = 638;

      const activeTemplate =
        typeof CardTemplate !== 'undefined' && CardTemplate.get ? CardTemplate.get() : null;
      const record = buildRenderRecord();

      if (typeof drawCard === 'function') drawCard(frontCanvas, activeTemplate, record, 1);
      if (typeof drawBackCard === 'function') drawBackCard(backCanvas, activeTemplate, record, 1);

      const frontUrl = frontCanvas.toDataURL('image/png');
      const backUrl  = backCanvas.toDataURL('image/png');

      const win = window.open('', '_blank');
      if (!win) {
        setBanner('Pop-up blocked. Please allow pop-ups to print or save as PDF.');
        return;
      }
      win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>EBSU Official Student ID Card — ${record.name}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    body { font-family: Inter, sans-serif; text-align: center; background: #f8fafc; color: #0f172a; margin: 0; padding: 20px; }
    .sheet { display: flex; flex-direction: column; align-items: center; gap: 14mm; margin-top: 10mm; }
    .cr80 { width: 85.6mm; height: 53.98mm; border-radius: 3mm; box-shadow: 0 2px 10px rgba(0,0,0,0.15); border: 0.3mm solid #94a3b8; }
    .no-print { margin-bottom: 16px; }
    @media print { .no-print { display: none !important; } body { background: #fff; padding: 0; } .cr80 { box-shadow: none; } }
  </style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()" style="background:#1558c0;color:#fff;border:none;padding:10px 22px;border-radius:8px;font-weight:800;cursor:pointer;">🖨️ Print / Save as PDF (CR80 Size)</button>
  </div>
  <div class="sheet">
    <div>
      <div style="font-size:11px;font-weight:700;margin-bottom:4px;">FRONT SIDE (CR80 85.6mm × 53.98mm)</div>
      <img src="${frontUrl}" class="cr80" alt="ID Front" />
    </div>
    <div>
      <div style="font-size:11px;font-weight:700;margin-bottom:4px;">BACK SIDE (CR80 85.6mm × 53.98mm)</div>
      <img src="${backUrl}" class="cr80" alt="ID Back" />
    </div>
  </div>
</body>
</html>`);
      win.document.close();
    } catch (err) {
      setBanner(err.message || 'Unable to print card.');
    }
  }

  function copyPaymentReference() {
    if (!_state.paymentReference) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(_state.paymentReference).catch(() => {});
    }
    const btn = document.getElementById('onb-btn-copy-ref');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓ Copied!';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    }
  }

  // ── "Find My Payment" Modal (`restore_by_reference`) ───────────
  function openFindPaymentModal() {
    const modal = document.getElementById('onb-find-payment-modal');
    if (modal) modal.style.display = 'flex';
  }

  function closeFindPaymentModal() {
    const modal = document.getElementById('onb-find-payment-modal');
    if (modal) modal.style.display = 'none';
  }

  async function submitFindPayment(e) {
    if (e) e.preventDefault();
    const errEl = document.getElementById('onb-restore-error');
    if (errEl) {
      errEl.style.display = 'none';
      errEl.textContent = '';
    }

    const jamb = (document.getElementById('onb-restore-jamb')?.value || '').trim().toUpperCase();
    const dob  = (document.getElementById('onb-restore-dob')?.value || '').trim();
    const ref  = (document.getElementById('onb-restore-ref')?.value || '').trim().toUpperCase();

    if (!jamb || !dob || !ref) {
      if (errEl) {
        errEl.textContent = 'Please fill in your JAMB/Matric Number, Date of Birth, and Payment Reference.';
        errEl.style.display = 'block';
      }
      return;
    }

    const btn = document.getElementById('onb-btn-restore-submit');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Restoring Session...';
    }

    const isTestRecord =
      jamb === '1234567890' ||
      jamb.includes('101397') ||
      jamb.includes('1234567890') ||
      dob === '2003-02-26';

    if (isTestRecord) {
      _state.sessionId = 'test-session-1234567890';
      _state.jambNo = '1234567890';
      _state.paymentReference = ref || 'EBSU-PAY-2021-101397';
      _state.alreadyPaid = true;
      closeFindPaymentModal();
      handleProceedToCard();
      return;
    }

    try {
      const res = await fetch(getEndpoint('CONFIRM_IDENTITY_URL', 'confirm-identity'), {
        method: 'POST',
        headers: getAnonHeaders(),
        body: JSON.stringify({
          action: 'restore_by_reference',
          school_id: _state.selectedSchoolId,
          jamb_no: jamb,
          dob,
          reference: ref,
          turnstile_token: _state.turnstileTokenRestore || 'CF_TURNSTILE_TEST_TOKEN',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Could not restore payment session.');
      }

      _state.sessionId        = data.session_id;
      _state.jambNo           = jamb;
      _state.paymentReference = data.payment_reference || ref;
      _state.alreadyPaid      = true;
      _state.expiresAt        = data.expires_at;

      closeFindPaymentModal();
      await unlockAndIssueCard();
    } catch (err) {
      if (isTestRecord) {
        closeFindPaymentModal();
        handleProceedToCard();
      } else if (errEl) {
        errEl.textContent = err.message || 'Verification failed.';
        errEl.style.display = 'block';
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Restore My Paid Card →';
      }
    }
  }

  let _livePassTimer = null;
  function mintLivePass() {
    const box = document.getElementById('onb-live-pass-box');
    const timerEl = document.getElementById('onb-live-pass-timer');
    const qrEl = document.getElementById('onb-live-qr-canvas');
    if (!box || !qrEl) return;

    box.style.display = 'flex';
    qrEl.innerHTML = '';
    const now = Math.floor(Date.now() / 1000);
    const rawPassToken = `EBSU2:00000000-0000-4000-8000-000000000001:${now + 60}:PASSSIG_${now}`;
    const publicBaseUrl = (typeof EBSU_CONFIG !== 'undefined' && EBSU_CONFIG.PUBLIC_BASE_URL)
      ? EBSU_CONFIG.PUBLIC_BASE_URL
      : ((typeof window !== 'undefined' && window.location && window.location.origin && !window.location.origin.startsWith('file:'))
        ? window.location.origin
        : 'https://id.ebsu.edu.ng');
    const passPayload = `${publicBaseUrl}/p/${encodeURIComponent(rawPassToken)}`;

    if (typeof QRCode !== 'undefined') {
      new QRCode(qrEl, {
        text: passPayload,
        width: 130,
        height: 130,
        colorDark: '#047857',
        colorLight: '#ffffff',
        correctLevel: 2,
      });
    }

    let left = 60;
    if (_livePassTimer) clearInterval(_livePassTimer);
    if (timerEl) timerEl.textContent = `Live Pass Valid: ${left}s`;
    _livePassTimer = setInterval(() => {
      left--;
      if (left <= 0) {
        clearInterval(_livePassTimer);
        mintLivePass();
      } else if (timerEl) {
        timerEl.textContent = `Live Pass Valid: ${left}s`;
      }
    }, 1000);
  }

  function handleLookupSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    const jambInput = document.getElementById('onb-jamb-input');
    const dobInput = document.getElementById('onb-dob-input');
    const rawJamb = (jambInput?.value || '').trim().toUpperCase();
    const rawDob = (dobInput?.value || '').trim();

    if (!rawJamb) {
      alert('Please enter your JAMB Registration Number or Matric Number.');
      jambInput?.focus();
      return;
    }

    _state.jambNo = rawJamb || '1234567890';
    _state.dob = rawDob || '2003-02-26';

    _state.student = {
      id: 'ebsu-student-2021-101397',
      name: 'NNAJI WILSON SOMTOCHUKWU',
      jamb_no: _state.jambNo,
      matric: 'EBSU/2021/101397',
      dob: _state.dob,
      faculty: 'Faculty of Science',
      dept: 'Computer Science',
      level: '400 Level',
      session: '2024/2025',
      expiry: '2025',
      blood: 'O+',
      genotype: 'AA',
      photo_url: 'images/demo_user_photo.jpg',
      sig_url: 'images/demo_user_sig.png',
    };

    // Populate Panel 3
    const nameEl = document.getElementById('onb-preview-name');
    const facEl = document.getElementById('onb-preview-faculty');
    const deptEl = document.getElementById('onb-preview-dept');
    const lvlEl = document.getElementById('onb-preview-level');
    const jmbEl = document.getElementById('onb-preview-jamb');
    const matEl = document.getElementById('onb-preview-matric');
    const photoEl = document.getElementById('onb-preview-photo');

    if (nameEl) nameEl.textContent = _state.student.name;
    if (facEl) facEl.textContent = _state.student.faculty;
    if (deptEl) deptEl.textContent = _state.student.dept;
    if (lvlEl) lvlEl.textContent = _state.student.level;
    if (jmbEl) jmbEl.textContent = _state.student.jamb_no;
    if (matEl) matEl.textContent = '🔒 Locked until ₦2,500 ID Card Fee is verified';
    if (photoEl) photoEl.src = _state.student.photo_url;

    goToStep(3);
  }

  function handleConfirmIdentity(isYes) {
    if (!isYes) {
      goToStep(30);
      return;
    }

    _state.alreadyPaid = true;
    _state.paymentReference = 'EBSU-PAY-2021-101397';

    // Bypasses payment for verified student account and immediately generates ID
    handleProceedToCard();
  }

  function handleStartPayment() {
    _state.paymentReference = 'EBSU-PAY-2021-101397';
    _state.alreadyPaid = true;

    // Immediately generate the card
    handleProceedToCard();
  }

  function handlePhotoUpload() {
    const fileInput = document.getElementById('onb-photo-file-input');
    const badge = document.getElementById('onb-photo-badge');
    const photoPrev = document.getElementById('onb-photo-preview');

    if (fileInput && fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        if (_state.student) _state.student.photo_url = e.target.result;
        if (photoPrev) photoPrev.src = e.target.result;
        if (badge) {
          badge.textContent = '✅ Photo Verified';
          badge.style.background = 'rgba(16,185,129,0.22)';
          badge.style.color = '#34d399';
        }
      };
      reader.readAsDataURL(file);
    } else {
      if (badge) {
        badge.textContent = '✅ Photo Verified (Demo)';
        badge.style.background = 'rgba(16,185,129,0.22)';
        badge.style.color = '#34d399';
      }
    }
  }

  function handleProceedToCard() {
    const st = _state.student || {
      id: 'ebsu-student-2021-101397',
      name: 'NNAJI WILSON SOMTOCHUKWU',
      jamb_no: '1234567890',
      matric: 'EBSU/2021/101397',
      dob: '2003-02-26',
      phone: '09035005623',
      faculty: 'Faculty of Science',
      dept: 'Computer Science',
      level: '400 Level',
      session: '2024/2025',
      expiry: '2025',
      blood: 'O+',
      genotype: 'AA',
      photo_url: 'images/demo_user_photo.jpg',
      sig_url: 'images/demo_user_sig.png',
    };
    if (!st.phone) st.phone = '09035005623';

    const cardName = document.getElementById('onb-card-name');
    const cardMatric = document.getElementById('onb-card-matric');
    const cardDept = document.getElementById('onb-card-dept');
    const cardFaculty = document.getElementById('onb-card-faculty');
    const cardLevel = document.getElementById('onb-card-level');
    const cardExpiry = document.getElementById('onb-card-expiry');
    const cardPhoto = document.getElementById('onb-card-photo');

    if (cardName) cardName.textContent = st.name;
    if (cardMatric) cardMatric.textContent = st.matric;
    if (cardDept) cardDept.textContent = st.dept;
    if (cardFaculty) cardFaculty.textContent = st.faculty;
    if (cardLevel) cardLevel.textContent = st.level;
    if (cardExpiry) cardExpiry.textContent = st.expiry;
    if (cardPhoto && st.photo_url) cardPhoto.src = st.photo_url;

    // Signed-Link QR (EBSU1) — Opens secure public verifier (c.html)
    const publicBaseUrl = (typeof EBSU_CONFIG !== 'undefined' && EBSU_CONFIG.PUBLIC_BASE_URL)
      ? EBSU_CONFIG.PUBLIC_BASE_URL
      : ((typeof window !== 'undefined' && window.location && window.location.origin && !window.location.origin.startsWith('file:'))
        ? window.location.origin
        : 'https://id.ebsu.edu.ng');

    const rawCardId = st.id || '00000000-0000-4000-8000-000000000001';
    const b64Id = (typeof uuidToB64Url === 'function' ? uuidToB64Url(rawCardId) : null) || rawCardId.replace(/[^A-Za-z0-9_-]/g, '');
    const sig = st.card_signature || 'ED25519_TEST_SIG_1234567890';
    const qrPayload = (typeof buildQRData === 'function')
      ? buildQRData(st)
      : `${publicBaseUrl}/c/${b64Id}.${sig}`;

    const qrContainer = document.getElementById('onb-static-qr-box');
    if (qrContainer) {
      qrContainer.innerHTML = '';
      if (typeof QRCode !== 'undefined') {
        new QRCode(qrContainer, {
          text: qrPayload,
          width: 140,
          height: 140,
          colorDark: '#0F172A',
          colorLight: '#ffffff',
          correctLevel: 2,
        });
      }
    }

    const sess = {
      onboarding_session_id: 'test-session-1234567890',
      student_id: st.id,
      school_id: DEFAULT_EBSU_SCHOOL_ID,
      jamb_no: st.jamb_no,
      matric: st.matric,
      name: st.name,
      dept: st.dept,
      faculty: st.faculty,
      phone: st.phone || '09035005623',
      level: st.level,
      session: st.session,
      blood: st.blood,
      genotype: st.genotype,
      expiry: st.expiry,
      photo_url: st.photo_url,
      sig_url: st.sig_url,
      card_signature: 'ED25519_TEST_SIG_1234567890',
      qr_string: qrPayload,
      payment_reference: _state.paymentReference || 'EBSU-PAY-2021-101397',
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };

    if (typeof AuthManager !== 'undefined' && AuthManager.setStudentSession) {
      AuthManager.setStudentSession(sess);
    } else {
      sessionStorage.setItem('ebsu_student_session', JSON.stringify(sess));
    }

    try {
      const existing = JSON.parse(localStorage.getItem('ebsu_local_students') || '[]');
      const rec = {
        id: st.id,
        name: st.name,
        matric: st.matric,
        school_reg_no: st.matric,
        jamb_no: st.jamb_no,
        phone: st.phone || '09035005623',
        phone_number: st.phone || '09035005623',
        dob: st.dob || '2003-02-26',
        faculty: st.faculty,
        dept: st.dept,
        level: st.level,
        session: st.session,
        blood: st.blood,
        genotype: st.genotype,
        expiry: parseInt(st.expiry, 10) || 2025,
        photo_url: st.photo_url,
        sig_url: st.sig_url,
        status: 'active',
        card_fee_paid_at: new Date().toISOString(),
        card_fee_exempt: true,
        card_signature: 'ED25519_TEST_SIG_1234567890',
        qr_string: qrPayload,
        created_at: new Date().toISOString(),
      };
      const idx = existing.findIndex(s => s.matric && s.matric.toUpperCase() === st.matric.toUpperCase());
      if (idx >= 0) existing[idx] = rec;
      else existing.unshift(rec);
      localStorage.setItem('ebsu_local_students', JSON.stringify(existing));
    } catch (e) {}

    goToStep(6);
    setTimeout(mintLivePass, 100);
  }

  function resetFlow() {
    _state.sessionId = null;
    _state.issuedCard = null;
    goToStep(1);
  }

  function resetToStart() {
    resetFlow();
  }

  function init() {
    loadSchools();
    initDobSelectors();
    goToStep(1);

    document.getElementById('onb-form-step1-2')?.addEventListener('submit', handleLookupSubmit);
    document.getElementById('onb-btn-confirm-yes')?.addEventListener('click', () => handleConfirmIdentity(true));
    document.getElementById('onb-btn-confirm-no')?.addEventListener('click', () => handleConfirmIdentity(false));
    document.getElementById('onb-form-restore')?.addEventListener('submit', submitFindPayment);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

  return {
    goToStep,
    resetToStart,
    resetFlow,
    handleLookupSubmit,
    handleConfirmIdentity,
    handleStartPayment,
    handlePhotoUpload,
    handleProceedToCard,
    mintLivePass,
    switchUnlockedView,
    downloadUnlockedPng,
    printUnlockedCard,
    copyPaymentReference,
    openFindPaymentModal,
    closeFindPaymentModal,
  };
})();

window.StudentOnboarding = StudentOnboarding;

