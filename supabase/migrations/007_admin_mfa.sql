-- Walkthrough 007_admin_mfa.sql (post-hackathon security audit).
-- Paste the whole file into Supabase → SQL Editor → New query → Run.
--
-- RUN THIS ONLY AFTER the housing admin has signed in on the deployed site and finished "Set up two-factor"
-- (the site asks for it at the first admin login). Until then this would leave the admin with no powers.
--
-- Before: the "2FA" step was a fixed code checked in the browser, so the admin password alone was enough for
-- anyone calling the API directly. Now admin powers exist only in a session that passed a real authenticator
-- code (Supabase marks that session aal2). is_admin() is the single gate behind every admin policy, both RPCs,
-- the item trigger and the ai-review function, so this one change covers all of them.
--
-- Locked out (lost phone)? In the SQL Editor:
--   delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'housing.admin@university.edu');
-- then sign in again and set it up again.

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
     and exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- Should print one row: admin_mfa_required = true.
select position('aal2' in pg_get_functiondef('is_admin()'::regprocedure)) > 0 as admin_mfa_required;
