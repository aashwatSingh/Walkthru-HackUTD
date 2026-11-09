-- Walkthrough 006_hardening.sql (post-hackathon security audit).
-- Paste the whole file into Supabase → SQL Editor → New query → Run. It runs as one transaction: if any
-- step fails, nothing changes. Safe to run again. Tested with tests/sql/ (npm run test:sql).
--
-- What it closes:
--   A. Backdated evidence. A student could point a move-in photo at a file that did not exist yet, lock, and
--      upload that "move-in" file months later during move-out (uploads were allowed to any path in the unit
--      folder in either open phase). Now: before- files upload only during move-in and after- files only during
--      move-out, into that item's folder, and a row can only point at a file that already exists.
--   B. Fingerprints are required (64 hex characters) and set once, together with the file.
--   C. Students could change an item's id, or store megabytes of notes.
--   D. Housing could reassign a room to itself after the student had uploaded evidence, and edit it.
--   E. Room emails with capital letters never matched the student's login.
--   F. Least privilege: the API roles had every table privilege (TRUNCATE skips row security), and signed-out
--      visitors could call the functions.
--   G. Uploads accept only JPEG, MP4 and WebM (was image/* and video/*, which includes SVG), at most 60 files per
--      item, and a photo over 5 MB cannot be registered as evidence.

begin;

-- Stop before changing anything if this project's storage setup is not what the rules below rely on.
do $$ begin
  if not has_schema_privilege('authenticated', 'storage', 'usage')
     or not has_table_privilege('authenticated', 'storage.objects', 'select') then
    raise exception 'authenticated cannot read storage.objects: the evidence-exists check would block every upload. Nothing was changed.';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'media: read own unit or admin') then
    raise exception 'Storage policy "media: read own unit or admin" is missing (run 002_policies.sql first). Nothing was changed.';
  end if;
end $$;

-- ───────────── A. Storage: where and when a file may be uploaded ─────────────
-- Files already stored for one item. A function, because a policy on storage.objects cannot query
-- storage.objects itself (infinite recursion). If this role could not see the files it would count 0,
-- so the cap would simply not apply: it can never block a legitimate upload by mistake.
create or replace function evidence_file_count(p_folder text) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from storage.objects where bucket_id = 'inspection-media' and name like p_folder || '%';
$$;

-- {unit_id}/{item_id}/{before|after}-{epochMs}.{jpg|mp4|webm}; "before" only while move-in is open,
-- "after" only while move-out is open; at most 60 files per item (retakes included).
drop policy if exists "media: student uploads to own open unit" on storage.objects;
create policy "media: student uploads to own open unit" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'inspection-media'
    and exists (
      select 1 from public.units u join public.inspection_items i on i.unit_id = u.id
      where u.assigned_student_email = lower(auth.jwt()->>'email')
        and objects.name ~ ('^' || u.id::text || '/' || i.id::text || '/'
              || case u.inspection_phase when 'MOVE_IN_OPEN' then 'before' when 'MOVE_OUT_OPEN' then 'after' end
              || '-[0-9]{10,16}\.(jpg|mp4|webm)$')   -- a locked phase gives NULL here, so nothing matches
    )
    and public.evidence_file_count(split_part(objects.name, '/', 1) || '/' || split_part(objects.name, '/', 2) || '/') < 60
  );

-- G. Only the file types the app produces. (Skipped with a notice if this role may not edit buckets.)
do $$ begin
  update storage.buckets set allowed_mime_types = array['image/jpeg', 'video/mp4', 'video/webm'] where id = 'inspection-media';
exception when others then
  raise notice 'Could not restrict the bucket file types (%). Set them in Storage → inspection-media → Edit bucket.', sqlerrm;
end $$;

-- ───────────── D + E. Units ─────────────
create or replace function guard_units() returns trigger language plpgsql as $$
begin
  new.assigned_student_email := lower(trim(new.assigned_student_email));   -- logins are compared in lowercase
  if current_user not in ('authenticated','anon') then return new; end if;

  if tg_op = 'INSERT' then
    new.inspection_phase := 'MOVE_IN_OPEN';
    new.move_in_locked_at := null;
    new.move_out_locked_at := null;
    return new;
  end if;

  if new.inspection_phase is distinct from old.inspection_phase then
    raise exception 'Phases change only through lock_inspection() or open_move_out()';
  end if;
  new.move_in_locked_at := old.move_in_locked_at;
  new.move_out_locked_at := old.move_out_locked_at;
  new.unit_code := old.unit_code;   -- QR codes may already be printed
  if new.assigned_student_email is distinct from old.assigned_student_email then
    if old.inspection_phase <> 'MOVE_IN_OPEN' then
      raise exception 'Cannot reassign a unit after move-in is locked';
    end if;
    -- Whoever is assigned can edit move-in evidence, so the room cannot change hands once evidence exists.
    if exists (select 1 from inspection_items where unit_id = old.id and before_media_path is not null) then
      raise exception 'Cannot reassign a unit that already has move-in evidence';
    end if;
  end if;
  return new;
end $$;

-- ───────────── A + B + C. Inspection items ─────────────
create or replace function protect_inspection_items() returns trigger language plpgsql as $$
declare
  u units%rowtype;
  me text := lower(auth.jwt()->>'email');
  is_student boolean;
  admin boolean := is_admin();
  folder text;
begin
  if current_user not in ('authenticated','anon') then return new; end if;

  if new.id is distinct from old.id then raise exception 'Item ids cannot change'; end if;

  select * into u from units where id = old.unit_id;
  is_student := me is not null and me = u.assigned_student_email;
  folder := u.id::text || '/' || old.id::text || '/';

  -- Server-owned columns: ignore whatever the client sent
  new.before_captured_at := old.before_captured_at;
  new.after_captured_at  := old.after_captured_at;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.disputed_at := old.disputed_at;

  -- The checklist definition never changes
  if row(new.unit_id, new.step_order, new.zone_category, new.item_name, new.instruction_text, new.standard_charge)
     is distinct from row(old.unit_id, old.step_order, old.zone_category, old.item_name, old.instruction_text, old.standard_charge) then
    raise exception 'The checklist itself cannot be edited';
  end if;

  if length(coalesce(new.before_notes, '')) > 2000 or length(coalesce(new.after_notes, '')) > 2000
     or length(coalesce(new.dispute_reason, '')) > 2000 or length(coalesce(new.admin_comments, '')) > 4000 then
    raise exception 'That text is too long';
  end if;

  -- Move-in evidence
  if row(new.before_media_path, new.before_media_type, new.before_sha256, new.before_notes)
     is distinct from row(old.before_media_path, old.before_media_type, old.before_sha256, old.before_notes) then
    if not is_student then raise exception 'Only the assigned student can edit move-in evidence'; end if;
    if u.inspection_phase <> 'MOVE_IN_OPEN' then raise exception 'Move-in inspection is locked'; end if;
    if row(new.before_media_path, new.before_media_type, new.before_sha256)
       is distinct from row(old.before_media_path, old.before_media_type, old.before_sha256) then
      perform check_evidence(folder || 'before-', new.before_media_path, old.before_media_path, new.before_media_type, new.before_sha256);
    end if;
    if new.before_media_path is distinct from old.before_media_path then
      new.before_captured_at := case when new.before_media_path is null then null else now() end;
    end if;
  end if;

  -- Move-out evidence
  if row(new.after_media_path, new.after_media_type, new.after_sha256, new.after_notes)
     is distinct from row(old.after_media_path, old.after_media_type, old.after_sha256, old.after_notes) then
    if not is_student then raise exception 'Only the assigned student can edit move-out evidence'; end if;
    if u.inspection_phase <> 'MOVE_OUT_OPEN' then raise exception 'Move-out inspection is not open'; end if;
    if row(new.after_media_path, new.after_media_type, new.after_sha256)
       is distinct from row(old.after_media_path, old.after_media_type, old.after_sha256) then
      perform check_evidence(folder || 'after-', new.after_media_path, old.after_media_path, new.after_media_type, new.after_sha256);
    end if;
    if new.after_media_path is distinct from old.after_media_path then
      new.after_captured_at := case when new.after_media_path is null then null else now() end;
    end if;
  end if;

  -- Assessment + dispute
  if row(new.condition_status, new.estimated_fine, new.admin_comments, new.dispute_reason)
     is distinct from row(old.condition_status, old.estimated_fine, old.admin_comments, old.dispute_reason) then
    if admin then
      if u.inspection_phase <> 'COMPLETED' then raise exception 'Assess items after move-out is submitted'; end if;
      if new.dispute_reason is distinct from old.dispute_reason then
        raise exception 'Admins cannot edit a student''s dispute';
      end if;
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    elsif is_student
      and u.inspection_phase = 'COMPLETED'
      and old.condition_status = 'NEW_DAMAGE_BILLABLE'
      and new.condition_status = 'DISPUTE_UNDER_REVIEW'
      and old.dispute_reason is null
      and length(trim(coalesce(new.dispute_reason, ''))) >= 10
      and new.estimated_fine = old.estimated_fine
      and new.admin_comments is not distinct from old.admin_comments then
      new.disputed_at := now();
    else
      raise exception 'Only housing admins can change assessments';
    end if;
  end if;

  return new;
end $$;

-- One piece of evidence (path + type + fingerprint) for one item and phase. Runs as the student, so the
-- "file exists" lookup goes through the storage read policy (own unit only).
create or replace function check_evidence(p_prefix text, p_path text, p_old_path text, p_type text, p_sha text)
returns void language plpgsql as $$
declare bytes bigint;
begin
  if p_path is null then
    if p_type is not null or p_sha is not null then raise exception 'Remove the file, its type and its fingerprint together'; end if;
    return;
  end if;
  if p_path is not distinct from p_old_path then
    raise exception 'A file''s type and fingerprint are set once, when it is uploaded';
  end if;
  -- A file uploaded for THIS item and phase (not another item, phase, unit or a seed file)
  if left(p_path, length(p_prefix)) <> p_prefix
     or substr(p_path, length(p_prefix) + 1) !~ '^[0-9]{10,16}\.(jpg|mp4|webm)$' then
    raise exception 'Evidence must be a photo uploaded for this item';
  end if;
  select (metadata->>'size')::bigint into bytes from storage.objects where bucket_id = 'inspection-media' and name = p_path;
  if not found then raise exception 'Upload the file first: nothing is stored at that path'; end if;
  -- The app compresses photos to about 150 KB; this keeps huge "photos" away from the AI functions.
  if p_path like '%.jpg' and bytes > 5 * 1024 * 1024 then raise exception 'Photos must be under 5 MB'; end if;
  if p_type is distinct from (case when p_path like '%.jpg' then 'image' else 'video' end) then
    raise exception 'The media type does not match the file';
  end if;
  if p_sha is null or p_sha !~ '^[0-9a-f]{64}$' then
    raise exception 'Every file needs its SHA-256 fingerprint';
  end if;
end $$;

-- ───────────── F. Least privilege ─────────────
-- Row security stays the gate; this removes what nobody needs (TRUNCATE ignores row security).
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on profiles, checklist_template, units, inspection_items, ai_reviews,
                ai_unit_reports, audit_log, item_dashboard to authenticated;
grant insert, update on units to authenticated;
grant update on inspection_items to authenticated;

-- Functions are callable by everyone by default; only signed-in users need these.
revoke execute on function is_admin(), owns_unit(uuid), lock_inspection(uuid), open_move_out(uuid),
                           check_evidence(text, text, text, text, text), evidence_file_count(text) from public, anon;
grant execute on function is_admin(), owns_unit(uuid), lock_inspection(uuid), open_move_out(uuid),
                          check_evidence(text, text, text, text, text), evidence_file_count(text) to authenticated, service_role;

commit;

-- Should print one row: hardening_installed = true.
select position('check_evidence' in pg_get_functiondef('protect_inspection_items()'::regprocedure)) > 0
   and not has_table_privilege('authenticated', 'public.inspection_items', 'truncate')
   and not has_function_privilege('anon', 'public.is_admin()', 'execute') as hardening_installed;
