/**
 * cardTemplate.js — Card design manager, one design per school.
 *
 * Each school has its own row in public.card_templates (keyed by school_id).
 * Database rules let a school's admin / registrar save only their own school's
 * design (super admin: any school), with two-factor sign-in required.
 *
 *   CardTemplate.setSchool(schoolId)   // which school this page is drawing for
 *   await CardTemplate.load()          // that school's saved design (or the default)
 *   CardTemplate.get()                 // the loaded design (sync), used by canvas.js
 *   await CardTemplate.save(design)    // save for the current school
 *
 * Words printed on the card (title, labels, terms) live in institution.cardText,
 * so no database change is needed.
 */

const CardTemplate = (() => {
  const EBSU_SCHOOL_ID = '00000000-0000-4000-8000-000000000001';
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const DEFAULT_TEMPLATE = {
    id: 'ebsu-default',
    institution: {
      name: 'EBONYI STATE UNIVERSITY, ABAKALIKI',
      crestUrl: '',
      expiryYear: 2029
    },
    canvas: {
      width: 1011,
      height: 638
    },
    colors: {
      headerBg:        '#1558c0',
      headerText:      '#ffffff',
      bodyBg:          '#ffffff',
      borderColor:     '#6ab0e0',
      titleColor:      '#cc0000',
      matricLabel:     '#1a3a9a',
      matricValue:     '#0B1F4D',
      lineColor:       '#4A86E8',
      labelColor:      '#000000',
      valueColor:      '#222222',
      photoBackground: '#aa1111'
    },
    fonts: {
      heading: 'Arial, sans-serif',
      body:    'Arial, sans-serif',
      mono:    'monospace'
    },
    layout: {
      headerFontSize:   36,
      titleFontSize:    38,
      matricFontSize:   32,
      matricLabelFontSize: 19,
      fieldFontSize:    22,
      bloodFontSize:    20,
      sigLabelFontSize: 18,
      photoX: 20,  photoY: 210, photoW: 310, photoH: 360,
      matricLabelX: 20, matricY: 189,
      fieldLabelX: 340, fieldValueX: 435,
      fieldsStartY: 240, fieldSpacing: 80,
      bloodX: 20, bloodY: 600, bloodValueX: 178,
      genoX:  20, genoY:  625,
      logoX: 805, logoY: 205, logoW: 125, logoH: 125, logoAlpha: 1.0,
      qrX: 760, qrY: 360, qrSize: 215,
      sigLabelX: 340, sigLabelY: 522,
      sigBoxX: 340, sigBoxY: 530, sigBoxW: 400, sigBoxH: 92,
      layoutVersion: 2,
      watermarkAlpha: 0.10, watermarkSize: 340,
      backHeaderFontSize: 28,
      backTermsHeadSize:  20,
      backTermsBodySize:  18
    }
  };

  let currentSchoolId = null;
  let activeTemplate = clone(DEFAULT_TEMPLATE);

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function cacheKey(schoolId) { return 'sid_template_' + (schoolId || 'default'); }

  // Layouts saved before v2 had a tiny reg number and signature; give them the v2 values.
  const V2_KEYS = ['matricFontSize', 'matricLabelFontSize', 'matricY', 'sigLabelFontSize',
    'qrX', 'qrY', 'qrSize', 'sigLabelX', 'sigLabelY', 'sigBoxX', 'sigBoxY', 'sigBoxW', 'sigBoxH'];
  function upgradeLayout(saved) {
    const layout = Object.assign({}, DEFAULT_TEMPLATE.layout, saved || {});
    if (saved && Number(saved.layoutVersion || 1) < 2) {
      V2_KEYS.forEach(k => { if (k in DEFAULT_TEMPLATE.layout) layout[k] = DEFAULT_TEMPLATE.layout[k]; });
    }
    layout.layoutVersion = 2;
    return layout;
  }

  // Turn a database row (or cached object) into a full design.
  function normalize(data, schoolId) {
    const inst = Object.assign({}, DEFAULT_TEMPLATE.institution, data.institution || {});
    const text = data.text || inst.cardText || null;
    return {
      id: data.id || null,
      schoolId: data.school_id || data.schoolId || schoolId || null,
      institution: inst,
      canvas: Object.assign({}, DEFAULT_TEMPLATE.canvas, data.canvas || {}),
      colors: Object.assign({}, DEFAULT_TEMPLATE.colors, data.colors || {}),
      fonts: Object.assign({}, DEFAULT_TEMPLATE.fonts, data.fonts || {}),
      layout: upgradeLayout(data.layout),
      text: text ? clone(text) : null,
      updatedAt: data.updated_at || data.updatedAt || null,
    };
  }

  function readCache(schoolId) {
    try {
      let raw = localStorage.getItem(cacheKey(schoolId));
      // Older builds kept one shared copy; only EBSU may inherit it.
      if (!raw && (!schoolId || schoolId === EBSU_SCHOOL_ID)) raw = localStorage.getItem('sid_canonical_template');
      return raw ? normalize(JSON.parse(raw), schoolId) : null;
    } catch (e) {
      return null;
    }
  }

  function writeCache(tpl) {
    try { localStorage.setItem(cacheKey(tpl.schoolId), JSON.stringify(tpl)); } catch (e) {}
  }

  // Start from this browser's cached copy so the first draw is right.
  activeTemplate = readCache(null) || activeTemplate;

  function getClient() {
    if (typeof ebsuSupabase !== 'undefined' && ebsuSupabase) return ebsuSupabase;
    if (typeof AuthManager !== 'undefined' && AuthManager.getClient) return AuthManager.getClient();
    if (typeof supabase !== 'undefined' && typeof EBSU_CONFIG !== 'undefined' && EBSU_CONFIG.SUPABASE_URL) {
      return supabase.createClient(EBSU_CONFIG.SUPABASE_URL, EBSU_CONFIG.SUPABASE_ANON_KEY);
    }
    return null;
  }

  // Demo mode on this computer (mock staff session): never talk to the server.
  function isLocalDemo() {
    try {
      return typeof AuthManager !== 'undefined' && AuthManager.isPrivateDemoHost && AuthManager.isPrivateDemoHost()
        && Boolean(sessionStorage.getItem('ebsu_mock_staff_session'));
    } catch (e) {
      return false;
    }
  }

  function setSchool(schoolId) {
    currentSchoolId = schoolId || null;
    const cached = readCache(currentSchoolId);
    activeTemplate = cached || Object.assign(clone(DEFAULT_TEMPLATE), { id: null, schoolId: currentSchoolId });
  }

  function getSchool() { return currentSchoolId; }

  /**
   * load()                      -> current school's design
   * load({ schoolId })          -> that school's design (does not change the current school)
   * load('template-id')         -> legacy: a design by id
   */
  async function load(arg) {
    const byId = typeof arg === 'string' && !UUID_RE.test(arg) ? arg : null;
    const schoolId = (arg && typeof arg === 'object' && arg.schoolId) || (typeof arg === 'string' && UUID_RE.test(arg) ? arg : null) || currentSchoolId;
    const makeActive = !(arg && typeof arg === 'object' && arg.schoolId && arg.schoolId !== currentSchoolId);

    let result = readCache(schoolId) || Object.assign(clone(DEFAULT_TEMPLATE), { id: null, schoolId });
    const client = getClient();

    if (client && !isLocalDemo()) {
      try {
        let row = null;
        if (byId) {
          const { data } = await client.from('card_templates').select('*').eq('id', byId).maybeSingle();
          row = data;
        } else if (schoolId) {
          const { data } = await client.from('card_templates').select('*')
            .eq('school_id', schoolId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
          row = data;
        } else {
          const { data } = await client.from('card_templates').select('*').eq('id', 'ebsu-default').maybeSingle();
          row = data;
        }
        if (row) {
          result = normalize(row, schoolId);
          writeCache(result);
        }
      } catch (err) {
        console.warn('Card design: could not reach the server, using the saved copy on this computer.', err);
      }
    }

    if (makeActive) activeTemplate = result;
    return clone(result);
  }

  /**
   * save(design, { schoolId }) — saves the whole design for one school.
   * Returns { success, localOnly?, error?, template }.
   */
  async function save(design, opts) {
    const schoolId = (opts && opts.schoolId) || design.schoolId || currentSchoolId;
    if (!schoolId) return { success: false, error: 'No school selected.' };

    const base = normalize(Object.assign({}, activeTemplate.schoolId === schoolId ? activeTemplate : {}, design), schoolId);
    // Keep the school's existing row id (EBSU's is 'ebsu-default'); otherwise one row per school.
    const id = (base.id && base.schoolId === schoolId) ? base.id
      : (schoolId === EBSU_SCHOOL_ID ? 'ebsu-default' : 'school-' + schoolId);
    const tpl = Object.assign(base, { id, schoolId, updatedAt: new Date().toISOString() });

    const client = getClient();
    if (!client || isLocalDemo()) {
      writeCache(tpl);
      if (schoolId === currentSchoolId) activeTemplate = tpl;
      return { success: true, localOnly: true, template: clone(tpl) };
    }

    let userId = null;
    try {
      const { data } = await client.auth.getUser();
      userId = data && data.user ? data.user.id : null;
    } catch (e) {}

    const payload = {
      id,
      school_id: schoolId,
      institution: Object.assign({}, tpl.institution, { cardText: tpl.text || null }),
      canvas: tpl.canvas,
      colors: tpl.colors,
      fonts: tpl.fonts,
      layout: tpl.layout,
      updated_by: userId,
    };

    try {
      const { data, error } = await client.from('card_templates').upsert(payload).select().maybeSingle();
      if (error) return { success: false, error: error.message, template: clone(tpl) };
      const saved = normalize(data || payload, schoolId);
      writeCache(saved);
      if (schoolId === currentSchoolId) activeTemplate = saved;
      return { success: true, template: clone(saved) };
    } catch (err) {
      return { success: false, error: err.message || String(err), template: clone(tpl) };
    }
  }

  function get() { return clone(activeTemplate); }
  function getDefault() { return clone(DEFAULT_TEMPLATE); }

  return { get, getDefault, load, save, setSchool, getSchool, EBSU_SCHOOL_ID };
})();

if (typeof window !== 'undefined') {
  window.CardTemplate = CardTemplate;
}
