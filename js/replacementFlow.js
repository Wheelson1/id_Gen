/**
 * replacementFlow.js — student portal money flows that come after the first card:
 *   1. Report card lost  -> old QR dies at once.
 *   2. New card (N500)   -> pay, then a brand-new QR is forged and the old one stays dead.
 *      After paying, the student is told printing costs N1,500 at most, with a way to report overcharging.
 *   3. School fees       -> pay the session fee (N300, once per academic session), then type the school-fees
 *                           RRR as plain text. The back office checks it. No new card is needed:
 *                           scans read the fee status live.
 *
 * Needs on the page (student-portal.html): the elements used below, and the globals from student-portal.js:
 * currentStudentSession, showToast, getAnonHeaders, EBSU_CONFIG.
 * Prices on screen are display text only. The server takes every price from the database.
 */
(function () {
  'use strict';
  var CAP_TEXT = '₦1,500';

  function $(id) { return document.getElementById(id); }
  function sessionId() {
    return (currentStudentSession && (currentStudentSession.onboarding_session_id || currentStudentSession.id)) || '';
  }
  function fn(name, cfgKey) {
    return (EBSU_CONFIG && EBSU_CONFIG[cfgKey]) || (EBSU_CONFIG.SUPABASE_URL + '/functions/v1/' + name);
  }
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: getAnonHeaders(), body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, data: d }; }); });
  }
  function setText(id, t) { var e = $(id); if (e) e.textContent = t; }
  function show(id, on) { var e = $(id); if (e) e.style.display = on ? '' : 'none'; }

  // ── generic pay-by-purpose (init -> provider page -> "I have paid" -> confirm) ──
  var pending = { replacement: null, renewal: null };

  function startPay(purpose, infoId, paidBtnId, btnId) {
    var sid = sessionId();
    if (!sid) { showToast('Please sign in again.', true); return; }
    var btn = $(btnId); if (btn) btn.disabled = true;
    post(fn('card-payment', 'CARD_PAYMENT_URL'), { action: 'init', session_id: sid, purpose: purpose }).then(function (res) {
      if (btn) btn.disabled = false;
      if (!res.ok) { showToast((res.data && res.data.error) || 'Could not start payment.', true); return; }
      if (res.data.already_paid) { setText(infoId, 'Already paid.'); if (purpose === 'renewal') loadFeeStatus(); return; }
      pending[purpose] = res.data.reference;
      setText(infoId, 'Pay ₦' + Number(res.data.amount).toLocaleString('en-NG') + ' (ref ' + res.data.reference + '), then press "I have paid".');
      if (res.data.authorization_url) window.open(res.data.authorization_url, '_blank', 'noopener');
      show(paidBtnId, true);
    });
  }

  function confirmPay(purpose, paidBtnId) {
    if (!pending[purpose]) return;
    post(fn('card-payment', 'CARD_PAYMENT_URL'), { action: 'confirm', session_id: sessionId(), reference: pending[purpose] })
      .then(function (res) {
        if (!res.ok) { showToast((res.data && res.data.error) || 'Payment not confirmed yet. Try again in a minute.', true); return; }
        pending[purpose] = null;
        show(paidBtnId, false);
        if (purpose === 'renewal') { loadFeeStatus(); showToast('Session fee paid.'); }
        else forgeNewCard();
      });
  }

  // ── 1. report lost ──
  function reportLost() {
    post(fn('confirm-identity', 'CONFIRM_IDENTITY_URL'), { action: 'report_lost', session_id: sessionId() }).then(function (res) {
      if (!res.ok) { showToast((res.data && res.data.error) || 'Could not report the card.', true); return; }
      show('lost-next-step', true);
      showToast('Card reported lost. The old QR code is now dead.');
    });
  }

  // ── 2. new card after paid replacement ──
  function forgeNewCard() {
    post(fn('issue-card', 'ISSUE_CARD_URL'), { onboarding_session_id: sessionId() }).then(function (res) {
      if (!res.ok) { showToast((res.data && res.data.error) || 'Payment received but the new card could not be made. Try again.', true); return; }
      try {
        var s = Object.assign({}, currentStudentSession, {
          student_id: res.data.card_id, card_signature: res.data.signature, qr_string: res.data.qr_string
        });
        if (typeof AuthManager !== 'undefined' && AuthManager.setStudentSession) AuthManager.setStudentSession(s);
        else sessionStorage.setItem('ebsu_student_session', JSON.stringify(s));
      } catch (e) { /* the reload below will ask them to sign in again */ }
      // FUTURE (OFF): play the burn-and-rebirth animation here, see the comment at the end of student-portal.js
      showCapNotice();
    });
  }

  function showCapNotice() { var m = $('pdf-cap-modal'); if (m) m.style.display = 'flex'; }
  function closeCapNotice() { var m = $('pdf-cap-modal'); if (m) m.style.display = 'none'; if (pendingReload) location.reload(); }
  var pendingReload = false;

  function submitOvercharge(ev) {
    ev.preventDefault();
    post(fn('confirm-identity', 'CONFIRM_IDENTITY_URL'), {
      action: 'report_overcharge', session_id: sessionId(),
      place: ($('oc-place') || {}).value || '', amount_naira: Number(($('oc-amount') || {}).value || 0), note: ($('oc-note') || {}).value || ''
    }).then(function (res) {
      setText('oc-result', res.ok
        ? 'Thank you. Your report is saved and the school will look into it. Keep your receipt or a screenshot of the chat as evidence.'
        : ((res.data && res.data.error) || 'Could not save the report.'));
      if (res.ok && $('oc-form')) $('oc-form').reset();
    });
  }

  // ── 3. school fees ──
  var SEM_TEXT = { first: 'First semester', second: 'Second semester', full: 'Full year' };
  function loadFeeStatus() {
    if (!sessionId() || !$('sf-block')) return;
    post(fn('confirm-identity', 'CONFIRM_IDENTITY_URL'), { action: 'fee_status', session_id: sessionId() }).then(function (res) {
      if (!res.ok) return;
      var d = res.data;
      setText('sf-session', d.session || '');
      if (!d.session) { setText('sf-status', 'The current session has not been set yet.'); show('btn-sf-pay', false); show('sf-rrr-wrap', false); return; }
      if (d.session_fee_naira) setText('sf-price', '₦' + d.session_fee_naira.toLocaleString('en-NG'));
      show('btn-sf-pay', !d.session_fee_paid);
      show('sf-rrr-wrap', d.session_fee_paid);
      var lines = (d.receipts || []).map(function (r) {
        var txt = r.status === 'verified' ? 'confirmed'
          : r.status === 'pending' ? 'waiting for the school to check'
          : r.status === 'needs_review' ? 'needs a check by the Bursary' + (r.review_reason ? ' (' + r.review_reason + ')' : '')
          : r.status === 'part_paid' ? (r.review_reason || 'part payment received, add the next RRR')
          : r.status === 'rejected' ? 'not accepted, please check the RRR and try again' : r.status;
        return (SEM_TEXT[r.semester] || r.semester) + ': ' + txt;
      });
      setText('sf-status', d.session_fee_paid
        ? (lines.length ? lines.join(' · ') : 'Session fee paid. Add your school fees RRR below.')
        : 'Pay the session fee once, then you can add your school fees RRR.');
    });
  }
  function submitRrr(ev) {
    ev.preventDefault();
    post(fn('confirm-identity', 'CONFIRM_IDENTITY_URL'), {
      action: 'submit_rrr', session_id: sessionId(),
      rrr: ($('sf-rrr') || {}).value || '', semester: ($('sf-sem') || {}).value || ''
    }).then(function (res) {
      setText('sf-msg', res.ok ? 'Saved. The school will check your RRR. If you paid in two parts, add each RRR one after the other. You do not need a new card.' : ((res.data && res.data.error) || 'Could not save.'));
      if (res.ok) { if ($('sf-form')) $('sf-form').reset(); loadFeeStatus(); }
    });
  }

  function wire() {
    var map = [
      ['btn-new-pdf', function () { startPay('replacement', 'pdf-pay-info', 'btn-pdf-paid', 'btn-new-pdf'); }],
      ['btn-pdf-paid', function () { pendingReload = true; confirmPay('replacement', 'btn-pdf-paid'); }],
      ['btn-sf-pay', function () { startPay('renewal', 'sf-pay-info', 'btn-sf-paid', 'btn-sf-pay'); }],
      ['btn-sf-paid', function () { confirmPay('renewal', 'btn-sf-paid'); }],
      ['btn-cap-close', closeCapNotice],
      ['btn-open-report', function () { showCapNotice(); }]
    ];
    map.forEach(function (m) { var e = $(m[0]); if (e) e.addEventListener('click', m[1]); });
    var f = $('oc-form'); if (f) f.addEventListener('submit', submitOvercharge);
    var g = $('sf-form'); if (g) g.addEventListener('submit', submitRrr);
    var k = document.querySelectorAll('[data-cap-text]'); for (var i = 0; i < k.length; i++) k[i].textContent = CAP_TEXT;
    setTimeout(loadFeeStatus, 800);   // the student session is restored a moment after page load
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();

  window.ReplacementFlow = { reportLost: reportLost, showCapNotice: showCapNotice, loadFeeStatus: loadFeeStatus };
})();

/* ─────────────────────────────────────────────────────────────────────────
 * FUTURE (OFF): link a student to a print agent. Part of the later
 * "bigger network" feature. Not loaded. To switch on, remove the "// " below,
 * run the commented SQL at the bottom of migration 0016, and add the UI.
 * ─────────────────────────────────────────────────────────────────────────
 * // function listPrintAgents() {
 * //   return ebsuSupabase.from('print_agents').select('id,name,location,phone').eq('status', 'approved');
 * // }
 * // function requestPrint(agentId) {
 * //   return ebsuSupabase.from('print_requests').insert({ agent_id: agentId });
 * // }
 * // function renderAgentPicker(el) {
 * //   listPrintAgents().then(function (r) { (r.data || []).forEach(function (a) { /* one button per agent *\/ }); });
 * // }
 */
