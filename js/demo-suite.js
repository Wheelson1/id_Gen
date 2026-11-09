/**
 * demo-suite.js — Disabled in production (Phase 1 Security Hotfix)
 * All demo personas, hardcoded credentials, and mock session injectors have been removed.
 */

const DEMO_PERSONAS = Object.freeze({});

const DemoAuthSuite = Object.freeze({
  getPersona() {
    return null;
  },
  setMockSession() {
    return null;
  },
  async executeLogin() {
    return;
  },
  renderCardsHtml() {
    return '';
  }
});

window.DEMO_PERSONAS = DEMO_PERSONAS;
window.DemoAuthSuite = DemoAuthSuite;
