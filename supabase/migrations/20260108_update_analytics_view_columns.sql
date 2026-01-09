CREATE OR REPLACE VIEW analytics_onboarding_status AS
SELECT ed.id AS employee_id,
    ed.first_name,
    ed.last_name,
    ed.email AS directory_email,
    ed.role AS directory_role,
    -- Calculated Registration Status (Restored)
    CASE
        WHEN u.id IS NOT NULL THEN 'Accepted'::text
        ELSE 'Pending'::text
    END AS registration_status,
    -- Calculated Onboarding Stage
    CASE
        WHEN u.profile_completed = true THEN 'Completed'::text
        WHEN u.id IS NOT NULL THEN 'In Progress'::text
        ELSE 'Not Started'::text
    END AS onboarding_stage,
    u.id AS user_id,
    u.last_login,
    u.created_at AS registered_at,
    -- NEW COLUMNS ADDED HERE
    u.nickname,
    u.bio,
    u.interests,
    u.avatar_url
FROM public.employee_directory ed
    LEFT JOIN public.users u ON ed.email = u.email;