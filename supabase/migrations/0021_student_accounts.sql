-- 0021: student email + password accounts (email magic link, then choose a password).
-- Order for a new student: number -> date of birth -> email -> link -> password -> pay -> card.

ALTER TABLE public.onboarding_sessions
  ADD COLUMN IF NOT EXISTS email             text,
  ADD COLUMN IF NOT EXISTS email_token_hash  text,
  ADD COLUMN IF NOT EXISTS email_sent_at     timestamptz,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS public.student_accounts (
  student_id        uuid PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
  school_id         uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  email             text NOT NULL,
  password_hash     text NOT NULL,
  email_verified_at timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_accounts_email
  ON public.student_accounts (school_id, lower(email));

ALTER TABLE public.student_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.student_accounts FROM anon, authenticated;
GRANT ALL ON TABLE public.student_accounts TO service_role;
