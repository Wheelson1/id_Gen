/**
 * js/guard.js — Shared Route Guard for Protected Staff Pages (Phase 2)
 *
 * Loaded first in <head> on every protected page:
 *   <script src="config.js"></script>
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
 *   <script src="js/auth.js"></script>
 *   <script src="js/guard.js" data-allowed-roles="operator,registrar,admin,super_admin"></script>
 *
 * Behavior:
 *   1. Immediately hides documentElement before body renders.
 *   2. Checks active Supabase session and user.app_metadata.role.
 *   3. For registrar, admin, and super_admin, verifies TOTP MFA assurance level is aal2.
 *   4. Redirects immediately to login.html?next=<current_page> if unauthorized.
 *   5. Starts 30-minute inactivity auto-logout timer and exposes Guard.signOut().
 */

const Guard = (() => {
  // Hide page immediately before rendering body
  const _guardStyle = document.createElement('style');
  _guardStyle.id = 'ebsu-guard-cloak';
  _guardStyle.textContent = 'html { visibility: hidden !important; opacity: 0 !important; }';
  (document.head || document.documentElement).appendChild(_guardStyle);

  const scriptTag = document.currentScript || document.querySelector('script[src*="guard.js"]');
  const rolesAttr = scriptTag ? scriptTag.getAttribute('data-allowed-roles') : null;
  const allowStudentSession = scriptTag ? scriptTag.getAttribute('data-allow-student-session') === 'true' : false;
  const _allowedRoles = rolesAttr
    ? rolesAttr.split(',').map(r => r.trim()).filter(Boolean)
    : ['operator', 'scanner', 'registrar', 'admin', 'super_admin', 'staff'];

  let _currentUser = null;
  let _currentSession = null;
  let _currentRole = null;
  let _studentSession = null;
  let _readyPromise = null;

  function revealPage() {
    const cloak = document.getElementById('ebsu-guard-cloak');
    if (cloak && cloak.parentNode) {
      cloak.parentNode.removeChild(cloak);
    }
    document.documentElement.style.visibility = 'visible';
    document.documentElement.style.opacity = '1';
  }

  function currentRelativeTarget() {
    const file = window.location.pathname.split('/').pop() || 'hub.html';
    return file + (window.location.search || '') + (window.location.hash || '');
  }

  function redirectToLogin(reason) {
    const next = encodeURIComponent(currentRelativeTarget());
    const q = reason ? `reason=${encodeURIComponent(reason)}&next=${next}` : `next=${next}`;
    window.location.replace(`login.html?${q}`);
  }

  function isPrivateDemoHost() {
    if (typeof window === 'undefined' || !window.location) return false;
    const h = window.location.hostname;
    const isPrivate = (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '::1' ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)
    );
    const cfg = (typeof EBSU_CONFIG !== 'undefined') ? EBSU_CONFIG : (typeof window !== 'undefined' ? window.EBSU_CONFIG : null);
    const isConfigDemo = Boolean(cfg && cfg.DEMO_MODE === true);
    return isPrivate && isConfigDemo;
  }

  async function verifyAccess(customRoles) {
    const allowed = Array.isArray(customRoles) && customRoles.length > 0 ? customRoles : _allowedRoles;

    if (typeof AuthManager === 'undefined') {
      redirectToLogin('auth_missing');
      return null;
    }

    const client = AuthManager.getClient();
    const search = (typeof window !== 'undefined' && window.location) ? (window.location.search || '') : '';
    const hasDemoParam = search.includes('demo=1') || search.includes('presentation=1');
    const isDemoPermitted = hasDemoParam && isPrivateDemoHost();

    if (!client) {
      if (isDemoPermitted && allowed.includes('scanner')) {
        _currentUser = {
          id: 'demo-staff-scanner',
          email: 'gate.scanner@ebsu.edu.ng',
          user_metadata: { full_name: 'EBSU Gate Scanner (Demo Sandbox)' },
          app_metadata: { role: 'scanner' },
        };
        _currentRole = 'scanner';
        _currentSession = { user: _currentUser };
        revealPage();
        return { session: _currentSession, user: _currentUser, role: 'scanner' };
      }
      redirectToLogin('config_missing');
      return null;
    }

    const session = await AuthManager.getSession();
    if (!session || !session.user) {
      // Check if presentation/demo mode is authorized strictly on private network
      if (isDemoPermitted && allowed.includes('scanner')) {
        _currentUser = {
          id: 'demo-staff-scanner',
          email: 'gate.scanner@ebsu.edu.ng',
          user_metadata: { full_name: 'EBSU Gate Scanner (Demo Sandbox)' },
          app_metadata: { role: 'scanner' },
        };
        _currentRole = 'scanner';
        _currentSession = { user: _currentUser };
        AuthManager.startInactivityTimer();
        revealPage();
        window.dispatchEvent(
          new CustomEvent('ebsu:guard-ready', {
            detail: { session: _currentSession, user: _currentUser, role: 'scanner' },
          })
        );
        return { session: _currentSession, user: _currentUser, role: 'scanner' };
      }

      // Check if page allows short-lived student onboarding/portal sessions
      if (allowStudentSession && typeof AuthManager.getStudentSession === 'function') {
        const stSess = AuthManager.getStudentSession();
        const rawHash = (window.location.hash || '').replace(/^#\/?/, '').split('?')[0].trim();
        const isPublicStudentHelpRoute = rawHash === 'help' || rawHash === 'support';

        if ((stSess && (stSess.session_id || stSess.onboarding_session_id || stSess.student_id)) || isPublicStudentHelpRoute) {
          _studentSession = stSess || null;
          _currentRole = 'student';
          _currentUser = {
            id: stSess?.student_id || 'student-guest',
            email: stSess?.jamb_no || stSess?.matric || 'Student Helpdesk',
            app_metadata: { role: 'student', school_id: stSess?.school_id || null },
          };
          AuthManager.startInactivityTimer();
          revealPage();
          window.dispatchEvent(
            new CustomEvent('ebsu:guard-ready', {
              detail: { session: null, studentSession: _studentSession, user: _currentUser, role: 'student' },
            })
          );
          return { session: null, studentSession: _studentSession, user: _currentUser, role: 'student' };
        }
      }
      redirectToLogin();
      return null;
    }

    const user = session.user;
    const role = user.app_metadata?.role || '';

    if (!allowed.includes(role)) {
      redirectToLogin('forbidden');
      return null;
    }

    // Enforce TOTP MFA (aal2) for registrar, admin, super_admin
    if (AuthManager.requiresMfa(role)) {
      const mfa = await AuthManager.getMfaStatus();
      if (mfa.currentLevel !== 'aal2') {
        redirectToLogin('mfa_required');
        return null;
      }
    }

    _currentSession = session;
    _currentUser = user;
    _currentRole = role;

    AuthManager.startInactivityTimer();
    revealPage();

    window.dispatchEvent(
      new CustomEvent('ebsu:guard-ready', {
        detail: { session, user, role },
      })
    );

    return { session, user, role };
  }

  async function signOut() {
    if (typeof AuthManager !== 'undefined') {
      await AuthManager.logout('login.html?reason=signed_out');
    } else {
      try { sessionStorage.clear(); } catch (e) {}
      window.location.replace('login.html?reason=signed_out');
    }
  }

  // Run verification immediately on load
  _readyPromise = verifyAccess(_allowedRoles);

  return {
    protect: (opts = {}) => verifyAccess(opts.roles || _allowedRoles),
    ready: () => _readyPromise,
    getUser: () => _currentUser,
    getSession: () => _currentSession,
    getStudentSession: () => _studentSession,
    getRole: () => _currentRole,
    isPrivateDemoHost,
    signOut,
  };
})();

window.Guard = Guard;

