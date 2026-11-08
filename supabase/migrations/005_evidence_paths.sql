-- Walkthrough 005_evidence_paths.sql (code review fix #1).
-- Paste the whole file into Supabase → SQL Editor → New query → Run. Safe to run once on an existing database.
--
-- Closes a hole: the evidence rule checked WHO edits a photo and WHEN, but not WHICH file it points to, so a
-- student could point their move-out photo at their own move-in photo (identical photos → "no change").
-- Now a photo path must be a file uploaded for that exact item and phase:
--   move-in:  <unit_id>/<item_id>/before-…      move-out: <unit_id>/<item_id>/after-…
-- Seed data (/seed/… paths) is unaffected: the SQL editor bypasses these checks.

create or replace function protect_inspection_items() returns trigger language plpgsql as $$
declare
  u units%rowtype;
  me text := lower(auth.jwt()->>'email');
  is_student boolean;
  admin boolean := is_admin();
begin
  if current_user not in ('authenticated','anon') then return new; end if;

  select * into u from units where id = old.unit_id;
  is_student := me is not null and me = u.assigned_student_email;

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

  -- Move-in evidence
  if row(new.before_media_path, new.before_media_type, new.before_sha256, new.before_notes)
     is distinct from row(old.before_media_path, old.before_media_type, old.before_sha256, old.before_notes) then
    if not is_student then raise exception 'Only the assigned student can edit move-in evidence'; end if;
    if u.inspection_phase <> 'MOVE_IN_OPEN' then raise exception 'Move-in inspection is locked'; end if;
    -- The photo must be a file uploaded for THIS item's move-in (no reusing other files or phases)
    if new.before_media_path is not null
       and new.before_media_path not like u.id::text || '/' || old.id::text || '/before-%' then
      raise exception 'Evidence must be a photo uploaded for this item';
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
    -- The photo must be a file uploaded for THIS item's move-out (e.g. not the move-in photo again)
    if new.after_media_path is not null
       and new.after_media_path not like u.id::text || '/' || old.id::text || '/after-%' then
      raise exception 'Evidence must be a photo uploaded for this item';
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
