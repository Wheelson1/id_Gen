/**
 * main.js — Application entry point.
 * Initialises all modules on DOMContentLoaded.
 * Also loads admin-configured defaults from localStorage so that
 * settings saved in admin.html are automatically applied here.
 */

// ── INIT ────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {

  // 1. Load admin CardConfig (font sizes, watermark alphas, etc.)
  try {
    const savedCC = JSON.parse(localStorage.getItem('idcard_cardconfig') || 'null');
    window.CardConfig = savedCC || {};
  } catch(e) {
    window.CardConfig = {};
  }

  // 2. Load admin school/expiry/colour defaults
  try {
    const savedDefs = JSON.parse(localStorage.getItem('idcard_defaults') || 'null');
    if (savedDefs) {
      if (savedDefs.schoolName) {
        AppState.set('schoolName', savedDefs.schoolName);
        const el = document.getElementById('schoolName');
        if (el) el.value = savedDefs.schoolName;
      }
      if (savedDefs.expiry) {
        AppState.set('expiry', savedDefs.expiry);
        const el = document.getElementById('expiry');
        if (el) el.value = savedDefs.expiry;
      }
      if (savedDefs.colors) {
        const merged = Object.assign({}, AppState.get('colors') || {}, savedDefs.colors);
        AppState.set('colors', merged);
        // Sync each colour picker in the UI
        Object.keys(merged).forEach(k => UI.updateColor(k, merged[k]));
      }
    }
  } catch(e) { /* Malformed JSON in localStorage — ignore, use defaults */ }

  // 3. Start modules
  Cropper.init();
  UI.init();
});

// ── HTML ONCLICK BRIDGES ─────────────────────────────────────────
// Thin wrappers so HTML onclick="" attributes work without coupling
// individual modules to the global scope.

function showPage(pg)              { UI.showPage(pg); }
function generate()                { UI.generate(); }
function setLayout(l)              { UI.setLayout(l); }
function downloadCard()            { UI.downloadCard(); }
function doPrint()                 { UI.doPrint(); }
function pickLogo()                { UI.pickLogo(); }
function removeImg(field)          { UI.removeImg(field); }
function applyTheme(name)          { UI.applyTheme(name); }
function updateColor(key, val)     { UI.updateColor(key, val); }
function syncColorText(key, val)   { UI.syncColorText(key, val); }
function pickFile(field, aspect)   { Cropper.pickFile(field, aspect); }
function applyCrop()               { Cropper.apply(); }
function cancelCrop()              { Cropper.cancel(); }

// Quick-choice modal bridges
function acceptCrop()              { Cropper.acceptImage(); }
function doCrop()                  { Cropper.cropImage(); }
function cancelQuickCrop()         { Cropper.cancelQuick(); }
