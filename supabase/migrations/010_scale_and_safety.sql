-- Walkthrough 010_scale_and_safety.sql
-- Paste the whole file into Supabase → SQL Editor → New query → Run. It runs as one transaction: if any
-- step fails, nothing changes. Safe to run again. Tested with tests/sql/ (npm run test:sql).
-- Needs 008_server_fingerprints.sql. It does not touch is_admin(), so it works before or after 007.
-- Everything here is additive: the site that is live before this runs keeps working after it.
--
-- What it adds:
--   A. A record of which migrations ran (from this one on), and security_status(): one call that tells the
--      admin dashboard which protections are installed, so a skipped migration shows up on screen.
--   B. Rate limits for the Edge Functions that cost money or memory (register-evidence, ai-review).
--   C. A tamper-evident audit log: every entry carries the SHA-256 of the entry before it, per room, and the
--      log can no longer be edited or deleted through any API role. The head of a room's chain is printed on
--      its inspection report, so a copy held by the student pins the history housing holds.
--   D. Building-scoped admins: an admin listed in admin_scopes sees and acts on those buildings only.
--      An admin with no rows there keeps seeing everything, exactly as before.
--   E. Dashboard queries that page and aggregate in the database, instead of sending every row to the browser.
--   F. Indexes for the lookups the app makes on every request.

begin;

do $$ begin
  if to_regprocedure('public.register_evidence(uuid,text,text,text,uuid,text)') is null then
    raise exception 'register_evidence() is missing: run 008_server_fingerprints.sql first. Nothing was changed.';
  end if;
end $$;

-- ───────────── A. What has been installed ─────────────
create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
alter table schema_migrations enable row level security;      -- no policies: read through security_status()
revoke all on schema_migrations from anon, authenticated;

-- ───────────── B. Rate limits (called by Edge Functions with the service role) ─────────────
create table if not exists rate_limits (
  subject uuid not null,                 -- the signed-in user
  action text not null,                  -- 'register-evidence', 'ai-review', …
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (subject, action, window_start)
);
alter table rate_limits enable row level security;            -- no policies: service role only
revoke all on rate_limits from anon, authenticated;

-- Counts one call and says whether it is still within p_max calls per p_window_seconds. Atomic.
create or replace function take_rate_limit(p_subject uuid, p_action text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / greatest(p_window_seconds, 1)) * greatest(p_window_seconds, 1));
  n int;
begin
  insert into rate_limits (subject, action, window_start, hits) values (p_subject, p_action, w, 1)
    on conflict (subject, action, window_start) do update set hits = rate_limits.hits + 1
    returning hits into n;
  if n = 1 then   -- first call of a new window: sweep out old windows
    delete from rate_limits where window_start < now() - interval '2 days';
  end if;
  return n <= p_max;
end $$;

-- ───────────── D. Building-scoped admins (defined before C and E, which use them) ─────────────
create table if not exists admin_scopes (
  admin_id uuid not null references profiles(id) on delete cascade,
  building_name text not null,
  primary key (admin_id, building_name)
);
alter table admin_scopes enable row level security;
revoke all on admin_scopes from anon, authenticated;
grant select on admin_scopes to authenticated;
drop policy if exists "admin scopes: own" on admin_scopes;
create policy "admin scopes: own" on admin_scopes for select to authenticated using (admin_id = auth.uid());
-- no write policies: scopes are assigned in the SQL Editor, e.g.
--   insert into admin_scopes select id, 'Founders Hall' from profiles where email = 'north.campus@university.edu';

-- May the caller act as an admin for this building? No rows in admin_scopes = every building.
create or replace function admin_of(p_building text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
     and (not exists (select 1 from admin_scopes where admin_id = auth.uid())
          or exists (select 1 from admin_scopes where admin_id = auth.uid() and building_name = p_building));
$$;
create or replace function admin_of_unit(p_unit_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select admin_of((select building_name from units where id = p_unit_id));
$$;
-- For storage paths, whose first folder is the unit id as text (and may be anything at all).
create or replace function admin_of_folder(p_unit text) returns boolean
language sql stable security definer set search_path = public as $$
  select admin_of((select building_name from units where id::text = p_unit));
$$;

drop policy if exists "units: read own or admin" on units;
create policy "units: read own or admin" on units for select to authenticated
  using (admin_of(building_name) or owns_unit(id));
drop policy if exists "units: admin insert" on units;
create policy "units: admin insert" on units for insert to authenticated with check (admin_of(building_name));
drop policy if exists "units: admin update" on units;
create policy "units: admin update" on units for update to authenticated
  using (admin_of(building_name)) with check (admin_of(building_name));

drop policy if exists "items: read own or admin" on inspection_items;
create policy "items: read own or admin" on inspection_items for select to authenticated
  using (admin_of_unit(unit_id) or owns_unit(unit_id));
drop policy if exists "items: update own or admin" on inspection_items;
create policy "items: update own or admin" on inspection_items for update to authenticated
  using (admin_of_unit(unit_id) or owns_unit(unit_id)) with check (admin_of_unit(unit_id) or owns_unit(unit_id));

drop policy if exists "ai: admin all, student own photo checks" on ai_reviews;
create policy "ai: admin all, student own photo checks" on ai_reviews for select to authenticated
  using (admin_of_unit((select unit_id from inspection_items where id = item_id))
         or (kind like 'PHOTO_CHECK_%' and owns_unit((select unit_id from inspection_items where id = item_id))));
drop policy if exists "ai unit reports: admin" on ai_unit_reports;
create policy "ai unit reports: admin" on ai_unit_reports for select to authenticated using (admin_of_unit(unit_id));

drop policy if exists "media: read own unit or admin" on storage.objects;
create policy "media: read own unit or admin" on storage.objects for select to authenticated
  using (
    bucket_id = 'inspection-media'
    and (public.admin_of_folder((storage.foldername(name))[1])
         or exists (select 1 from public.units u
                    where u.id::text = (storage.foldername(name))[1]
                      and u.assigned_student_email = lower(auth.jwt()->>'email')))
  );

create or replace function open_move_out(p_unit_id uuid) returns units
language plpgsql security definer set search_path = public as $$
declare u units%rowtype;
begin
  if not admin_of_unit(p_unit_id) then raise exception 'Admins only'; end if;
  update units set inspection_phase = 'MOVE_OUT_OPEN'
    where id = p_unit_id and inspection_phase = 'MOVE_IN_LOCKED' returning * into u;
  if u.id is null then raise exception 'Move-out can only open after move-in is locked'; end if;
  return u;
end $$;

-- ───────────── C. Tamper-evident audit log ─────────────
alter table audit_log add column if not exists unit_id uuid;     -- the room an entry belongs to
alter table audit_log add column if not exists prev_hash text;   -- row_hash of the room's previous entry
alter table audit_log add column if not exists row_hash text;    -- SHA-256 over prev_hash and this entry
create index if not exists audit_log_unit_idx on audit_log (unit_id, id);

create or replace function audit_row_hash(p_prev text, p_table text, p_row uuid, p_actor uuid, p_email text,
                                          p_action text, p_old jsonb, p_new jsonb, p_at timestamptz)
returns text language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(jsonb_build_array(
    p_prev, p_table, p_row, p_actor, p_email, p_action, p_old, p_new,
    to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'))::text, 'UTF8')), 'hex');
$$;

-- Same trigger as before (every change to units and items), now chained per room. The advisory lock is per
-- room, so two students in different rooms never wait for each other.
create or replace function log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_unit uuid := coalesce((to_jsonb(new)->>'unit_id')::uuid, new.id);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_new jsonb := to_jsonb(new);
  v_actor uuid := auth.uid();
  v_email text := auth.jwt()->>'email';
  v_at timestamptz := clock_timestamp();
  v_prev text;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_unit::text, 42));
  select row_hash into v_prev from audit_log where unit_id = v_unit and row_hash is not null order by id desc limit 1;
  insert into audit_log (table_name, row_id, actor, actor_email, action, old_row, new_row, created_at, unit_id, prev_hash, row_hash)
  values (tg_table_name, new.id, v_actor, v_email, tg_op, v_old, v_new, v_at, v_unit, v_prev,
          audit_row_hash(v_prev, tg_table_name, new.id, v_actor, v_email, tg_op, v_old, v_new, v_at));
  return new;
end $$;

-- The log is append-only for every role that reaches it through the API, the service role included.
create or replace function audit_log_is_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'The audit log cannot be changed';
end $$;
drop trigger if exists audit_log_no_rewrite on audit_log;
create trigger audit_log_no_rewrite before update or delete on audit_log
  for each row execute function audit_log_is_append_only();
drop trigger if exists audit_log_no_truncate on audit_log;
create trigger audit_log_no_truncate before truncate on audit_log
  for each statement execute function audit_log_is_append_only();

drop policy if exists "audit: admin" on audit_log;
create policy "audit: admin" on audit_log for select to authenticated using (admin_of_unit(unit_id));

-- Re-computes a room's chain. { ok, entries, head }: ok = no entry was altered, removed or reordered since it
-- was written; head = the latest row_hash (what the inspection report prints). For the room's student, its
-- admins, and the SQL Editor.
create or replace function verify_audit_chain(p_unit_id uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  r audit_log%rowtype;
  v_prev text;
  v_ok boolean := true;
  v_n bigint := 0;
begin
  if coalesce(auth.jwt()->>'role', '') in ('authenticated', 'anon')
     and not (admin_of_unit(p_unit_id) or owns_unit(p_unit_id)) then
    raise exception 'Not your room';
  end if;
  for r in select * from audit_log where unit_id = p_unit_id and row_hash is not null order by id loop
    v_n := v_n + 1;
    if r.prev_hash is distinct from v_prev
       or r.row_hash is distinct from audit_row_hash(r.prev_hash, r.table_name, r.row_id, r.actor, r.actor_email,
                                                     r.action, r.old_row, r.new_row, r.created_at) then
      v_ok := false;
    end if;
    v_prev := r.row_hash;
  end loop;
  return json_build_object('ok', v_ok, 'entries', v_n, 'head', v_prev);
end $$;

-- ───────────── E. Dashboard queries that scale ─────────────
-- Both run as the caller, so row security decides what is counted (an admin: their buildings).
create or replace function dashboard_summary() returns json
language sql stable set search_path = public as $$
  select json_build_object(
    'units', (select count(*) from units),
    'inspected', (select count(*) from units where inspection_phase <> 'MOVE_IN_OPEN'),
    'items', (select count(*) from inspection_items),
    'saved', (select coalesce(sum(waived_amount), 0) from item_dashboard),
    'billable', (select coalesce(sum(billable_amount), 0) from item_dashboard),
    'disputes', (select count(*) from inspection_items where condition_status = 'DISPUTE_UNDER_REVIEW'),
    'by_building', coalesce((select json_agg(b order by b.building) from (
        select building_name as building, sum(waived_amount) as waived, sum(billable_amount) as billable
        from item_dashboard group by building_name) b), '[]'::json),
    'by_status', coalesce((select json_agg(s) from (
        select condition_status as key, count(*) as value from inspection_items group by condition_status) s), '[]'::json),
    'buildings', coalesce((select json_agg(x.n order by x.n) from (select distinct building_name as n from units) x), '[]'::json),
    'zones', coalesce((select json_agg(x.n order by x.n) from (select distinct zone_category as n from inspection_items) x), '[]'::json),
    'unit_codes', coalesce((select json_agg(x.n order by x.n) from (select unit_code as n from units order by unit_code limit 500) x), '[]'::json)
  );
$$;

-- One page of rooms with how many photos each has. p_search matches code, building, room, student name or email.
create or replace function units_overview(p_search text default null, p_limit int default 12, p_offset int default 0)
returns json language sql stable set search_path = public as $$
  with hits as (
    select u.* from units u
    where coalesce(trim(p_search), '') = ''
       or position(lower(trim(p_search)) in lower(u.unit_code || ' ' || u.building_name || ' ' || u.room_number || ' '
                                                  || u.assigned_student_name || ' ' || u.assigned_student_email)) > 0
  ), page as (
    select * from hits order by unit_code
    limit least(greatest(coalesce(p_limit, 12), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
  )
  select json_build_object(
    'total', (select count(*) from hits),
    'units', coalesce((select json_agg(row_to_json(x) order by x.unit_code) from (
        select p.*,
               (select count(*) from inspection_items i where i.unit_id = p.id) as item_count,
               (select count(*) from inspection_items i where i.unit_id = p.id and i.before_media_path is not null) as before_count,
               (select count(*) from inspection_items i where i.unit_id = p.id and i.after_media_path is not null) as after_count
        from page p) x), '[]'::json));
$$;

-- ───────────── A (continued). One call for the dashboard's setup checks ─────────────
create or replace function security_status() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.jwt()->>'role', '') in ('authenticated', 'anon') and not is_admin() then
    raise exception 'Admins only';
  end if;
  return json_build_object(
    'hardening', to_regprocedure('public.check_evidence(text,text,text,text,text)') is not null,
    'admin_mfa_required', position('aal2' in pg_get_functiondef('public.is_admin()'::regprocedure)) > 0,
    'server_fingerprints', exists (select 1 from pg_trigger where tgrelid = 'public.inspection_items'::regclass
                                   and tgname = 'inspection_items_evidence_by_server' and tgenabled <> 'D'),
    'audit_chain', exists (select 1 from pg_trigger where tgrelid = 'public.audit_log'::regclass
                           and tgname = 'audit_log_no_rewrite' and tgenabled <> 'D'),
    'seed_photos_fingerprinted', not exists (select 1 from inspection_items
        where (before_media_path like '/seed/%' and before_sha256 is null) or (after_media_path like '/seed/%' and after_sha256 is null)),
    'migrations', coalesce((select json_agg(name order by name) from schema_migrations), '[]'::json),
    -- How much is stored, and how much of it no checklist item points to (abandoned uploads and retakes).
    'storage', (select json_build_object(
        'files', count(*),
        'bytes', coalesce(sum((o.metadata->>'size')::bigint), 0),
        'unreferenced_files', count(*) filter (where i.id is null),
        'unreferenced_bytes', coalesce(sum((o.metadata->>'size')::bigint) filter (where i.id is null), 0))
      from storage.objects o
      left join inspection_items i on o.name in (i.before_media_path, i.after_media_path)
      where o.bucket_id = 'inspection-media')
  );
end $$;

-- ───────────── F. Indexes ─────────────
create index if not exists units_student_email_idx on units (assigned_student_email);
create index if not exists units_building_idx on units (building_name);
create index if not exists items_status_idx on inspection_items (condition_status);
create index if not exists items_before_path_idx on inspection_items (before_media_path) where before_media_path is not null;
create index if not exists items_after_path_idx on inspection_items (after_media_path) where after_media_path is not null;
create index if not exists ai_reviews_item_idx on ai_reviews (item_id, kind, created_at desc);
create index if not exists ai_unit_reports_unit_idx on ai_unit_reports (unit_id, created_at desc);

-- ───────────── Privileges ─────────────
-- New functions are callable by everyone by default (and Supabase also grants them to the API roles).
revoke execute on function take_rate_limit(uuid, text, int, int) from public, anon, authenticated;
grant execute on function take_rate_limit(uuid, text, int, int) to service_role;
revoke execute on function admin_of(text), admin_of_unit(uuid), admin_of_folder(text), verify_audit_chain(uuid),
                           dashboard_summary(), units_overview(text, int, int), security_status(),
                           open_move_out(uuid) from public, anon;
grant execute on function admin_of(text), admin_of_unit(uuid), admin_of_folder(text), verify_audit_chain(uuid),
                          dashboard_summary(), units_overview(text, int, int), security_status(),
                          open_move_out(uuid) to authenticated, service_role;

insert into schema_migrations (name) values ('010_scale_and_safety') on conflict (name) do nothing;

commit;

-- Should print one row: scale_and_safety_installed = true.
select exists (select 1 from schema_migrations where name = '010_scale_and_safety')
   and exists (select 1 from pg_trigger where tgrelid = 'public.audit_log'::regclass and tgname = 'audit_log_no_rewrite')
   and has_function_privilege('service_role', 'public.take_rate_limit(uuid,text,int,int)', 'execute')
   and not has_function_privilege('authenticated', 'public.take_rate_limit(uuid,text,int,int)', 'execute')
   and not has_function_privilege('anon', 'public.dashboard_summary()', 'execute')
   as scale_and_safety_installed;
