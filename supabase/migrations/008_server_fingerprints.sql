-- Walkthrough 008_server_fingerprints.sql (post-hackathon security audit, "Known limits" item 1).
-- Paste the whole file into Supabase → SQL Editor → New query → Run. It runs as one transaction: if any
-- step fails, nothing changes. Safe to run again. Tested with tests/sql/ (npm run test:sql).
-- Needs 006_hardening.sql. Deploy the register-evidence Edge Function with it (see SECURITY.md): after this
-- runs, that function is the only way a photo gets onto a checklist item.
--
-- What it closes:
--   The SHA-256 fingerprint of every photo was computed by the student's browser and written by the student.
--   The database checked its shape (64 hex characters) but not that it matched the file, so a student calling
--   the API directly could register a wrong fingerprint and later point at the "Mismatch" badge as proof that
--   housing altered the photo.
-- Now:
--   A. A student (or admin) can no longer write a file path, media type or fingerprint. The one thing left is
--      clearing all three together ("remove photo"). Notes stay editable.
--   B. register_evidence() is the only way to set them. Only the service role may call it, which is what the
--      register-evidence Edge Function uses after it has downloaded the stored file and hashed it itself.
--      It re-checks, under a row lock, everything the trigger used to check for students: the assigned student,
--      the open phase, a file that exists in this item's folder for this phase, its size and type.
--   C. The capture time is still the database clock, and the audit log still names the student.
--
-- A is its own trigger, not an edit to protect_inspection_items(): 005 and 006 replace that function, so
-- running either of them again would silently bring the old behaviour back. This one they do not touch.

begin;

do $$ begin
  if to_regprocedure('public.check_evidence(text,text,text,text,text)') is null then
    raise exception 'check_evidence() is missing: run 006_hardening.sql first. Nothing was changed.';
  end if;
end $$;

-- ───────────── A. Students cannot write a path, type or fingerprint ─────────────
-- SECURITY INVOKER on purpose (like the other guards): current_user is 'authenticated' for API calls and the
-- function owner inside register_evidence(), so the server's own write passes.
create or replace function evidence_set_by_server() returns trigger language plpgsql as $$
begin
  if current_user not in ('authenticated','anon') then return new; end if;

  if row(new.before_media_path, new.before_media_type, new.before_sha256)
       is distinct from row(old.before_media_path, old.before_media_type, old.before_sha256)
     and (new.before_media_path is not null or new.before_media_type is not null or new.before_sha256 is not null) then
    raise exception 'Photos are registered by the server: upload the file, then call register-evidence';
  end if;
  if row(new.after_media_path, new.after_media_type, new.after_sha256)
       is distinct from row(old.after_media_path, old.after_media_type, old.after_sha256)
     and (new.after_media_path is not null or new.after_media_type is not null or new.after_sha256 is not null) then
    raise exception 'Photos are registered by the server: upload the file, then call register-evidence';
  end if;
  return new;   -- who may clear a photo, and when, is still decided by protect_inspection_items()
end $$;

drop trigger if exists inspection_items_evidence_by_server on inspection_items;
create trigger inspection_items_evidence_by_server before update on inspection_items
  for each row execute function evidence_set_by_server();

-- ───────────── B + C. The only way to put a file on an item ─────────────
-- p_sha256 is the fingerprint the Edge Function computed from the bytes it downloaded; p_user_id and p_email
-- are the caller it authenticated. SECURITY DEFINER: the "file exists" lookup and the write run as the owner.
create or replace function register_evidence(p_item_id uuid, p_phase text, p_path text, p_sha256 text,
                                             p_user_id uuid, p_email text)
returns inspection_items language plpgsql security definer set search_path = public as $$
declare
  i inspection_items%rowtype;
  u units%rowtype;
  v_email text := lower(trim(p_email));
  v_old_path text;
  v_old_sha text;
  v_type text;
  v_claims text := current_setting('request.jwt.claims', true);
begin
  if p_phase is null or p_phase not in ('before', 'after') then
    raise exception 'Phase must be before or after';
  end if;

  -- The same row lock lock_inspection() takes: a photo cannot slip in while the inspection is being locked.
  select u2.* into u from units u2 join inspection_items i2 on i2.unit_id = u2.id
    where i2.id = p_item_id for update of u2;
  if not found then raise exception 'Item not found'; end if;
  select * into i from inspection_items where id = p_item_id for update;

  if v_email is null or v_email = '' or v_email <> u.assigned_student_email then
    raise exception 'Only the assigned student can edit % evidence',
      case p_phase when 'before' then 'move-in' else 'move-out' end;
  end if;
  if p_phase = 'before' and u.inspection_phase <> 'MOVE_IN_OPEN' then raise exception 'Move-in inspection is locked'; end if;
  if p_phase = 'after' and u.inspection_phase <> 'MOVE_OUT_OPEN' then raise exception 'Move-out inspection is not open'; end if;
  if p_path is null then raise exception 'Evidence must be a photo uploaded for this item'; end if;

  if p_phase = 'before' then v_old_path := i.before_media_path; v_old_sha := i.before_sha256;
  else                       v_old_path := i.after_media_path;  v_old_sha := i.after_sha256;
  end if;
  -- The app asked twice for the same file (a retry after a dropped connection): already done.
  if p_path = v_old_path and p_sha256 = v_old_sha then return i; end if;

  -- A file that exists, uploaded for THIS item and phase, of the right size; a 64-hex fingerprint; and a path
  -- that is already registered is never given a different fingerprint.
  v_type := case when p_path like '%.jpg' then 'image' else 'video' end;
  perform check_evidence(u.id::text || '/' || i.id::text || '/' || p_phase || '-', p_path, v_old_path, v_type, p_sha256);

  -- The audit log names who did it: the server writes this on the student's behalf.
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'email', v_email, 'role', 'service_role')::text, true);
  if p_phase = 'before' then
    update inspection_items set before_media_path = p_path, before_media_type = v_type, before_sha256 = p_sha256,
           before_captured_at = now() where id = i.id returning * into i;
  else
    update inspection_items set after_media_path = p_path, after_media_type = v_type, after_sha256 = p_sha256,
           after_captured_at = now() where id = i.id returning * into i;
  end if;
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  return i;
end $$;

-- New functions are callable by everyone by default (and Supabase also grants them to the API roles).
revoke execute on function register_evidence(uuid, text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function register_evidence(uuid, text, text, text, uuid, text) to service_role;

commit;

-- Should print one row: server_fingerprints_installed = true.
select exists (select 1 from pg_trigger where tgrelid = 'public.inspection_items'::regclass
               and tgname = 'inspection_items_evidence_by_server' and tgenabled <> 'D')
   and has_function_privilege('service_role', 'public.register_evidence(uuid,text,text,text,uuid,text)', 'execute')
   and not has_function_privilege('authenticated', 'public.register_evidence(uuid,text,text,text,uuid,text)', 'execute')
   and not has_function_privilege('anon', 'public.register_evidence(uuid,text,text,text,uuid,text)', 'execute')
   as server_fingerprints_installed;
