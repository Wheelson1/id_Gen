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

// ── AUTO-FIT TYPOGRAPHY HELPER ───────────────────────────────────
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

function buildQRData(st) {
  if (!st) return '';
  return st.qrString || (st.cardId ? `EBSU1:${st.cardId}` : (st.matric ? `SID:${st.matric}` : ''));
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

  const rows = [
    ['Name:',        studentName],
    ['Faculty:',     studentFaculty],
    ['Department:',  studentDept],
    ['Expiry Year:', expiryYear.toString()]
  ];

  rows.forEach(([label, val], i) => {
    const ty = S(CC.fieldsStartY + i * CC.fieldSpacing);
    c.textAlign = 'left';
    c.fillStyle = col.labelColor || '#000000';
    c.font      = 'bold ' + S(CC.fieldFontSize) + 'px Arial,sans-serif';
    c.fillText(label, S(CC.fieldLabelX), ty);

    // Position value dynamically right after label with consistent spacing to prevent overlap
    const labelW = c.measureText(label).width;
    const rowValX = S(CC.fieldLabelX) + labelW + S(12);

    c.fillStyle = col.valueColor || '#222222';
    const fMaxW = Math.max(0, S(CC.qrX - 10) - rowValX);
    drawFittedText(c, val || '—', rowValX, ty, fMaxW, S(CC.fieldFontSize), (i === 0 ? 'bold' : ''));
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
    const qc = document.createElement('canvas');
    if (typeof QRGen !== 'undefined' && QRGen.drawToCanvas) {
      QRGen.drawToCanvas(qc, buildQRData(st), 4);
      c.save();
      // Pure white backing to prevent background/watermark interference
      c.fillStyle = '#ffffff';
      c.fillRect(S(CC.qrX) - S(4), S(CC.qrY) - S(4), S(CC.qrSize) + S(8), S(CC.qrSize) + S(8));
      c.imageSmoothingEnabled = false;
      c.drawImage(qc, S(CC.qrX), S(CC.qrY), S(CC.qrSize), S(CC.qrSize));
      c.restore();
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
