/**
 * cardTemplate.js — Canonical Card Template Manager
 * Single source of truth for card visual styling, dimensions, colors, and layout.
 * Backed by Supabase (card_templates table) with in-memory / localStorage caching
 * and safe hardcoded defaults for offline or unauthenticated fallback.
 */

const CardTemplate = (() => {
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
      matricFontSize:   22,
      fieldFontSize:    22,
      bloodFontSize:    20,
      sigLabelFontSize: 14,
      photoX: 20,  photoY: 210, photoW: 310, photoH: 360,
      matricLabelX: 20, matricY: 180,
      fieldLabelX: 340, fieldValueX: 435,
      fieldsStartY: 240, fieldSpacing: 80,
      bloodX: 20, bloodY: 600, bloodValueX: 178,
      genoX:  20, genoY:  625,
      logoX: 805, logoY: 205, logoW: 125, logoH: 125, logoAlpha: 1.0,
      qrX: 760, qrY: 345, qrSize: 215,
      sigLabelX: 760, sigLabelY: 570,
      sigBoxX: 760, sigBoxY: 582, sigBoxW: 220, sigBoxH: 46,
      watermarkAlpha: 0.10, watermarkSize: 340,
      backHeaderFontSize: 28,
      backTermsHeadSize:  20,
      backTermsBodySize:  18
    }
  };

  let activeTemplate = JSON.parse(JSON.stringify(DEFAULT_TEMPLATE));

  // Initialize from localStorage cache if available
  try {
    const cached = localStorage.getItem('sid_canonical_template');
    if (cached) {
      activeTemplate = Object.assign({}, DEFAULT_TEMPLATE, JSON.parse(cached));
      if (activeTemplate.layout) {
        if (activeTemplate.layout.fieldValueX > 450) {
          activeTemplate.layout.fieldValueX = 435;
          activeTemplate.layout.fieldLabelX = 340;
        }
        if (!activeTemplate.layout.logoAlpha || activeTemplate.layout.logoAlpha < 0.5) {
          activeTemplate.layout.logoAlpha = 1.0;
          activeTemplate.layout.logoX = 805;
          activeTemplate.layout.logoY = 205;
          activeTemplate.layout.logoW = 125;
          activeTemplate.layout.logoH = 125;
        }
      }
    }
  } catch (e) {
    console.warn('Could not read cached template:', e);
  }

  function getClient() {
    if (typeof ebsuSupabase !== 'undefined' && ebsuSupabase) return ebsuSupabase;
    if (typeof AuthManager !== 'undefined' && AuthManager.getClient) return AuthManager.getClient();
    if (typeof supabase !== 'undefined' && typeof EBSU_CONFIG !== 'undefined' && EBSU_CONFIG.SUPABASE_URL) {
      return supabase.createClient(EBSU_CONFIG.SUPABASE_URL, EBSU_CONFIG.SUPABASE_ANON_KEY);
    }
    return null;
  }

  async function load(templateId = 'ebsu-default') {
    const client = getClient();
    if (!client) {
      return activeTemplate;
    }

    try {
      const { data, error } = await client
        .from('card_templates')
        .select('*')
        .eq('id', templateId)
        .maybeSingle();

      if (error) {
        console.warn('Error loading template from Supabase, using active/cached:', error.message);
        return activeTemplate;
      }

      if (data) {
        activeTemplate = {
          id: data.id,
          institution: Object.assign({}, DEFAULT_TEMPLATE.institution, data.institution || {}),
          canvas: Object.assign({}, DEFAULT_TEMPLATE.canvas, data.canvas || {}),
          colors: Object.assign({}, DEFAULT_TEMPLATE.colors, data.colors || {}),
          fonts: Object.assign({}, DEFAULT_TEMPLATE.fonts, data.fonts || {}),
          layout: Object.assign({}, DEFAULT_TEMPLATE.layout, data.layout || {}),
          updatedAt: data.updated_at
        };

        try {
          localStorage.setItem('sid_canonical_template', JSON.stringify(activeTemplate));
        } catch (e) {}
      }
    } catch (err) {
      console.warn('Network error loading card template:', err);
    }

    return activeTemplate;
  }

  async function save(templateUpdates, templateId = 'ebsu-default') {
    activeTemplate = {
      ...activeTemplate,
      ...templateUpdates,
      id: templateId,
      updatedAt: new Date().toISOString()
    };

    try {
      localStorage.setItem('sid_canonical_template', JSON.stringify(activeTemplate));
    } catch (e) {}

    const client = getClient();
    if (!client) {
      return { success: true, localOnly: true, template: activeTemplate };
    }

    try {
      const payload = {
        id: templateId,
        institution: activeTemplate.institution,
        canvas: activeTemplate.canvas,
        colors: activeTemplate.colors,
        fonts: activeTemplate.fonts,
        layout: activeTemplate.layout,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await client
        .from('card_templates')
        .upsert(payload)
        .select();

      if (error) {
        console.error('Failed to save template to Supabase:', error);
        return { success: false, error: error.message, template: activeTemplate };
      }

      return { success: true, data, template: activeTemplate };
    } catch (err) {
      console.error('Exception saving card template:', err);
      return { success: false, error: err.message, template: activeTemplate };
    }
  }

  function get() {
    return JSON.parse(JSON.stringify(activeTemplate));
  }

  function getDefault() {
    return JSON.parse(JSON.stringify(DEFAULT_TEMPLATE));
  }

  return {
    get,
    getDefault,
    load,
    save
  };
})();

if (typeof window !== 'undefined') {
  window.CardTemplate = CardTemplate;
}
