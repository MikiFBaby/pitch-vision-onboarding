-- Create "Booked Days Off" Table
CREATE TABLE IF NOT EXISTS "Booked Days Off" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "Agent Name" TEXT,
    "Date" DATE
);
-- Create "Non Booked Days Off" Table
CREATE TABLE IF NOT EXISTS "Non Booked Days Off" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "Agent Name" TEXT,
    "Reason" TEXT,
    "Date" DATE
);
-- Enable RLS
ALTER TABLE "Booked Days Off" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Non Booked Days Off" ENABLE ROW LEVEL SECURITY;
-- Policies for "Booked Days Off"
CREATE POLICY "Allow authenticated users to read booked days" ON "Booked Days Off" FOR
SELECT TO authenticated USING (true);
CREATE POLICY "Allow public read access booked days" ON "Booked Days Off" FOR
SELECT TO public USING (true);
CREATE POLICY "Allow service role to insert booked days" ON "Booked Days Off" FOR
INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Allow service role to delete booked days" ON "Booked Days Off" FOR DELETE TO service_role USING (true);
-- Policies for "Non Booked Days Off"
CREATE POLICY "Allow authenticated users to read non-booked days" ON "Non Booked Days Off" FOR
SELECT TO authenticated USING (true);
CREATE POLICY "Allow public read access non-booked days" ON "Non Booked Days Off" FOR
SELECT TO public USING (true);
CREATE POLICY "Allow service role to insert non-booked days" ON "Non Booked Days Off" FOR
INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Allow service role to delete non-booked days" ON "Non Booked Days Off" FOR DELETE TO service_role USING (true);
-- Add to Realtime Publication (Optional but good practice for dashboard)
begin;
alter publication supabase_realtime
add table "Booked Days Off";
alter publication supabase_realtime
add table "Non Booked Days Off";
exception
when duplicate_object then null;
end;