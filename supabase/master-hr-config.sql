-- MASTER SCRIPT for HR Tables
-- Runs Safe to Rerun!
-- This handles:
-- 1. Realtime Broadcasts (so the dashboard updates)
-- 2. Service Role & Authenticated Permissions (so n8n can insert)
-- 3. Public Read Access (so users can see the dashboard)
-- A. ENABLE REALTIME
begin;
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
-- B. FORCE RLS POLICIES (Resetting everything to be sure)
ALTER TABLE "HR Hired" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HR Fired" ENABLE ROW LEVEL SECURITY;
-- 1. SERVICE ROLE (Full Access)
DROP POLICY IF EXISTS "Service Role Full Access Hires" ON "HR Hired";
CREATE POLICY "Service Role Full Access Hires" ON "HR Hired" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service Role Full Access Fires" ON "HR Fired";
CREATE POLICY "Service Role Full Access Fires" ON "HR Fired" FOR ALL TO service_role USING (true) WITH CHECK (true);
-- 2. AUTHENTICATED USERS (Insert Access for n8n/Scripts)
DROP POLICY IF EXISTS "Authenticated Insert Hires" ON "HR Hired";
CREATE POLICY "Authenticated Insert Hires" ON "HR Hired" FOR
INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated Insert Fires" ON "HR Fired";
CREATE POLICY "Authenticated Insert Fires" ON "HR Fired" FOR
INSERT TO authenticated WITH CHECK (true);
-- 3. PUBLIC READ ACCESS (For the Dashboard)
DROP POLICY IF EXISTS "Public Read Hires" ON "HR Hired";
CREATE POLICY "Public Read Hires" ON "HR Hired" FOR
SELECT TO public USING (true);
DROP POLICY IF EXISTS "Public Read Fires" ON "HR Fired";
CREATE POLICY "Public Read Fires" ON "HR Fired" FOR
SELECT TO public USING (true);
-- Done!