-- Enable real-time updates for processing_jobs table
-- This allows the frontend to receive live milestone updates

-- 1. Ensure table is in the realtime publication
DO $$
BEGIN
    -- Check if table is already in publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND tablename = 'processing_jobs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE processing_jobs;
    END IF;
END $$;

-- 2. CRITICAL: Set REPLICA IDENTITY FULL for UPDATE events to work
-- Without this, Supabase Realtime won't send the updated row data on UPDATE events
ALTER TABLE processing_jobs REPLICA IDENTITY FULL;

-- 3. Create or replace the updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 4. Drop existing trigger if it exists (idempotent)
DROP TRIGGER IF EXISTS update_processing_jobs_updated_at ON processing_jobs;

-- 5. Create trigger on processing_jobs table
CREATE TRIGGER update_processing_jobs_updated_at
    BEFORE UPDATE ON processing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 6. Ensure RLS policy allows reads (for realtime to work)
-- The existing "Allow all access" policy should work, but let's make sure
DROP POLICY IF EXISTS "Allow all access" ON processing_jobs;
CREATE POLICY "Allow all access" ON processing_jobs
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Verification query (run manually to check):
-- SELECT * FROM pg_publication_tables WHERE tablename = 'processing_jobs';
-- SELECT relreplident FROM pg_class WHERE relname = 'processing_jobs'; -- Should return 'f' for FULL
