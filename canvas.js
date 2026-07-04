/**
 * canvas.js — Card drawing logic.
 * Base canvas: 1011 × 638 px (CR80 at ~300 DPI).
 *
 * ALL major positions, font sizes, and visual weights are read from
 * window.CardConfig so admin.html can change them in real-time.
 * getCC() merges admin-set values over the hard defaults below.
 */

// ── DEFAULT LAYOUT CONFIG ────────────────────────────────────────
const CC_DEFAULTS = {
  // Typography
  headerFontSize:   36,
  titleFontSize:    38,
  matricFontSize:   22,
  fieldFontSize:    22,
  bloodFontSize:    20,
  sigLabelFontSize: 14,

  // Photo (left column)
  photoX: 20,  photoY: 210, photoW: 310, photoH: 360,

  // Matric row
  matricLabelX: 20, matricY: 180,

  // Centre column
  fieldLabelX: 350, fieldValueX: 520,
  fieldsStartY: 240, fieldSpacing: 80,

  // Bottom-left vitals
  bloodX: 20, bloodY: 600, bloodValueX: 178,
  genoX:  20, genoY:  625,

  // Right column — logo
  logoX: 780, logoY: 210, logoW: 180, logoH: 180, logoAlpha: 0.15,

  // Right column — QR code
  qrX: 760, qrY: 345, qrSize: 215,

  // Right column — signature label (sits ABOVE the sig box)
  sigLabelX: 760, sigLabelY: 570,

  // Right column — signature box
  sigBoxX: 760, sigBoxY: 582, sigBoxW: 220, sigBoxH: 46,

  // Centre watermark
  watermarkAlpha: 0.10, watermarkSize: 340,

  // Back card
  backHeaderFontSize: 28,
  backTermsHeadSize:  20,
  backTermsBodySize:  18
};

// ── CONFIG HELPER ────────────────────────────────────────────────
function getCC() {
  return Object.assign({}, CC_DEFAULTS, window.CardConfig || {});
}

// ── HELPERS ──────────────────────────────────────────────────────
function truncateText(ctx, text, maxW) {
  if (!text) return '—';
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
  return text + '…';
}

// Returns the opaque signed token issued by the issue-card Edge Function.
// Format: EBSU1:<card_id_uuid>:<ed25519_signature_base64url>
// No PII goes into the QR — all student details live server-side only.
// If the card has not been issued yet (qrString empty) the QR renders
// a blank code that the verifier will reject immediately as 'tampered'.
function buildQRData(st) {
  return st.qrString || '';
}

// ── FRONT CARD ───────────────────────────────────────────────────
function drawCard(canvas, st, scale) {
  scale = scale || 1;
  const CC = getCC();
  const W  = Math.round(1011 * scale);
  const H  = Math.round(638  * scale);
  canvas.width = W; canvas.height = H;

  const c   = canvas.getContext('2d');
  const S   = n => Math.round(n * scale);
  const col = AppState.get('colors') || {};

  // ── SYNC: background, static text, structural lines ──────────

  c.fillStyle = col.bodyBg || '#ffffff';
  c.fillRect(0, 0, W, H);

  // Header bar
  c.fillStyle = col.headerBg || '#1558c0';
  c.fillRect(0, 0, W, S(90));

  // University name — centred in header, maxWidth prevents overflow
  c.fillStyle = col.headerText || '#ffffff';
  c.font      = 'bold ' + S(CC.headerFontSize) + 'px Arial,sans-serif';
  c.textAlign = 'center';
  c.fillText(
    (AppState.get('schoolName') || 'EBONYI STATE UNIVERSITY, ABAKALIKI').toUpperCase(),
    S(505), S(55), S(971)
  );

  // Card border
  c.strokeStyle = col.borderColor || '#6ab0e0';
  c.lineWidth   = S(2);
  c.strokeRect(S(1), S(1), W - S(2), H - S(2));

  // Card title
  c.fillStyle = col.titleColor || '#CC0000';
  c.font      = 'bold ' + S(CC.titleFontSize) + 'px Arial,sans-serif';
  c.textAlign = 'center';
  c.fillText('STUDENT IDENTITY CARD', S(505), S(135));

  // Top divider
  c.strokeStyle = '#4A86E8';
  c.lineWidth   = S(2);
  c.beginPath(); c.moveTo(0, S(150)); c.lineTo(W, S(150)); c.stroke();

  // Matric row — value starts right after the label, extends to qrX boundary
  c.textAlign = 'left';
  c.fillStyle = col.matricLabel || '#003399';
  c.font      = 'bold ' + S(CC.matricFontSize) + 'px Arial,sans-serif';
  const matLabel  = 'MATRIC NUMBER:';
  const matLabelW = c.measureText(matLabel).width;
  c.fillText(matLabel, S(CC.matricLabelX), S(CC.matricY));

  c.fillStyle = '#4A86E8';
  c.font      = S(CC.matricFontSize) + 'px Arial,sans-serif';
  const matValX = S(CC.matricLabelX) + matLabelW + S(8);
  // Max width: from value start to the right column boundary (qrX - 10)
  const matMaxW = Math.max(0, S(CC.qrX - 10) - matValX);
  c.fillText(truncateText(c, st.matric || '—', matMaxW), matValX, S(CC.matricY));

  // Bottom divider
  c.strokeStyle = '#4A86E8';
  c.lineWidth   = S(2);
  c.beginPath(); c.moveTo(0, S(195)); c.lineTo(W, S(195)); c.stroke();

  // Photo placeholder
  const PX = S(CC.photoX), PY = S(CC.photoY),
        PW = S(CC.photoW), PH = S(CC.photoH);
  c.fillStyle = col.photoBackground || '#990000';
  c.fillRect(PX, PY, PW, PH);

  // Blood Group
  c.textAlign = 'left';
  c.fillStyle = col.labelColor || '#000';
  c.font      = 'bold ' + S(CC.bloodFontSize) + 'px Arial,sans-serif';
  c.fillText('Blood Group', S(CC.bloodX), S(CC.bloodY));
  c.fillStyle = col.valueColor || '#222';
  c.font      = S(CC.bloodFontSize) + 'px Arial,sans-serif';
  c.fillText(st.blood || '—', S(CC.bloodValueX), S(CC.bloodY));

  // Genotype
  c.fillStyle = col.labelColor || '#000';
  c.font      = 'bold ' + S(CC.bloodFontSize) + 'px Arial,sans-serif';
  c.fillText('Genotype', S(CC.genoX), S(CC.genoY));
  c.fillStyle = col.valueColor || '#222';
  c.font      = S(CC.bloodFontSize) + 'px Arial,sans-serif';
  c.fillText(st.genotype || '—', S(CC.bloodValueX), S(CC.genoY));

  // Centre column
  const rows = [
    ['Name:',        st.name],
    ['Faculty:',     st.faculty],
    ['Department:',  st.dept],
    ['Expiry Year:', AppState.get('expiry')]
  ];
  rows.forEach(([label, val], i) => {
    const ty = S(CC.fieldsStartY + i * CC.fieldSpacing);
    c.textAlign = 'left';
    c.fillStyle = col.labelColor || '#000000';
    c.font      = 'bold ' + S(CC.fieldFontSize) + 'px Arial,sans-serif';
    c.fillText(label, S(CC.fieldLabelX), ty);
    c.fillStyle = col.valueColor || '#222222';
    c.font      = S(CC.fieldFontSize) + 'px Arial,sans-serif';
    // Max width: from valueX to qrX boundary
    const fMaxW = Math.max(0, S(CC.qrX - 10) - S(CC.fieldValueX));
    c.fillText(truncateText(c, val || '—', fMaxW), S(CC.fieldValueX), ty);
  });

  // Signature label — ABOVE the sig box
  c.fillStyle = col.labelColor || '#000';
  c.font      = 'bold ' + S(CC.sigLabelFontSize) + 'px Arial,sans-serif';
  c.textAlign = 'left';
  c.fillText('Signature', S(CC.sigLabelX), S(CC.sigLabelY));

  // Signature box
  c.fillStyle   = '#EFEFEF';
  c.fillRect(S(CC.sigBoxX), S(CC.sigBoxY), S(CC.sigBoxW), S(CC.sigBoxH));
  c.strokeStyle = '#CCCCCC';
  c.lineWidth   = S(1);
  c.strokeRect(S(CC.sigBoxX), S(CC.sigBoxY), S(CC.sigBoxW), S(CC.sigBoxH));

  // Placeholder text inside sig box (if no signature uploaded)
  if (!st.sig) {
    const sigCX = S(CC.sigBoxX) + S(CC.sigBoxW) / 2;
    const sigCY = S(CC.sigBoxY) + S(CC.sigBoxH) / 2 + S(5);
    c.fillStyle = '#aaaaaa';
    c.font      = 'italic ' + S(13) + 'px Arial,sans-serif';
    c.textAlign = 'center';
    c.fillText('sign here', sigCX, sigCY);
  }

  // ── ASYNC: image chain ────────────────────────────────────────

  // 1. Centre watermark
  const crestL = new Image();
  crestL.onerror = () => stepLogo();
  crestL.onload  = () => {
    const wm = S(CC.watermarkSize);
    c.save();
    c.globalAlpha = CC.watermarkAlpha;
    c.drawImage(crestL, S(505) - wm / 2, S(415) - wm / 2, wm, wm);
    c.restore();
    stepLogo();
  };
  crestL.src = AppState.get('customLogo') || CREST_LARGE;

  // 2. Top-right faded logo
  function stepLogo() {
    const img = new Image();
    img.onerror = () => stepQR();
    img.onload  = () => {
      c.save();
      c.globalAlpha = CC.logoAlpha;
      c.drawImage(img, S(CC.logoX), S(CC.logoY), S(CC.logoW), S(CC.logoH));
      c.restore();
      stepQR();
    };
    img.src = AppState.get('customLogo') || CREST_SMALL;
  }

  // 3. QR code
  function stepQR() {
    const qc = document.createElement('canvas');
    QRGen.drawToCanvas(qc, buildQRData(st), 4);
    c.drawImage(qc, S(CC.qrX), S(CC.qrY), S(CC.qrSize), S(CC.qrSize));
    stepSig();
  }

  // 4. Signature image
  function stepSig() {
    if (!st.sig) { stepPhoto(); return; }
    const img = new Image();
    img.onerror = () => stepPhoto();
    img.onload  = () => {
      c.drawImage(img, S(CC.sigBoxX), S(CC.sigBoxY), S(CC.sigBoxW), S(CC.sigBoxH));
      stepPhoto();
    };
    img.src = st.sig;
  }

  // 5. Passport photo
  function stepPhoto() {
    if (!st.photo) return;
    const img = new Image();
    img.onerror = () => {};
    img.onload  = () => { c.drawImage(img, PX, PY, PW, PH); };
    img.src = st.photo;
  }
}

// ── BACK CARD ────────────────────────────────────────────────────
function drawBackCard(canvas, st, scale) {
  scale = scale || 1;
  const CC = getCC();
  const W  = Math.round(1011 * scale);
  const H  = Math.round(638  * scale);
  canvas.width = W; canvas.height = H;

  const c = canvas.getContext('2d');
  const S = n => Math.round(n * scale);

  c.fillStyle = '#fff';
  c.fillRect(0, 0, W, H);

  c.strokeStyle = '#6ab0e0';
  c.lineWidth   = S(2);
  c.strokeRect(S(1), S(1), W - S(2), H - S(2));

  const grad = c.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#1a3a8a');
  grad.addColorStop(1, '#2255cc');
  c.fillStyle = grad;
  c.fillRect(0, 0, W, S(80));

  c.fillStyle = '#fff';
  c.font      = 'bold ' + S(CC.backHeaderFontSize) + 'px Arial,sans-serif';
  c.textAlign = 'center';
  c.fillText(
    (AppState.get('schoolName') || 'EBONYI STATE UNIVERSITY').toUpperCase(),
    W / 2, S(50), S(951)
  );

  c.fillStyle = '#cc0000';
  c.fillRect(0, S(80), W, S(5));

  c.fillStyle = '#cc0000';
  c.font      = 'bold ' + S(CC.backTermsHeadSize) + 'px Arial,sans-serif';
  c.textAlign = 'left';
  c.fillText('TERMS & CONDITIONS OF USE', S(30), S(120));

  const terms = [
    '1. This card is the property of the University and must be returned on demand.',
    '2. This card is strictly non-transferable. Misuse attracts disciplinary action.',
    '3. Loss must be reported immediately to the Student Affairs Office.',
    '4. Carry this card at all times within the University premises.',
    '5. Present for access to library, exam halls and academic facilities.',
    '6. Tampering renders this card invalid and attracts disciplinary action.'
  ];

  c.fillStyle = '#222';
  c.font      = S(CC.backTermsBodySize) + 'px Arial,sans-serif';
  let ty = S(158);
  terms.forEach(t => { c.fillText(t, S(30), ty); ty += S(45); });

  c.fillStyle = grad;
  c.fillRect(0, H - S(55), W, S(55));

  c.fillStyle = 'rgba(255,255,255,0.90)';
  c.font      = S(CC.backTermsBodySize) + 'px Arial,sans-serif';
  c.textAlign = 'left';
  c.fillText('Valid Until: ' + (AppState.get('expiry') || '—'), S(30), H - S(18));
  c.textAlign = 'right';
  c.fillText('If found, return to Student Affairs Office', W - S(30), H - S(18));
}
