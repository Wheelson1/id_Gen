-- ============================================================
-- 0002_admin_system.sql  —  Admin dashboard, status management,
--   audit trail.  Run AFTER 0001_init.sql.
--
-- Paste into Supabase SQL Editor and click Run, OR:
--   supabase db push --include-all
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1.  EXTEND students TABLE
--     Add full-name split columns + admin status columns.
--     Keep existing columns (matric, name, blood, etc.) intact
--     so the card generator is unaffected.
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS first_name        text,
  ADD COLUMN IF NOT EXISTS last_name         text,
  ADD COLUMN IF NOT EXISTS middle_name       text,
  ADD COLUMN IF NOT EXISTS status_reason     text,
  ADD COLUMN IF NOT EXISTS status_reference  text,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_updated_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- Expand status values beyond the original ('active','revoked').
-- 'revoked' is kept for backward compat with the existing
-- issue-card / verify-card Edge Functions.
ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_status_check;

ALTER TABLE public.students
  ADD CONSTRAINT students_status_check
  CHECK (status IN (
    'active', 'suspended', 'graduated',
    'expelled', 'withdrawn', 'lost_card', 'revoked'
  ));


-- ════════════════════════════════════════════════════════════
-- 2.  staff_profiles TABLE
--     One row per Supabase Auth user who is a member of staff.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.staff_profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id    text        UNIQUE NOT NULL,
  full_name   text        NOT NULL,
  role        text        NOT NULL DEFAULT 'staff'
              CHECK (role IN (
                'super_admin', 'registrar', 'admin', 'staff', 'scanner'
              )),
  department  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;


-- ════════════════════════════════════════════════════════════
-- 3.  HELPER FUNCTION  auth_staff_role()
--     Returns the role of the currently authenticated user
--     from staff_profiles.  SECURITY DEFINER so it can read
--     staff_profiles without triggering its own RLS policies,
--     which avoids an infinite-recursion loop.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auth_staff_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.staff_profiles WHERE id = auth.uid()
$$;


-- ════════════════════════════════════════════════════════════
-- 4.  staff_profiles RLS POLICIES
-- ════════════════════════════════════════════════════════════

-- Every staff member can read their own profile (they need their
-- own role so the UI can decide what controls to show).
DROP POLICY IF EXISTS "staff_profiles_read_own" ON public.staff_profiles;
CREATE POLICY "staff_profiles_read_own"
  ON public.staff_profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

-- super_admin can read all profiles.
DROP POLICY IF EXISTS "super_admin_read_all_profiles" ON public.staff_profiles;
CREATE POLICY "super_admin_read_all_profiles"
  ON public.staff_profiles FOR SELECT TO authenticated
  USING (public.auth_staff_role() = 'super_admin');

-- super_admin can create / update / delete staff profiles.
DROP POLICY IF EXISTS "super_admin_manage_profiles" ON public.staff_profiles;
CREATE POLICY "super_admin_manage_profiles"
  ON public.staff_profiles FOR ALL TO authenticated
  USING    (public.auth_staff_role() = 'super_admin')
  WITH CHECK (public.auth_staff_role() = 'super_admin');


-- ════════════════════════════════════════════════════════════
-- 5.  status_audit_log TABLE  (append-only)
--     Every status change writes one row here.
--     There is NO UPDATE policy and NO DELETE policy, making
--     the log immutable at the database level.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.status_audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  changed_by  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  old_status  text        NOT NULL,
  new_status  text        NOT NULL,
  reason      text,
  reference   text,            -- e.g. suspension letter number
  ip_address  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.status_audit_log ENABLE ROW LEVEL SECURITY;

-- INSERT: super_admin, registrar, admin only.
DROP POLICY IF EXISTS "authorized_staff_insert_audit" ON public.status_audit_log;
CREATE POLICY "authorized_staff_insert_audit"
  ON public.status_audit_log FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_staff_role() IN ('super_admin', 'registrar', 'admin')
  );

-- SELECT: same + staff (read-only viewers). Scanners cannot read the log.
DROP POLICY IF EXISTS "authorized_staff_read_audit" ON public.status_audit_log;
CREATE POLICY "authorized_staff_read_audit"
  ON public.status_audit_log FOR SELECT TO authenticated
  USING (
    public.auth_staff_role() IN ('super_admin', 'registrar', 'admin', 'staff')
  );

-- (No UPDATE policy.  No DELETE policy.  Log is append-only.)


-- ════════════════════════════════════════════════════════════
-- 6.  REPLACE students RLS POLICIES
--     Old policies from 0001 checked JWT user_metadata.role.
--     New policies check staff_profiles.role via the helper
--     function — staff_profiles is the authoritative role source.
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "operators_insert"          ON public.students;
DROP POLICY IF EXISTS "operators_update"          ON public.students;
DROP POLICY IF EXISTS "admins_delete"             ON public.students;
DROP POLICY IF EXISTS "staff_read_students"       ON public.students;
DROP POLICY IF EXISTS "admin_update_students"     ON public.students;
DROP POLICY IF EXISTS "operator_insert_students"  ON public.students;
DROP POLICY IF EXISTS "super_admin_delete_students" ON public.students;

-- Any authenticated staff member (all roles) can read student records.
CREATE POLICY "staff_read_students"
  ON public.students FOR SELECT TO authenticated
  USING (public.auth_staff_role() IS NOT NULL);

-- INSERT: issue-card Edge Function uses service role (bypasses RLS).
-- This policy guards any future direct inserts made with a user JWT.
CREATE POLICY "operator_insert_students"
  ON public.students FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_staff_role() IN ('super_admin', 'registrar', 'admin')
  );

-- UPDATE (status changes): super_admin, registrar, admin only.
CREATE POLICY "admin_update_students"
  ON public.students FOR UPDATE TO authenticated
  USING    (public.auth_staff_role() IN ('super_admin', 'registrar', 'admin'))
  WITH CHECK (public.auth_staff_role() IN ('super_admin', 'registrar', 'admin'));

-- DELETE: super_admin only — for data correction, not revocation
-- (revocation flips status; it does not delete the row).
CREATE POLICY "super_admin_delete_students"
  ON public.students FOR DELETE TO authenticated
  USING (public.auth_staff_role() = 'super_admin');


-- ════════════════════════════════════════════════════════════
-- 7.  change_student_status()  — ATOMIC RPC
--     Called from Next.js server actions via supabaseAdmin.rpc().
--     Updates students + inserts audit row in one transaction.
--     The caller (server action) is responsible for role checks
--     before calling this; the function validates status values.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.change_student_status(
  p_student_id  uuid,
  p_new_status  text,
  p_reason      text,
  p_reference   text,
  p_ip_address  text,
  p_changed_by  uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_status text;
BEGIN
  -- Lock the row and fetch the current status.
  SELECT status INTO v_old_status
  FROM public.students
  WHERE id = p_student_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'student_not_found';
  END IF;

  -- Validate the incoming status.
  IF p_new_status NOT IN (
    'active', 'suspended', 'graduated', 'expelled', 'withdrawn', 'lost_card'
  ) THEN
    RAISE EXCEPTION 'invalid_status: %', p_new_status;
  END IF;

  -- Update the student record.
  UPDATE public.students SET
    status             = p_new_status,
    status_reason      = p_reason,
    status_reference   = p_reference,
    status_updated_at  = now(),
    status_updated_by  = p_changed_by
  WHERE id = p_student_id;

  -- Append the immutable audit row.
  INSERT INTO public.status_audit_log
    (student_id, changed_by, old_status, new_status,
     reason, reference, ip_address)
  VALUES
    (p_student_id, p_changed_by, v_old_status, p_new_status,
     p_reason, p_reference, p_ip_address);
END;
$$;
