-- Walkthrough 001_schema.sql (copied from the build spec, Section 4.1).
-- Paste the whole file into Supabase → SQL Editor → New query → Run.

create extension if not exists pgcrypto;

-- ───────────── Profiles (linked to Supabase Auth) ─────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text unique not null,
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz not null default now()
);

-- New sign-ups are ALWAYS students. Admins are promoted by SQL (Section 4.4).
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), lower(new.email));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- ───────────── Checklist template + fee schedule ─────────────
create table checklist_template (
  id serial primary key,
  step_order int unique not null,
  zone_category text not null check (zone_category in ('Entryway','Living Area','Bathroom','Kitchen')),
  item_name text not null,
  instruction_text text not null,
  standard_charge numeric(8,2) not null default 0   -- fee schedule: cost if this item is newly damaged
);

-- ───────────── Units ─────────────
create table units (
  id uuid primary key default gen_random_uuid(),
  unit_code text unique not null,              -- e.g. 'FH-304B' → QR URL /inspect/FH-304B
  building_name text not null,
  room_number text not null,
  semester text not null,
  assigned_student_name text not null,
  assigned_student_email text not null,        -- store lowercase
  inspection_phase text not null default 'MOVE_IN_OPEN'
    check (inspection_phase in ('MOVE_IN_OPEN','MOVE_IN_LOCKED','MOVE_OUT_OPEN','COMPLETED')),
  move_in_locked_at timestamptz,
  move_out_locked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (building_name, room_number, semester)
);

-- ───────────── Inspection items (one row = one item, before + after side by side) ─────────────
create table inspection_items (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  step_order int not null,
  zone_category text not null,
  item_name text not null,
  instruction_text text not null,
  standard_charge numeric(8,2) not null default 0,

  -- BEFORE (move-in) evidence
  before_media_path text,                        -- storage path, or '/seed/...' for seed images
  before_media_type text check (before_media_type in ('image','video')),
  before_sha256 text,                            -- fingerprint of the uploaded file
  before_notes text,
  before_captured_at timestamptz,                -- server time of upload

  -- AFTER (move-out) evidence
  after_media_path text,
  after_media_type text check (after_media_type in ('image','video')),
  after_sha256 text,
  after_notes text,
  after_captured_at timestamptz,

  -- Admin assessment
  condition_status text not null default 'UNREVIEWED'
    check (condition_status in ('UNREVIEWED','NO_CHANGE','PRE_EXISTING_DAMAGE','NEW_DAMAGE_BILLABLE','DISPUTE_UNDER_REVIEW')),
  estimated_fine numeric(8,2) not null default 0 check (estimated_fine >= 0),
  admin_comments text,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,

  -- Student dispute (one per item)
  dispute_reason text,
  disputed_at timestamptz,

  unique (unit_id, step_order)
);

-- ───────────── AI output (written ONLY by Edge Functions via service role) ─────────────
create table ai_reviews (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references inspection_items(id) on delete cascade,
  kind text not null check (kind in ('PHOTO_CHECK_BEFORE','PHOTO_CHECK_AFTER','DAMAGE_DIFF')),
  model text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create table ai_unit_reports (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  model text not null,
  result jsonb not null,     -- { admin_summary[], student_note, dispute_briefs[] }
  created_at timestamptz not null default now()
);

-- ───────────── Audit log (every change to units/items) ─────────────
create table audit_log (
  id bigserial primary key,
  table_name text not null,
  row_id uuid not null,
  actor uuid,
  actor_email text,
  action text not null,
  old_row jsonb,
  new_row jsonb,
  created_at timestamptz not null default now()
);

create function log_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (table_name, row_id, actor, actor_email, action, old_row, new_row)
  values (tg_table_name, new.id, auth.uid(), auth.jwt()->>'email', tg_op,
          case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  return new;
end $$;

-- ───────────── Auto-create checklist items for every new unit ─────────────
create function seed_unit_items() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into inspection_items (unit_id, step_order, zone_category, item_name, instruction_text, standard_charge)
  select new.id, step_order, zone_category, item_name, instruction_text, standard_charge
  from checklist_template;
  return new;
end $$;
create trigger units_seed_items after insert on units
  for each row execute function seed_unit_items();

-- ───────────── Guard: units ─────────────
-- SECURITY INVOKER on purpose: current_user is 'authenticated' for API calls,
-- and 'postgres' for the SQL editor and our security-definer RPCs (trusted → skip checks).
create function guard_units() returns trigger language plpgsql as $$
begin
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
  if old.inspection_phase <> 'MOVE_IN_OPEN'
     and new.assigned_student_email is distinct from old.assigned_student_email then
    raise exception 'Cannot reassign a unit after move-in is locked';
  end if;
  return new;
end $$;
create trigger units_guard before insert or update on units
  for each row execute function guard_units();
create trigger units_audit after update on units
  for each row execute function log_change();

-- ───────────── Guard: inspection items (the integrity core) ─────────────
create function protect_inspection_items() returns trigger language plpgsql as $$
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
    if new.before_media_path is distinct from old.before_media_path then
      new.before_captured_at := case when new.before_media_path is null then null else now() end;
    end if;
  end if;

  -- Move-out evidence
  if row(new.after_media_path, new.after_media_type, new.after_sha256, new.after_notes)
     is distinct from row(old.after_media_path, old.after_media_type, old.after_sha256, old.after_notes) then
    if not is_student then raise exception 'Only the assigned student can edit move-out evidence'; end if;
    if u.inspection_phase <> 'MOVE_OUT_OPEN' then raise exception 'Move-out inspection is not open'; end if;
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
create trigger inspection_items_protect before update on inspection_items
  for each row execute function protect_inspection_items();
create trigger inspection_items_audit after update on inspection_items
  for each row execute function log_change();

-- ───────────── RPCs: the ONLY way phases change ─────────────
create function lock_inspection(p_unit_id uuid) returns units
language plpgsql security definer set search_path = public as $$
declare u units%rowtype; missing int;
begin
  select * into u from units where id = p_unit_id for update;
  if u.id is null then raise exception 'Unit not found'; end if;
  if lower(auth.jwt()->>'email') is distinct from u.assigned_student_email then
    raise exception 'Only the assigned student can submit this inspection';
  end if;

  if u.inspection_phase = 'MOVE_IN_OPEN' then
    select count(*) into missing from inspection_items where unit_id = u.id and before_media_path is null;
    if missing > 0 then raise exception '% item(s) still need a photo or video', missing; end if;
    update units set inspection_phase = 'MOVE_IN_LOCKED', move_in_locked_at = now()
      where id = u.id returning * into u;
  elsif u.inspection_phase = 'MOVE_OUT_OPEN' then
    select count(*) into missing from inspection_items where unit_id = u.id and after_media_path is null;
    if missing > 0 then raise exception '% item(s) still need a photo or video', missing; end if;
    update units set inspection_phase = 'COMPLETED', move_out_locked_at = now()
      where id = u.id returning * into u;
  else
    raise exception 'Nothing to submit while the unit is %', u.inspection_phase;
  end if;
  return u;
end $$;

create function open_move_out(p_unit_id uuid) returns units
language plpgsql security definer set search_path = public as $$
declare u units%rowtype;
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  update units set inspection_phase = 'MOVE_OUT_OPEN'
    where id = p_unit_id and inspection_phase = 'MOVE_IN_LOCKED' returning * into u;
  if u.id is null then raise exception 'Move-out can only open after move-in is locked'; end if;
  return u;
end $$;

-- ───────────── Dashboard view (respects RLS of the caller) ─────────────
-- NOTE: `security_invoker = true` requires PostgreSQL 15+ (standard on all new Supabase projects;
-- check with `select version();`). Never delete it to make this run on older Postgres: without it
-- the view runs as its owner, skips RLS, and every student could read every unit's items.
create view item_dashboard with (security_invoker = true) as
select i.*,
       u.unit_code, u.building_name, u.room_number, u.semester,
       u.assigned_student_name, u.assigned_student_email, u.inspection_phase,
       case when i.condition_status = 'PRE_EXISTING_DAMAGE' then i.standard_charge else 0 end as waived_amount,
       case when i.condition_status = 'NEW_DAMAGE_BILLABLE' then i.estimated_fine  else 0 end as billable_amount
from inspection_items i
join units u on u.id = i.unit_id;
