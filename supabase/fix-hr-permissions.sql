-- Fix RLS Permissions for HR Tables
-- Run this in the Supabase SQL Editor to unblock n8n
-- 1. Ensure Service Role has FULL Access (Overrides RLS usually, but explicit policies help)
-- HR Hired
DROP POLICY IF EXISTS "Allow service role to do everything on hires" ON "HR Hired";
CREATE POLICY "Allow service role to do everything on hires" ON "HR Hired" FOR ALL TO service_role USING (true) WITH CHECK (true);
-- HR Fired
DROP POLICY IF EXISTS "Allow service role to do everything on fires" ON "HR Fired";
CREATE POLICY "Allow service role to do everything on fires" ON "HR Fired" FOR ALL TO service_role USING (true) WITH CHECK (true);
-- 2. Allow Authenticated Users to Insert (Backup for n8n if using generic auth)
-- HR Hired
DROP POLICY IF EXISTS "Allow authenticated insert hires" ON "HR Hired";
CREATE POLICY "Allow authenticated insert hires" ON "HR Hired" FOR
INSERT TO authenticated WITH CHECK (true);
-- HR Fired
DROP POLICY IF EXISTS "Allow authenticated insert fires" ON "HR Fired";
CREATE POLICY "Allow authenticated insert fires" ON "HR Fired" FOR
INSERT TO authenticated WITH CHECK (true);
-- 3. Allow Authenticated users to Update/Delete (if needed later)
-- HR Hired
DROP POLICY IF EXISTS "Allow authenticated update/delete hires" ON "HR Hired";
CREATE POLICY "Allow authenticated update/delete hires" ON "HR Hired" FOR
UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow authenticated delete hires" ON "HR Hired";
CREATE POLICY "Allow authenticated delete hires" ON "HR Hired" FOR DELETE TO authenticated USING (true);
-- 4. Re-verify Public Read Access (for the Dashboard)
DROP POLICY IF EXISTS "Allow public read access" ON "HR Hired";
CREATE POLICY "Allow public read access" ON "HR Hired" FOR
SELECT TO public USING (true);
DROP POLICY IF EXISTS "Allow public read access" ON "HR Fired";
CREATE POLICY "Allow public read access" ON "HR Fired" FOR
SELECT TO public USING (true);