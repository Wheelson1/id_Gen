/**
 * js/cardLab.js — Card Design Lab (staff console → Card Design Lab)
 *
 * A school's admin or registrar designs their own ID card here:
 *   • drag any element on the live card to move it, drag its corner to resize it
 *   • fine-tune exact positions and sizes in the panel on the right
 *   • change colours, the words printed on the card, the crest, the back of the card
 *   • undo / redo, reset one element or the whole card
 *   • safety checks stop a design that would break scanning (QR too small, reg number too small, off the card)
 *   • save: the design is stored for that school only and used for every card it issues
 *
 * Super admins can pick which school's design they are editing.
 * Depends on canvas.js (drawCard, drawBackCard, CardCanvas) and js/cardTemplate.js.
 */

const CardLab = (() => {
  const W = 1011;
  const H = 638;
  const EDIT_ROLES = ['registrar', 'admin', 'super_admin'];

  const COLOR_FIELDS = [
    ['headerBg', 'Header band'],
    ['headerText', 'Header text'],
    ['bodyBg', 'Card background'],
    ['borderColor', 'Card border'],
    ['titleColor', 'Card title'],
    ['lineColor', 'Lines around reg number'],
    ['matricLabel', 'Reg number label'],
    ['matricValue', 'Reg number'],
    ['labelColor', 'Field labels'],
    ['valueColor', 'Field values'],
    ['photoBackground', 'Photo background'],
  ];

  const BACK_FIELDS = [
    { k: 'backHeaderH', label: 'Header height', min: 40, max: 200 },
    { k: 'backHeaderFontSize', label: 'Header text size', min: 12, max: 60 },
    { k: 'backTermsY', label: 'Terms heading position (down)', min: 90, max: 400 },
    { k: 'backTermsHeadSize', label: 'Terms heading size', min: 10, max: 48 },
    { k: 'backTermsBodySize', label: 'Terms text size', min: 10, max: 40 },
    { k: 'backTermsSpacing', label: 'Space between terms', min: 18, max: 90 },
    { k: 'backFooterH', label: 'Footer height', min: 30, max: 140 },
  ];

  const measureCtx = document.createElement('canvas').getContext('2d');
  function textW(txt, size, bold = true) {
    measureCtx.font = (bold ? 'bold ' : '') + size + 'px Arial,sans-serif';
    return measureCtx.measureText(String(txt || '')).width;
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const R = Math.round;

  function esc(val) {
    return String(val ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── Per-part style helpers (stored in layout.fx[id]) ───────────
  function fxOf(L, id) { if (!L.fx) L.fx = {}; if (!L.fx[id]) L.fx[id] = {}; return L.fx[id]; }
  function fxv(L, id, k, d) {
    const f = L && L.fx && L.fx[id];
    return (f && f[k] !== undefined && f[k] !== null) ? f[k] : (d === undefined ? 0 : d);
  }
  function setFx(L, id, k, v) {
    const f = fxOf(L, id);
    const zeroDefault = ['dx', 'dy', 'letterSpacing', 'rotate', 'radius', 'blur', 'gray'].includes(k) && v === 0;
    const oneDefault = ['opacity', 'bright'].includes(k) && v === 1;
    if (v === '' || v === undefined || v === null || v === false || zeroDefault || oneDefault) delete f[k]; else f[k] = v;
    if (!Object.keys(f).length) delete L.fx[id];
  }
  const TEXT_CAPS = ['opacity', 'rotate', 'color', 'font', 'weight', 'italic', 'spacing'];
  const ROW_CAPS = ['opacity', 'rotate', 'color', 'labelColor', 'font', 'weight', 'labelWeight', 'italic', 'spacing'];

  function rowEl(id, label, idx, required) {
    const size = L => fxv(L, id, 'size', 0) || L.fieldFontSize;
    return {
      id, label, required: !!required, caps: ROW_CAPS, colorKey: 'valueColor', labelColorKey: 'labelColor',
      box: L => {
        const sz = size(L);
        return { x: L.fieldLabelX + fxv(L, id, 'dx'), y: L.fieldsStartY + idx * L.fieldSpacing - sz * 0.86 + fxv(L, id, 'dy'), w: L.fieldsW, h: sz * 1.1 };
      },
      move: (L, s, dx, dy) => { const f = fxOf(L, id); f.dx = R(fxv(s, id, 'dx') + dx); f.dy = R(fxv(s, id, 'dy') + dy); },
      resize: (L, s, dx, dy, sb) => {
        const ratio = (sb.h + dy) / sb.h;
        setFx(L, id, 'size', clamp(R((fxv(s, id, 'size', 0) || s.fieldFontSize) * ratio), 8, 70));
      },
      fields: [
        { fx: true, k: 'dx', label: 'Nudge across', min: -500, max: 500, def: () => 0 },
        { fx: true, k: 'dy', label: 'Nudge down', min: -300, max: 300, def: () => 0 },
        { fx: true, k: 'size', label: 'Text size', min: 8, max: 70, def: L => L.fieldFontSize },
      ],
      groupTitle: 'All four detail lines together',
      groupFields: [
        { k: 'fieldLabelX', label: 'Across', min: 0, max: W },
        { k: 'fieldsStartY', label: 'Down', min: 0, max: H },
        { k: 'fieldsW', label: 'Width', min: 160, max: W },
        { k: 'fieldFontSize', label: 'Standard text size', min: 12, max: 44 },
        { k: 'fieldSpacing', label: 'Space between lines', min: 24, max: 150 },
      ],
      keys: [],
    };
  }

  function vitalEl(id, label, isBlood) {
    const yk = isBlood ? 'bloodY' : 'genoY';
    const xk = isBlood ? 'bloodX' : 'genoX';
    const size = L => fxv(L, id, 'size', 0) || L.bloodFontSize;
    return {
      id, label, caps: ROW_CAPS, colorKey: 'valueColor', labelColorKey: 'labelColor',
      box: L => ({
        x: L[xk] + fxv(L, id, 'dx'), y: L[yk] - size(L) * 0.86 + fxv(L, id, 'dy'),
        w: (L.bloodValueX - L[xk]) + textW('AB+', size(L), false) + 10, h: size(L) * 1.1,
      }),
      move: (L, s, dx, dy) => { const f = fxOf(L, id); f.dx = R(fxv(s, id, 'dx') + dx); f.dy = R(fxv(s, id, 'dy') + dy); },
      resize: (L, s, dx, dy, sb) => {
        const ratio = (sb.h + dy) / sb.h;
        setFx(L, id, 'size', clamp(R((fxv(s, id, 'size', 0) || s.bloodFontSize) * ratio), 8, 44));
      },
      fields: [
        { fx: true, k: 'dx', label: 'Nudge across', min: -500, max: 500, def: () => 0 },
        { fx: true, k: 'dy', label: 'Nudge down', min: -300, max: 300, def: () => 0 },
        { fx: true, k: 'size', label: 'Text size', min: 8, max: 44, def: L => L.bloodFontSize },
      ],
      groupTitle: 'Blood group and genotype together',
      groupFields: [
        { k: 'bloodX', label: 'Across', min: 0, max: W, link: L => { L.genoX = L.bloodX; } },
        { k: 'bloodValueX', label: 'Answer starts at', min: 40, max: 500 },
        { k: 'bloodY', label: 'Blood group down', min: 0, max: H },
        { k: 'genoY', label: 'Genotype down', min: 0, max: H },
        { k: 'bloodFontSize', label: 'Standard text size', min: 10, max: 40 },
      ],
      keys: [],
    };
  }

  // ── Elements on the front of the card ──────────────────────────
  // box(L, TX): where it sits, in card pixels. move/resize work from a snapshot (s)
  // taken when the drag started, so dragging never drifts.
  // caps: which look controls this part offers. colorKey: the standard colour it uses.
  const ELEMENTS = [
    {
      id: 'border', label: 'Card border', noBox: true, caps: ['opacity', 'color', 'width'], colorKey: 'borderColor',
      box: () => ({ x: 0, y: 0, w: W, h: H }), move: () => {}, resize: () => {},
      fields: [], keys: [],
    },
    {
      id: 'header', label: 'Header band', required: true, caps: ['opacity', 'color', 'font', 'weight', 'italic', 'spacing'], colorKey: 'headerText',
      box: L => ({ x: 0, y: 0, w: W, h: L.headerH }),
      move: () => {},
      resize: (L, s, dx, dy) => { L.headerH = clamp(R(s.headerH + dy), 40, 180); },
      fields: [
        { k: 'headerH', label: 'Height', min: 40, max: 180 },
        { k: 'headerFontSize', label: 'School name size', min: 12, max: 70 },
      ],
      keys: ['headerH', 'headerFontSize'],
    },
    {
      id: 'title', label: 'Card title', caps: TEXT_CAPS, colorKey: 'titleColor',
      box: (L, TX) => {
        const w = Math.min(971, textW(TX.cardTitle, L.titleFontSize));
        return { x: L.titleX - w / 2, y: L.titleY - L.titleFontSize * 0.82, w, h: L.titleFontSize * 1.02 };
      },
      move: (L, s, dx, dy) => { L.titleX = R(s.titleX + dx); L.titleY = R(s.titleY + dy); },
      resize: (L, s, dx, dy, sb) => {
        const ratio = (sb.h + dy) / sb.h;
        L.titleFontSize = clamp(R(s.titleFontSize * ratio), 12, 80);
      },
      fields: [
        { k: 'titleX', label: 'Across (centre)', min: 0, max: W },
        { k: 'titleY', label: 'Down', min: 20, max: H },
        { k: 'titleFontSize', label: 'Text size', min: 12, max: 80 },
      ],
      keys: ['titleX', 'titleY', 'titleFontSize'],
    },
    {
      id: 'matric', label: 'Reg number', required: true, caps: ROW_CAPS, colorKey: 'matricValue', labelColorKey: 'matricLabel',
      box: L => ({ x: L.matricLabelX, y: L.matricY - L.matricFontSize * 0.86, w: L.matricW, h: L.matricFontSize * 1.1 }),
      move: (L, s, dx, dy) => { L.matricLabelX = R(s.matricLabelX + dx); L.matricY = R(s.matricY + dy); },
      resize: (L, s, dx, dy, sb) => {
        L.matricW = clamp(R(s.matricW + dx), 200, W - s.matricLabelX);
        const ratio = (sb.h + dy) / sb.h;
        L.matricFontSize = clamp(R(s.matricFontSize * ratio), 16, 64);
        L.matricLabelFontSize = clamp(R(s.matricLabelFontSize * ratio), 10, 40);
      },
      fields: [
        { k: 'matricLabelX', label: 'Across', min: 0, max: W },
        { k: 'matricY', label: 'Down', min: 40, max: H },
        { k: 'matricW', label: 'Width', min: 200, max: W },
        { k: 'matricFontSize', label: 'Reg number size', min: 16, max: 64 },
        { k: 'matricLabelFontSize', label: 'Label size', min: 10, max: 40 },
        { k: 'showMatricLines', label: 'Lines above and below', type: 'bool' },
      ],
      keys: ['matricLabelX', 'matricY', 'matricW', 'matricFontSize', 'matricLabelFontSize', 'showMatricLines'],
    },
    {
      id: 'photo', label: 'Passport photo', required: true, caps: ['radius'],
      box: L => ({ x: L.photoX, y: L.photoY, w: L.photoW, h: L.photoH }),
      move: (L, s, dx, dy) => { L.photoX = R(s.photoX + dx); L.photoY = R(s.photoY + dy); },
      resize: (L, s, dx, dy) => {
        L.photoW = clamp(R(s.photoW + dx), 80, 600);
        L.photoH = clamp(R(s.photoH + dy), 100, 620);
      },
      fields: [
        { k: 'photoX', label: 'Across', min: 0, max: W },
        { k: 'photoY', label: 'Down', min: 0, max: H },
        { k: 'photoW', label: 'Width', min: 80, max: 600 },
        { k: 'photoH', label: 'Height', min: 100, max: 620 },
      ],
      keys: ['photoX', 'photoY', 'photoW', 'photoH'],
    },
    rowEl('name', 'Name', 0, true),
    rowEl('faculty', 'Faculty', 1),
    rowEl('dept', 'Department', 2),
    rowEl('expiry', 'Expiry year', 3),
    vitalEl('blood', 'Blood group', true),
    vitalEl('geno', 'Genotype', false),
    {
      id: 'logo', label: 'School crest', caps: ['opacity', 'rotate', 'radius', 'filter'],
      box: L => ({ x: L.logoX, y: L.logoY, w: L.logoW, h: L.logoH }),
      move: (L, s, dx, dy) => { L.logoX = R(s.logoX + dx); L.logoY = R(s.logoY + dy); },
      resize: (L, s, dx, dy) => {
        const ratio = s.logoH / Math.max(1, s.logoW);
        L.logoW = clamp(R(s.logoW + Math.max(dx, dy / Math.max(ratio, 0.01))), 30, 420);
        L.logoH = R(L.logoW * ratio);
      },
      fields: [
        { k: 'logoX', label: 'Across', min: 0, max: W },
        { k: 'logoY', label: 'Down', min: 0, max: H },
        { k: 'logoW', label: 'Width', min: 30, max: 420 },
        { k: 'logoH', label: 'Height', min: 30, max: 420 },
      ],
      keys: ['logoX', 'logoY', 'logoW', 'logoH'],
    },
    {
      id: 'qr', label: 'QR code', required: true, caps: [],
      box: L => ({ x: L.qrX, y: L.qrY, w: L.qrSize, h: L.qrSize }),
      move: (L, s, dx, dy) => { L.qrX = R(s.qrX + dx); L.qrY = R(s.qrY + dy); },
      resize: (L, s, dx, dy) => { L.qrSize = clamp(R(s.qrSize + Math.max(dx, dy)), 120, 340); },
      fields: [
        { k: 'qrX', label: 'Across', min: 0, max: W },
        { k: 'qrY', label: 'Down', min: 0, max: H },
        { k: 'qrSize', label: 'Size', min: 120, max: 340 },
      ],
      note: 'The QR code stays fully solid so it always scans. You can move it, resize it and change its layer.',
      keys: ['qrX', 'qrY', 'qrSize'],
    },
    {
      id: 'sigLabel', label: 'Signature word', caps: TEXT_CAPS, colorKey: 'labelColor',
      box: (L, TX) => ({ x: L.sigLabelX, y: L.sigLabelY - L.sigLabelFontSize * 0.86, w: textW(TX.signatureLabel, L.sigLabelFontSize) + 8, h: L.sigLabelFontSize * 1.1 }),
      move: (L, s, dx, dy) => { L.sigLabelX = R(s.sigLabelX + dx); L.sigLabelY = R(s.sigLabelY + dy); },
      resize: (L, s, dx, dy, sb) => {
        const ratio = (sb.h + dy) / sb.h;
        L.sigLabelFontSize = clamp(R(s.sigLabelFontSize * ratio), 10, 36);
      },
      fields: [
        { k: 'sigLabelX', label: 'Across', min: 0, max: W },
        { k: 'sigLabelY', label: 'Down', min: 20, max: H },
        { k: 'sigLabelFontSize', label: 'Text size', min: 10, max: 36 },
      ],
      keys: ['sigLabelX', 'sigLabelY', 'sigLabelFontSize'],
    },
    {
      id: 'signature', label: 'Signature and line', caps: ['opacity'],
      box: L => ({ x: L.sigBoxX, y: L.sigBoxY, w: L.sigBoxW, h: L.sigBoxH }),
      move: (L, s, dx, dy) => { L.sigBoxX = R(s.sigBoxX + dx); L.sigBoxY = R(s.sigBoxY + dy); },
      resize: (L, s, dx, dy) => {
        L.sigBoxW = clamp(R(s.sigBoxW + dx), 100, 900);
        L.sigBoxH = clamp(R(s.sigBoxH + dy), 30, 320);
      },
      fields: [
        { k: 'sigBoxX', label: 'Across', min: 0, max: W },
        { k: 'sigBoxY', label: 'Down', min: 20, max: H },
        { k: 'sigBoxW', label: 'Width', min: 100, max: 900 },
        { k: 'sigBoxH', label: 'Height', min: 30, max: 320 },
      ],
      keys: ['sigBoxX', 'sigBoxY', 'sigBoxW', 'sigBoxH'],
    },
    {
      id: 'watermark', label: 'Crest watermark', caps: ['rotate', 'filter'], opacityKey: 'watermarkAlpha',
      box: L => ({ x: L.watermarkX - L.watermarkSize / 2, y: L.watermarkY - L.watermarkSize / 2, w: L.watermarkSize, h: L.watermarkSize }),
      move: (L, s, dx, dy) => { L.watermarkX = R(s.watermarkX + dx); L.watermarkY = R(s.watermarkY + dy); },
      resize: (L, s, dx, dy) => { L.watermarkSize = clamp(R(s.watermarkSize + Math.max(dx, dy) * 2), 60, 900); },
      fields: [
        { k: 'watermarkX', label: 'Across (centre)', min: 0, max: W },
        { k: 'watermarkY', label: 'Down (centre)', min: 0, max: H },
        { k: 'watermarkSize', label: 'Size', min: 60, max: 900 },
      ],
      keys: ['watermarkX', 'watermarkY', 'watermarkSize', 'watermarkAlpha'],
    },
  ];
  const BY_ID = Object.fromEntries(ELEMENTS.map(e => [e.id, e]));

  // ── Lab state ──────────────────────────────────────────────────
  let S = null;

  function defaultsLayout() {
    return (window.CardCanvas && CardCanvas.defaults) ? CardCanvas.defaults() : {};
  }
  function defaultsText() {
    return (window.CardCanvas && CardCanvas.textDefaults) ? CardCanvas.textDefaults() : {};
  }

  function fullDraft(tpl, school) {
    const d = JSON.parse(JSON.stringify(tpl || {}));
    d.layout = Object.assign(defaultsLayout(), d.layout || {});
    d.layout.layoutVersion = 3;
    d.layout.fx = d.layout.fx || {};
    d.layout.order = CardCanvas.layerOrder(d.layout.order);
    d.colors = Object.assign({}, CardTemplate.getDefault().colors, d.colors || {});
    d.text = Object.assign(defaultsText(), d.text || {});
    if (!Array.isArray(d.text.terms) || !d.text.terms.length) d.text.terms = defaultsText().terms;
    d.institution = Object.assign({}, CardTemplate.getDefault().institution, d.institution || {});
    // A school with no saved design yet starts with its own name in the header.
    if (!d.id && school && school.name) d.institution.name = String(school.name).toUpperCase();
    return d;
  }

  const snapshot = () => JSON.stringify({ layout: S.draft.layout, colors: S.draft.colors, text: S.draft.text, institution: S.draft.institution });

  function restoreSnapshot(json) {
    const o = JSON.parse(json);
    Object.assign(S.draft, o);
    afterChange({ history: false });
    renderProps();
    renderList();
  }

  function pushHistory() {
    const snap = snapshot();
    if (S.history[S.history.length - 1] === snap) return;
    S.history.push(snap);
    if (S.history.length > 100) S.history.shift();
    S.future = [];
    updateButtons();
  }

  function undo() {
    if (S.history.length < 2) return;
    S.future.push(S.history.pop());
    restoreSnapshot(S.history[S.history.length - 1]);
    updateButtons();
  }

  function redo() {
    if (!S.future.length) return;
    const snap = S.future.pop();
    S.history.push(snap);
    restoreSnapshot(snap);
    updateButtons();
  }

  // Sample data so every element shows at its real size.
  function sampleStudent() {
    const long = S.sample === 'long';
    return {
      name: long ? 'OKORONKWO CHINEDUM EMMANUEL NWACHUKWU-OBI' : 'NWANKWO CHIDIMMA ADAEZE',
      matric: long ? 'EBSU/2026/1089204517' : 'EBSU/2026/108920',
      faculty: long ? 'Faculty of Agriculture and Natural Resources Management' : 'Science',
      dept: long ? 'Agricultural Economics and Extension' : 'Computer Science',
      level: '100 Level', session: '2026/2027', blood: 'O+', genotype: 'AA', expiry: 2030,
      photo: 'images/demo_user_photo.jpg',
      sig: S.sampleSig,
      cardId: '123e4567-e89b-42d3-a456-426614174000',
      card_signature: 'SAMPLE-DESIGN-PREVIEW',
    };
  }

  function makeSampleSignature() {
    const c = document.createElement('canvas');
    c.width = 600; c.height = 180;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 600, 180);
    g.strokeStyle = '#14288C'; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i <= 300; i++) {
      const t = i / 300;
      const x = 40 + t * 480;
      const y = 100 + 40 * Math.sin(t * 9) * Math.exp(-t * 1.1) + (t > 0.2 && t < 0.6 ? 22 * Math.sin(t * 24) : 0);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    g.beginPath(); g.moveTo(290, 140); g.lineTo(550, 124); g.stroke();
    return c.toDataURL('image/png');
  }

  // ── Rendering ──────────────────────────────────────────────────
  let renderQueued = false;
  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      if (!S) return;
      const canvas = S.el.querySelector('#lab-canvas');
      if (!canvas) return;
      if (S.side === 'back') {
        drawBackCard(canvas, S.draft, sampleStudent(), 1);
      } else {
        drawCard(canvas, S.draft, sampleStudent(), 1);
      }
      renderBoxes();
      renderChecks();
    });
  }

  function isShown(id) {
    return CardCanvas.elementShown(S.draft.layout, id);
  }
  function visible(def) { return isShown(def.id); }
  function isLocked(id) { return fxv(S.draft.layout, id, 'locked', false) === true; }

  function renderBoxes() {
    const overlay = S.el.querySelector('#lab-overlay');
    if (!overlay) return;
    if (S.side === 'back') { overlay.innerHTML = ''; return; }
    const L = S.draft.layout;
    const TX = S.draft.text;
    const order = CardCanvas.layerOrder(L.order);
    let html = '';
    ELEMENTS.forEach(def => {
      if (def.noBox || !visible(def)) return;
      const b = def.box(L, TX);
      const locked = isLocked(def.id);
      const sel = S.selected === def.id ? ' is-selected' : '';
      const z = S.selected === def.id ? 1000 : order.indexOf(def.id) + 1;
      html += `<div class="lab-box${sel}${locked ? ' is-locked' : ''}" data-el="${def.id}" role="button" tabindex="-1" aria-label="${esc(def.label)}${locked ? ' (locked)' : ''}"
        style="left:${(b.x / W) * 100}%;top:${(b.y / H) * 100}%;width:${(b.w / W) * 100}%;height:${(b.h / H) * 100}%;z-index:${z};">
        <span class="lab-box-tag">${esc(def.label)}${locked ? ' (locked)' : ''}</span>
        ${locked ? '' : '<span class="lab-handle" data-handle="se" aria-hidden="true"></span>'}
      </div>`;
    });
    overlay.innerHTML = html;
  }

  function intersects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // Problems that would make a card fail at the gate block saving; the rest are advice.
  const TEXT_PARTS = ['matric', 'name', 'faculty', 'dept', 'expiry', 'blood', 'geno', 'sigLabel', 'title'];
  function computeChecks() {
    const L = S.draft.layout;
    const TX = S.draft.text;
    const errors = [];
    const warnings = [];
    const boxes = {};
    ELEMENTS.forEach(def => { if (!def.noBox && visible(def)) boxes[def.id] = def.box(L, TX); });
    const nameOf = id => BY_ID[id].label;

    if (L.qrSize < 160) errors.push('The QR code is too small to scan reliably. Make it at least 160.');
    if (L.matricFontSize < 20) errors.push('The reg number is too small to read. Make it at least 20.');
    if (fxv(L, 'matric', 'opacity', 1) < 0.7) errors.push('The reg number is too faint. Keep its strength at 70% or more.');
    if (fxv(L, 'name', 'opacity', 1) < 0.7) errors.push('The name is too faint. Keep its strength at 70% or more.');
    if (fxv(L, 'matric', 'rotate', 0) || fxv(L, 'name', 'rotate', 0)) warnings.push('A tilted reg number or name is harder to read at the gate. Keep them straight.');

    ['qr', 'photo', 'matric', 'name'].forEach(id => {
      const b = boxes[id];
      if (b && (b.x < 0 || b.y < 0 || b.x + b.w > W + 1 || b.y + b.h > H + 1)) {
        errors.push(`${nameOf(id)} goes off the edge of the card.`);
      }
    });
    ['title', 'faculty', 'dept', 'expiry', 'blood', 'geno', 'logo', 'signature', 'sigLabel'].forEach(id => {
      const b = boxes[id];
      if (b && (b.x < -1 || b.y < -1 || b.x + b.w > W + 1 || b.y + b.h > H + 1)) {
        warnings.push(`${nameOf(id)} goes off the edge of the card.`);
      }
    });

    if (boxes.qr) {
      ['photo', 'name', 'faculty', 'dept', 'expiry', 'signature', 'sigLabel', 'logo', 'matric', 'blood', 'geno'].forEach(id => {
        if (boxes[id] && intersects(boxes.qr, boxes[id])) errors.push(`The QR code overlaps the ${nameOf(id).toLowerCase()}. Anything on top of a QR code can stop it scanning.`);
      });
    }
    if (boxes.photo && (L.photoW < 150 || L.photoH < 180)) warnings.push('The passport photo is small. Security staff compare it with the student\'s face.');
    ['name', 'faculty', 'dept', 'expiry', 'matric', 'blood', 'geno'].forEach(id => {
      if (boxes.photo && boxes[id] && intersects(boxes.photo, boxes[id])) warnings.push(`The photo overlaps the ${nameOf(id).toLowerCase()}.`);
    });
    for (let i = 0; i < TEXT_PARTS.length; i++) {
      for (let j = i + 1; j < TEXT_PARTS.length; j++) {
        const a = TEXT_PARTS[i], b = TEXT_PARTS[j];
        if (boxes[a] && boxes[b] && intersects(boxes[a], boxes[b])) {
          const w = `${nameOf(a)} and ${nameOf(b).toLowerCase()} overlap.`;
          if (!warnings.includes(w)) warnings.push(w);
        }
      }
    }
    if (boxes.signature && boxes.name && intersects(boxes.signature, boxes.name)) warnings.push('The signature overlaps the name.');
    if (L.watermarkAlpha > 0.25 && isShown('watermark')) warnings.push('A strong watermark can make the details harder to read.');
    return { errors, warnings };
  }

  function renderChecks() {
    const box = S.el.querySelector('#lab-checks');
    if (!box) return;
    const { errors, warnings } = computeChecks();
    S.lastChecks = { errors, warnings };
    if (!errors.length && !warnings.length) {
      box.innerHTML = '<p class="lab-check-ok">No problems found. This design is safe to print and scan.</p>';
    } else {
      box.innerHTML =
        errors.map(m => `<p class="lab-check-error"><strong>Fix before saving:</strong> ${esc(m)}</p>`).join('') +
        warnings.map(m => `<p class="lab-check-warn"><strong>Check:</strong> ${esc(m)}</p>`).join('');
    }
    updateButtons();
  }

  // ── Panels ─────────────────────────────────────────────────────
  function renderList() {
    const list = S.el.querySelector('#lab-elements');
    if (!list) return;
    if (S.side === 'back') {
      list.innerHTML = '<p class="lab-muted">The back of the card has no movable parts. Use the panel on the right to change its sizes and words.</p>';
      return;
    }
    const L = S.draft.layout;
    const order = CardCanvas.layerOrder(L.order);          // bottom to top
    const topFirst = order.slice().reverse();
    const dis = S.canEdit ? '' : ' disabled';
    list.innerHTML = '<li class="lab-layer-note">Top of the list is the front of the card.</li>' + topFirst.map((id, i) => {
      const def = BY_ID[id];
      const on = visible(def);
      const locked = isLocked(id);
      const sel = S.selected === id ? ' is-selected' : '';
      const showBox = def.required
        ? '<span class="lab-required">Always shown</span>'
        : `<label class="lab-switch" title="Show on card"><input type="checkbox" data-showel="${id}" ${on ? 'checked' : ''}${dis} aria-label="Show ${esc(def.label)} on the card"><span>Show</span></label>`;
      return `<li class="lab-el${sel}${on ? '' : ' is-hidden'}${locked ? ' is-locked' : ''}">
        <button type="button" class="lab-el-name" data-select="${id}">${esc(def.label)}${locked ? ' <span class="lab-lock-tag">locked</span>' : ''}</button>
        <span class="lab-el-tools">
          <button type="button" class="lab-mini" data-act="fwd" data-id="${id}" ${i === 0 || !S.canEdit ? 'disabled' : ''} aria-label="Bring ${esc(def.label)} forward" title="Bring forward">&#9650;</button>
          <button type="button" class="lab-mini" data-act="bwd" data-id="${id}" ${i === topFirst.length - 1 || !S.canEdit ? 'disabled' : ''} aria-label="Send ${esc(def.label)} backward" title="Send backward">&#9660;</button>
          <button type="button" class="lab-mini lab-mini-lock${locked ? ' is-on' : ''}" data-act="lock" data-id="${id}" ${S.canEdit ? '' : 'disabled'} aria-pressed="${locked}" title="${locked ? 'Unlock' : 'Lock so it cannot be moved by accident'}">${locked ? 'Unlock' : 'Lock'}</button>
          ${showBox}
        </span>
      </li>`;
    }).join('');
  }

  function numberField(f, def) {
    const L = S.draft.layout;
    const step = f.step || 1;
    const lockedAttr = def && isLocked(def.id) ? ' disabled' : '';
    if (f.fx) {
      const val = fxv(L, def.id, f.k, f.def ? f.def(L) : 0);
      return `<label class="lab-field">
        <span>${esc(f.label)}</span>
        <input type="number" class="sh-input" data-fxnum="${f.k}" value="${esc(val)}" min="${f.min}" max="${f.max}" step="${step}"${lockedAttr}>
      </label>`;
    }
    return `<label class="lab-field">
      <span>${esc(f.label)}</span>
      <input type="number" class="sh-input" data-key="${f.k}" value="${esc(L[f.k])}" min="${f.min}" max="${f.max}" step="${step}"${lockedAttr}>
    </label>`;
  }

  const WEIGHTS = [['', 'Standard'], ['bold', 'Bold'], ['normal', 'Regular'], ['light', 'Light']];
  const FONT_NAMES = {
    arial: 'Arial', verdana: 'Verdana', trebuchet: 'Trebuchet', tahoma: 'Tahoma', georgia: 'Georgia',
    times: 'Times New Roman', garamond: 'Garamond', courier: 'Courier', impact: 'Impact',
  };

  function rangeField(label, attr, val, min, max, step, unit, scale, dis) {
    return `<label class="lab-field lab-field-wide lab-range">
      <span>${esc(label)}: <b>${esc(Math.round(val * 100) / 100)}${unit}</b></span>
      <input type="range" ${attr} data-scale="${scale}" data-unit="${unit}" min="${min}" max="${max}" step="${step}" value="${esc(val)}"${dis}>
    </label>`;
  }
  function colourField(label, k, f, std, dis) {
    const custom = f[k] ? true : false;
    return `<div class="lab-colour-row">
      <label class="lab-colour"><input type="color" data-fxc="${k}" value="${esc(f[k] || std || '#000000')}"${dis}><span>${esc(label)}</span></label>
      ${custom ? `<button type="button" class="lab-link" data-fxclear="${k}"${dis}>Use standard</button>` : '<span class="lab-muted lab-inline-note">standard</span>'}
    </div>`;
  }
  function selectField(label, k, f, options, dis) {
    return `<label class="lab-field"><span>${esc(label)}</span>
      <select class="sh-input" data-fxs="${k}"${dis}>${options.map(([v, t]) => `<option value="${esc(v)}" ${String(f[k] || '') === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  }

  function styleHtml(def) {
    const caps = def.caps || [];
    if (!caps.length && !def.opacityKey) return '';
    const L = S.draft.layout;
    const C = S.draft.colors;
    const f = (L.fx && L.fx[def.id]) || {};
    const dis = isLocked(def.id) ? ' disabled' : '';
    let h = '';
    if (def.opacityKey) {
      h += rangeField('Strength (see-through)', `data-kr="${def.opacityKey}"`, Math.round(L[def.opacityKey] * 100), 0, 100, 1, '%', 100, dis);
    } else if (caps.includes('opacity')) {
      h += rangeField('Strength (see-through)', 'data-fxr="opacity"', Math.round(fxv(L, def.id, 'opacity', 1) * 100), 0, 100, 1, '%', 100, dis);
    }
    if (caps.includes('rotate')) h += rangeField('Tilt', 'data-fxr="rotate"', fxv(L, def.id, 'rotate', 0), -180, 180, 1, '°', 1, dis);
    if (caps.includes('color')) h += colourField(def.labelColorKey ? 'Value colour' : (def.id === 'border' ? 'Border colour' : 'Text colour'), 'color', f, C[def.colorKey], dis);
    if (caps.includes('labelColor')) h += colourField('Label colour', 'labelColor', f, C[def.labelColorKey], dis);
    if (caps.includes('font') || caps.includes('weight') || caps.includes('italic')) {
      h += '<div class="lab-fields">';
      if (caps.includes('font')) h += selectField('Font', 'font', f, [['', 'Standard']].concat(Object.keys(FONT_NAMES).map(k => [k, FONT_NAMES[k]])), dis);
      if (caps.includes('weight')) h += selectField(caps.includes('labelWeight') ? 'Value weight' : 'Weight', 'weight', f, WEIGHTS, dis);
      if (caps.includes('labelWeight')) h += selectField('Label weight', 'labelWeight', f, WEIGHTS, dis);
      if (caps.includes('spacing')) h += `<label class="lab-field"><span>Letter spacing</span><input type="number" class="sh-input" data-fxnum="letterSpacing" value="${esc(fxv(L, def.id, 'letterSpacing', 0))}" min="-3" max="20" step="0.5"${dis}></label>`;
      h += '</div>';
      if (caps.includes('italic')) h += `<label class="lab-switch lab-field-wide"><input type="checkbox" data-fxb="italic" ${f.italic ? 'checked' : ''}${dis}><span>Slanted (italic)</span></label>`;
    }
    if (caps.includes('width')) h += `<div class="lab-fields">${numberField({ fx: true, k: 'width', label: 'Border thickness', min: 1, max: 14, def: () => 2 }, def)}</div>`;
    if (caps.includes('radius')) h += `<div class="lab-fields">${numberField({ fx: true, k: 'radius', label: 'Rounded corners', min: 0, max: 120, def: () => 0 }, def)}</div>`;
    if (caps.includes('filter')) {
      h += rangeField('Black and white', 'data-fxr="gray"', Math.round(fxv(L, def.id, 'gray', 0) * 100), 0, 100, 1, '%', 100, dis);
      h += rangeField('Soft blur', 'data-fxr="blur"', fxv(L, def.id, 'blur', 0), 0, 12, 0.5, ' px', 1, dis);
      h += rangeField('Brightness', 'data-fxr="bright"', Math.round(fxv(L, def.id, 'bright', 1) * 100), 40, 160, 1, '%', 100, dis);
    }
    return `<details class="lab-group" ${S.openGroups.look ? 'open' : ''} data-group="look"><summary>Look of this part</summary>${h}</details>`;
  }

  function renderProps() {
    const panel = S.el.querySelector('#lab-props');
    if (!panel) return;
    const L = S.draft.layout;
    const C = S.draft.colors;
    const TX = S.draft.text;
    let html = '';

    if (S.side === 'back') {
      html += `<h3 class="lab-h">Back of the card</h3>
        <div class="lab-fields">${BACK_FIELDS.map(f => numberField(f, null)).join('')}</div>
        <label class="lab-field lab-field-wide"><span>Terms heading</span>
          <input type="text" class="sh-input" data-text="termsTitle" value="${esc(TX.termsTitle)}" maxlength="80"></label>
        <label class="lab-field lab-field-wide"><span>Terms, one per line</span>
          <textarea class="sh-input" data-text="terms" rows="7" maxlength="1200">${esc(TX.terms.join('\n'))}</textarea></label>
        <label class="lab-field lab-field-wide"><span>Footer note (right side)</span>
          <input type="text" class="sh-input" data-text="backFooterRight" value="${esc(TX.backFooterRight)}" maxlength="80"></label>`;
    } else if (S.selected && BY_ID[S.selected]) {
      const def = BY_ID[S.selected];
      const locked = isLocked(def.id);
      const dis = locked ? ' disabled' : '';
      html += `<h3 class="lab-h">${esc(def.label)}</h3>
        <div class="lab-toolrow">
          <button type="button" class="sh-btn sh-btn-secondary lab-small" data-act="lock" data-id="${def.id}" ${S.canEdit ? '' : 'disabled'}>${locked ? 'Unlock' : 'Lock in place'}</button>
          <button type="button" class="sh-btn sh-btn-secondary lab-small" data-act="front" data-id="${def.id}" ${S.canEdit ? '' : 'disabled'}>To front</button>
          <button type="button" class="sh-btn sh-btn-secondary lab-small" data-act="back" data-id="${def.id}" ${S.canEdit ? '' : 'disabled'}>To back</button>
        </div>
        ${locked ? '<p class="lab-muted">This part is locked. Unlock it to move or change it.</p>'
                 : '<p class="lab-muted">Drag it on the card to move it. Drag the corner to resize it. Arrow keys nudge it (hold Shift for bigger steps).</p>'}
        ${def.note ? `<p class="lab-muted">${esc(def.note)}</p>` : ''}
        <div class="lab-fields">${def.fields.map(f => f.type === 'bool'
          ? `<label class="lab-switch lab-field-wide"><input type="checkbox" data-toggle="${f.k}" ${L[f.k] !== false ? 'checked' : ''}${dis}><span>${esc(f.label)}</span></label>`
          : numberField(f, def)).join('')}</div>
        ${styleHtml(def)}
        ${def.groupFields ? `<details class="lab-group" ${S.openGroups.group ? 'open' : ''} data-group="group"><summary>${esc(def.groupTitle)}</summary>
          <div class="lab-fields">${def.groupFields.map(f => numberField(f, def)).join('')}</div></details>` : ''}
        <button type="button" class="sh-btn sh-btn-secondary lab-small" data-reset-el="${def.id}"${dis}>Reset ${esc(def.label.toLowerCase())}</button>`;
    } else {
      html += `<h3 class="lab-h">Pick something to change</h3>
        <p class="lab-muted">Click any part of the card, or pick it from the list on the left. Every part can be locked, hidden and moved forward or backward.</p>`;
    }

    const textInput = (k, label, max) => `<label class="lab-field lab-field-wide"><span>${esc(label)}</span>
          <input type="text" class="sh-input" data-text="${k}" value="${esc(TX[k])}" maxlength="${max || 40}"></label>`;
    html += `<details class="lab-group" ${S.openGroups.words ? 'open' : ''} data-group="words">
        <summary>Words on the card</summary>
        <label class="lab-field lab-field-wide"><span>School name (header)</span>
          <input type="text" class="sh-input" data-inst="name" value="${esc(S.draft.institution.name)}" maxlength="80"></label>
        ${textInput('cardTitle', 'Card title', 60)}
        ${textInput('matricLabel', 'Reg number label', 30)}
        ${textInput('nameLabel', 'Name label', 30)}
        ${textInput('facultyLabel', 'Faculty label', 30)}
        ${textInput('deptLabel', 'Department label', 30)}
        ${textInput('expiryLabel', 'Expiry label', 30)}
        ${textInput('bloodLabel', 'Blood group label', 30)}
        ${textInput('genoLabel', 'Genotype label', 30)}
        ${textInput('signatureLabel', 'Signature label', 30)}
      </details>
      <details class="lab-group" ${S.openGroups.colours ? 'open' : ''} data-group="colours">
        <summary>Colours</summary>
        <div class="lab-colours">${COLOR_FIELDS.map(([k, label]) => `
          <label class="lab-colour"><input type="color" data-color="${k}" value="${esc(C[k] || '#000000')}"><span>${esc(label)}</span></label>`).join('')}
        </div>
      </details>
      <details class="lab-group" ${S.openGroups.crest ? 'open' : ''} data-group="crest">
        <summary>School crest</summary>
        <p class="lab-muted">Used for the crest and the watermark. A square PNG or JPG with a plain background works best.</p>
        <input type="file" id="lab-crest-file" accept="image/png,image/jpeg,image/webp" class="sh-input">
        ${S.draft.institution.crestUrl ? '<button type="button" class="sh-btn sh-btn-secondary lab-small" id="lab-crest-clear">Use the standard EBSU crest</button>' : ''}
      </details>`;

    panel.innerHTML = html;
  }

  function syncPropValues() {
    // Update numbers in place during a drag without rebuilding the panel (keeps focus).
    const panel = S.el.querySelector('#lab-props');
    if (!panel) return;
    const L = S.draft.layout;
    const def = BY_ID[S.selected];
    panel.querySelectorAll('input[data-key]').forEach(inp => {
      if (document.activeElement !== inp) inp.value = L[inp.dataset.key];
    });
    panel.querySelectorAll('input[data-fxnum]').forEach(inp => {
      if (document.activeElement === inp || !def) return;
      const field = def.fields.find(f => f.fx && f.k === inp.dataset.fxnum);
      inp.value = fxv(L, def.id, inp.dataset.fxnum, field && field.def ? field.def(L) : 0);
    });
  }

  function updateButtons() {
    if (!S) return;
    const q = sel => S.el.querySelector(sel);
    const undoBtn = q('#lab-undo'); if (undoBtn) undoBtn.disabled = S.history.length < 2;
    const redoBtn = q('#lab-redo'); if (redoBtn) redoBtn.disabled = !S.future.length;
    const saveBtn = q('#lab-save');
    if (saveBtn) saveBtn.disabled = !S.canEdit || !S.dirty || Boolean(S.lastChecks && S.lastChecks.errors.length) || S.saving;
    const dirtyEl = q('#lab-dirty');
    if (dirtyEl) dirtyEl.textContent = S.dirty ? 'Unsaved changes' : 'All changes saved';
  }

  function setStatus(msg, kind) {
    const el = S.el.querySelector('#lab-status');
    if (!el) return;
    el.className = 'lab-status' + (kind ? ' is-' + kind : '');
    el.textContent = msg || '';
  }

  function draftKey() { return 'sid_lab_draft_' + (S.schoolId || 'default'); }

  function afterChange(opts) {
    S.dirty = snapshot() !== S.savedSnap;
    try {
      if (S.dirty) localStorage.setItem(draftKey(), snapshot());
      else localStorage.removeItem(draftKey());
    } catch (e) {}
    if (!opts || opts.history !== false) pushHistory();
    queueRender();
    updateButtons();
  }

  // ── Events ─────────────────────────────────────────────────────
  let drag = null;

  function cardUnits(ev) {
    const overlay = S.el.querySelector('#lab-overlay');
    const r = overlay.getBoundingClientRect();
    return { k: W / r.width };
  }

  function onPointerDown(ev) {
    const boxEl = ev.target.closest('.lab-box');
    if (!boxEl || !S.canEdit) {
      if (boxEl) select(boxEl.dataset.el);
      return;
    }
    const def = BY_ID[boxEl.dataset.el];
    if (!def) return;
    ev.preventDefault();
    if (isLocked(def.id)) { select(def.id); return; }
    select(def.id, { keepPanel: S.selected === def.id });
    const isResize = Boolean(ev.target.closest('.lab-handle'));
    const { k } = cardUnits(ev);
    drag = {
      def, isResize, k,
      startX: ev.clientX, startY: ev.clientY,
      snap: JSON.parse(JSON.stringify(S.draft.layout)),
      startBox: def.box(S.draft.layout, S.draft.text),
      moved: false,
    };
    try { boxEl.setPointerCapture(ev.pointerId); } catch (e) {}
  }

  function onPointerMove(ev) {
    if (!drag) return;
    let dx = (ev.clientX - drag.startX) * drag.k;
    let dy = (ev.clientY - drag.startY) * drag.k;
    if (ev.shiftKey) { dx = Math.round(dx / 10) * 10; dy = Math.round(dy / 10) * 10; }
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    drag.moved = true;
    const L = S.draft.layout;
    Object.assign(L, JSON.parse(JSON.stringify(drag.snap)));
    if (drag.isResize) drag.def.resize(L, drag.snap, dx, dy, drag.startBox);
    else drag.def.move(L, drag.snap, dx, dy);
    queueRender();
    syncPropValues();
  }

  function onPointerUp() {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (moved) afterChange();
  }

  function select(id, opts) {
    S.selected = id;
    renderList();
    if (!opts || !opts.keepPanel) renderProps();
    renderBoxes();
  }

  function nudge(dx, dy) {
    const def = BY_ID[S.selected];
    if (!def || S.side === 'back' || !S.canEdit || isLocked(def.id)) return;
    const snap = JSON.parse(JSON.stringify(S.draft.layout));
    def.move(S.draft.layout, snap, dx, dy);
    syncPropValues();
    afterChange();
  }

  function onKey(ev) {
    if (!S) return;
    const tag = (ev.target && ev.target.tagName) || '';
    const typing = /INPUT|TEXTAREA|SELECT/.test(tag);
    if ((ev.ctrlKey || ev.metaKey) && !typing && ev.key.toLowerCase() === 'z') {
      ev.preventDefault();
      if (ev.shiftKey) redo(); else undo();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && !typing && ev.key.toLowerCase() === 'y') { ev.preventDefault(); redo(); return; }
    if (typing || !S.selected) return;
    const step = ev.shiftKey ? 10 : 1;
    const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (map[ev.key]) { ev.preventDefault(); nudge(map[ev.key][0], map[ev.key][1]); }
    if (ev.key === 'Escape') select(null);
  }

  function onBeforeUnload(ev) {
    if (S && S.dirty) { ev.preventDefault(); ev.returnValue = ''; }
  }

  let inputTimer = null;
  function selectedDef() { return S.selected ? BY_ID[S.selected] : null; }
  function selectedLocked() { return Boolean(S.selected && S.side === 'front' && isLocked(S.selected)); }

  function onInput(ev) {
    const t = ev.target;
    if (!S.canEdit) return;
    const L = S.draft.layout;
    const def = selectedDef();
    let changed = false;
    if (t.dataset.key) {
      if (selectedLocked()) return;
      const v = parseFloat(t.value);
      if (!Number.isFinite(v)) return;
      const key = t.dataset.key;
      const field = (def ? (def.fields || []).concat(def.groupFields || []) : []).find(f => f.k === key) || BACK_FIELDS.find(f => f.k === key);
      const val = field ? clamp(v, field.min, field.max) : v;
      L[key] = field && field.step && field.step < 1 ? Math.round(val * 100) / 100 : Math.round(val);
      if (field && field.link) field.link(L);
      changed = true;
    } else if (t.dataset.fxnum) {
      if (!def || selectedLocked()) return;
      const v = parseFloat(t.value);
      if (!Number.isFinite(v)) return;
      const field = def.fields.find(f => f.fx && f.k === t.dataset.fxnum);
      const lo = field ? field.min : -3, hi = field ? field.max : 20;
      setFx(L, def.id, t.dataset.fxnum, clamp(t.dataset.fxnum === 'letterSpacing' ? Math.round(v * 2) / 2 : Math.round(v), lo, hi));
      changed = true;
    } else if (t.dataset.fxr || t.dataset.kr) {
      if (!def || selectedLocked()) return;
      const v = parseFloat(t.value);
      const scale = parseFloat(t.dataset.scale || '1') || 1;
      if (t.dataset.kr) L[t.dataset.kr] = Math.round(v) / scale;
      else setFx(L, def.id, t.dataset.fxr, v / scale);
      const out = t.closest('label') && t.closest('label').querySelector('b');
      if (out) out.textContent = v + (t.dataset.unit || '');
      changed = true;
    } else if (t.dataset.fxc) {
      if (!def || selectedLocked()) return;
      setFx(L, def.id, t.dataset.fxc, t.value);
      changed = true;
    } else if (t.dataset.color) {
      S.draft.colors[t.dataset.color] = t.value; changed = true;
    } else if (t.dataset.text) {
      S.draft.text[t.dataset.text] = t.dataset.text === 'terms'
        ? t.value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 12)
        : t.value;
      changed = true;
    } else if (t.dataset.inst) {
      S.draft.institution[t.dataset.inst] = t.value; changed = true;
    }
    if (!changed) return;
    queueRender();
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => afterChange(), 350);
  }

  const LEGACY_SHOW = { border: 'showBorder', title: 'showTitle', logo: 'showLogo', signature: 'showSignature',
    sigLabel: 'showSignature', watermark: 'showWatermark', blood: 'showVitals', geno: 'showVitals' };

  function setShown(id, on) {
    const L = S.draft.layout;
    if (on) {
      setFx(L, id, 'hidden', false);
      if (LEGACY_SHOW[id]) L[LEGACY_SHOW[id]] = true;
    } else {
      setFx(L, id, 'hidden', true);
    }
  }

  function toggleLock(id) {
    const L = S.draft.layout;
    setFx(L, id, 'locked', !isLocked(id));
    afterChange();
    renderList(); renderProps(); renderBoxes();
  }

  // Layers: order[0] is the back of the card, the last one is the front.
  function moveLayer(id, how) {
    const L = S.draft.layout;
    const order = CardCanvas.layerOrder(L.order);
    const i = order.indexOf(id);
    if (i < 0) return;
    order.splice(i, 1);
    let j = i;
    if (how === 'fwd') j = Math.min(order.length, i + 1);
    else if (how === 'bwd') j = Math.max(0, i - 1);
    else if (how === 'front') j = order.length;
    else if (how === 'back') j = 0;
    order.splice(j, 0, id);
    L.order = order;
    afterChange();
    renderList(); renderBoxes();
  }

  function onChange(ev) {
    const t = ev.target;
    if (S.canEdit) {
      if (t.dataset.toggle) {
        if (selectedLocked()) return;
        S.draft.layout[t.dataset.toggle] = t.checked;
        afterChange();
        renderList();
        return;
      }
      if (t.dataset.showel) {
        setShown(t.dataset.showel, t.checked);
        afterChange();
        renderList(); renderBoxes();
        return;
      }
      if (t.dataset.fxs && S.selected) {
        setFx(S.draft.layout, S.selected, t.dataset.fxs, t.value);
        afterChange();
        return;
      }
      if (t.dataset.fxb && S.selected) {
        setFx(S.draft.layout, S.selected, t.dataset.fxb, t.checked);
        afterChange();
        return;
      }
      if (t.dataset.fxc && S.selected) {
        // colour picker finished: show the "Use standard" button
        renderProps();
        return;
      }
      if (t.dataset.fxr || t.dataset.kr) { renderProps(); return; }
    }
    if (t.id === 'lab-crest-file' && t.files && t.files[0]) loadCrest(t.files[0]);
    if (t.id === 'lab-school' ) switchSchool(t.value);
    if (t.id === 'lab-sample') { S.sample = t.value; queueRender(); }
  }

  function onClick(ev) {
    const t = ev.target.closest('button, summary');
    if (!t) return;
    if (t.tagName === 'SUMMARY') {
      const d = t.parentElement;
      setTimeout(() => { S.openGroups[d.dataset.group] = d.open; }, 0);
      return;
    }
    if (t.dataset.select) { select(t.dataset.select); return; }
    if (t.dataset.side) { setSide(t.dataset.side); return; }
    if (t.dataset.resetEl) { resetElement(t.dataset.resetEl); return; }
    if (t.dataset.act && S.canEdit) {
      const id = t.dataset.id;
      if (t.dataset.act === 'lock') toggleLock(id);
      else moveLayer(id, t.dataset.act);
      return;
    }
    if (t.dataset.fxclear && S.selected && S.canEdit) {
      setFx(S.draft.layout, S.selected, t.dataset.fxclear, '');
      afterChange(); renderProps();
      return;
    }
    switch (t.id) {
      case 'lab-undo': undo(); break;
      case 'lab-redo': redo(); break;
      case 'lab-reset-all': resetAll(); break;
      case 'lab-revert': revertToSaved(); break;
      case 'lab-save': save(); break;
      case 'lab-crest-clear': S.draft.institution.crestUrl = ''; afterChange(); renderProps(); break;
      default: break;
    }
  }

  function setSide(side) {
    S.side = side;
    S.el.querySelectorAll('[data-side]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.side === side)));
    renderList();
    renderProps();
    queueRender();
  }

  function resetElement(id) {
    const def = BY_ID[id];
    if (!def || isLocked(id)) return;
    const D = defaultsLayout();
    (def.keys || []).forEach(k => { S.draft.layout[k] = D[k]; });
    if (S.draft.layout.fx) {
      const keepLock = fxv(S.draft.layout, id, 'locked', false);
      delete S.draft.layout.fx[id];
      if (keepLock) setFx(S.draft.layout, id, 'locked', true);
    }
    if (LEGACY_SHOW[id]) S.draft.layout[LEGACY_SHOW[id]] = true;
    afterChange();
    renderProps();
    renderList();
  }

  function resetAll() {
    if (!window.confirm('Put every part of the card back to the standard design? Your school name and crest stay. You can undo this.')) return;
    S.draft.layout = defaultsLayout();
    S.draft.layout.fx = {};
    S.draft.layout.order = CardCanvas.layerOrder(null);
    S.draft.colors = Object.assign({}, CardTemplate.getDefault().colors);
    const name = S.draft.institution.name;
    const crest = S.draft.institution.crestUrl;
    S.draft.text = defaultsText();
    S.draft.institution = Object.assign({}, CardTemplate.getDefault().institution, { name, crestUrl: crest });
    afterChange();
    renderProps();
    renderList();
  }

  function revertToSaved() {
    if (!S.dirty) return;
    if (!window.confirm('Throw away the changes you have not saved?')) return;
    restoreSnapshot(S.savedSnap);
    pushHistory();
    setStatus('Changes thrown away. This is the saved design.', 'ok');
  }

  function loadCrest(file) {
    if (file.size > 3 * 1024 * 1024) { setStatus('That image is over 3 MB. Use a smaller crest image.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Keep the saved design small: largest side 400 px.
        const scale = Math.min(1, 400 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        S.draft.institution.crestUrl = c.toDataURL('image/png');
        afterChange();
        renderProps();
        setStatus('Crest added. Save to keep it.', 'ok');
      };
      img.onerror = () => setStatus('That file could not be read as an image.', 'error');
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  async function save() {
    if (!S.canEdit || S.saving) return;
    const { errors } = computeChecks();
    if (errors.length) { setStatus('Fix the problems listed under the card before saving.', 'error'); return; }
    S.saving = true;
    updateButtons();
    setStatus('Saving…');
    const design = {
      id: S.draft.id || null,
      schoolId: S.schoolId,
      institution: S.draft.institution,
      colors: S.draft.colors,
      layout: S.draft.layout,
      text: S.draft.text,
      canvas: S.draft.canvas,
      fonts: S.draft.fonts,
    };
    const res = await CardTemplate.save(design, { schoolId: S.schoolId });
    S.saving = false;
    if (res.success) {
      if (res.template && res.template.id) S.draft.id = res.template.id;
      S.savedSnap = snapshot();
      S.dirty = false;
      try { localStorage.removeItem(draftKey()); } catch (e) {}
      setStatus(res.localOnly
        ? 'Saved on this computer only (demo mode). On the live site this saves for the whole school.'
        : `Saved for ${S.schoolName}. New cards, downloads and print sheets now use this design.`, 'ok');
    } else {
      const msg = String(res.error || '');
      const friendly = /row-level security|permission|policy|42501/i.test(msg)
        ? 'You can only save the design for your own school, and you need to be signed in with two-step verification.'
        : 'Could not save: ' + msg;
      setStatus(friendly, 'error');
    }
    updateButtons();
  }

  async function switchSchool(schoolId) {
    if (S.dirty && !window.confirm('You have unsaved changes for this school. Switch anyway? They stay saved as a draft on this computer.')) {
      const sel = S.el.querySelector('#lab-school'); if (sel) sel.value = S.schoolId;
      return;
    }
    await openSchool(schoolId);
  }

  async function openSchool(schoolId) {
    S.schoolId = schoolId;
    const school = (S.ctx.schoolsList || []).find(s => s.id === schoolId) || S.ctx.school || null;
    S.schoolName = (school && school.name) || 'this school';
    setStatus('Loading design…');
    let tpl;
    try {
      tpl = await CardTemplate.load({ schoolId });
    } catch (e) {
      tpl = CardTemplate.get();
    }
    S.draft = fullDraft(tpl, school);
    if (!school || !school.name) {
      // School list unavailable (demo or offline): name it from the card header.
      const n = String(S.draft.institution.name || '').toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase());
      if (n) S.schoolName = n;
    }
    S.savedSnap = snapshot();
    S.history = [S.savedSnap];
    S.future = [];
    S.dirty = false;
    S.selected = null;

    // Bring back unsaved work from earlier on this computer.
    let restored = false;
    try {
      const raw = localStorage.getItem(draftKey());
      if (raw && raw !== S.savedSnap) {
        Object.assign(S.draft, JSON.parse(raw));
        S.dirty = true;
        S.history.push(snapshot());
        restored = true;
      }
    } catch (e) {}

    const nameEl = S.el.querySelector('#lab-school-name');
    if (nameEl) nameEl.textContent = S.schoolName;
    setStatus(restored ? 'Your unsaved changes from earlier were brought back. Save them, or use "Discard changes".' : '', restored ? 'warn' : '');
    renderList();
    renderProps();
    queueRender();
    updateButtons();
  }

  // ── Mount / unmount ────────────────────────────────────────────
  async function mount(el, ctx) {
    unmount();
    const canEdit = EDIT_ROLES.includes(ctx && ctx.role);
    const isSuper = ctx && ctx.role === 'super_admin';
    const schools = (ctx && ctx.schoolsList) || [];
    const schoolId = (ctx && ctx.schoolId) || (schools[0] && schools[0].id) || (window.CardTemplate && CardTemplate.EBSU_SCHOOL_ID);

    S = {
      el, ctx: ctx || {}, canEdit, schoolId, schoolName: '',
      draft: null, savedSnap: '', history: [], future: [], dirty: false,
      selected: null, side: 'front', sample: 'standard', saving: false,
      openGroups: { words: false, colours: false, crest: false, look: true, group: false },
      sampleSig: makeSampleSignature(), lastChecks: null,
    };

    const schoolPicker = isSuper && schools.length > 1
      ? `<label class="lab-inline"><span>School</span>
          <select id="lab-school" class="sh-input">${schools.map(s => `<option value="${esc(s.id)}" ${s.id === schoolId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>`
      : '<span class="lab-school">Designing for <strong id="lab-school-name"></strong></span>';

    el.innerHTML = `
      <div class="lab">
        <div class="lab-bar">
          <div class="lab-bar-left">
            ${schoolPicker}
            <div class="lab-seg" role="group" aria-label="Side of the card">
              <button type="button" class="sh-btn sh-btn-secondary" data-side="front" aria-pressed="true">Front</button>
              <button type="button" class="sh-btn sh-btn-secondary" data-side="back" aria-pressed="false">Back</button>
            </div>
            <label class="lab-inline"><span>Preview with</span>
              <select id="lab-sample" class="sh-input">
                <option value="standard">A typical student</option>
                <option value="long">A very long name</option>
              </select></label>
          </div>
          <div class="lab-bar-right">
            <button type="button" id="lab-undo" class="sh-btn sh-btn-secondary" title="Undo (Ctrl+Z)">Undo</button>
            <button type="button" id="lab-redo" class="sh-btn sh-btn-secondary" title="Redo (Ctrl+Shift+Z)">Redo</button>
            <button type="button" id="lab-revert" class="sh-btn sh-btn-secondary">Discard changes</button>
            <button type="button" id="lab-reset-all" class="sh-btn sh-btn-secondary">Reset to standard</button>
            <button type="button" id="lab-save" class="sh-btn">Save design</button>
          </div>
        </div>
        <div class="lab-statusrow">
          <span id="lab-dirty" class="lab-dirty"></span>
          <span id="lab-status" class="lab-status" role="status" aria-live="polite"></span>
        </div>
        ${canEdit ? '' : '<p class="lab-readonly">You can look at your school\'s card design here. Only an admin or registrar can change it.</p>'}
        <div class="lab-main">
          <aside class="lab-panel lab-panel-left">
            <h3 class="lab-h">Parts of the card</h3>
            <ul id="lab-elements" class="lab-elements"></ul>
          </aside>
          <section class="lab-stage" aria-label="Card preview">
            <div class="lab-canvas-wrap">
              <canvas id="lab-canvas" width="${W}" height="${H}"></canvas>
              <div id="lab-overlay" class="lab-overlay"></div>
            </div>
            <p class="lab-size-note">Shown at screen size. Printed size: 85.6 × 54 mm (standard ID card). Sample student, not real data.</p>
            <div id="lab-checks" class="lab-checks" aria-live="polite"></div>
          </section>
          <aside id="lab-props" class="lab-panel lab-panel-right"></aside>
        </div>
      </div>`;

    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onBeforeUnload);
    el.addEventListener('input', onInput);
    el.addEventListener('change', onChange);
    el.addEventListener('click', onClick);

    await openSchool(schoolId);
  }

  function unmount() {
    if (!S) return;
    const el = S.el;
    el.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('beforeunload', onBeforeUnload);
    el.removeEventListener('input', onInput);
    el.removeEventListener('change', onChange);
    el.removeEventListener('click', onClick);
    // Make sure the rest of the console keeps drawing with the signed-in school's saved design.
    if (window.CardTemplate && S.ctx && S.ctx.schoolId && S.schoolId !== S.ctx.schoolId) {
      CardTemplate.load().catch(() => {});
    }
    S = null;
  }

  return { mount, unmount };
})();

if (typeof window !== 'undefined') window.CardLab = CardLab;
