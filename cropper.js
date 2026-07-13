/**
 * cropper.js — Image upload and cropping logic.
 *
 * Flow when user clicks "Upload & Crop":
 *   1. File picker opens.
 *   2. Image is read as DataURL.
 *   3. Quick-choice modal (#qc-modal) is shown with:
 *        • A preview of the uploaded image
 *        • Detected dimensions and a smart orientation hint
 *        • "✓ Accept" button  → saves image as-is, closes modal
 *        • "✂ Crop"   button  → closes modal, opens full crop overlay
 *        • "✕ Cancel" button  → discards the upload
 *   4. Full crop overlay: user drags to select an area, then applies.
 */
const Cropper = (() => {

  // ── STATE ────────────────────────────────────────────────────
  const state = {
    // Full-crop overlay state
    field:    null,
    aspect:   null,
    img:      null,
    dragging: false,
    start:    { x: 0, y: 0 },
    box:      null,
    // Quick-choice pending state
    pendingField:  null,
    pendingAspect: null,
    pendingSrc:    null
  };

  let canvas = null;

  // ── POINTER HELPERS ──────────────────────────────────────────
  function getPos(e) {
    const r  = canvas.getBoundingClientRect();
    const sx = canvas.width  / r.width;
    const sy = canvas.height / r.height;
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - r.left) * sx,
      y: (src.clientY - r.top)  * sy
    };
  }

  // ── FULL-CROP OVERLAY DRAW ───────────────────────────────────
  function redraw() {
    if (!canvas || !state.img) return;
    canvas.width  = state.img.naturalWidth;
    canvas.height = state.img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(state.img, 0, 0);

    if (state.box) {
      const { x, y, w, h } = state.box;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.clearRect(x, y, w, h);
      ctx.strokeStyle = '#00aaff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
    }
  }

  function buildBox(p) {
    const w = p.x - state.start.x;
    const h = state.aspect
      ? Math.abs(w) / state.aspect * (p.y > state.start.y ? 1 : -1)
      : p.y - state.start.y;
    state.box = {
      x: w < 0 ? p.x              : state.start.x,
      y: h < 0 ? state.start.y + h : state.start.y,
      w: Math.abs(w),
      h: Math.abs(h)
    };
  }

  // ── INIT ─────────────────────────────────────────────────────
  function init() {
    canvas = document.getElementById('crop-canvas');

    canvas.addEventListener('mousedown', e => {
      state.start    = getPos(e);
      state.dragging = true;
      state.box      = null;
      redraw();
    });
    canvas.addEventListener('mousemove', e => {
      if (!state.dragging) return;
      buildBox(getPos(e));
      redraw();
    });
    canvas.addEventListener('mouseup', () => { state.dragging = false; });

    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      state.start    = getPos(e);
      state.dragging = true;
      state.box      = null;
      redraw();
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      if (!state.dragging) return;
      buildBox(getPos(e));
      redraw();
    }, { passive: false });
    canvas.addEventListener('touchend', () => { state.dragging = false; });
  }

  // ── FULL-CROP OVERLAY: open / cancel / apply ─────────────────
  function open(field, aspect, src) {
    state.field    = field;
    state.aspect   = aspect;
    state.box      = null;
    state.dragging = false;

    const img = new Image();
    img.onload = () => { state.img = img; redraw(); };
    img.src = src;

    document.getElementById('cropper-overlay').classList.add('show');
  }

  function cancel() {
    document.getElementById('cropper-overlay').classList.remove('show');
  }

  function apply() {
    const b = state.box;
    if (!b || b.w < 5) {
      UI.showToast('Please drag to select an area first.', 2000, true);
      return;
    }

    const off = document.createElement('canvas');
    off.width  = b.w;
    off.height = b.h;
    const ctx = off.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(state.img, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    const url = off.toDataURL('image/png');

    _saveToStudent(state.field, url);
    cancel();
  }

  // ── QUICK-CHOICE MODAL ────────────────────────────────────────

  /**
   * Show the quick-choice modal for a newly loaded image.
   * Detects dimensions/orientation and builds a smart hint.
   */
  function showQuickChoice(field, aspect, src) {
    const img = new Image();
    img.onload = () => {
      state.pendingField  = field;
      state.pendingAspect = aspect;
      state.pendingSrc    = src;

      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const ratio = W / H;

      // Preview
      document.getElementById('qc-preview').src = src;
      document.getElementById('qc-dims').textContent = W + ' × ' + H + ' px';

      // Title and hint
      const isPhoto = field === 'photo';
      document.getElementById('qc-title').textContent =
        isPhoto ? 'Passport Photo' : 'Signature Image';

      let hint = '';
      if (isPhoto) {
        if (ratio <= 0.85)        hint = '✓ Portrait — looks good, you can accept or fine-tune with crop';
        else if (ratio <= 1.05)   hint = '⚠ Near-square detected — crop to portrait (3:4) recommended';
        else                      hint = '⚠ Landscape photo — please crop to portrait (3:4) for best result';
      } else {
        if (ratio >= 1.5)         hint = '✓ Landscape signature — looks good, you can accept directly';
        else if (ratio >= 0.9)    hint = '⚠ Near-square — crop to landscape for a cleaner signature strip';
        else                      hint = '⚠ Portrait image — crop to landscape orientation recommended';
      }
      document.getElementById('qc-hint').textContent = hint;

      document.getElementById('qc-modal').classList.add('show');
    };
    img.src = src;
  }

  /** User chose "✓ Accept" — save raw DataURL without cropping. */
  function acceptImage() {
    _saveToStudent(state.pendingField, state.pendingSrc);
    cancelQuick();
  }

  /** User chose "✂ Crop" — close modal, open full crop overlay. */
  function cropImage() {
    const { pendingField, pendingAspect, pendingSrc } = state;
    cancelQuick();
    open(pendingField, pendingAspect, pendingSrc);
  }

  /** User chose "✕ Cancel" — discard the upload. */
  function cancelQuick() {
    document.getElementById('qc-modal').classList.remove('show');
    state.pendingField = state.pendingAspect = state.pendingSrc = null;
  }

  /** Entry point called by the Upload button in index.html. */
  function pickFile(field, aspect) {
    const inp  = document.createElement('input');
    inp.type   = 'file';
    inp.accept = 'image/*';
    inp.onchange = e => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = ev => showQuickChoice(field, aspect, ev.target.result);
      reader.readAsDataURL(f);
    };
    inp.click();
  }

  // ── PRIVATE HELPERS ──────────────────────────────────────────

  /** Shared logic for saving an image (accepted or cropped) to the student. */
  function _saveToStudent(field, url) {
    AppState.currentStudent()[field] = url;

    if (field === 'photo') {
      const pp = document.getElementById('photo-preview');
      pp.innerHTML = '';
      const img = document.createElement('img');
      img.src = url;
      img.className = 'preview-img';
      pp.appendChild(img);
      document.getElementById('rm-photo').style.display = 'block';
    } else {
      const sp = document.getElementById('sig-preview');
      sp.innerHTML = '';
      const img = document.createElement('img');
      img.src = url;
      img.className = 'preview-img-sig';
      sp.appendChild(img);
      document.getElementById('rm-sig').style.display = 'block';
    }
  }

  // ── PUBLIC API ───────────────────────────────────────────────
  return { init, open, cancel, apply, pickFile, acceptImage, cropImage, cancelQuick };
})();
