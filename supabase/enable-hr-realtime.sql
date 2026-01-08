-- Enable Realtime for HR Tables
-- Run this in the Supabase SQL Editor
-- 1. Add tables to supabase_realtime publication to broadcast events
begin;
-- Try to add tables, ignoring errors if they are already added
alter publication supabase_realtime
add table "HR Hired";
exception
when duplicate_object then null;
end;
begin;
alter publication supabase_realtime
add table "HR Fired";
exception
when duplicate_object then null;
end;
-- 2. Update RLS to allow public (anonymous) read access
-- This is required because the client uses the anon key and auth is handled by Firebase
-- Update "HR Hired" Policies
DROP POLICY IF EXISTS "Allow authenticated users to read hires" ON "HR Hired";
DROP POLICY IF EXISTS "Allow public read access" ON "HR Hired";
CREATE POLICY "Allow public read access" ON "HR Hired" FOR
SELECT TO public USING (true);
-- Update "HR Fired" Policies
DROP POLICY IF EXISTS "Allow authenticated users to read fires" ON "HR Fired";
DROP POLICY IF EXISTS "Allow public read access" ON "HR Fired";
CREATE POLICY "Allow public read access" ON "HR Fired" FOR
SELECT TO public USING (true);
-- Note: We assume "service_role" policies for INSERT/DELETE are already set from previous scripts.