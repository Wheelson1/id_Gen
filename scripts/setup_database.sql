-- Run this SQL in your Supabase SQL Editor to create the students table

CREATE TABLE public.students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    jamb_no TEXT UNIQUE NOT NULL,
    full_name TEXT,
    department TEXT,
    faculty TEXT,
    linked_email TEXT UNIQUE,
    passport_url TEXT,
    signature_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Allow public read access so the login page can verify JAMB numbers
CREATE POLICY "Allow public read access to students" 
ON public.students FOR SELECT 
USING (true);

-- Allow authenticated users to update their own records (if linked)
CREATE POLICY "Allow users to update their own student record"
ON public.students FOR UPDATE
USING (auth.uid() IN (
    SELECT id FROM auth.users WHERE email = linked_email
));
