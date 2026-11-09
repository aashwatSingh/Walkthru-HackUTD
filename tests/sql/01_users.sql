-- Test users, and helpers to act as one of them the way Supabase's API does (a role + JWT claims).
insert into auth.users (email) values ('housing.admin@university.edu'), ('alex.rivera@university.edu'),
  ('jordan.lee@university.edu'), ('sam.patel@university.edu'), ('priya.nair@university.edu'), ('mallory@university.edu');
