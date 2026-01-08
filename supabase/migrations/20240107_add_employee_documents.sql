-- Add documents column to employee_directory table
ALTER TABLE public.employee_directory
ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '[]'::jsonb;
-- Create storage bucket for employee documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee_documents', 'employee_documents', true) ON CONFLICT (id) DO NOTHING;
-- Policy: Allow authenticated users to upload files
CREATE POLICY "Allow authenticated uploads" ON storage.objects FOR
INSERT TO authenticated WITH CHECK (bucket_id = 'employee_documents');
-- Policy: Allow authenticated users to view files
CREATE POLICY "Allow authenticated view" ON storage.objects FOR
SELECT TO authenticated USING (bucket_id = 'employee_documents');
-- Policy: Allow authenticated users to update/delete files
CREATE POLICY "Allow authenticated update delete" ON storage.objects FOR
UPDATE TO authenticated USING (bucket_id = 'employee_documents');
CREATE POLICY "Allow authenticated delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'employee_documents');