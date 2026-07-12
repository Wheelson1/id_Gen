-- ============================================================
-- 0004_dominance.sql — EBSU ID Card System
-- Adds the Activity Log for the "Campus Footprint" feature
-- ============================================================

CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  action text NOT NULL, -- e.g., 'Exam Cleared', 'Library Entry', 'Event Attended'
  location text, -- e.g., 'Main Library', 'Faculty of Science'
  timestamp timestamptz DEFAULT now()
);

-- RLS: A student can view their own activity logs
CREATE POLICY "student_view_activity" ON public.activity_log
  FOR SELECT
  TO authenticated
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE email = auth.jwt()->>'email'
    )
  );

-- Admins/Service Role can insert into the log (simulated by edge functions or verifiers)
