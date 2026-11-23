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
  matricFontSize:   32,   // the reg number itself (v2: was 22)
  matricLabelFontSize: 19,
  fieldFontSize:    22,
  bloodFontSize:    20,
  sigLabelFontSize: 18,   // v2: was 14

  // Photo (left column)
  photoX: 20,  photoY: 210, photoW: 310, photoH: 360,

  // Matric row
  matricLabelX: 20, matricY: 189,

  // Centre column
  fieldLabelX: 340, fieldValueX: 435,
  fieldsStartY: 240, fieldSpacing: 80,

  // Bottom-left vitals
  bloodX: 20, bloodY: 600, bloodValueX: 178,
  genoX:  20, genoY:  625,

  // Right column — logo (EBSU Crest Shield above QR code)
  logoX: 805, logoY: 205, logoW: 125, logoH: 125, logoAlpha: 1.0,

  // Right column — QR code
  qrX: 760, qrY: 360, qrSize: 215,

  // Centre column, under the details — signature label (v2: moved from the right column)
  sigLabelX: 340, sigLabelY: 524,

  // Centre column — signature area, 250 x 58 (v3: was 400 x 92, too big)
  sigBoxX: 340, sigBoxY: 536, sigBoxW: 250, sigBoxH: 58,

  // Layout version. Saved templates older than this get the newer positions
  // for the reg number, signature and QR (see getMergedConfig).
  layoutVersion: 3,

  // ── Adjustable in the Card Design Lab (defaults = the standard EBSU card) ──
  headerH: 90,                       // header band height
  titleX: 505, titleY: 135,          // card title (centre x, baseline y)
  matricW: 955,                      // width available to the reg number row
  fieldsW: 410,                      // width available to name / faculty / department
  watermarkX: 505, watermarkY: 415,  // watermark centre
  showBorder: true, showTitle: true, showMatricLines: true,
  showWatermark: true, showLogo: true, showVitals: true, showSignature: true,

  // Back card
  backHeaderH: 80, backTermsY: 120, backTermsSpacing: 45, backFooterH: 55,

  // Centre watermark
  watermarkAlpha: 0.10, watermarkSize: 340,

  // Back card
  backHeaderFontSize: 28,
  backTermsHeadSize:  20,
  backTermsBodySize:  18,

  // Per-part styling and layer order (Card Design Lab). Empty = standard look.
  fx: {},
  order: null
};

// Words printed on the card that a school can change in the Card Design Lab.
const CARD_TEXT_DEFAULTS = {
  cardTitle: 'STUDENT IDENTITY CARD',
  matricLabel: 'MATRIC NO.',
  signatureLabel: 'Signature',
  nameLabel: 'Name:',
  facultyLabel: 'Faculty:',
  deptLabel: 'Department:',
  expiryLabel: 'Expiry Year:',
  bloodLabel: 'Blood Group',
  genoLabel: 'Genotype',
  termsTitle: 'TERMS & CONDITIONS OF USE',
  terms: [
    '1. This card is the property of the University and must be returned on demand.',
    '2. This card is strictly non-transferable. Misuse attracts disciplinary action.',
    '3. Loss must be reported immediately to the Student Affairs Office.',
    '4. Carry this card at all times within the University premises.',
    '5. Present for access to library, exam halls and academic facilities.',
    '6. Tampering renders this card invalid and attracts disciplinary action.'
  ],
  backFooterRight: 'If found, return to Student Affairs Office'
};

function getMergedText(template) {
  let src = template && template.text;
  if (!src && typeof CardTemplate !== 'undefined' && CardTemplate.get) {
    const t = CardTemplate.get();
    src = t && t.text;
  }
  const out = Object.assign({}, CARD_TEXT_DEFAULTS, src || {});
  if (!Array.isArray(out.terms) || !out.terms.length) out.terms = CARD_TEXT_DEFAULTS.terms.slice();
  return out;
}

// ── CONFIG HELPER ────────────────────────────────────────────────
// Keys that v2 resized/moved. A saved template older than v2 still carries the
// old small values, so these are reset to the v2 defaults for it.
const CC_V2_KEYS = [
  'matricFontSize', 'matricLabelFontSize', 'matricY', 'sigLabelFontSize',
  'qrX', 'qrY', 'qrSize', 'sigLabelX', 'sigLabelY', 'sigBoxX', 'sigBoxY', 'sigBoxW', 'sigBoxH'
];

function upgradeLayout(merged, savedLayout) {
  if (!savedLayout || Number(savedLayout.layoutVersion || 1) < 2) {
    CC_V2_KEYS.forEach(k => { merged[k] = CC_DEFAULTS[k]; });
    merged.layoutVersion = 3;
  } else if (Number(savedLayout.layoutVersion) < 3) {
    // v3: the signature area was too big; saved designs get the smaller one
    ['sigLabelY', 'sigBoxX', 'sigBoxY', 'sigBoxW', 'sigBoxH'].forEach(k => { merged[k] = CC_DEFAULTS[k]; });
    merged.layoutVersion = 3;
  }
  return merged;
}

function getMergedConfig(template) {
  if (template && template.layout) {
    return upgradeLayout(Object.assign({}, CC_DEFAULTS, template.layout), template.layout);
  }
  if (typeof CardTemplate !== 'undefined' && CardTemplate.get) {
    const t = CardTemplate.get();
    const saved = (t && t.layout) || null;
    return Object.assign(upgradeLayout(Object.assign({}, CC_DEFAULTS, saved || {}), saved), window.CardConfig || {});
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
    : 'https://ebsu-id-card.vercel.app';

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
  // st.sig is often the signature IMAGE (a data: URL), never a card signature, so it is only
  // used when it looks like a short base64url signature.
  const sigAlt = (typeof st.sig === 'string' && /^[A-Za-z0-9_-]{20,200}$/.test(st.sig)) ? st.sig : '';
  const sig = st.card_signature || st.cardSignature || sigAlt || 'ED25519_PREVIEW_SIGNATURE';

  return `${publicBaseUrl}/c/${b64Id}.${sig}`;
}

// ── FRONT CARD ───────────────────────────────────────────────────
/**
 * Canonical Render Function: drawCard(canvas, template, st, scale, onComplete)
 * Accepts flexible parameters: (canvas, st, scale, onComplete) OR (canvas, template, st, scale, onComplete)
 */
// ── PER-ELEMENT STYLE (opacity, colour, font, layer order …) ─────
const FX_FONTS = {
  arial: 'Arial,sans-serif',
  verdana: 'Verdana,Geneva,sans-serif',
  trebuchet: '"Trebuchet MS",sans-serif',
  tahoma: 'Tahoma,sans-serif',
  georgia: 'Georgia,serif',
  times: '"Times New Roman",Times,serif',
  garamond: 'Garamond,"Times New Roman",serif',
  courier: '"Courier New",monospace',
  impact: 'Impact,"Arial Narrow",sans-serif'
};
// Bottom to top. The last one is drawn on top of everything else.
const CARD_LAYER_DEFAULT = ['border', 'header', 'watermark', 'title', 'matric', 'blood', 'geno', 'name', 'faculty',
  'dept', 'expiry', 'sigLabel', 'signature', 'logo', 'qr', 'photo'];
const CARD_LEGACY_TOGGLE = {
  border: 'showBorder', title: 'showTitle', logo: 'showLogo', signature: 'showSignature',
  sigLabel: 'showSignature', watermark: 'showWatermark', blood: 'showVitals', geno: 'showVitals'
};

function cardLayerOrder(order) {
  const out = [];
  (Array.isArray(order) ? order : []).forEach(id => {
    if (CARD_LAYER_DEFAULT.includes(id) && !out.includes(id)) out.push(id);
  });
  CARD_LAYER_DEFAULT.forEach(id => { if (!out.includes(id)) out.push(id); });
  return out;
}

function cardElementShown(L, id) {
  const f = (L && L.fx && L.fx[id]) || {};
  if (f.hidden === true) return false;
  const k = CARD_LEGACY_TOGGLE[id];
  return !(k && L[k] === false);
}

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
    template = (typeof CardTemplate !== 'undefined' && CardTemplate.get) ? CardTemplate.get() : null;
    st = arg2 || {};
    scale = arg3;
    onComplete = typeof arg4 === 'function' ? arg4 : null;
  } else {
    template = (typeof CardTemplate !== 'undefined' && CardTemplate.get) ? CardTemplate.get() : null;
    st = arg1 || {};
    scale = typeof arg2 === 'number' ? arg2 : 1;
    onComplete = typeof arg3 === 'function' ? arg3 : (typeof arg4 === 'function' ? arg4 : null);
  }

  const CC = getMergedConfig(template);
  const col = getMergedColors(template);
  const TX = getMergedText(template);
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

  const FXo = id => (CC.fx && CC.fx[id]) || {};
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const fam = f => FX_FONTS[f.font] || 'Arial,sans-serif';
  // Weight for the value text; def is the standard weight for that part.
  const wt = (f, def) => {
    const v = f.weight;
    const base = v === 'bold' ? 'bold' : v === 'normal' ? '' : v === 'light' ? '300' : def;
    return ((f.italic ? 'italic ' : '') + base).trim();
  };
  const lwt = (f, def) => {
    const v = f.labelWeight;
    const base = v === 'bold' ? 'bold' : v === 'normal' ? '' : v === 'light' ? '300' : def;
    return ((f.italic ? 'italic ' : '') + base).trim();
  };
  const fontStr = (w, size, family) => (w ? w + ' ' : '') + Math.round(size) + 'px ' + family;

  const studentName = st.fullName || st.name || '—';
  const studentFaculty = st.faculty || '—';
  const studentDept = st.department || st.dept || '—';
  const studentMatric = st.matric || st.schoolRegNo || st.jambNo || '—';

  // Everything the card needs is loaded first, then drawn in layer order.
  const defaultLargeCrest = typeof CREST_LARGE !== 'undefined' ? CREST_LARGE : 'crest_large.png.jpeg';
  const customLogo = (template && template.institution && template.institution.crestUrl) ||
                     (typeof AppState !== 'undefined' && AppState.get ? AppState.get('customLogo') : null);
  const logoSrc = customLogo || defaultLargeCrest;
  const sigSrc = st.sig || st.signatureUrl;
  const photoSrc = st.photo || st.photoUrl;
  const imgs = {};
  let pending = 1;
  function want(key, src) {
    if (!src) return;
    pending++;
    getCachedImage(src, im => { imgs[key] = im; settle(); }, () => settle());
  }
  // If the card is redrawn while images are still loading (photo, then signature), only the
  // newest draw may paint, so an older, slower draw can never wipe the newer one.
  const drawId = canvas.__cardDrawId = (canvas.__cardDrawId || 0) + 1;
  function settle() {
    if (--pending !== 0) return;
    if (canvas.__cardDrawId !== drawId) { if (typeof onComplete === 'function') onComplete(); return; }
    render();
  }
  want('crest', logoSrc);
  if (cardElementShown(CC, 'signature')) want('sig', sigSrc);
  want('photo', photoSrc);
  settle();

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
        if (d[i + 3] < 40) continue;   // already transparent (a cleaned signature): leave it empty
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
          dw = targetW * 0.98;
          dh = dw / ratio;
        } else {
          dh = targetH * 0.98;
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



  function roundPath(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function imageFilter(f) {
    const parts = [];
    if (f.gray > 0) parts.push('grayscale(' + clamp01(f.gray) + ')');
    if (f.blur > 0) parts.push('blur(' + S(f.blur) + 'px)');
    if (typeof f.bright === 'number' && f.bright !== 1) parts.push('brightness(' + Math.max(0.2, Math.min(2, f.bright)) + ')');
    return parts.length ? parts.join(' ') : 'none';
  }

  function render() {
    // Card background
    c.fillStyle = col.bodyBg || '#ffffff';
    c.fillRect(0, 0, W, H);

    // The name can wrap onto two lines; measure it first so the rows below never collide.
    const sc = document.createElement('canvas').getContext('2d');
    const fN = FXo('name');
    const nameLabelText = TX.nameLabel;
    const nSize = S(fN.size || CC.fieldFontSize);
    if ('letterSpacing' in sc && fN.letterSpacing) sc.letterSpacing = S(fN.letterSpacing) + 'px';
    sc.font = fontStr(lwt(fN, 'bold'), nSize, fam(fN));
    const nameValX0 = S(CC.fieldLabelX) + sc.measureText(nameLabelText).width + S(12);
    const nameMaxW0 = Math.max(0, S(CC.fieldLabelX + CC.fieldsW) - nameValX0);
    const nameRes = drawCardName(sc, studentName, nameValX0, 0, nameMaxW0, nSize, wt(fN, 'bold'), fam(fN));
    const nameOffset = (nameRes && nameRes.lines === 2) ? nameRes.nextRowOffset : 0;
    const subSpacing = nameOffset > 0 ? S(CC.fieldSpacing * 0.88) : S(CC.fieldSpacing);
    const rowY = idx => S(CC.fieldsStartY) + (idx === 0 ? 0 : nameOffset + idx * subSpacing);

    function row(id, label, val, idx, isName) {
      const f = FXo(id);
      const size = S(f.size || CC.fieldFontSize);
      const x = S(CC.fieldLabelX), y = rowY(idx);
      c.textAlign = 'left';
      c.fillStyle = f.labelColor || col.labelColor || '#000000';
      c.font = fontStr(lwt(f, 'bold'), size, fam(f));
      c.fillText(label, x, y);
      const vx = x + c.measureText(label).width + S(12);
      const maxW = Math.max(0, S(CC.fieldLabelX + CC.fieldsW) - vx);
      c.fillStyle = f.color || col.valueColor || '#222222';
      if (isName) drawCardName(c, val, vx, y, maxW, size, wt(f, 'bold'), fam(f));
      else drawFittedText(c, val || '—', vx, y, maxW, size, wt(f, ''), fam(f));
    }

    function vital(id, label, val, x, y) {
      const f = FXo(id);
      const size = S(f.size || CC.bloodFontSize);
      c.textAlign = 'left';
      c.fillStyle = f.labelColor || col.labelColor || '#000';
      c.font = fontStr(lwt(f, 'bold'), size, fam(f));
      c.fillText(label, S(x), S(y));
      c.fillStyle = f.color || col.valueColor || '#222';
      c.font = fontStr(wt(f, ''), size, fam(f));
      c.fillText(val, S(CC.bloodValueX), S(y));
    }

    const PX = S(CC.photoX), PY = S(CC.photoY), PW = S(CC.photoW), PH = S(CC.photoH);
    const bandTop = CC.matricY - Math.round(CC.matricFontSize * 1.22);
    const bandBottom = CC.matricY + 14;

    // Centre point of each element (card pixels), used when it is rotated.
    const CENTER = {
      title:   () => ({ x: CC.titleX, y: CC.titleY - CC.titleFontSize * 0.35 }),
      matric:  () => ({ x: CC.matricLabelX + Math.min(CC.matricW, 520) / 2, y: CC.matricY - CC.matricFontSize * 0.35 }),
      name:    () => ({ x: CC.fieldLabelX + CC.fieldsW / 2, y: CC.fieldsStartY - 8 }),
      faculty: () => ({ x: CC.fieldLabelX + CC.fieldsW / 2, y: CC.fieldsStartY + CC.fieldSpacing - 8 }),
      dept:    () => ({ x: CC.fieldLabelX + CC.fieldsW / 2, y: CC.fieldsStartY + 2 * CC.fieldSpacing - 8 }),
      expiry:  () => ({ x: CC.fieldLabelX + CC.fieldsW / 2, y: CC.fieldsStartY + 3 * CC.fieldSpacing - 8 }),
      blood:   () => ({ x: CC.bloodX + 90, y: CC.bloodY - 8 }),
      geno:    () => ({ x: CC.genoX + 90, y: CC.genoY - 8 }),
      sigLabel:() => ({ x: CC.sigLabelX + 40, y: CC.sigLabelY - 6 }),
      logo:    () => ({ x: CC.logoX + CC.logoW / 2, y: CC.logoY + CC.logoH / 2 }),
      watermark: () => ({ x: CC.watermarkX, y: CC.watermarkY }),
    };

    const DRAW = {
      border(f) {
        c.strokeStyle = f.color || col.borderColor || '#6ab0e0';
        c.lineWidth = S(f.width || 2);
        c.strokeRect(S(1), S(1), W - S(2), H - S(2));
      },
      header(f) {
        c.fillStyle = col.headerBg || '#1558c0';
        c.fillRect(0, 0, W, S(CC.headerH));
        c.fillStyle = f.color || col.headerText || '#ffffff';
        c.font = fontStr(wt(f, 'bold'), S(CC.headerFontSize), fam(f));
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(schoolName.toUpperCase(), S(505), S(CC.headerH / 2 + 2), S(971));
        c.textBaseline = 'alphabetic';
      },
      title(f) {
        c.fillStyle = f.color || col.titleColor || '#CC0000';
        c.font = fontStr(wt(f, 'bold'), S(CC.titleFontSize), fam(f));
        c.textAlign = 'center';
        c.fillText(TX.cardTitle, S(CC.titleX), S(CC.titleY), S(971));
      },
      matric(f) {
        const lineCol = col.lineColor || '#4A86E8';
        if (CC.showMatricLines !== false) {
          c.strokeStyle = lineCol;
          c.lineWidth = S(2);
          c.beginPath(); c.moveTo(0, S(bandTop)); c.lineTo(W, S(bandTop)); c.stroke();
          c.beginPath(); c.moveTo(0, S(bandBottom)); c.lineTo(W, S(bandBottom)); c.stroke();
        }
        c.textAlign = 'left';
        c.fillStyle = f.labelColor || col.matricLabel || '#003399';
        c.font = fontStr(lwt(f, 'bold'), S(CC.matricLabelFontSize || 19), fam(f));
        const matLabelW = c.measureText(TX.matricLabel).width;
        c.fillText(TX.matricLabel, S(CC.matricLabelX), S(CC.matricY));
        c.fillStyle = f.color || col.matricValue || '#0B1F4D';
        const matValX = S(CC.matricLabelX) + matLabelW + S(14);
        const matMaxW = Math.max(0, S(CC.matricLabelX + CC.matricW) - matValX);
        drawFittedText(c, studentMatric, matValX, S(CC.matricY), matMaxW, S(f.size || CC.matricFontSize), wt(f, 'bold'), fam(f));
      },
      blood(f) { vital('blood', TX.bloodLabel, st.blood || st.bloodGroup || '—', CC.bloodX, CC.bloodY); },
      geno(f)  { vital('geno', TX.genoLabel, st.genotype || '—', CC.genoX, CC.genoY); },
      name()    { row('name', TX.nameLabel, studentName, 0, true); },
      faculty() { row('faculty', TX.facultyLabel, studentFaculty, 1, false); },
      dept()    { row('dept', TX.deptLabel, studentDept, 2, false); },
      expiry()  { row('expiry', TX.expiryLabel, expiryYear.toString(), 3, false); },
      sigLabel(f) {
        c.fillStyle = f.color || col.labelColor || '#000';
        c.font = fontStr(wt(f, 'bold'), S(f.size || CC.sigLabelFontSize), fam(f));
        c.textAlign = 'left';
        c.fillText(TX.signatureLabel, S(CC.sigLabelX), S(CC.sigLabelY));
      },
      signature(f) {
        c.strokeStyle = '#9AA3B2';
        c.lineWidth = S(1.5);
        c.beginPath();
        c.moveTo(S(CC.sigBoxX), S(CC.sigBoxY + CC.sigBoxH));
        c.lineTo(S(CC.sigBoxX + CC.sigBoxW), S(CC.sigBoxY + CC.sigBoxH));
        c.stroke();
        if (!sigSrc) {
          c.fillStyle = '#aaaaaa';
          c.font = 'italic ' + S(20) + 'px Arial,sans-serif';
          c.textAlign = 'center';
          c.fillText('sign here', S(CC.sigBoxX) + S(CC.sigBoxW) / 2, S(CC.sigBoxY) + S(CC.sigBoxH) / 2 + S(8));
        } else if (imgs.sig) {
          drawCleanSignature(c, imgs.sig, S(CC.sigBoxX), S(CC.sigBoxY), S(CC.sigBoxW), S(CC.sigBoxH));
        }
      },
      watermark(f) {
        if (!imgs.crest) return;
        const wm = S(CC.watermarkSize);
        c.globalAlpha *= clamp01(CC.watermarkAlpha);
        if ('filter' in c) c.filter = imageFilter(f);
        c.drawImage(imgs.crest, S(CC.watermarkX) - wm / 2, S(CC.watermarkY) - wm / 2, wm, wm);
      },
      logo(f) {
        if (!imgs.crest) return;
        c.globalAlpha *= (typeof CC.logoAlpha === 'number' && CC.logoAlpha > 0.05) ? CC.logoAlpha : 1.0;
        if ('filter' in c) c.filter = imageFilter(f);
        if (f.radius > 0) {
          roundPath(S(CC.logoX), S(CC.logoY), S(CC.logoW), S(CC.logoH), S(f.radius));
          c.clip();
        }
        c.drawImage(imgs.crest, S(CC.logoX), S(CC.logoY), S(CC.logoW), S(CC.logoH));
      },
      qr() {
        const qrString = buildQRData(st);
        if (typeof QRGen === 'undefined' || !QRGen.generate || !qrString) return;
        const q = QRGen.generate(qrString);
        const targetSize = S(CC.qrSize);
        // Whole pixels per module (at least 2) keep the squares crisp at print size
        const px = Math.max(2, Math.floor(targetSize / (q.size + 8)));
        const qc = document.createElement('canvas');
        QRGen.drawToCanvas(qc, qrString, px);
        const actualSize = qc.width;
        const drawX = S(CC.qrX) + Math.round((targetSize - actualSize) / 2);
        const drawY = S(CC.qrY) + Math.round((targetSize - actualSize) / 2);
        // Solid white backing so nothing underneath can disturb the scan
        c.fillStyle = '#ffffff';
        c.fillRect(drawX - S(4), drawY - S(4), actualSize + S(8), actualSize + S(8));
        c.imageSmoothingEnabled = false;
        c.drawImage(qc, drawX, drawY);
        if (typeof jsQR !== 'undefined') verifyRenderedQR(qc, qrString);
      },
      photo(f) {
        c.fillStyle = col.photoBackground || '#990000';
        if (f.radius > 0) {
          roundPath(PX, PY, PW, PH, S(f.radius));
          c.fill();
          c.save();
          roundPath(PX, PY, PW, PH, S(f.radius));
          c.clip();
        } else {
          c.fillRect(PX, PY, PW, PH);
          c.save();
        }
        if (imgs.photo) drawImageCover(c, imgs.photo, PX, PY, PW, PH);
        else drawPhotoPlaceholder();
        c.restore();
      }
    };

    cardLayerOrder(CC.order).forEach(id => {
      if (!cardElementShown(CC, id) || !DRAW[id]) return;
      const f = FXo(id);
      c.save();
      try {
        c.globalAlpha = (typeof f.opacity === 'number') ? clamp01(f.opacity) : 1;
        if (f.dx || f.dy) c.translate(S(f.dx || 0), S(f.dy || 0));
        if (f.rotate && CENTER[id]) {
          const m = CENTER[id]();
          c.translate(S(m.x), S(m.y));
          c.rotate(f.rotate * Math.PI / 180);
          c.translate(-S(m.x), -S(m.y));
        }
        if (f.letterSpacing && 'letterSpacing' in c) c.letterSpacing = S(f.letterSpacing) + 'px';
        DRAW[id](f);
      } catch (err) {
        console.warn('Card part could not be drawn: ' + id, err);
      }
      c.restore();
    });

    if (typeof onComplete === 'function') onComplete();
  }

  function drawPhotoPlaceholder() {
    const PX = S(CC.photoX), PY = S(CC.photoY), PW = S(CC.photoW), PH = S(CC.photoH);
    c.save();
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

  const col = getMergedColors(template);
  const TX = getMergedText(template);
  const band = col.headerBg || '#1a3a8a';

  c.fillStyle = col.bodyBg || '#fff';
  c.fillRect(0, 0, W, H);

  if (CC.showBorder !== false) {
    c.strokeStyle = col.borderColor || '#6ab0e0';
    c.lineWidth   = S(2);
    c.strokeRect(S(1), S(1), W - S(2), H - S(2));
  }

  c.fillStyle = band;
  c.fillRect(0, 0, W, S(CC.backHeaderH));

  c.fillStyle = col.headerText || '#fff';
  c.font      = 'bold ' + S(CC.backHeaderFontSize) + 'px Arial,sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(schoolName.toUpperCase(), W / 2, S(CC.backHeaderH / 2 + 2), S(951));
  c.textBaseline = 'alphabetic';

  c.fillStyle = col.titleColor || '#cc0000';
  c.fillRect(0, S(CC.backHeaderH), W, S(5));

  c.fillStyle = col.titleColor || '#cc0000';
  c.font      = 'bold ' + S(CC.backTermsHeadSize) + 'px Arial,sans-serif';
  c.textAlign = 'left';
  c.fillText(TX.termsTitle, S(30), S(CC.backTermsY), S(951));

  c.fillStyle = col.valueColor || '#222';
  c.font      = S(CC.backTermsBodySize) + 'px Arial,sans-serif';
  let ty = S(CC.backTermsY + 38);
  TX.terms.forEach(line => { c.fillText(line, S(30), ty, S(951)); ty += S(CC.backTermsSpacing); });

  c.fillStyle = band;
  c.fillRect(0, H - S(CC.backFooterH), W, S(CC.backFooterH));

  c.fillStyle = col.headerText || 'rgba(255,255,255,0.90)';
  c.font      = S(CC.backTermsBodySize) + 'px Arial,sans-serif';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  const footY = H - S(CC.backFooterH / 2);
  const sessionText = (st && st.session) ? `Issued: ${st.session}  •  ` : '';
  c.fillText(sessionText + 'Valid Until: ' + expiryYear, S(30), footY);
  c.textAlign = 'right';
  c.fillText(TX.backFooterRight, W - S(30), footY);
  c.textBaseline = 'alphabetic';
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
  window.CardCanvas.defaults = () => JSON.parse(JSON.stringify(CC_DEFAULTS));
  window.CardCanvas.textDefaults = () => JSON.parse(JSON.stringify(CARD_TEXT_DEFAULTS));
  window.CardCanvas.mergedLayout = getMergedConfig;
  window.CardCanvas.mergedText = getMergedText;
  window.CardCanvas.layerOrder = cardLayerOrder;
  window.CardCanvas.layerDefault = () => CARD_LAYER_DEFAULT.slice();
  window.CardCanvas.elementShown = cardElementShown;
  window.CardCanvas.fonts = () => Object.keys(FX_FONTS);
}
