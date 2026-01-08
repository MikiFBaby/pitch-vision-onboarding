-- Add Primary Keys to Existing HR Tables
-- Run this in your Supabase SQL Editor
-- Step 1: Add id column to HR Hired (if not exists)
ALTER TABLE "HR Hired"
ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
-- Step 2: Add id column to HR Fired (if not exists)
ALTER TABLE "HR Fired"
ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
-- Step 3: Update any NULL ids (shouldn't be any, but just in case)
UPDATE "HR Hired"
SET id = gen_random_uuid()
WHERE id IS NULL;
UPDATE "HR Fired"
SET id = gen_random_uuid()
WHERE id IS NULL;
-- Step 4: Add primary key constraint to HR Hired
ALTER TABLE "HR Hired"
ADD CONSTRAINT "HR Hired_pkey" PRIMARY KEY (id);
-- Step 5: Add primary key constraint to HR Fired
ALTER TABLE "HR Fired"
ADD CONSTRAINT "HR Fired_pkey" PRIMARY KEY (id);