-- Add new columns
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS fees_paid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS school_reg_no TEXT,
ADD COLUMN IF NOT EXISTS jamb_year INTEGER,
ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'provisional',
ADD COLUMN IF NOT EXISTS blood_group TEXT,
ADD COLUMN IF NOT EXISTS genotype TEXT,
ADD COLUMN IF NOT EXISTS level TEXT,
ADD COLUMN IF NOT EXISTS session TEXT,
ADD COLUMN IF NOT EXISTS photo_url TEXT,
ADD COLUMN IF NOT EXISTS signature_url TEXT;

-- Add CHECK constraint for status
ALTER TABLE public.students 
ADD CONSTRAINT students_status_check CHECK (status IN ('provisional', 'active', 'suspended', 'revoked', 'graduated'));

-- Create Indexes for performance
CREATE INDEX IF NOT EXISTS students_jamb_no_idx ON public.students USING btree (jamb_no);
CREATE INDEX IF NOT EXISTS students_school_reg_no_idx ON public.students USING btree (school_reg_no);
CREATE INDEX IF NOT EXISTS students_jamb_year_idx ON public.students USING btree (jamb_year);
CREATE INDEX IF NOT EXISTS students_fees_paid_idx ON public.students USING btree (fees_paid);
CREATE INDEX IF NOT EXISTS students_status_idx ON public.students USING btree (status);
CREATE INDEX IF NOT EXISTS students_jamb_year_fees_paid_idx ON public.students USING btree (jamb_year, fees_paid);

-- RLS Policies
-- Assuming SELECT policy already exists (e.g. "Public profiles are viewable by everyone.")

-- Allow authenticated users to update only their own row
CREATE POLICY "Users can update own record" ON public.students
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Allow service_role full access (useful for sync scripts)
CREATE POLICY "Service role full access" ON public.students
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Explicitly allow service_role to insert
CREATE POLICY "Service role insert" ON public.students
  FOR INSERT TO service_role WITH CHECK (true);
