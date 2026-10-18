/**
 * demo-suite.js — Universal 1-Click Demo Login & Attached Capabilities Suite
 * Powers interactive 1-click logins across all EBSU ID Portal authentication screens.
 */

const DEMO_PERSONAS = {
  superadmin: {
    key: 'superadmin',
    title: 'Super Admin',
    icon: '👑',
    email: 'superadmin+test@example.com',
    password: 'QaTest@2026!Secured',
    role: 'super_admin',
    name: 'Test Super Admin',
    badgeText: 'ROOT SAAS',
    badgeClass: 'demo-badge-super',
    summary: 'Multi-Institution SaaS Command Center',
    attached: [
      'Mothership Multi-University SaaS Control',
      'Global Emergency Killswitch (Disable Node Access)',
      'Multi-Campus Telemetry & Gateway Latency Monitor',
      'Database Root & All University Configurations'
    ],
    destUrl: 'mothership.html'
  },

  admin: {
    key: 'admin',
    title: 'University Admin',
    icon: '🏛️',
    email: 'admin+test@example.com',
    password: 'QaTest@2026!Secured',
    role: 'admin',
    name: 'Test University Admin',
    badgeText: 'ADMIN',
    badgeClass: 'demo-badge-admin',
    summary: 'Full Admin Panel & Academic Authority',
    attached: [
      'Full Administrative Panel Access',
      'Student Card Revocation Desk & Blacklisting',
      'Interactive Drag-and-Drop Layout Canvas Editor',
      'Institutional Defaults (School Name, Expiry Year, Colors)'
    ],
    destUrl: 'admin.html'
  },

  operator: {
    key: 'operator',
    title: 'Card Production Operator',
    icon: '🪪',
    email: 'editor+test@example.com',
    password: 'QaTest@2026!Secured',
    role: 'operator',
    name: 'Test Card Operator',
    badgeText: 'OPERATOR',
    badgeClass: 'demo-badge-operator',
    summary: 'Batch ID Generation & Print Bureau',
    attached: [
      'Bulk ID Generator (CSV Student Roster Ingestion)',
      'High-Resolution 300 DPI CR80 Dual-Sided Card Export',
      'Manual Form Fill & Photo/Signature Capture Desk',
      'Instant Cryptographic Ed25519 QR Binding'
    ],
    destUrl: 'generate.html'
  },

  registrar: {
    key: 'registrar',
    title: 'Academic Registrar',
    icon: '📋',
    email: 'manager+test@example.com',
    password: 'QaTest@2026!Secured',
    role: 'registrar',
    name: 'Test Academic Registrar',
    badgeText: 'REGISTRAR',
    badgeClass: 'demo-badge-admin',
    summary: 'Student Academic Records & Matric Validation',
    attached: [
      'Student Matriculation & Admission Record Search',
      'Academic Session & Expiry Verification',
      'Audit Logs & Verification Clearance Reviews'
    ],
    destUrl: 'admin.html'
  },

  verifier: {
    key: 'verifier',
    title: 'Security Officer / Verifier',
    icon: '🛡️',
    email: 'verifier+test@example.com',
    password: 'QaTest@2026!Secured',
    role: 'verifier',
    name: 'Test Security Guard',
    badgeText: 'VERIFIER',
    badgeClass: 'demo-badge-verifier',
    summary: 'Gate & Exam Invigilation Terminal',
    attached: [
      'Live Camera Scanner & QR Code Viewport',
      'Dual Online & Offline Ed25519 Cryptographic Decryption',
      'Real-Time Student Photo & Status Display (Active/Revoked)',
      'Gate Attendance Counter & Audio/Haptic Alerts'
    ],
    destUrl: 'verify.html'
  },

  student_active: {
    key: 'student_active',
    title: 'Student (Active & Verified)',
    icon: '🎓',
    email: 'student+test@example.com',
    matric: 'EBSU/2024/900001',
    jamb_no: '09035005623',
    password: 'QaTest@2026!Secured',
    role: 'student',
    name: 'NNAJI WILSON SOMTOCHUKWU',
    faculty: 'Faculty of Science',
    dept: 'Computer Science',
    level: '100 Level',
    session: '2024/2025',
    blood: 'A+',
    genotype: 'AA',
    expiry: 2029,
    status: 'active',
    fees_paid: true,
    badgeText: 'ACTIVE · PAID',
    badgeClass: 'demo-badge-student',
    summary: 'Full Student ID Card & Exam Access',
    attached: [
      'Official EBSU CR80 Digital ID Card Preview',
      'Dynamic 30-Second Rotating Anti-Screenshot QR Code',
      'Exam Hall Clearance Pass & Gate Verification Token',
      'Tuition Status: PAID (Full Access Unlocked)',
      'Activity & Verification History Log'
    ],
    destUrl: 'student-portal.html'
  },

  student_unpaid: {
    key: 'student_unpaid',
    title: 'Student (Fees Outstanding)',
    icon: '⚠️',
    email: 'student_unpaid+test@example.com',
    matric: 'EBSU/2024/900002',
    jamb_no: '09035005624',
    password: 'QaTest@2026!Secured',
    role: 'student',
    name: 'CHUKWUEMEKA CHIDERA ESTHER',
    faculty: 'Faculty of Law',
    dept: 'Public Law',
    level: '200 Level',
    session: '2024/2025',
    blood: 'O+',
    genotype: 'AS',
    expiry: 2028,
    status: 'provisional',
    fees_paid: false,
    badgeText: 'FEES DUE',
    badgeClass: 'demo-badge-warning',
    summary: 'Restricted Student Identity Portal',
    attached: [
      'Provisional Student Record (Law Faculty)',
      'Fees Outstanding Restriction Alert Banner',
      'ID Card Generation / Download Blocked Until Paid',
      'Direct Remita Tuition Payment Portal Link'
    ],
    destUrl: 'student-portal.html'
  },

  student_revoked: {
    key: 'student_revoked',
    title: 'Student (Card Revoked / Lost)',
    icon: '🚫',
    email: 'student_revoked+test@example.com',
    matric: 'EBSU/2024/900003',
    jamb_no: '09035005625',
    password: 'QaTest@2026!Secured',
    role: 'student',
    name: 'OKORO GODWIN BLESSING',
    faculty: 'Faculty of Management Sciences',
    dept: 'Accountancy',
    level: '300 Level',
    session: '2024/2025',
    blood: 'B+',
    genotype: 'AA',
    expiry: 2027,
    status: 'revoked',
    status_reason: 'Card lost on campus transit',
    status_reference: 'SEC/LOST/2026/089',
    fees_paid: true,
    badgeText: 'REVOKED / LOST',
    badgeClass: 'demo-badge-danger',
    summary: 'Revoked Credential & Security Warning',
    attached: [
      'Instant Invalidation Flag at All Security Gates',
      'Red Warning Alert on Verifier Scanner Screen',
      'Security Incident Reference (SEC/LOST/2026/089)',
      'Direct Link to Identity Reissue Bureau'
    ],
    destUrl: 'student-portal.html'
  }
};

const DemoAuthSuite = {
  getPersona(key) {
    return DEMO_PERSONAS[key] || null;
  },

  /**
   * Sets mock session in localStorage and returns persona
   */
  setMockSession(key) {
    const persona = this.getPersona(key);
    if (!persona) return null;

    const mockUser = {
      id: 'demo-user-' + persona.key,
      email: persona.email,
      user_metadata: {
        role: persona.role,
        full_name: persona.name,
        matric: persona.matric || ''
      }
    };

    const mockSession = {
      user: mockUser,
      access_token: 'mock-token-' + Date.now(),
      expires_at: Math.floor(Date.now() / 1000) + 86400
    };

    localStorage.setItem('ebsu_mock_session', JSON.stringify(mockSession));
    localStorage.setItem(`ebsu_login_count_${persona.email}`, '1');

    if (persona.matric) {
      localStorage.setItem('ebsu_active_student', JSON.stringify({
        ...persona,
        photo_url: 'images/demo_user_face.jpg',
        signature_url: 'images/demo_user_sig.jpg'
      }));
    }

    return persona;
  },

  /**
   * Universal 1-Click Demo Login Trigger
   */
  async executeLogin(key, opts = {}) {
    const persona = this.setMockSession(key);
    if (!persona) return;

    // Fill inputs if selectors/elements provided
    if (opts.emailInputId) {
      const emailEl = document.getElementById(opts.emailInputId);
      if (emailEl) emailEl.value = (opts.useMatric && persona.matric) ? persona.matric : persona.email;
    }
    if (opts.passInputId) {
      const passEl = document.getElementById(opts.passInputId);
      if (passEl) passEl.value = persona.password;
    }

    // Call custom action if defined
    if (typeof opts.onLogin === 'function') {
      try {
        await opts.onLogin(persona);
        return;
      } catch (e) {
        console.warn('Custom demo onLogin handler error, falling back:', e);
      }
    }

    // Click submit button if provided
    if (opts.submitBtnId) {
      const btn = document.getElementById(opts.submitBtnId);
      if (btn) {
        btn.click();
        return;
      }
    }

    // Otherwise navigate to persona destination if specified
    if (opts.redirect !== false && persona.destUrl) {
      window.location.href = persona.destUrl;
    }
  },

  /**
   * Generates HTML markup for demo cards with attached capabilities breakdown
   */
  renderCardsHtml(roleKeys, opts = {}) {
    return roleKeys.map(key => {
      const p = DEMO_PERSONAS[key];
      if (!p) return '';
      const loginVal = (opts.useMatric && p.matric) ? p.matric : p.email;
      const attachedList = p.attached.map(a => `<li>${a}</li>`).join('');

      return `
        <div class="demo-role-card" onclick="DemoAuthSuite.executeLogin('${p.key}', ${JSON.stringify(opts).replace(/"/g, '&quot;')})">
          <div class="demo-role-top">
            <div class="demo-role-name">
              <span>${p.icon}</span>
              <strong>${p.title}</strong>
            </div>
            <span class="demo-badge ${p.badgeClass}">${p.badgeText}</span>
          </div>

          <div class="demo-role-meta">
            <span class="demo-role-id">${loginVal}</span>
            <span class="demo-role-summary">· ${p.summary}</span>
          </div>

          <div class="demo-role-attached">
            <div class="demo-attached-label">⚡ WHAT IS ATTACHED &amp; UNLOCKED:</div>
            <ul class="demo-attached-items">
              ${attachedList}
            </ul>
          </div>

          <div class="demo-role-action">
            <span>⚡ 1-Click Demo Login</span>
            <span class="demo-arrow">→</span>
          </div>
        </div>
      `;
    }).join('');
  }
};

window.DEMO_PERSONAS = DEMO_PERSONAS;
window.DemoAuthSuite = DemoAuthSuite;
