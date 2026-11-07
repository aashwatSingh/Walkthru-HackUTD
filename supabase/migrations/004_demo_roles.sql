-- Walkthrough 004_demo_roles.sql (copied from the build spec, Section 4.4).
-- Paste the whole file into Supabase → SQL Editor → New query → Run.

-- Run AFTER creating the 5 demo users in Authentication → Users (Section 4.4).
update profiles set role = 'admin', full_name = 'Housing Admin' where email = 'housing.admin@university.edu';
update profiles set full_name = 'Alex Rivera'  where email = 'alex.rivera@university.edu';
update profiles set full_name = 'Jordan Lee'   where email = 'jordan.lee@university.edu';
update profiles set full_name = 'Sam Patel'    where email = 'sam.patel@university.edu';
update profiles set full_name = 'Priya Nair'   where email = 'priya.nair@university.edu';
