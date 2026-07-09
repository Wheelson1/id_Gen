-- ============================================================
-- 0003_student_portal.sql — EBSU ID Card System
-- Adds support for Student Portal (email auth, self-service)
-- ============================================================

-- 1. Add new columns
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS email text UNIQUE,
ADD COLUMN IF NOT EXISTS card_signature text;

-- 2. Add Row-Level Security (RLS) for the Student Portal
-- A student can view their own record if their authenticated email matches the row
CREATE POLICY "student_self_access" ON public.students
  FOR SELECT
  TO authenticated
  USING (email = auth.jwt()->>'email');

-- A student can update their own record (e.g. marking it revoked, updating photo)
CREATE POLICY "student_self_update" ON public.students
  FOR UPDATE
  TO authenticated
  USING (email = auth.jwt()->>'email')
  WITH CHECK (email = auth.jwt()->>'email');

-- 3. Storage Bucket Policy Updates
-- Allow authenticated students to upload to student-photos
CREATE POLICY "student_photo_upload" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'student-photos');

CREATE POLICY "student_photo_update" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'student-photos');
