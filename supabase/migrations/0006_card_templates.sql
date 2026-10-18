-- ============================================================
-- 0006_card_templates.sql — SID Card Template System
-- Stores the canonical card design (colors, layout, fonts,
-- institution info) per institution. Design Studio writes here;
-- every other page reads from here.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.card_templates (
  id              text        PRIMARY KEY,   -- e.g. 'ebsu-default'

  -- Institution metadata
  institution     jsonb       NOT NULL DEFAULT '{
    "name": "EBONYI STATE UNIVERSITY, ABAKALIKI",
    "crestUrl": "",
    "expiryYear": 2029
  }'::jsonb,

  -- Canvas dimensions
  canvas          jsonb       NOT NULL DEFAULT '{"width": 1011, "height": 638}'::jsonb,

  -- Card colour palette
  colors          jsonb       NOT NULL DEFAULT '{
    "headerBg":        "#1558c0",
    "headerText":      "#ffffff",
    "bodyBg":          "#ffffff",
    "borderColor":     "#6ab0e0",
    "titleColor":      "#cc0000",
    "matricLabel":     "#1a3a9a",
    "labelColor":      "#000000",
    "valueColor":      "#222222",
    "photoBackground": "#aa1111"
  }'::jsonb,

  -- Font configuration
  fonts           jsonb       NOT NULL DEFAULT '{
    "heading": "Arial, sans-serif",
    "body":    "Arial, sans-serif",
    "mono":    "monospace"
  }'::jsonb,

  -- Layout positions and sizes (merges CC_DEFAULTS from canvas.js)
  layout          jsonb       NOT NULL DEFAULT '{
    "headerFontSize":   36,
    "titleFontSize":    38,
    "matricFontSize":   22,
    "fieldFontSize":    22,
    "bloodFontSize":    20,
    "sigLabelFontSize": 14,
    "photoX": 20,  "photoY": 210, "photoW": 310, "photoH": 360,
    "matricLabelX": 20, "matricY": 180,
    "fieldLabelX": 350, "fieldValueX": 520,
    "fieldsStartY": 240, "fieldSpacing": 80,
    "bloodX": 20, "bloodY": 600, "bloodValueX": 178,
    "genoX":  20, "genoY":  625,
    "logoX": 780, "logoY": 210, "logoW": 180, "logoH": 180, "logoAlpha": 0.15,
    "qrX": 760, "qrY": 345, "qrSize": 215,
    "sigLabelX": 760, "sigLabelY": 570,
    "sigBoxX": 760, "sigBoxY": 582, "sigBoxW": 220, "sigBoxH": 46,
    "watermarkAlpha": 0.10, "watermarkSize": 340,
    "backHeaderFontSize": 28,
    "backTermsHeadSize":  20,
    "backTermsBodySize":  18
  }'::jsonb,

  -- Audit
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ── Auto-update updated_at ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_card_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS card_templates_updated_at ON public.card_templates;
CREATE TRIGGER card_templates_updated_at
  BEFORE UPDATE ON public.card_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_card_templates_updated_at();

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE public.card_templates ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read templates (needed by all pages)
DROP POLICY IF EXISTS "anyone_read_templates" ON public.card_templates;
CREATE POLICY "anyone_read_templates"
  ON public.card_templates FOR SELECT
  TO authenticated
  USING (true);

-- Also allow anonymous reads so the landing page can load the template
DROP POLICY IF EXISTS "anon_read_templates" ON public.card_templates;
CREATE POLICY "anon_read_templates"
  ON public.card_templates FOR SELECT
  TO anon
  USING (true);

-- Only admin-level staff can write templates
DROP POLICY IF EXISTS "admin_write_templates" ON public.card_templates;
CREATE POLICY "admin_write_templates"
  ON public.card_templates FOR ALL
  TO authenticated
  USING (
    public.auth_staff_role() IN ('super_admin', 'registrar', 'admin')
  )
  WITH CHECK (
    public.auth_staff_role() IN ('super_admin', 'registrar', 'admin')
  );

-- ── Seed the default EBSU template ───────────────────────────
INSERT INTO public.card_templates (id)
VALUES ('ebsu-default')
ON CONFLICT (id) DO NOTHING;
