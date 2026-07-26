-- ============================================================
-- Insert / Update Test Student Record into Supabase
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================

INSERT INTO public.students (
    jamb_no,
    full_name,
    department,
    faculty,
    school_reg_no,
    fees_paid,
    jamb_year,
    is_email_verified,
    status,
    blood_group,
    genotype,
    level,
    session
) VALUES (
    '09035005623',
    'Wilson Somtochukwu Nnaji',
    'Computer Science',
    'Faculty of Science',
    'EBSU/2024/900001',
    true,
    2026,
    true,
    'active',
    'A+',
    'AA',
    '100 Level',
    '2024/2025'
)
ON CONFLICT (jamb_no) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    department = EXCLUDED.department,
    faculty = EXCLUDED.faculty,
    school_reg_no = EXCLUDED.school_reg_no,
    fees_paid = EXCLUDED.fees_paid,
    jamb_year = EXCLUDED.jamb_year,
    is_email_verified = EXCLUDED.is_email_verified,
    status = EXCLUDED.status,
    blood_group = EXCLUDED.blood_group,
    genotype = EXCLUDED.genotype,
    level = EXCLUDED.level,
    session = EXCLUDED.session;
