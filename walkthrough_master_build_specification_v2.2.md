# 🛠️ Walkthrough — Master Build Specification (v2.2)

> **HackUTD · Target: NVIDIA challenge — "Use Nemotron beyond a chatbot"**
> Native build edition · Repo: [`Walkthru-HackUTD`](https://github.com/aashwatSingh/Walkthru-HackUTD) · Stack: React (Vite) + Supabase (Postgres, Auth, Storage, Edge Functions) + NVIDIA Nemotron · Deploy: Vercel

> **How to use this file**
> 1. Every teammate reads Sections 1–4 (10 minutes). That's the shared contract.
> 2. Each person pastes this whole file into Claude, then adds their **personal prompt** from Section 12.
> 3. Everyone builds against the **mock data layer first** (Increment 1), so nobody waits on anybody.

---

## 1. What We're Building (and the one-line pitch)

**Walkthrough** is a zero-download, mobile-first **web app** for university housing move-in/move-out inspections.

**Pitch:** *"Students get charged for damage that was already there. Walkthrough gives every room a tamper-proof, timestamped before/after record, and an NVIDIA Nemotron inspection agent that coaches students while they take photos and pre-reviews every move-out for housing staff, so fines are fair and disputes settle in minutes."*

**How it works**
1. A housing admin generates a **QR code** for each room and tapes it to the door.
2. The student scans it → logs in → a guided checklist walks them through photographing each item (**Move-In / "Before"**).
3. They **lock & submit**. From that moment, **Postgres itself** refuses any edit, from students *and* admins.
4. At move-out, the student repeats the walkthrough with their move-in photo shown as a framing reference (**Move-Out / "After"**).
5. **Nemotron** compares before vs. after for every item and proposes a status. Fines come from a fixed fee schedule, never from the model. The admin approves with one click.
6. Students can **dispute** a charge. Nemotron drafts an evidence brief citing timestamps, and the admin resolves it. Anyone can download a **PDF report**.

### Why this wins the Nemotron challenge
Nemotron is **embedded in the workflow at three points**. The user never chats with it:

| # | Agent step | Who triggers it | Nemotron model | Output |
|---|---|---|---|---|
| 1 | **Capture Coach** | Every student photo upload | Vision-language (VL) | "Does this photo show the right item, framed correctly, sharp, same angle as move-in?" + a one-line retake tip |
| 2 | **Damage Diff** | Admin clicks "Run Nemotron Review" on a unit | VL | Per item: change detected?, findings, suggested status, confidence, rationale citing move-in evidence |
| 3 | **Review Memo + Dispute Brief** | Same run, after step 2 | Text (reasoning) | Admin summary, plain-language note to the student, evidence brief for every disputed item |

**Design principle to say out loud to judges:** *Nemotron proposes, code computes, humans decide.* The model classifies; a deterministic fee schedule sets dollar amounts; an admin must approve every status.

---

## 2. Tech Stack (decided, no alternatives)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **React + Vite (JavaScript)**, **Tailwind CSS** (latest, via `@tailwindcss/vite`), **react-router-dom** | Mobile-first for students, desktop layout for admin |
| UI | `lucide-react` icons, `recharts` charts, `qrcode.react` (`import { QRCodeSVG } from 'qrcode.react'`) | |
| Database | **Supabase Postgres** | Rules enforced with **RLS policies + triggers + RPC functions** (Section 4) |
| Auth | **Supabase Auth** (email + password) + **demo 2FA screen** (code `123456`) | Real accounts and real RLS; the 2FA step is a UI gate for the demo |
| Media | **Supabase Storage**, private bucket `inspection-media` | **No update/delete policies → uploaded files are immutable** |
| AI | **NVIDIA Nemotron** via NVIDIA's OpenAI-compatible API (`https://integrate.api.nvidia.com/v1/chat/completions`) | Called **only** from Supabase Edge Functions; the API key never reaches the browser |
| Server code | **Supabase Edge Functions** (Deno/TypeScript): `photo-check`, `ai-review` | No Python server, no second deploy |
| Hosting | **Vercel** | SPA rewrite so `/inspect/...` QR links don't 404 |

**No Python backend.** Every rule that matters lives in Postgres, so it holds even if someone opens devtools and calls Supabase directly.

### Choosing the Nemotron models (do this at hour 0)
Model IDs change often, so they are **environment variables**, not hard-coded:
- `NEMOTRON_VLM_MODEL`: on build.nvidia.com, filter by **Vision Language Model** and pick the newest **Nemotron VL** model (vision + text input).
- `NEMOTRON_TEXT_MODEL`: the newest Nemotron text/reasoning model.
- **Ask the NVIDIA mentors which models count for the challenge** and whether they're giving out API credits. Test both prompts (Section 8) in the build.nvidia.com playground before writing code.

---

## 3. Roles & Rules

Every rule below is enforced **in the database** (Section 4). The UI only hides buttons using the same rules (`src/lib/rules.js`).

### 🎓 Student (`role = 'student'`)
- Logs in with university email + password + 6-digit 2FA code.
- Sees **only units where `units.assigned_student_email` = their login email**.
- Can add, replace, or remove media and notes:
  - Move-in fields **only while** `inspection_phase = 'MOVE_IN_OPEN'`
  - Move-out fields **only while** `inspection_phase = 'MOVE_OUT_OPEN'`
- Locks a phase with **Lock & Submit** (`lock_inspection()` RPC). This requires every item to have media.
- After move-out is submitted (`COMPLETED`), can **dispute a billable item once**, with a written reason.
- Can view and print their own unit's report.
- **Cannot:** edit anything after locking, set timestamps, change statuses or fines, see other units, read AI admin reviews, or overwrite or delete uploaded files.

### 🏢 Housing Admin (`role = 'admin'`)
- Logs in the same way (admin accounts are promoted by SQL; nobody can sign up as admin).
- Sees all units, items, AI reviews, and the audit log.
- Creates units (checklist items are **auto-created** from the template), generates QR flyers, and opens move-out (`open_move_out()` RPC).
- Sets `condition_status`, `estimated_fine`, and `admin_comments` **after move-out is submitted**; resolves disputes.
- Runs the Nemotron review.
- **Cannot:** touch any student evidence column (media, notes, hashes, timestamps), edit a student's dispute reason, move a phase backwards, or reassign a unit after move-in is locked.

### Phase lifecycle (single source of truth: `units.inspection_phase`)
```
MOVE_IN_OPEN ──(student: lock_inspection)──▶ MOVE_IN_LOCKED ──(admin: open_move_out)──▶ MOVE_OUT_OPEN ──(student: lock_inspection)──▶ COMPLETED
```
Lock times (`move_in_locked_at`, `move_out_locked_at`) and capture times (`*_captured_at`) are always set by **server `now()`**, never by the client.

---

## 4. Database (copy-paste into the Supabase SQL Editor, in order)

> Run `001` → `002` → create demo users (Section 4.4) → `003`. Save these files in `supabase/migrations/` too.

### 4.1 `001_schema.sql` — tables, triggers, RPCs

```sql
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
```

### 4.2 `002_policies.sql` — Row-Level Security + Storage

```sql
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
```

### 4.3 What the database guarantees (use these as test cases)
Run these from the browser console while signed in as the named user. Each one **must fail**:

| # | As | Attempt | Expected error |
|---|---|---|---|
| T1 | Alex (FH-304B, COMPLETED) | `update inspection_items set before_notes='edited'` | `Move-in inspection is locked` |
| T2 | Admin | Change any `before_media_path` | `Only the assigned student can edit move-in evidence` |
| T3 | Jordan (FH-210A) | Read FH-304B items | Returns **0 rows** (RLS) |
| T4 | Alex | Set `condition_status='NO_CHANGE'` | `Only housing admins can change assessments` |
| T5 | Alex | Set `before_captured_at` to last year | Silently ignored (server value kept) |
| T6 | Any user | Upload to a path that already exists | Storage error (no update policy) |
| T7 | Admin | `update units set inspection_phase='MOVE_IN_OPEN'` on a locked unit | `Phases change only through…` |

**T1 is a live demo moment** (Section 11).

### 4.4 Demo accounts (Supabase Dashboard)
1. **Authentication → Sign In / Providers:** turn **off** "Allow new users to sign up". Students don't self-register in the demo; this also stops anyone claiming a student's email.
2. **Authentication → Users → Add user → Create new user**, tick **Auto Confirm**. Use the same password for all, stored as `VITE_DEMO_PASSWORD`:

| Email | Role | Unit |
|---|---|---|
| `housing.admin@university.edu` | admin | all |
| `alex.rivera@university.edu` | student | FH-304B (completed, has a dispute) |
| `jordan.lee@university.edu` | student | FH-210A (live move-in demo) |
| `sam.patel@university.edu` | student | BB-112 (live move-out demo) |
| `priya.nair@university.edu` | student | BB-118 (completed) |

3. Then in the SQL editor:
```sql
update profiles set role = 'admin', full_name = 'Housing Admin' where email = 'housing.admin@university.edu';
update profiles set full_name = 'Alex Rivera'  where email = 'alex.rivera@university.edu';
update profiles set full_name = 'Jordan Lee'   where email = 'jordan.lee@university.edu';
update profiles set full_name = 'Sam Patel'    where email = 'sam.patel@university.edu';
update profiles set full_name = 'Priya Nair'   where email = 'priya.nair@university.edu';
```

### 4.5 `003_seed.sql` — sample data

**Seed images:** put 6 photos in `public/seed/`: `door.jpg`, `desk.jpg` (visible scratch), `desk-water-ring.jpg`, `blinds.jpg`, `blinds-broken.jpg`, `sink.jpg` (hairline crack). **Best option: photograph a real room at the venue or hotel.** Real damage gives Nemotron something real to find. Don't hot-link external image URLs; they can break or be blocked on venue Wi‑Fi.

**Compress the seed photos before committing them:** each must be **under 250 KB** and **at most 1200 px wide** (JPEG quality ≈ 80; lower it if a file is still over 250 KB). `ai-review` base64-encodes two photos per item inside an Edge Function, and small files keep it far from memory and payload limits. Use [Squoosh](https://squoosh.app) in the browser, or ImageMagick: `magick mogrify -resize '1200x>' -quality 80 public/seed/*.jpg`. Compress **before** running `hash-seed.mjs` so the fingerprints match the final files. Check sizes with `ls -lh public/seed`.

After the seed photos exist, generate the SHA-256 fingerprints and paste the output into the SQL editor. The example seed rows below intentionally omit the `*_sha256` values so that the integrity badge step can populate them explicitly.

```sql
insert into checklist_template (step_order, zone_category, item_name, instruction_text, standard_charge) values
 (1, 'Entryway',    'Main Door & Deadbolt Lock',      'Capture both sides of the entry door, frame, and deadbolt latch.', 150),
 (2, 'Living Area', 'Study Desk Surface',             'Stand 3 feet back and capture the entire top wood grain surface under bright room lighting.', 85),
 (3, 'Living Area', 'Window Blinds & Slats',          'Lower blinds completely and take a straight-on photo showing all horizontal slats.', 45),
 (4, 'Bathroom',    'Porcelain Sink & Vanity Mirror', 'Take a close-up photo of the sink basin drain and full vanity mirror.', 120);

-- Inserting units auto-creates their 4 checklist items (trigger)
insert into units (unit_code, building_name, room_number, semester, assigned_student_name, assigned_student_email,
                   inspection_phase, move_in_locked_at, move_out_locked_at) values
 ('FH-304B', 'Founders Hall',   '304-B', 'Fall 2026', 'Alex Rivera', 'alex.rivera@university.edu', 'COMPLETED',     '2026-08-18 10:25-05', '2026-11-07 09:40-06'),
 ('FH-210A', 'Founders Hall',   '210-A', 'Fall 2026', 'Jordan Lee',  'jordan.lee@university.edu',  'MOVE_IN_OPEN',  null, null),
 ('BB-112',  'Bluebonnet Hall', '112',   'Fall 2026', 'Sam Patel',   'sam.patel@university.edu',   'MOVE_OUT_OPEN', '2026-08-19 14:05-05', null),
 ('BB-118',  'Bluebonnet Hall', '118',   'Fall 2026', 'Priya Nair',  'priya.nair@university.edu',  'COMPLETED',     '2026-08-19 15:20-05', '2026-11-06 16:45-06');

update inspection_items i set
  before_media_path  = v.bp,  before_media_type = case when v.bp is null then null else 'image' end,
  before_notes       = v.bn,  before_captured_at = v.bt::timestamptz,
  after_media_path   = v.ap,  after_media_type  = case when v.ap is null then null else 'image' end,
  after_notes        = v.an,  after_captured_at  = v.at::timestamptz,
  condition_status   = v.st,  estimated_fine = v.fine::numeric, admin_comments = v.ac,
  dispute_reason     = v.dr,  disputed_at = v.dt::timestamptz
from units u, (values
 -- FH-304B: the four headline scenarios
 ('FH-304B', 1, '/seed/door.jpg',   'Paint clean, lock works smoothly.', '2026-08-18 10:11-05',
                '/seed/door.jpg',   'Clean, keys returned.',             '2026-11-07 09:28-06',
                'NO_CHANGE', 0, null, null, null),
 ('FH-304B', 2, '/seed/desk.jpg',   'Deep 4-inch scratch on front-left corner already here when I picked up keys.', '2026-08-18 10:14-05',
                '/seed/desk.jpg',   'Exact same scratch from move-in. No new marks.', '2026-11-07 09:30-06',
                'PRE_EXISTING_DAMAGE', 0, 'Scratch documented at move-in. $85 refinishing charge waived.', null, null),
 ('FH-304B', 3, '/seed/blinds.jpg', 'All slats intact and string mechanism works.', '2026-08-18 10:16-05',
                '/seed/blinds-broken.jpg', 'Bottom two slats snapped accidentally while moving boxes.', '2026-11-07 09:33-06',
                'NEW_DAMAGE_BILLABLE', 45, 'Two slats broken; student acknowledged in notes.', null, null),
 ('FH-304B', 4, '/seed/sink.jpg',   'Hairline crack near drain present at move-in.', '2026-08-18 10:19-05',
                '/seed/sink.jpg',   'Same hairline crack near the drain. Nothing new.', '2026-11-07 09:36-06',
                'DISPUTE_UNDER_REVIEW', 120, null,
                'The crack was documented at move-in on Aug 18 at 10:19 AM. Please compare the photos.', '2026-11-07 12:02-06'),
 -- BB-112: move-in locked, move-out OPEN (judges do the move-out live)
 ('BB-112', 1, '/seed/door.jpg',   'Door and lock fine.',            '2026-08-19 13:58-05', null, null, null, 'UNREVIEWED', 0, null, null, null),
 ('BB-112', 2, '/seed/desk.jpg',   'Scratch on front-left corner.',  '2026-08-19 14:00-05', null, null, null, 'UNREVIEWED', 0, null, null, null),
 ('BB-112', 3, '/seed/blinds.jpg', 'All slats fine.',                '2026-08-19 14:02-05', null, null, null, 'UNREVIEWED', 0, null, null, null),
 ('BB-112', 4, '/seed/sink.jpg',   'Small crack near drain.',        '2026-08-19 14:03-05', null, null, null, 'UNREVIEWED', 0, null, null, null),
 -- BB-118: second completed unit so the per-building chart has two bars
 ('BB-118', 1, '/seed/door.jpg',   'Looks good.',                    '2026-08-19 15:10-05', '/seed/door.jpg', 'Returned keys.', '2026-11-06 16:30-06', 'NO_CHANGE', 0, null, null, null),
 ('BB-118', 2, '/seed/desk.jpg',   'Scratch on corner.',             '2026-08-19 15:12-05', '/seed/desk-water-ring.jpg', 'Cleaned the desk, light mark left.', '2026-11-06 16:33-06', 'NEW_DAMAGE_BILLABLE', 85, 'New water ring in center of desk.', null, null),
 ('BB-118', 3, '/seed/blinds.jpg', 'All fine.',                      '2026-08-19 15:14-05', '/seed/blinds.jpg', 'All fine.', '2026-11-06 16:36-06', 'NO_CHANGE', 0, null, null, null),
 ('BB-118', 4, '/seed/sink.jpg',   'Small crack near drain.',        '2026-08-19 15:16-05', '/seed/sink.jpg', 'Same crack.', '2026-11-06 16:39-06', 'PRE_EXISTING_DAMAGE', 0, 'Documented at move-in. $120 waived.', null, null)
) as v(code, step, bp, bn, bt, ap, an, at, st, fine, ac, dr, dt)
where u.id = i.unit_id and u.unit_code = v.code and i.step_order = v.step;
```

**Seed fingerprints (optional, recommended):** run `node scripts/hash-seed.mjs` and paste its output into the SQL editor so seed images also show the ✓ integrity badge:
```js
// scripts/hash-seed.mjs
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
for (const f of readdirSync('public/seed')) {
  const h = createHash('sha256').update(readFileSync(`public/seed/${f}`)).digest('hex');
  console.log(`update inspection_items set before_sha256='${h}' where before_media_path='/seed/${f}';`);
  console.log(`update inspection_items set after_sha256='${h}'  where after_media_path='/seed/${f}';`);
}
```

---

## 5. Project Structure & Environment

```
Walkthru-HackUTD/
├─ public/seed/*.jpg
├─ src/
│  ├─ main.jsx, App.jsx                  # routes
│  ├─ lib/
│  │  ├─ supabaseClient.js               # null when env vars missing → mock mode
│  │  ├─ dbService.js                    # THE contract (Section 6). Picks supabase or mock.
│  │  ├─ mockDb.js, mockData.js          # localStorage-backed copy of the seed + sample AI results
│  │  ├─ rules.js                        # canEditEvidence / canAssess / canDispute (UI mirror of SQL rules)
│  │  ├─ hash.js, image.js, format.js    # sha256, resize/compress, dates & money
│  ├─ auth/      AuthProvider, LoginPage, TwoFactorModal, RequireRole, DemoSwitcher
│  ├─ student/   InspectPage, StepCard, MediaCapture, PhotoCoach, StudentSummary, DisputeDialog
│  ├─ admin/     AdminDashboard, KpiCards, Charts, ItemsTable, ComparatorModal, CompareSlider,
│  │             AiReviewPanel, IntegrityBadge, QrGenerator, DoorFlyer
│  └─ report/    ReportPage
├─ supabase/
│  ├─ migrations/001_schema.sql, 002_policies.sql, 003_seed.sql
│  └─ functions/_shared/{nemotron.ts,cors.ts}, photo-check/index.ts, ai-review/index.ts
├─ scripts/
│  └─ hash-seed.mjs
├─ vercel.json      # { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
└─ .env.example
```

**Frontend env (`.env.local` + Vercel project settings):**
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=          # the public "anon"/"publishable" key, never the service role key
VITE_PUBLIC_SITE_URL=https://walkthru.vercel.app   # QR codes encode THIS, not window.location
VITE_DEMO_PASSWORD=              # demo accounts only
```
**Edge Function secrets** (`supabase secrets set ...` or Dashboard → Edge Functions → Secrets):
```
NVIDIA_API_KEY=nvapi-...
NEMOTRON_VLM_MODEL=nvidia/<nemotron-vl-model-id>
NEMOTRON_TEXT_MODEL=nvidia/<nemotron-text-model-id>
PUBLIC_SITE_URL=https://walkthru.vercel.app       # so functions can fetch /seed/ images
```
(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge Functions automatically.)

⚠️ **Never** put the NVIDIA key or service role key in a `VITE_` variable; Vite bundles those into the public JS.

⚠️ **Phones must use HTTPS** (the Vercel URL). `crypto.subtle` (hashing) doesn't work over plain `http://192.168.x.x`.

**Deploying the Edge Functions (P1, no Docker needed):**
- **Easiest: deploy in the browser.** Supabase Dashboard → **Edge Functions → Deploy a new function → Via Editor**. Name it exactly `photo-check` (then repeat for `ai-review`), paste the code from `supabase/functions/<name>/`, and click Deploy. No local Docker or Supabase CLI needed. The repo stays the source of truth, so re-paste after every change.
  - The editor deploys each function on its own, so `../_shared/` imports won't resolve. Add `nemotron.ts` and `cors.ts` as files inside each function (or paste them at the top of `index.ts`) and import them as `./nemotron.ts` and `./cors.ts`.
  - Then turn **off** JWT verification in each function's settings (the toggle may read "Verify JWT with legacy secret"). This matches the CLI flag below.
- **If you deploy with the CLI instead:**
  ```bash
  npx supabase login
  npx supabase functions deploy photo-check --no-verify-jwt --project-ref <project-ref>
  npx supabase functions deploy ai-review --no-verify-jwt --project-ref <project-ref>
  ```
  `--no-verify-jwt` stops the gateway from rejecting a browser request before it reaches the function's own auth check (Section 8.1). That covers the CORS preflight (`OPTIONS`), which carries no `Authorization` header, and tokens from Supabase's newer API keys and JWT signing keys, which the gateway's built-in JWT check may not accept. It's safe only because every function verifies the caller itself.

---

## 6. `dbService.js` — The Shared Contract

Everyone codes against these signatures from hour 1. If `VITE_SUPABASE_URL` is missing, the same functions run on `mockDb.js` (localStorage, seeded from `mockData.js`, with **the same rules** from `rules.js`, so the UI behaves identically). Every function returns data or throws an `Error` with a human-readable message (show it in a toast).

| Function | Who | Does |
|---|---|---|
| `getSession()` / `signIn(email, pw)` / `signOut()` | all | Supabase Auth; `getProfile()` returns `{ id, full_name, email, role }` |
| `getMyUnits()` | all | Units visible to caller (RLS does the filtering) |
| `getUnitByCode(code)` | all | One unit or `null` (null = "not your room") |
| `getInspectionItems(unitId)` | all | Items ordered by `step_order` |
| `getDashboardRows(filters)` | admin | `item_dashboard` view rows; filters: building, unitCode, zone, status |
| `uploadStudentMedia({ item, phase, file, notes })` | student | resize → hash → upload → update row → return updated item (see below) |
| `removeStudentMedia(itemId, phase)` | student | Sets path/type/hash to null (only while open) |
| `updateNotes(itemId, phase, notes)` | student | |
| `lockInspection(unitId)` | student | `rpc('lock_inspection')` |
| `openMoveOut(unitId)` | admin | `rpc('open_move_out')` |
| `updateAdminAssessment(itemId, { status, fine, comments })` | admin | |
| `submitDispute(itemId, reason)` | student | Sets status `DISPUTE_UNDER_REVIEW` + reason |
| `createUnit({ buildingName, roomNumber, semester, studentName, studentEmail })` | admin | Generates `unit_code` (building initials + room, e.g. `FH-304B`); items auto-created |
| `getMediaUrl(path)` | all | `/seed/...` → as is; else `createSignedUrl(path, 3600)` |
| `verifyMedia(path, sha256)` | all | Download → re-hash → `true/false` (Integrity badge) |
| `runPhotoCheck(itemId, phase)` | student | `functions.invoke('photo-check')` |
| `runAiReview(unitId)` | admin | `functions.invoke('ai-review')` |
| `getAiReviews(itemIds)`, `getLatestUnitReport(unitId)` | admin (+ student photo checks) | Latest result per item/kind |

**Upload sequence** (`uploadStudentMedia`):
1. Images: resize on a canvas to **max 1280 px** (longest side) at **JPEG quality 0.80**, about 150–250 KB per photo. Uploads stay fast on venue Wi-Fi and base64 payloads stay small for Nemotron. Videos: reject over **50 MB** or **30 s** with a friendly message.
   ```js
   // src/lib/image.js
   export async function compressImage(file, maxSide = 1280, quality = 0.8) {
     const img = new Image();
     img.src = URL.createObjectURL(file);
     await img.decode();                       // modern browsers apply the photo's rotation here
     const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
     const canvas = document.createElement('canvas');
     canvas.width = Math.round(img.naturalWidth * scale);
     canvas.height = Math.round(img.naturalHeight * scale);
     canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
     URL.revokeObjectURL(img.src);
     return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
   }
   ```
2. `sha256 = await sha256Hex(fileOrBlob)`:
   ```js
   export async function sha256Hex(blob) {
     const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
     return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
   }
   ```
3. Upload to `inspection-media/{unit_id}/{item_id}/{phase}-{Date.now()}.{ext}` with `upsert: false`.
4. `update inspection_items set {phase}_media_path, _media_type, _sha256, _notes`. The DB stamps `_captured_at`.
5. Fire-and-forget `runPhotoCheck(item.id, phase)` (images only); the UI shows the coach result when it arrives.

---

## 7. Incremental Build Plan

> **Rule:** finish and click-test each increment on mock data before layering the next. Each increment lists its **Done when** check.

### Increment 0 — Scaffold (hour 0–1)
Vite + React + Tailwind + router + `vercel.json`; deploy the empty app to Vercel immediately; create the Supabase project; create the NVIDIA API key.
**Done when:** the Vercel URL loads on a phone.

### Increment 1 — Data layer
`001`/`002`/`003` SQL run; demo users created; `dbService.js` + `mockDb.js` + `mockData.js` + `rules.js`.
**Done when:** a scratch page lists FH-304B's 4 items in **both** mock mode and Supabase mode, and tests T1–T7 from Section 4.3 fail as expected.

### Increment 2 — Auth, 2FA gate, routing, demo switcher
- `/login`: email + password → `signIn` → **TwoFactorModal** (6 boxes, auto-advance, paste support). Accepts `123456`; show a small "Demo code: 123456" hint. Store `mfaVerified` in `sessionStorage`.
- `RequireRole` guard needs session **and** `mfaVerified` **and** the right role.
- Routes: `/inspect/:unitCode` (student; QR target) · `/my-unit` (redirects to the student's unit) · `/admin` · `/admin/qr` · `/report/:unitCode`.
- Not logged in on `/inspect/FH-210A` → `/login?next=/inspect/FH-210A` → back after 2FA.
- Admin landing on `/inspect/...` → opens that unit in the admin comparator. Student on someone else's code → friendly "This room isn't assigned to you" screen.
- **DemoSwitcher** (top-right pill): Admin · Alex (completed) · Jordan (move-in) · Sam (move-out). One click = sign out → sign in with `VITE_DEMO_PASSWORD` → auto-pass 2FA → navigate.
**Done when:** each switcher option lands on the right screen and a student cannot reach `/admin`.

### Increment 3 — Student guided inspection (mobile-first)
- Header: building, room, phase badge, progress bar "Step 2 of 4".
- One **StepCard** per screen (swipe or Next/Back): zone badge, item name, framing instruction.
- **Move-out:** show the locked move-in photo + its timestamp + the student's move-in note above the capture button as a framing reference ("Match this angle").
- **MediaCapture:** wraps **`CameraCapture`** (`src/student/CameraCapture.jsx`): a live in-page camera via `getUserMedia` + `MediaRecorder`. **No `<input type="file">` anywhere**, so students cannot upload from the camera roll. Photos are stamped with room/item/time. Then preview, notes textarea, **Retake** / **Remove** (only when `rules.canEditEvidence`). Pass the returned `blob` to `uploadStudentMedia` as `file`.
- **PhotoCoach** chip under the preview: "Nemotron is checking your photo…" → ✅ "Looks good" or ⚠️ the retake tip. **Advisory only, never blocks.**
- **Lock & Submit Official Inspection** → confirm dialog ("You can't change anything after this") → `lockInspection` → read-only summary showing server lock time.
- **StudentSummary** (locked/completed): all items with before/after, statuses, fines, total due, and **Dispute this charge** on billable items (Increment 6).
**Done when:** Jordan completes FH-210A move-in on a real phone, and the T1-style edit fails afterwards.

### Increment 4 — Admin dashboard
- **KPI cards:** Units inspected (move-in locked or later) · **$ saved by students** (sum `waived_amount`) · Active disputes · Confirmed billable (sum `billable_amount`).
- **Charts (Recharts):** Bar: waived $ vs billable $ per building. Donut: item status breakdown.
- **Table:** filters (building, unit, zone, status) · columns: student, unit, item, before time, after time, status badge, fine, **AI suggestion badge**, **Inspect side-by-side**.
- **Unit actions:** "Open move-out" (MOVE_IN_LOCKED units) · "Run Nemotron Review" (COMPLETED units) · "View report".
- **ComparatorModal:** left = move-in media + timestamp + notes; right = move-out. Toggle between **side-by-side** and **slider** (draggable divider, images only). **IntegrityBadge** on each side. **AiReviewPanel** (findings, suggested status, confidence, rationale, "Apply suggestion"). Resolution buttons:
  - **Waive (pre-existing proof)** → `PRE_EXISTING_DAMAGE`, fine 0
  - **Approve billable fine** → `NEW_DAMAGE_BILLABLE`, fine prefilled from the fee schedule (editable)
  - **Mark no change** → `NO_CHANGE`, fine 0
  - Comment is required when resolving a dispute.
**Done when:** the admin can resolve FH-304B's sink dispute and the KPIs and charts update.

### Increment 5 — Admin-only QR generator & door flyer
- `/admin/qr`: pick an existing unit or create one (form → `createUnit`).
- `QRCodeSVG value={`${VITE_PUBLIC_SITE_URL}/inspect/${unitCode}`}`, with error correction level `M` and size ≥ 256.
- **Print Door Check-In Flyer**: `@media print` page with the university housing header, room, big QR code, and 3 steps: *1. Scan · 2. Photograph each item as guided · 3. Lock & submit before you unpack.*
**Done when:** a printed or on-screen QR, scanned with a phone, opens the right room on the Vercel URL.

### Increment 6 — Stretch features (in this order)
1. **Integrity badges (SHA-256):** `IntegrityBadge` calls `verifyMedia` → "✓ Fingerprint matches upload at 10:14 AM" / "✗ Mismatch" / "— Not fingerprinted". Show the first 8 hex characters with a tooltip for the full hash.
2. **Student dispute flow:** `DisputeDialog` (reason, min 10 chars, shows move-in evidence as context) → `submitDispute`. The student summary shows "Under review" → "Resolved: waived / upheld" with the admin's comment.
3. **Nemotron agent** (Section 8): `photo-check` first (biggest demo impact), then `ai-review`.
4. **PDF report:** `/report/:unitCode`, a print-optimized page with **Download PDF** = `window.print()`. Contents: unit header, each item with before/after thumbnails, server timestamps, short hashes, status, fine, admin comment, AI notes labelled "AI-assisted · admin-approved", totals, lock times. Available to the student (own unit) and admin.

---

## 8. Nemotron Inspection Agent (Edge Functions)

### 8.1 Shared helper — `supabase/functions/_shared/nemotron.ts`
> Deploying from the Dashboard editor? Copy this file and `cors.ts` into each function (Section 5).

```ts
const NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

// Every call gets its own AbortController timeout (default 20 s), so one slow
// model response can't hang a whole function run.
export async function nemotron(
  model: string,
  messages: unknown[],
  { maxTokens = 900, timeoutMs = 20_000 }: { maxTokens?: number; timeoutMs?: number } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(NIM_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('NVIDIA_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: maxTokens }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Nemotron ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices[0].message.content as string;
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`Nemotron timed out after ${timeoutMs / 1000} s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Models sometimes wrap JSON in ```json fences or add reasoning text. Extract the first {...} block.
export function parseJson<T>(text: string): T {
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('Model did not return JSON');
  return JSON.parse(text.slice(start, end + 1));
}

export const imagePart = (b64: string, mime = 'image/jpeg') =>
  ({ type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } });
```
- Load images with the **service-role** client: `storage.from('inspection-media').download(path)`. Load `/seed/...` paths with `fetch(PUBLIC_SITE_URL + path)`. Base64-encode with `encodeBase64` from `jsr:@std/encoding/base64`.
- If the chosen VL model rejects `image_url` parts or multiple images, check its build.nvidia.com page for the expected format and adjust **only** this helper.
- **CORS:** the browser calls these functions directly. Answer `OPTIONS` first, and send `corsHeaders` on **every** response, errors included. A 401 or 500 without them shows up in the browser as a misleading "CORS error".
  ```ts
  // _shared/cors.ts
  export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  export const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  ```
- **Authorize the caller first.** JWT verification is off at the gateway (Section 5), so this check is the only gate. Return `401` before any Nemotron call if the `Authorization` header is missing or doesn't belong to a signed-in user:
  ```ts
  // index.ts (same opening for both functions)
  import { createClient } from 'jsr:@supabase/supabase-js@2';
  import { corsHeaders, json } from '../_shared/cors.ts';   // './cors.ts' in the Dashboard editor

  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Not signed in' }, 401);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) return json({ error: 'Not signed in' }, 401);
    // ...function-specific work, wrapped in try/catch → return json({ error: String(err) }, 500)
    return json({ ok: true });
  });
  ```
  Then `photo-check` reads the item with `userClient` (RLS proves ownership) and `ai-review` calls `userClient.rpc('is_admin')`. Write results with the **service-role** client.
- **Videos:** skip AI ("AI review available for photos") and keep the human flow.

### 8.2 `photo-check` — Capture Coach
Input `{ itemId, phase }`. Images: the new photo, plus (move-out only) the move-in photo as reference.
```
System: You check photos for a university housing inspection. Reply with JSON only.
User:   [image 1: new photo] [image 2: move-in reference, move-out only]
        Checklist item: "{item_name}". Framing instruction: "{instruction_text}".
        {move-out: "Image 2 is the move-in photo of the same item; judge whether image 1 uses a similar angle."}
        Return exactly:
        {"shows_item": bool, "framing_ok": bool, "lighting_ok": bool, "sharp": bool,
         "matches_reference_angle": bool | null, "retake_tip": "one short sentence, empty if the photo is fine"}
```
Insert into `ai_reviews` (`kind = PHOTO_CHECK_BEFORE|AFTER`), then return the result.

### 8.3 `ai-review` — Damage Diff → Fees → Memo (the agent pipeline)
Input `{ unitId }`; the unit must be `COMPLETED`; admin only. Steps:

**Step A: Damage Diff (VL, one call per item with two images, run in parallel)**
```
System: You are a careful housing damage inspector. Compare only the named item. Ignore differences in lighting,
        camera angle, clutter, and image quality. Reply with JSON only.
User:   [image 1: MOVE-IN, captured {before_captured_at}] [image 2: MOVE-OUT, captured {after_captured_at}]
        Item: "{item_name}". Student move-in note: "{before_notes}". Student move-out note: "{after_notes}".
        Return exactly:
        {"change_detected": bool,
         "findings": [{"description": str, "location": str, "present_at_move_in": bool,
                       "severity": "minor" | "moderate" | "severe"}],
         "suggested_status": "NO_CHANGE" | "PRE_EXISTING_DAMAGE" | "NEW_DAMAGE_BILLABLE" | "NEEDS_HUMAN_REVIEW",
         "confidence": number between 0 and 1,
         "rationale": "max 2 sentences; cite the move-in photo/note and timestamp when relevant"}
```
Run the per-item calls **in parallel** with `Promise.allSettled`, not one after another. Each call has its own 20-second `AbortController` timeout (built into `nemotron()`, Section 8.1), so one slow response can't push the function past its wall-clock limit or crash the whole unit review:
```ts
const pairs = items.filter((i) => i.before_media_type === 'image' && i.after_media_type === 'image');
// diffItem(item): load both images → nemotron(VLM, prompt above) → parseJson
const settled = await Promise.allSettled(pairs.map(diffItem));
const diffs = settled.map((r, n) => r.status === 'fulfilled'
  ? { item_id: pairs[n].id, ...r.value }
  : { item_id: pairs[n].id, suggested_status: 'NEEDS_HUMAN_REVIEW', error: String(r.reason) });
```
- If NVIDIA's API answers `429` (rate limit), run **2 batches of 2** instead:
  ```ts
  const settled: PromiseSettledResult<Record<string, unknown>>[] = [];
  for (let n = 0; n < pairs.length; n += 2) {
    settled.push(...(await Promise.allSettled(pairs.slice(n, n + 2).map(diffItem))));
  }
  ```
- A failed or timed-out item never fails the run. It's saved as `NEEDS_HUMAN_REVIEW` with its error (UI: "AI couldn't review this item — review it manually"), and Steps B and C continue with the rest.
- Worst case is about 20 s for Step A (40 s in batches) plus 20 s for Step C, well inside the Edge Function wall-clock limit.

**Step B: Fees (plain code, no AI):** `NEW_DAMAGE_BILLABLE` → `suggested_fine = standard_charge × {minor: 0.5, moderate: 1, severe: 1.5}` (worst finding); anything else → 0. `waived_if_pre_existing = standard_charge`. If `confidence < 0.6`, force `NEEDS_HUMAN_REVIEW`. Store `{...diff, suggested_fine}` in `ai_reviews` (`kind = DAMAGE_DIFF`).

**Step C: Memo + Dispute Briefs (text model, one call)**: send the unit, the items (status, notes, timestamps, dispute reasons) and the Step A/B results as JSON:
```
System: You write concise, neutral housing inspection summaries. Never invent evidence. Reply with JSON only.
User:   {unit + items + ai results JSON}
        Return exactly:
        {"admin_summary": ["3 bullets max"],
         "student_note": "plain-language explanation of each charge or waiver, 4 sentences max",
         "dispute_briefs": [{"item_id": str, "brief": "what the move-in and move-out evidence shows, with timestamps; end with a recommendation and say it is a recommendation"}]}
```
Insert into `ai_unit_reports`. Return everything to the UI. If this call fails or times out, skip the memo (UI: "Summary unavailable") and still return the Step A and B results.

**Never** let the function write `condition_status` or `estimated_fine`. The admin clicks "Apply suggestion" (which calls `updateAdminAssessment`).

**Upgrade if ahead of schedule:** turn Step A–C into a Nemotron **tool-calling** loop (tools: `list_items`, `compare_item`, `get_fee`, `record_finding`, `write_memo`) so the model decides which items need a closer look. Keep the fixed pipeline as the fallback.

### 8.4 Reliability rules
- Run `ai-review` on FH-304B and BB-118 **before judging**. Results persist in the DB, so the demo never waits on a cold API call.
- Mock mode returns canned results from `mockData.js` after an 800 ms delay.
- Any Nemotron error → UI shows "AI review unavailable — manual review still works". Never block the human flow.

---

## 9. Team Split (4 people, mostly React)

| Person | Owns | Hours 1–8 (mock data) | Hours 8–18 (live) |
|---|---|---|---|
| **P1 · Data & Edge** | Increments 0 (Supabase side), 1 | `mockData.js`, `mockDb.js`, `dbService.js`, `rules.js`; run SQL; demo users; seed photos + hashes | Supabase mode in `dbService`; tests T1–T7; Edge Functions `photo-check`, `ai-review` |
| **P2 · Student flow** | Increment 3, 6.1 hashing, 6.2 dispute UI | InspectPage, StepCard, MediaCapture, StudentSummary | PhotoCoach UI, DisputeDialog, phone testing |
| **P3 · Admin flow** | Increment 4, 6.4 report | KPIs, charts, table, ComparatorModal, CompareSlider | AiReviewPanel, IntegrityBadge, ReportPage |
| **P4 · Auth, QR, Nemotron prompts, Pitch** | Increments 0 (Vite/Vercel), 2, 5 | Scaffold, Vercel, login/2FA/guards/switcher, QR + flyer | Test Nemotron prompts in the build.nvidia.com playground with seed photos and hand the final prompts to P1; slides; demo script; backup video |

**Integration rule:** only P1 edits `dbService.js` signatures. Anyone needing a new function asks P1. Mock and Supabase must stay in sync.

## 10. Timeline & Checkpoints

| Hour | Milestone |
|---|---|
| 0–1 | Scaffold deployed, Supabase project live, NVIDIA key working in the playground, everyone has read Sections 1–6 |
| **6** | ✅ **Checkpoint 1:** full demo path works on **mock data** on one laptop |
| 6–12 | Switch to Supabase; RLS tests pass; real phones via Vercel URL |
| **12** | ✅ **Checkpoint 2:** end-to-end on **real DB** with **real phones** and a **printed QR** |
| 12–18 | Nemotron functions, integrity badges, disputes, report |
| **18** | 🧊 **Feature freeze.** Only bug fixes and polish after this |
| 18–22 | Polish, run AI review on seed units, reset demo data, **record a backup demo video** |
| 22–24 | Rehearse the pitch 3×; slides final |

**Demo reset script:** keep a `reset_demo.sql` (delete units → re-run seed) so FH-210A and BB-112 can be demoed fresh for each judge.

---

## 11. 3-Minute Demo Script

1. **(20 s) Problem.** "Students get billed for damage that was already there, and it's their word against the housing office's."
2. **(20 s) Admin** generates the FH-210A QR code. Print it or show it on a laptop.
3. **(40 s) A judge scans it with their own phone** (switch to Jordan) → 2FA → photographs the blinds. **Nemotron Capture Coach**: "Lower the blinds fully so all slats are visible" → retake → ✅ → Lock & Submit.
4. **(15 s) Tamper attempt live:** in the console, as Alex, try to edit a locked move-in note → **Postgres rejects it**. "Not even the admin can do this."
5. **(30 s) Move-out (Sam, BB-112):** the move-in reference photo guides the angle → lock.
6. **(30 s) Admin → "Run Nemotron Review"** on FH-304B: desk = pre-existing (cites the Aug 18 10:14 AM photo, **$85 waived**), blinds = new damage (**$45 from the fee schedule**). "Nemotron proposes, code computes, humans decide." Approve.
7. **(15 s) Dispute:** the sink dispute → Nemotron evidence brief → admin waives → ✓ integrity badges → **Download PDF**.
8. **(10 s) Close** on the "$ saved by students" KPI.

**Q&A answers to prepare:** How is 2FA real? (Production: Supabase TOTP MFA + an RLS check on `aal2`; the demo uses a fixed code.) Can students upload old gallery photos? (No: there is no file picker; evidence is captured from the live camera inside the page, and the DB stamps the time. Next step: short-lived per-capture upload tokens so the storage API can't be called directly.) What if the AI is wrong? (It never sets a status or a fine; low confidence becomes "needs human review".)

---

## 12. Prompts to Paste into Claude (after this file)

**Everyone, first message:**
> Read this build specification carefully. I am **P#** (Section 9). Don't build anything outside my row unless I ask. Code against the `dbService.js` contract in Section 6. If it doesn't exist yet, create a stub that returns `mockData.js` data with the exact same signatures. Build one increment at a time, and after each one tell me exactly how to click-test it.

- **P1:** "Start with Increment 1: `mockData.js` (the full seed from Section 4.5, plus sample AI results for FH-304B), `mockDb.js`, `rules.js`, and `dbService.js` with mock and Supabase modes. Then walk me through running the SQL files and tests T1–T7."
- **P2:** "Build Increment 3, mobile-first, against the mock dbService. Include the move-out reference photo, MediaCapture with resize and hashing, and the lock flow."
- **P3:** "Build Increment 4 against the mock dbService: KPI cards, the two Recharts charts, the filterable table, and the ComparatorModal with slider and resolution buttons."
- **P4:** "Build Increment 0 (Vite + Tailwind + router + vercel.json), then Increment 2 (login, 2FA modal, RequireRole, DemoSwitcher, `?next=` redirect), then Increment 5 (QR generator + print flyer using `VITE_PUBLIC_SITE_URL`)."

---

## 13. Changes from v1 (for the team)
- Committed to **supabase-js + RLS/triggers**; removed the Python option.
- Integrity is now **enforced by Postgres** (trigger + RPCs + immutable storage), not by `dbService.js`.
- Fixed `PENDING_MOVE_IN` (not a valid phase) → `MOVE_IN_OPEN`.
- Units keyed by `id` + `unit_code`; room numbers can now repeat across buildings and semesters. `TIMESTAMPTZ` everywhere.
- Added a `checklist_template` / fee schedule (`standard_charge`), so new units get items automatically and "$ waived" is computable.
- Added the student **dispute** flow, **SHA-256** integrity badges, **PDF report**, **audit log**, and the **Nemotron inspection agent**.
- Single phase source of truth (`inspection_phase`); dropped the per-item `*_locked` flags.
- Seed images are self-hosted; QR codes use `VITE_PUBLIC_SITE_URL`; Vercel SPA rewrite added.

---

## 14. Changes in v2.1 (reliability & deployment)
- **Edge Function deploys:** P1 can deploy `photo-check` and `ai-review` from the Supabase Dashboard editor (no Docker or CLI). CLI deploys use `--no-verify-jwt`; each function checks the caller itself and sends CORS headers on every response (Sections 5, 8.1).
- **Smaller images:** seed photos under 250 KB and at most 1200 px wide; student photos resized to 1280 px at JPEG quality 0.80 before upload (Sections 4.5, 6).
- **Parallel AI review:** `ai-review` runs the per-item Nemotron calls with `Promise.allSettled` (or 2 batches of 2), each with a 20 s timeout. A slow or failed item becomes `NEEDS_HUMAN_REVIEW` instead of failing the run (Sections 8.1, 8.3).
- **Postgres 15+ note** on `security_invoker` in `001_schema.sql` (Section 4.1).
