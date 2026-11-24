/**
 * mediaFlow.js — student portal: passport photo, signature and biodata.
 *
 * Rules (the server enforces them, this file only shows them):
 *   - first upload goes straight onto the card
 *   - a later change waits for Registry approval
 *   - 30 days between changes of the same kind, at most 3 per session
 * The QR code does not depend on the picture, so no new card is needed.
 */
(function () {
  'use strict';
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function $(id) { return document.getElementById(id); }
  function sessionId() {
    return (typeof currentStudentSession !== 'undefined' && currentStudentSession &&
      (currentStudentSession.onboarding_session_id || currentStudentSession.id)) || '';
  }
  function isLive() { return UUID_RE.test(String(sessionId())); }
  function fnUrl() {
    return (EBSU_CONFIG && EBSU_CONFIG.CONFIRM_IDENTITY_URL) || (EBSU_CONFIG.SUPABASE_URL + '/functions/v1/confirm-identity');
  }
  function post(body) {
    return fetch(fnUrl(), { method: 'POST', headers: getAnonHeaders(), body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, data: d }; }); });
  }
  function say(id, text, bad) {
    var e = $(id); if (!e) return;
    e.textContent = text || '';
    e.style.color = bad ? 'var(--error, #b00020)' : 'var(--muted)';
  }
  function dateText(iso) {
    try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; }
  }

  // ── shrink a picture so it fits the 500 KB limit ──
  function fileToDataUrl(file, kind) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { reject(new Error('Use a JPG, PNG or WEBP image.')); return; }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('That image could not be read.')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('That image could not be read.')); };
        img.onload = function () {
          var maxSide = kind === 'photo' ? 900 : 700;
          var k = Math.min(1, maxSide / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * k));
          c.height = Math.max(1, Math.round(img.height * k));
          var g = c.getContext('2d');
          g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
          g.drawImage(img, 0, 0, c.width, c.height);
          var q = 0.9, out = c.toDataURL('image/jpeg', q);
          while (out.length * 0.75 > 480000 && q > 0.4) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
          if (out.length * 0.75 > 500000) { reject(new Error('That image is too large. Use a smaller one.')); return; }
          resolve(out);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ── show the current pictures and the rules for each ──
  var NAMES = { photo: 'passport photo', signature: 'signature' };
  var IDS = { photo: { img: 'mf-photo-img', none: 'mf-photo-none', status: 'mf-photo-status', btn: 'mf-photo-btn', file: 'mf-photo-file' },
              signature: { img: 'mf-sig-img', none: 'mf-sig-none', status: 'mf-sig-status', btn: 'mf-sig-btn', file: 'mf-sig-file' } };

  function showCurrent(kind, url) {
    var ids = IDS[kind], img = $(ids.img), none = $(ids.none);
    if (url) { img.src = url; img.style.display = ''; if (none) none.style.display = 'none'; }
    else { img.style.display = 'none'; if (none) none.style.display = ''; }
  }
  function currentUrls() {
    var s = (typeof currentStudent !== 'undefined' && currentStudent) || {};
    return { photo: s.photo_url || s.photo || '', signature: s.sig_url || s.sig || '' };
  }

  function renderStatus(kind, st) {
    var ids = IDS[kind], btn = $(ids.btn), file = $(ids.file);
    var label = NAMES[kind];
    var text = '', locked = false;
    if (st.pending) { text = 'Waiting for the Registry to approve your new ' + label + '.'; locked = true; }
    else if (st.next_allowed_at) { text = 'You can change your ' + label + ' again on ' + dateText(st.next_allowed_at) + '.'; locked = true; }
    else if (st.has_current && st.remaining_this_session <= 0) { text = 'You have used all your ' + label + ' changes for this session. Please visit the Registry.'; locked = true; }
    else if (!st.has_current) { text = 'Add your ' + label + '. It goes straight onto your card.'; }
    else { text = 'A new ' + label + ' will be checked by the Registry. ' + st.remaining_this_session + ' change(s) left this session.'; }
    if (st.last_rejected_reason && !st.pending) text += ' Last request not approved: ' + st.last_rejected_reason;
    say(ids.status, text, false);
    btn.disabled = locked; file.disabled = locked;
    btn.textContent = st.has_current ? 'Ask to change ' + label : 'Upload ' + label;
  }

  function loadStatus() {
    var urls = currentUrls();
    showCurrent('photo', urls.photo); showCurrent('signature', urls.signature);
    if (!isLive()) {
      renderStatus('photo', { has_current: !!urls.photo, remaining_this_session: 3 });
      renderStatus('signature', { has_current: !!urls.signature, remaining_this_session: 3 });
      say('mf-msg', 'Demo screen. On the live site your uploads are saved and checked by the Registry.', false);
      return;
    }
    post({ action: 'media_status', session_id: sessionId() }).then(function (res) {
      if (!res.ok) { say('mf-msg', (res.data && res.data.error) || 'Could not load your picture settings.', true); return; }
      renderStatus('photo', res.data.photo); renderStatus('signature', res.data.signature);
      loadQueue();
    });
  }

  function loadQueue() {
    var box = $('mf-queue'); if (!box) return;
    function show(items) {
      if (!items || !items.length) { box.style.display = 'none'; return; }
      box.style.display = 'block'; box.textContent = '';
      var h = document.createElement('strong'); h.style.fontSize = '13px'; h.textContent = 'Your waiting room'; box.appendChild(h);
      items.forEach(function (i) {
        var p = document.createElement('p'); p.style.cssText = 'font-size:13px; margin:6px 0 0;';
        p.textContent = i.what + ': you are number ' + i.position + ' in line (' + i.ahead + ' ahead of you). Expected wait: ' + i.label + '.' +
          (i.basis === 'default' ? ' (An early estimate. It gets sharper as the Registry clears more requests.)' : '');
        box.appendChild(p);
      });
    }
    if (!isLive()) { show([]); return; }
    post({ action: 'queue_status', session_id: sessionId() }).then(function (res) { show(res.ok ? res.data.items : []); });
  }

  function submit(kind) {
    var ids = IDS[kind], file = $(ids.file).files && $(ids.file).files[0];
    if (!file) { say('mf-msg', 'Choose a picture first.', true); return; }
    say('mf-msg', 'Preparing your picture…', false);
    fileToDataUrl(file, kind).then(function (dataUrl) {
      if (!isLive()) {
        showCurrent(kind, dataUrl);
        say('mf-msg', 'Demo only: nothing was saved. On the live site this goes to the Registry for approval.', false);
        return;
      }
      $(ids.btn).disabled = true;
      return post({ action: 'submit_media', session_id: sessionId(), kind: kind, image_b64: dataUrl }).then(function (res) {
        if (!res.ok) { say('mf-msg', (res.data && res.data.error) || 'Could not save the picture.', true); loadStatus(); return; }
        if (res.data.applied) {
          say('mf-msg', 'Saved. Your ' + NAMES[kind] + ' is now on your card. Reloading…', false);
          setTimeout(function () { location.reload(); }, 1200);
        } else {
          say('mf-msg', 'Sent. The Registry will check your new ' + NAMES[kind] + '.', false);
          $(ids.file).value = '';
          loadStatus();
        }
      });
    }).catch(function (e) { say('mf-msg', e.message || 'Could not read that picture.', true); });
  }

  // ── biodata ──
  var ROWS = [['name', 'Name'], ['matric', 'Matric number'], ['jamb_no', 'JAMB number'], ['faculty', 'Faculty'], ['dept', 'Department'],
              ['level', 'Level'], ['blood', 'Blood group'], ['genotype', 'Genotype']];

  function renderReadonly(b) {
    var dl = $('bd-readonly'); if (!dl) return;
    dl.innerHTML = '';
    ROWS.forEach(function (r) {
      if (!b[r[0]]) return;
      var dt = document.createElement('dt'); dt.textContent = r[1]; dt.style.color = 'var(--muted)';
      var dd = document.createElement('dd'); dd.textContent = b[r[0]]; dd.style.margin = '0'; dd.style.fontWeight = '600';
      dl.appendChild(dt); dl.appendChild(dd);
    });
  }
  function fillForm(b) {
    if ($('bd-phone')) $('bd-phone').value = b.phone || '';
    if ($('bd-email')) $('bd-email').value = b.email || '';
    if ($('bd-address')) $('bd-address').value = b.home_address || '';
    if ($('bd-nok-name')) $('bd-nok-name').value = b.nok_name || '';
    if ($('bd-nok-phone')) $('bd-nok-phone').value = b.nok_phone || '';
  }
  function loadBiodata() {
    var s = (typeof currentStudent !== 'undefined' && currentStudent) || {};
    if (!isLive()) {
      renderReadonly({ name: s.name, matric: s.matric, jamb_no: s.jamb_no, faculty: s.faculty, dept: s.dept || s.department, level: s.level, blood: s.blood, genotype: s.genotype });
      return;
    }
    post({ action: 'get_biodata', session_id: sessionId() }).then(function (res) {
      if (!res.ok) { say('bd-msg', (res.data && res.data.error) || 'Could not load your details.', true); return; }
      renderReadonly(res.data.biodata); fillForm(res.data.biodata);
    });
  }
  function saveBiodata(ev) {
    ev.preventDefault();
    if (!isLive()) { say('bd-msg', 'Demo only: nothing was saved.', false); return; }
    say('bd-msg', 'Saving…', false);
    post({
      action: 'update_biodata', session_id: sessionId(),
      phone: $('bd-phone').value, email: $('bd-email').value, home_address: $('bd-address').value,
      nok_name: $('bd-nok-name').value, nok_phone: $('bd-nok-phone').value
    }).then(function (res) {
      say('bd-msg', res.ok ? 'Saved.' : ((res.data && res.data.error) || 'Could not save your details.'), !res.ok);
    });
  }

  function wire() {
    if ($('mf-photo-btn')) $('mf-photo-btn').addEventListener('click', function () { submit('photo'); });
    if ($('mf-sig-btn')) $('mf-sig-btn').addEventListener('click', function () { submit('signature'); });
    if ($('bd-form')) $('bd-form').addEventListener('submit', saveBiodata);
    // the student session is restored a moment after the page loads
    var tries = 0;
    (function wait() {
      var ready = typeof currentStudent !== 'undefined' && currentStudent;
      if (ready || tries++ > 20) { loadStatus(); loadBiodata(); } else setTimeout(wait, 500);
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
