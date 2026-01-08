-- Create the employee_directory table
create table "public"."employee_directory" (
    "id" uuid not null default gen_random_uuid(),
    "first_name" text,
    "last_name" text,
    "role" text,
    "email" text,
    "slack_display_name" text,
    "created_at" timestamp with time zone not null default now(),
    constraint "employee_directory_pkey" primary key ("id")
);
-- Enable Row Level Security
alter table "public"."employee_directory" enable row level security;
-- Policy for Service Role (Full Access)
create policy "Enable full access for service role" on "public"."employee_directory" as permissive for all to service_role using (true) with check (true);
-- Policy for Authenticated Users (Insert)
create policy "Enable insert for authenticated users" on "public"."employee_directory" as permissive for
insert to authenticated with check (true);
-- Policy for Authenticated Users (Delete)
create policy "Enable delete for authenticated users" on "public"."employee_directory" as permissive for delete to authenticated using (true);
-- Policy for Authenticated Users (Select) - Required for UI/Deletion identification
create policy "Enable select for authenticated users" on "public"."employee_directory" as permissive for
select to authenticated using (true);
-- Grant permissions to authenticated users
grant insert,
    delete,
    select on table "public"."employee_directory" to "authenticated";
grant insert,
    delete,
    select on table "public"."employee_directory" to "service_role";