-- ============================================================
-- 0001_init.sql  —  EBSU ID Card System — initial schema
-- Run with:  supabase db push   (or paste into Supabase SQL editor)
-- ============================================================

-- ── Students table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.students (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifying fields
  matric      text        NOT NULL,
  name        text        NOT NULL,

  -- Academic fields
  faculty     text,
  dept        text,
  level       text,
  session     text,

  -- Medical fields
  blood       text,
  genotype    text,

  -- Media (URLs in Supabase Storage)
  photo_url   text,
  sig_url     text,

  -- Card lifecycle
  expiry      integer     NOT NULL,                                      -- e.g. 2029
  status      text        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'revoked')),

  -- Audit
  issued_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One live card per matric number
CREATE UNIQUE INDEX IF NOT EXISTS students_matric_idx ON public.students (matric);

-- ── Auto-update updated_at ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS students_updated_at ON public.students;
CREATE TRIGGER students_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- NO anonymous read — all reads go through the verify-card Edge Function
-- using the service-role key, which bypasses RLS.

-- Operators and admins can insert/update via issue-card Edge Function.
-- The Edge Function uses the service-role key, so these policies are a
-- defence-in-depth second layer for any direct DB access that may be
-- added later.

CREATE POLICY "operators_insert" ON public.students
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('operator', 'admin')
  );

CREATE POLICY "operators_update" ON public.students
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('operator', 'admin')
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('operator', 'admin')
  );

-- Admins can delete (used for data-correction only, not revocation)
CREATE POLICY "admins_delete" ON public.students
  FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- ── Storage buckets ───────────────────────────────────────────
-- Run these only if the storage extension is enabled on your project.
-- If using the Supabase dashboard, create these buckets manually (see SETUP.md).

INSERT INTO storage.buckets (id, name, public)
  VALUES ('student-photos',    'student-photos',    true)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('student-signatures', 'student-signatures', true)
  ON CONFLICT (id) DO NOTHING;

-- Public read (verifier needs to display photos)
CREATE POLICY "public_read_photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'student-photos');

CREATE POLICY "public_read_sigs" ON storage.objects
  FOR SELECT USING (bucket_id = 'student-signatures');

-- Only service-role writes (edge functions only)
-- No client-direct upload — prevents anyone from swapping a photo via the anon key.
