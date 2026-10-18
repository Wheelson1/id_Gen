-- ============================================================================
-- seed_test_accounts.sql — EBSU Digital ID & Verification System (QA Seed Script)
-- Target: Supabase SQL Editor (Dashboard -> Project -> SQL Editor -> New Query)
-- Safety: ALL test accounts use reserved test emails (*+test@example.com)
--         and fake phone numbers (+1-555-0100 to +1-555-0199).
-- ============================================================================

-- Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_super_admin_id uuid := '11111111-1111-4111-a111-111111111111';
  v_admin_id       uuid := '22222222-2222-4222-a222-222222222222';
  v_registrar_id   uuid := '33333333-3333-4333-a333-333333333333';
  v_operator_id    uuid := '44444444-4444-4444-a444-444444444444';
  v_verifier_id    uuid := '55555555-5555-4555-a555-555555555555';
  v_student_1_id   uuid := '66666666-6666-4666-a666-666666666666';
  v_student_2_id   uuid := '77777777-7777-4777-a777-777777777777';
  v_student_3_id   uuid := '88888888-8888-4888-a888-888888888888';
  v_default_pwd_hash text;
BEGIN
  -- Standard test password hash: 'QaTest@2026!Secured'
  v_default_pwd_hash := crypt('QaTest@2026!Secured', gen_salt('bf'));

  -- ── 1. CLEANUP PREVIOUS QA TEST SEED DATA ──────────────────────────────────
  DELETE FROM public.activity_log WHERE student_id IN (v_student_1_id, v_student_2_id, v_student_3_id);
  DELETE FROM public.status_audit_log WHERE student_id IN (v_student_1_id, v_student_2_id, v_student_3_id);
  DELETE FROM public.staff_profiles WHERE id IN (v_super_admin_id, v_admin_id, v_registrar_id, v_operator_id, v_verifier_id);
  DELETE FROM public.students WHERE id IN (v_student_1_id, v_student_2_id, v_student_3_id)
    OR matric IN ('EBSU/2024/900001', 'EBSU/2024/900002', 'EBSU/2024/900003');
  DELETE FROM auth.users WHERE id IN (
    v_super_admin_id, v_admin_id, v_registrar_id, v_operator_id,
    v_verifier_id, v_student_1_id, v_student_2_id, v_student_3_id
  ) OR email LIKE '%+test@example.com';

  -- ── 2. SEED AUTH USERS ──────────────────────────────────────────────────────
  -- Super Admin
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_super_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'superadmin+test@example.com', v_default_pwd_hash, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"super_admin","full_name":"Test Super Admin","phone":"+1-555-0101"}'::jsonb,
    now(), now()
  );

  -- Admin
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'admin+test@example.com', v_default_pwd_hash, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"admin","full_name":"Test University Admin","phone":"+1-555-0102"}'::jsonb,
    now(), now()
  );

  -- Registrar (Manager)
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_registrar_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'manager+test@example.com', v_default_pwd_hash, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"registrar","full_name":"Test Academic Registrar","phone":"+1-555-0103"}'::jsonb,
    now(), now()
  );

  -- Operator (Editor)
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_operator_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'editor+test@example.com', v_default_pwd_hash, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"operator","full_name":"Test Card Operator","phone":"+1-555-0104"}'::jsonb,
    now(), now()
  );

  -- Verifier (Scanner / Guard)
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_verifier_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'verifier+test@example.com', v_default_pwd_hash, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"verifier","full_name":"Test Security Guard","phone":"+1-555-0105"}'::jsonb,
    now(), now()
  );

  -- Student 1 (Active User)
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_student_1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'student+test@example.com', v_default_pwd_hash, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"student","full_name":"Test Student Active","phone":"+1-555-0106"}'::jsonb,
    now(), now()
  );

  -- Student 2 (Unpaid Fees User)
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_student_2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'student_unpaid+test@example.com', v_default_pwd_hash, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"student","full_name":"Test Student Unpaid","phone":"+1-555-0107"}'::jsonb,
    now(), now()
  );

  -- Student 3 (Revoked / Lost Card User)
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_student_3_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'student_revoked+test@example.com', v_default_pwd_hash, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"student","full_name":"Test Student Revoked","phone":"+1-555-0108"}'::jsonb,
    now(), now()
  );

  -- ── 3. SEED STAFF PROFILES TABLE ───────────────────────────────────────────
  INSERT INTO public.staff_profiles (id, staff_id, full_name, role, department)
  VALUES
    (v_super_admin_id, 'STF-QA-001', 'Test Super Admin', 'super_admin', 'Directorate of ICT & Mothership'),
    (v_admin_id,       'STF-QA-002', 'Test University Admin', 'admin', 'Student Identity Affairs'),
    (v_registrar_id,   'STF-QA-003', 'Test Academic Registrar', 'registrar', 'Registrar Academic Records'),
    (v_operator_id,    'STF-QA-004', 'Test Card Operator', 'staff', 'ID Production Bureau'),
    (v_verifier_id,    'STF-QA-005', 'Test Security Guard', 'scanner', 'Campus Security Division');

  -- ── 4. SEED STUDENTS TABLE ────────────────────────────────────────────────
  -- Student 1: Fully Active Student with Paid Fees & Issued Card
  INSERT INTO public.students (
    id, matric, name, first_name, last_name, faculty, dept, level, session,
    blood, genotype, expiry, status, email, jamb_no, school_reg_no,
    fees_paid, jamb_year, is_email_verified
  ) VALUES (
    v_student_1_id,
    'EBSU/2024/900001',
    'NNAJI WILSON SOMTOCHUKWU',
    'WILSON',
    'NNAJI',
    'Faculty of Science',
    'Computer Science',
    '100 Level',
    '2024/2025',
    'A+',
    'AA',
    2029,
    'active',
    'student+test@example.com',
    '09035005623',
    'EBSU/2024/900001',
    true,
    2026,
    true
  );

  -- Student 2: Provisional Student with Unpaid Fees (Restriction Testing)
  INSERT INTO public.students (
    id, matric, name, first_name, last_name, faculty, dept, level, session,
    blood, genotype, expiry, status, email, jamb_no, school_reg_no,
    fees_paid, jamb_year, is_email_verified
  ) VALUES (
    v_student_2_id,
    'EBSU/2024/900002',
    'CHUKWUEMEKA CHIDERA ESTHER',
    'CHIDERA',
    'CHUKWUEMEKA',
    'Faculty of Law',
    'Public Law',
    '200 Level',
    '2024/2025',
    'O+',
    'AS',
    2028,
    'provisional',
    'student_unpaid+test@example.com',
    '09035005624',
    'EBSU/2024/900002',
    false,
    2025,
    true
  );

  -- Student 3: Revoked / Lost Card Student (Security Rejection Testing)
  INSERT INTO public.students (
    id, matric, name, first_name, last_name, faculty, dept, level, session,
    blood, genotype, expiry, status, status_reason, status_reference, email, jamb_no, school_reg_no,
    fees_paid, jamb_year, is_email_verified
  ) VALUES (
    v_student_3_id,
    'EBSU/2024/900003',
    'OKORO GODWIN BLESSING',
    'GODWIN',
    'OKORO',
    'Faculty of Management Sciences',
    'Accountancy',
    '300 Level',
    '2024/2025',
    'B+',
    'AA',
    2027,
    'revoked',
    'Card lost on campus transit',
    'SEC/LOST/2026/089',
    'student_revoked+test@example.com',
    '09035005625',
    'EBSU/2024/900003',
    true,
    2024,
    true
  );

  -- ── 5. SEED CAMPUS FOOTPRINT (ACTIVITY LOG) ────────────────────────────────
  INSERT INTO public.activity_log (student_id, action, location, timestamp)
  VALUES
    (v_student_1_id, 'Library Gate Verified', 'Main Campus Library', now() - interval '2 hours'),
    (v_student_1_id, 'Faculty of Science Exam Clearance', 'Hall B Complex', now() - interval '1 day'),
    (v_student_3_id, 'Security Turnstile Denied', 'Campus North Gate', now() - interval '3 hours');

  RAISE NOTICE '✅ QA Test Accounts and Records successfully seeded!';
END $$;
