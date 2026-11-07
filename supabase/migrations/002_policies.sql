-- Walkthrough 002_policies.sql (copied from the build spec, Section 4.2).
-- Paste the whole file into Supabase → SQL Editor → New query → Run.

alter table profiles           enable row level security;
alter table checklist_template enable row level security;
alter table units              enable row level security;
alter table inspection_items   enable row level security;
alter table ai_reviews         enable row level security;
alter table ai_unit_reports    enable row level security;
alter table audit_log          enable row level security;

-- Helper: does the caller own this unit?
create function owns_unit(p_unit_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from units where id = p_unit_id
                 and assigned_student_email = lower(auth.jwt()->>'email'));
$$;

create policy "profiles: self or admin" on profiles for select to authenticated
  using (id = auth.uid() or is_admin());

create policy "template: readable" on checklist_template for select to authenticated using (true);

create policy "units: read own or admin" on units for select to authenticated
  using (is_admin() or owns_unit(id));
create policy "units: admin insert" on units for insert to authenticated with check (is_admin());
create policy "units: admin update" on units for update to authenticated
  using (is_admin()) with check (is_admin());
-- no delete policy: units (and their evidence) are never deleted from the app

create policy "items: read own or admin" on inspection_items for select to authenticated
  using (is_admin() or owns_unit(unit_id));
create policy "items: update own or admin" on inspection_items for update to authenticated
  using (is_admin() or owns_unit(unit_id)) with check (is_admin() or owns_unit(unit_id));
-- no insert/delete policies: items come only from the template trigger
-- column-level rules are enforced by protect_inspection_items()

create policy "ai: admin all, student own photo checks" on ai_reviews for select to authenticated
  using (is_admin() or (kind like 'PHOTO_CHECK_%'
         and owns_unit((select unit_id from inspection_items where id = item_id))));
create policy "ai unit reports: admin" on ai_unit_reports for select to authenticated using (is_admin());
create policy "audit: admin" on audit_log for select to authenticated using (is_admin());
-- no write policies on ai_* or audit_log: only triggers and Edge Functions (service role) write them

-- Explicit grants (harmless if Supabase already granted them)
grant select on profiles, checklist_template, units, inspection_items, ai_reviews,
                ai_unit_reports, audit_log, item_dashboard to authenticated;
grant insert, update on units to authenticated;
grant update on inspection_items to authenticated;

-- ───────────── Storage: private, immutable media bucket ─────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inspection-media', 'inspection-media', false, 52428800, array['image/*','video/*']);  -- 50 MB

-- Path convention: {unit_id}/{item_id}/{before|after}-{epochMs}.{ext}
create policy "media: student uploads to own open unit" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'inspection-media'
    and exists (select 1 from units u
                where u.id::text = (storage.foldername(name))[1]
                  and u.assigned_student_email = lower(auth.jwt()->>'email')
                  and u.inspection_phase in ('MOVE_IN_OPEN','MOVE_OUT_OPEN'))
  );
create policy "media: read own unit or admin" on storage.objects for select to authenticated
  using (
    bucket_id = 'inspection-media'
    and (is_admin() or exists (select 1 from units u
                               where u.id::text = (storage.foldername(name))[1]
                                 and u.assigned_student_email = lower(auth.jwt()->>'email')))
  );
-- Deliberately NO update/delete policies: no one can overwrite or delete an uploaded file.
-- "Retake" uploads a NEW file and points the row at it; the old file stays as history.
