-- HR Tables Setup for Existing Tables
-- Run this in your Supabase SQL Editor
-- Note: Your tables are named "HR Hired" and "HR Fired"
-- This script adds the missing policies
-- Enable Row Level Security (if not already enabled)
ALTER TABLE "HR Hired" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HR Fired" ENABLE ROW LEVEL SECURITY;
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated users to read hires" ON "HR Hired";
DROP POLICY IF EXISTS "Allow service role to insert hires" ON "HR Hired";
DROP POLICY IF EXISTS "Allow authenticated users to delete hires" ON "HR Hired";
DROP POLICY IF EXISTS "Allow authenticated users to read fires" ON "HR Fired";
DROP POLICY IF EXISTS "Allow service role to insert fires" ON "HR Fired";
DROP POLICY IF EXISTS "Allow authenticated users to delete fires" ON "HR Fired";
-- Create policies for HR Hired table
CREATE POLICY "Allow authenticated users to read hires" ON "HR Hired" FOR
SELECT TO authenticated USING (true);
CREATE POLICY "Allow service role to insert hires" ON "HR Hired" FOR
INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Allow authenticated users to delete hires" ON "HR Hired" FOR DELETE TO authenticated USING (true);
-- Create policies for HR Fired table
CREATE POLICY "Allow authenticated users to read fires" ON "HR Fired" FOR
SELECT TO authenticated USING (true);
CREATE POLICY "Allow service role to insert fires" ON "HR Fired" FOR
INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Allow authenticated users to delete fires" ON "HR Fired" FOR DELETE TO authenticated USING (true);
-- Verify tables have UUID primary keys (should already exist)
-- The 'id' column is your unique key for manual deletion