/**
 * canvas.js — Canonical Card Drawing Engine.
 * Base canvas: 1011 × 638 px (CR80 at ~300 DPI).
 *
 * Canonical Contract: drawCard(canvas, template, studentRecord, scale)
 * All positions, font sizes, colors, and layout tokens are read from the canonical template.
 */

// ── IN-MEMORY DECODED IMAGE CACHE ────────────────────────────────
const _imageCache = new Map();

function getCachedImage(src, callback, errorCallback) {
  if (!src) { if (errorCallback) errorCallback(); return; }
  const cached = _imageCache.get(src);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    callback(cached);
    return;
  }
  const img = new Image();
  if (!src.startsWith('data:')) {
    img.crossOrigin = 'anonymous';
  }
  img.onload = () => {
    _imageCache.set(src, img);
    callback(img);
  };
  img.onerror = () => {
    if (errorCallback) errorCallback();
  };
  img.src = src;
}

// Pre-warm cache for default assets immediately
if (typeof window !== 'undefined') {
  const prewarm = () => {
    if (typeof CREST_LARGE !== 'undefined') getCachedImage(CREST_LARGE, () => {});
    if (typeof CREST_SMALL !== 'undefined') getCachedImage(CREST_SMALL, () => {});
    // Pre-warm default verified signature SVG
    const defaultSig = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50"><text x="10" y="40" font-family="cursive" font-size="34" fill="black">VerifiedSID</text></svg>';
    getCachedImage(defaultSig, () => {});
  };
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', prewarm);
  } else {
    prewarm();
  }
}

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
  fieldLabelX: 340, fieldValueX: 435,
  fieldsStartY: 240, fieldSpacing: 80,

  // Bottom-left vitals
  bloodX: 20, bloodY: 600, bloodValueX: 178,
  genoX:  20, genoY:  625,

  // Right column — logo (EBSU Crest Shield above QR code)
  logoX: 805, logoY: 205, logoW: 125, logoH: 125, logoAlpha: 1.0,

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
function getMergedConfig(template) {
  if (template && template.layout) {
    return Object.assign({}, CC_DEFAULTS, template.layout);
  }
  if (typeof CardTemplate !== 'undefined' && CardTemplate.get) {
    const t = CardTemplate.get();
    return Object.assign({}, CC_DEFAULTS, (t && t.layout) || {}, window.CardConfig || {});
  }
  return Object.assign({}, CC_DEFAULTS, window.CardConfig || {});
}

function getMergedColors(template) {
  if (template && template.colors) {
    return template.colors;
  }
  if (typeof CardTemplate !== 'undefined' && CardTemplate.get) {
    const t = CardTemplate.get();
    if (t && t.colors) return t.colors;
  }
  if (typeof AppState !== 'undefined' && AppState.get) {
    return AppState.get('colors') || {};
  }
  return {};
}

// ── AUTO-FIT & NAME WRAPPING TYPOGRAPHY HELPERS ──────────────────
/**
 * Shared Full Name Renderer: Never truncates with ellipsis.
 * 1. Uppercase display (underlying data/signature unchanged).
 * 2. Shrink-to-fit: Starts at baseFontSize, steps down 1px to min 60% of base.
 * 3. 2-Line Wrap: If it doesn't fit at 60%, wraps across exactly two lines.
 * 4. Returns layout metrics so calling code can shift/compress rows below without overlap.
 */
function drawCardName(ctx, rawName, x, y, maxW, baseFontSize, fontWeight = 'bold', fontFamily = 'Arial,sans-serif') {
  const upper = String(rawName || '—').trim().toUpperCase();
  if (!upper || upper === '—') {
    ctx.font = `${fontWeight} ${Math.round(baseFontSize)}px ${fontFamily}`.trim();
    ctx.fillText('—', x, y);
    return { lines: 1, fontSize: baseFontSize, heightUsed: baseFontSize, nextRowOffset: 0, line1: '—', line2: '' };
  }

  const minSingleLineSize = Math.max(6, Math.floor(baseFontSize * 0.60));
  const fontPrefix = fontWeight ? fontWeight + ' ' : '';

  // ── Step 1: Attempt single-line fit from baseFontSize down to 60% ──
  let size = baseFontSize;
  ctx.font = `${fontPrefix}${Math.round(size)}px ${fontFamily}`.trim();
  let textWidth = ctx.measureText(upper).width;

  while (textWidth > maxW && size > minSingleLineSize) {
    size -= 1;
    ctx.font = `${fontPrefix}${Math.round(size)}px ${fontFamily}`.trim();
    textWidth = ctx.measureText(upper).width;
  }

  // If it fits on 1 line:
  if (textWidth <= maxW) {
    ctx.fillText(upper, x, y);
    return {
      lines: 1,
      fontSize: size,
      heightUsed: size,
      nextRowOffset: 0,
      line1: upper,
      line2: ''
    };
  }

  // ── Step 2: Wrap onto TWO lines (never more than two) ──
  const words = upper.split(/\s+/).filter(Boolean);
  let bestSplit = 1;
  let bestScore = Infinity;

  // Find split point that balances the lengths of line 1 and line 2
  for (let i = 1; i < words.length; i++) {
    const l1 = words.slice(0, i).join(' ');
    const l2 = words.slice(i).join(' ');
    const diff = Math.abs(l1.length - l2.length);
    if (diff < bestScore) {
      bestScore = diff;
      bestSplit = i;
    }
  }

  let line1 = words.slice(0, bestSplit).join(' ');
  let line2 = words.slice(bestSplit).join(' ');

  // If only 1 huge word, split in half
  if (!line2 && line1.length > 10) {
    const mid = Math.floor(line1.length / 2);
    line2 = line1.slice(mid);
    line1 = line1.slice(0, mid);
  }

  // Find font size that fits both lines comfortably
  let wrapSize = Math.max(10, Math.floor(baseFontSize * 0.85));
  ctx.font = `${fontPrefix}${Math.round(wrapSize)}px ${fontFamily}`.trim();

  while (
    (ctx.measureText(line1).width > maxW || ctx.measureText(line2).width > maxW) &&
    wrapSize > 9
  ) {
    wrapSize -= 1;
    ctx.font = `${fontPrefix}${Math.round(wrapSize)}px ${fontFamily}`.trim();
  }

  const lineSpacing = Math.round(wrapSize * 1.15);
  ctx.fillText(line1, x, y);
  ctx.fillText(line2, x, y + lineSpacing);

  return {
    lines: 2,
    fontSize: wrapSize,
    heightUsed: wrapSize + lineSpacing,
    nextRowOffset: lineSpacing,
    line1,
    line2
  };
}

function drawFittedText(ctx, text, x, y, maxW, baseFontSize, fontWeight = '', fontFamily = 'Arial,sans-serif') {
  if (!text) text = '—';
  let size = baseFontSize;
  const fontPrefix = fontWeight ? fontWeight + ' ' : '';
  ctx.font = `${fontPrefix}${Math.round(size)}px ${fontFamily}`.trim();
  const initialWidth = ctx.measureText(text).width;

  // Proportional jump directly to approximate target size if oversized
  if (initialWidth > maxW) {
    size = Math.max(13, Math.min(size - 1, Math.floor(baseFontSize * (maxW / initialWidth))));
    ctx.font = `${fontPrefix}${Math.round(size)}px ${fontFamily}`.trim();
    while (size > 13 && ctx.measureText(text).width > maxW) {
      size -= 1;
      ctx.font = `${fontPrefix}${Math.round(size)}px ${fontFamily}`.trim();
    }
  }

  // Graceful fallback if still exceeds at 13px
  let finalText = text;
  if (ctx.measureText(finalText).width > maxW) {
    while (finalText.length > 1 && ctx.measureText(finalText + '…').width > maxW) {
      finalText = finalText.slice(0, -1);
    }
    finalText += '…';
  }

  ctx.fillText(finalText, x, y);
}

function truncateText(ctx, text, maxW) {
  if (!text) return '—';
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
  return text + '…';
}

// ── Base64URL / UUID Converters for Compact Signed QR Links ──────────────
function uuidToB64Url(uuid) {
  try {
    const clean = String(uuid || '').replace(/-/g, '').toLowerCase();
    if (clean.length !== 32) return null;
    let binary = '';
    for (let i = 0; i < 32; i += 2) {
      binary += String.fromCharCode(parseInt(clean.substr(i, 2), 16));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  } catch (e) {
    return null;
  }
}

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
    for (let i = 0; i < 16; i++) {
      hex += binary.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`.toLowerCase();
  } catch (e) {
    return null;
  }
}

function verifyRenderedQR(canvas, expectedText) {
  if (typeof jsQR === 'undefined') return true;
  try {
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imgData.data, canvas.width, canvas.height);
    if (!code || code.data !== expectedText) {
      console.warn('QR self-test mismatch:', { expected: expectedText, got: code?.data });
      return false;
    }
    return true;
  } catch (err) {
    console.warn('QR self-test decode error:', err);
    return false;
  }
}

function buildQRData(st) {
  if (!st) return '';

  const publicBaseUrl = (typeof EBSU_CONFIG !== 'undefined' && EBSU_CONFIG.PUBLIC_BASE_URL)
    ? EBSU_CONFIG.PUBLIC_BASE_URL
    : ((typeof window !== 'undefined' && window.location && window.location.origin && !window.location.origin.startsWith('file:') && !window.location.origin.includes('null'))
      ? window.location.origin
      : 'https://id.ebsu.edu.ng');

  // Case 1: 60s rotating pass (EBSU2 token)
  if (st.token && st.token.startsWith('EBSU2:')) {
    return `${publicBaseUrl}/p/${encodeURIComponent(st.token)}`;
  }
  if (st.qrString && st.qrString.startsWith('EBSU2:')) {
    return `${publicBaseUrl}/p/${encodeURIComponent(st.qrString)}`;
  }

  // Case 2: Already a signed verification link
  if (st.qrString && (st.qrString.startsWith('http://') || st.qrString.startsWith('https://'))) {
    return st.qrString;
  }

  // Case 3: Legacy EBSU1 token -> translate to signed link https://<domain>/c/<id_b64>.<sig>
  if (st.qrString && st.qrString.startsWith('EBSU1:')) {
    const parts = st.qrString.split(':');
    if (parts.length === 3) {
      const b64Id = uuidToB64Url(parts[1]) || parts[1];
      return `${publicBaseUrl}/c/${b64Id}.${parts[2]}`;
    }
  }

  // Case 4: Static printed card with cardId/card_signature
  const rawId = st.cardId || st.card_id || st.id || '00000000-0000-4000-8000-000000000001';
  const b64Id = uuidToB64Url(rawId) || rawId.replace(/[^A-Za-z0-9_-]/g, '');
  const sig = st.card_signature || st.cardSignature || st.sig || 'ED25519_PREVIEW_SIGNATURE';

  return `${publicBaseUrl}/c/${b64Id}.${sig}`;
}

// ── FRONT CARD ───────────────────────────────────────────────────
/**
 * Canonical Render Function: drawCard(canvas, template, st, scale, onComplete)
 * Accepts flexible parameters: (canvas, st, scale, onComplete) OR (canvas, template, st, scale, onComplete)
 */
function drawCard(canvas, arg1, arg2, arg3, arg4) {
  let template = null;
  let st = null;
  let scale = 1;
  let onComplete = null;

  // Polymorphic argument handling for backward compatibility
  if (arg1 && typeof arg1 === 'object' && (arg1.layout || arg1.colors || arg1.institution)) {
    template = arg1;
    st = arg2 || {};
    scale = typeof arg3 === 'number' ? arg3 : 1;
    onComplete = typeof arg4 === 'function' ? arg4 : (typeof arg3 === 'function' ? arg3 : null);
  } else if (arg2 && typeof arg2 === 'object' && typeof arg3 === 'number') {
    // 4-arg call where template is null/undefined: drawCard(canvas, null, st, scale, onComplete)
    template = (typeof CardTemplate !== 'undefined' && CardTemplate.get) ? CardTemplate.get() : null;
    st = arg2 || {};
    scale = arg3;
    onComplete = typeof arg4 === 'function' ? arg4 : null;
  } else {
    // Legacy invocation: drawCard(canvas, st, scale, onComplete)
    template = (typeof CardTemplate !== 'undefined' && CardTemplate.get) ? CardTemplate.get() : null;
    st = arg1 || {};
    scale = typeof arg2 === 'number' ? arg2 : 1;
    onComplete = typeof arg3 === 'function' ? arg3 : (typeof arg4 === 'function' ? arg4 : null);
  }

  const CC = getMergedConfig(template);
  const col = getMergedColors(template);
  const schoolName = (template && template.institution && template.institution.name) || 
                     (typeof AppState !== 'undefined' && AppState.get ? AppState.get('schoolName') : null) || 
                     'EBONYI STATE UNIVERSITY, ABAKALIKI';
  const expiryYear = (st && (st.expiry || st.expiryYear)) ||
                     (template && template.institution && template.institution.expiryYear) || 
                     (typeof AppState !== 'undefined' && AppState.get ? AppState.get('expiry') : null) || 
                     '2029';

  const W  = Math.round(1011 * scale);
  const H  = Math.round(638  * scale);
  canvas.width = W; canvas.height = H;

  const c = canvas.getContext('2d');
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  const S = n => Math.round(n * scale);

  // ── 1. Background & Card Border ─────────────────────────────
  c.fillStyle = col.bodyBg || '#ffffff';
  c.fillRect(0, 0, W, H);

  // Header bar
  c.fillStyle = col.headerBg || '#1558c0';
  c.fillRect(0, 0, W, S(90));

  // University name — centred in header
  c.fillStyle = col.headerText || '#ffffff';
  c.font      = 'bold ' + S(CC.headerFontSize) + 'px Arial,sans-serif';
  c.textAlign = 'center';
  c.fillText(
    schoolName.toUpperCase(),
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

  // Matric row
  c.textAlign = 'left';
  c.fillStyle = col.matricLabel || '#003399';
  c.font      = 'bold ' + S(CC.matricFontSize) + 'px Arial,sans-serif';
  const matLabel  = 'MATRIC NUMBER:';
  const matLabelW = c.measureText(matLabel).width;
  c.fillText(matLabel, S(CC.matricLabelX), S(CC.matricY));

  c.fillStyle = '#4A86E8';
  const matValX = S(CC.matricLabelX) + matLabelW + S(8);
  const matMaxW = Math.max(0, S(CC.qrX - 10) - matValX);
  const studentMatric = st.matric || st.schoolRegNo || st.jambNo || '—';
  drawFittedText(c, studentMatric, matValX, S(CC.matricY), matMaxW, S(CC.matricFontSize));

  // Bottom divider
  c.strokeStyle = '#4A86E8';
  c.lineWidth   = S(2);
  c.beginPath(); c.moveTo(0, S(195)); c.lineTo(W, S(195)); c.stroke();

  // Photo placeholder box
  const PX = S(CC.photoX), PY = S(CC.photoY),
        PW = S(CC.photoW), PH = S(CC.photoH);
  c.fillStyle = col.photoBackground || '#990000';
  c.fillRect(PX, PY, PW, PH);

  // Blood Group & Genotype (Bottom Left)
  c.textAlign = 'left';
  c.fillStyle = col.labelColor || '#000';
  c.font      = 'bold ' + S(CC.bloodFontSize) + 'px Arial,sans-serif';
  c.fillText('Blood Group', S(CC.bloodX), S(CC.bloodY));
  c.fillStyle = col.valueColor || '#222';
  c.font      = S(CC.bloodFontSize) + 'px Arial,sans-serif';
  c.fillText(st.blood || st.bloodGroup || '—', S(CC.bloodValueX), S(CC.bloodY));

  c.fillStyle = col.labelColor || '#000';
  c.font      = 'bold ' + S(CC.bloodFontSize) + 'px Arial,sans-serif';
  c.fillText('Genotype', S(CC.genoX), S(CC.genoY));
  c.fillStyle = col.valueColor || '#222';
  c.font      = S(CC.bloodFontSize) + 'px Arial,sans-serif';
  c.fillText(st.genotype || '—', S(CC.bloodValueX), S(CC.genoY));

  // Centre column data rows
  const studentName = st.fullName || st.name || '—';
  const studentFaculty = st.faculty || '—';
  const studentDept = st.department || st.dept || '—';

  // 1. Draw Name with shrink-to-fit and 2-line wrapping (no ellipsis)
  const nameLabel = 'Name:';
  c.textAlign = 'left';
  c.fillStyle = col.labelColor || '#000000';
  c.font      = 'bold ' + S(CC.fieldFontSize) + 'px Arial,sans-serif';
  const nameLabelY = S(CC.fieldsStartY);
  c.fillText(nameLabel, S(CC.fieldLabelX), nameLabelY);

  const nameLabelW = c.measureText(nameLabel).width;
  const nameValX = S(CC.fieldLabelX) + nameLabelW + S(12);
  const nameMaxW = Math.max(0, S(CC.qrX - 10) - nameValX);

  c.fillStyle = col.valueColor || '#222222';
  const nameRes = drawCardName(c, studentName, nameValX, nameLabelY, nameMaxW, S(CC.fieldFontSize), 'bold', 'Arial,sans-serif');

  // If name took 2 lines, shift subsequent rows down and compress spacing slightly so rows never collide
  const nameOffset = (nameRes && nameRes.lines === 2) ? nameRes.nextRowOffset : 0;
  const subSpacing = nameOffset > 0 ? S(CC.fieldSpacing * 0.88) : S(CC.fieldSpacing);

  const subRows = [
    ['Faculty:',     studentFaculty],
    ['Department:',  studentDept],
    ['Expiry Year:', expiryYear.toString()]
  ];

  subRows.forEach(([label, val], idx) => {
    const ty = S(CC.fieldsStartY) + nameOffset + (idx + 1) * subSpacing;
    c.textAlign = 'left';
    c.fillStyle = col.labelColor || '#000000';
    c.font      = 'bold ' + S(CC.fieldFontSize) + 'px Arial,sans-serif';
    c.fillText(label, S(CC.fieldLabelX), ty);

    const labelW = c.measureText(label).width;
    const rowValX = S(CC.fieldLabelX) + labelW + S(12);
    const fMaxW = Math.max(0, S(CC.qrX - 10) - rowValX);

    c.fillStyle = col.valueColor || '#222222';
    drawFittedText(c, val || '—', rowValX, ty, fMaxW, S(CC.fieldFontSize), '');
  });

  // Signature label
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

  // Signature placeholder if not uploaded
  if (!st.sig && !st.signatureUrl) {
    const sigCX = S(CC.sigBoxX) + S(CC.sigBoxW) / 2;
    const sigCY = S(CC.sigBoxY) + S(CC.sigBoxH) / 2 + S(5);
    c.fillStyle = '#aaaaaa';
    c.font      = 'italic ' + S(13) + 'px Arial,sans-serif';
    c.textAlign = 'center';
    c.fillText('sign here', sigCX, sigCY);
  }

  // ── 2. Cached Media Chain: Watermark -> Crest -> QR -> Sig -> Photo ───
  const defaultLargeCrest = typeof CREST_LARGE !== 'undefined' ? CREST_LARGE : 'crest_large.png.jpeg';
  const customLogo = (template && template.institution && template.institution.crestUrl) || 
                     (typeof AppState !== 'undefined' && AppState.get ? AppState.get('customLogo') : null);
  const logoSrc = customLogo || defaultLargeCrest;

  getCachedImage(logoSrc, (crestL) => {
    const wm = S(CC.watermarkSize);
    c.save();
    c.globalAlpha = CC.watermarkAlpha;
    c.drawImage(crestL, S(505) - wm / 2, S(415) - wm / 2, wm, wm);
    c.restore();
    stepLogo(crestL);
  }, () => stepLogo(null));

  function stepLogo(cachedLogo) {
    if (cachedLogo) {
      c.save();
      c.globalAlpha = (typeof CC.logoAlpha === 'number' && CC.logoAlpha > 0.05) ? CC.logoAlpha : 1.0;
      c.drawImage(cachedLogo, S(CC.logoX), S(CC.logoY), S(CC.logoW), S(CC.logoH));
      c.restore();
      stepQR();
    } else {
      getCachedImage(logoSrc, (img) => {
        c.save();
        c.globalAlpha = (typeof CC.logoAlpha === 'number' && CC.logoAlpha > 0.05) ? CC.logoAlpha : 1.0;
        c.drawImage(img, S(CC.logoX), S(CC.logoY), S(CC.logoW), S(CC.logoH));
        c.restore();
        stepQR();
      }, () => stepQR());
    }
  }

  function stepQR() {
    const qrString = buildQRData(st);
    if (typeof QRGen !== 'undefined' && QRGen.generate && qrString) {
      const q = QRGen.generate(qrString);
      const targetSize = S(CC.qrSize);
      // Integer pixel sizing per module (min 2px) for ultra-crisp square edges at 300 DPI
      const px = Math.max(2, Math.floor(targetSize / (q.size + 8)));
      const qc = document.createElement('canvas');
      QRGen.drawToCanvas(qc, qrString, px);

      c.save();
      const actualSize = qc.width; // (q.size + 8) * px
      const drawX = S(CC.qrX) + Math.round((targetSize - actualSize) / 2);
      const drawY = S(CC.qrY) + Math.round((targetSize - actualSize) / 2);

      // Dedicated solid white backing rectangle with quiet zone (prevents watermark / background interference)
      c.fillStyle = '#ffffff';
      c.fillRect(drawX - S(4), drawY - S(4), actualSize + S(8), actualSize + S(8));

      c.imageSmoothingEnabled = false;
      c.drawImage(qc, drawX, drawY);
      c.restore();

      // Automated self-test check
      if (typeof jsQR !== 'undefined') {
        verifyRenderedQR(qc, qrString);
      }
    }
    stepSig();
  }

  // ── SMART IMAGE & SIGNATURE PROCESSING HELPERS ─────────────────
  function drawImageCover(ctx, img, x, y, w, h) {
    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;
    if (!imgW || !imgH) {
      ctx.drawImage(img, x, y, w, h);
      return;
    }
    const imgRatio = imgW / imgH;
    const targetRatio = w / h;

    let sx, sy, sWidth, sHeight;
    if (imgRatio > targetRatio) {
      sHeight = imgH;
      sWidth = imgH * targetRatio;
      sx = (imgW - sWidth) / 2;
      sy = 0;
    } else {
      sWidth = imgW;
      sHeight = imgW / targetRatio;
      sx = 0;
      sy = Math.max(0, Math.min(imgH - sHeight, (imgH - sHeight) * 0.18));
    }
    ctx.drawImage(img, sx, sy, sWidth, sHeight, x, y, w, h);
  }

  function drawCleanSignature(ctx, img, targetX, targetY, targetW, targetH) {
    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;
    if (!nw || !nh) {
      ctx.drawImage(img, targetX, targetY, targetW, targetH);
      return;
    }

    try {
      const oc = document.createElement('canvas');
      oc.width = nw;
      oc.height = nh;
      const octx = oc.getContext('2d');
      octx.drawImage(img, 0, 0);

      const imgData = octx.getImageData(0, 0, nw, nh);
      const d = imgData.data;

      let minX = nw, minY = nh, maxX = 0, maxY = 0;
      let foundInk = false;

      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const brightness = (r + g + b) / 3;
        const isBlueInk = (b > r + 15 && b > g + 10);
        const isDarkInk = (brightness < 165);

        if (isBlueInk || isDarkInk) {
          foundInk = true;
          const px = (i / 4) % nw;
          const py = Math.floor((i / 4) / nw);
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;

          if (isBlueInk) {
            d[i] = Math.max(0, r - 30);
            d[i + 1] = Math.max(0, g - 20);
            d[i + 2] = Math.min(255, b + 20);
            d[i + 3] = 255;
          } else {
            d[i] = Math.max(0, r * 0.5);
            d[i + 1] = Math.max(0, g * 0.5);
            d[i + 2] = Math.max(0, b * 0.6);
            d[i + 3] = 255;
          }
        } else {
          d[i + 3] = 0; // Remove paper background
        }
      }

      if (foundInk && maxX > minX && maxY > minY) {
        octx.putImageData(imgData, 0, 0);
        const pad = 4;
        const cropX = Math.max(0, minX - pad);
        const cropY = Math.max(0, minY - pad);
        const cropW = Math.min(nw - cropX, (maxX - minX) + pad * 2);
        const cropH = Math.min(nh - cropY, (maxY - minY) + pad * 2);

        const ratio = cropW / cropH;
        const targetRatio = targetW / targetH;
        let dw, dh;
        if (ratio > targetRatio) {
          dw = targetW * 0.92;
          dh = dw / ratio;
        } else {
          dh = targetH * 0.88;
          dw = dh * ratio;
        }
        const dx = targetX + (targetW - dw) / 2;
        const dy = targetY + (targetH - dh) / 2;
        ctx.drawImage(oc, cropX, cropY, cropW, cropH, dx, dy, dw, dh);
        return;
      }
    } catch (err) {
      console.warn('Signature processing fallback:', err);
    }

    const ratio = nw / nh;
    const targetRatio = targetW / targetH;
    let dw, dh;
    if (ratio > targetRatio) {
      dw = targetW * 0.92;
      dh = dw / ratio;
    } else {
      dh = targetH * 0.88;
      dw = dh * ratio;
    }
    const dx = targetX + (targetW - dw) / 2;
    const dy = targetY + (targetH - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  function stepSig() {
    const sigSrc = st.sig || st.signatureUrl;
    if (!sigSrc) { stepPhoto(); return; }
    getCachedImage(sigSrc, (img) => {
      drawCleanSignature(c, img, S(CC.sigBoxX), S(CC.sigBoxY), S(CC.sigBoxW), S(CC.sigBoxH));
      stepPhoto();
    }, () => stepPhoto());
  }

  function stepPhoto() {
    const photoSrc = st.photo || st.photoUrl;
    if (!photoSrc) {
      drawPhotoPlaceholder();
      if (typeof onComplete === 'function') onComplete();
      return;
    }
    getCachedImage(photoSrc, (img) => {
      drawImageCover(c, img, PX, PY, PW, PH);
      if (typeof onComplete === 'function') onComplete();
    }, () => {
      drawPhotoPlaceholder();
      if (typeof onComplete === 'function') onComplete();
    });
  }

  function drawPhotoPlaceholder() {
    c.save();
    // Subdued avatar silhouette
    c.fillStyle = 'rgba(255, 255, 255, 0.22)';
    const headCX = PX + PW / 2;
    const headCY = PY + PH * 0.38;
    const headR = PW * 0.22;
    c.beginPath();
    c.arc(headCX, headCY, headR, 0, Math.PI * 2);
    c.fill();

    c.beginPath();
    c.arc(headCX, PY + PH * 0.94, PW * 0.40, Math.PI, 0);
    c.fill();

    // Subtle helper text
    c.fillStyle = 'rgba(255, 255, 255, 0.9)';
    c.font = 'bold ' + S(11) + 'px Arial, sans-serif';
    c.textAlign = 'center';
    c.fillText('PASSPORT PHOTO', headCX, PY + PH - S(14));
    c.restore();
  }
}

// ── BACK CARD ────────────────────────────────────────────────────
function drawBackCard(canvas, arg1, arg2, arg3) {
  let template = null;
  let st = null;
  let scale = 1;

  if (arg1 && typeof arg1 === 'object' && (arg1.layout || arg1.colors || arg1.institution)) {
    template = arg1;
    st = arg2 || {};
    scale = typeof arg3 === 'number' ? arg3 : 1;
  } else if (arg2 && typeof arg2 === 'object' && typeof arg3 === 'number') {
    // 4-arg call where template is null/undefined: drawBackCard(canvas, null, st, scale)
    template = (typeof CardTemplate !== 'undefined' && CardTemplate.get) ? CardTemplate.get() : null;
    st = arg2 || {};
    scale = arg3;
  } else {
    template = (typeof CardTemplate !== 'undefined' && CardTemplate.get) ? CardTemplate.get() : null;
    st = arg1 || {};
    scale = typeof arg2 === 'number' ? arg2 : 1;
  }

  const CC = getMergedConfig(template);
  const schoolName = (template && template.institution && template.institution.name) || 
                     (typeof AppState !== 'undefined' && AppState.get ? AppState.get('schoolName') : null) || 
                     'EBONYI STATE UNIVERSITY';
  const expiryYear = (st && (st.expiry || st.expiryYear)) ||
                     (template && template.institution && template.institution.expiryYear) || 
                     (typeof AppState !== 'undefined' && AppState.get ? AppState.get('expiry') : null) || 
                     '2029';

  const W  = Math.round(1011 * scale);
  const H  = Math.round(638  * scale);
  canvas.width = W; canvas.height = H;

  const c = canvas.getContext('2d');
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
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
    schoolName.toUpperCase(),
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
  const sessionText = (st && st.session) ? `Issued: ${st.session}  •  ` : '';
  c.fillText(sessionText + 'Valid Until: ' + expiryYear, S(30), H - S(18));
  c.textAlign = 'right';
  c.fillText('If found, return to Student Affairs Office', W - S(30), H - S(18));
}

// Canonical Render Function Alias
const renderCard = drawCard;

if (typeof window !== 'undefined') {
  window.drawCardName = drawCardName;
  window.drawCard = drawCard;
  window.drawBackCard = drawBackCard;
  window.CardCanvas = window.CardCanvas || {};
  window.CardCanvas.drawCardName = drawCardName;
  window.CardCanvas.drawCard = drawCard;
  window.CardCanvas.drawBackCard = drawBackCard;
}
