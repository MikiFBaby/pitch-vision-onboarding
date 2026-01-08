-- Allow anonymous/public access to employee_directory to unblock n8n
-- (Often n8n is connected via the standard API key which might effectively be anon if not using service_role specifically)
create policy "Enable full access for anon/public" on "public"."employee_directory" as permissive for all to anon using (true) with check (true);
-- Ensure authenticated policy is also fully permissive just in case
drop policy if exists "Enable insert for authenticated users" on "public"."employee_directory";
drop policy if exists "Enable delete for authenticated users" on "public"."employee_directory";
drop policy if exists "Enable select for authenticated users" on "public"."employee_directory";
create policy "Enable full access for authenticated users" on "public"."employee_directory" as permissive for all to authenticated using (true) with check (true);
-- Grant privileges
grant all on table "public"."employee_directory" to anon;
grant all on table "public"."employee_directory" to authenticated;
grant all on table "public"."employee_directory" to service_role;