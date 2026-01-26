-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing trigger if it exists (to make migration idempotent)
DROP TRIGGER IF EXISTS update_processing_jobs_updated_at ON processing_jobs;

-- Create trigger on processing_jobs table
CREATE TRIGGER update_processing_jobs_updated_at
    BEFORE UPDATE ON processing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
