# Walkthrough (HackUTD)

Tamper-proof, timestamped move-in / move-out inspections for university housing, with an NVIDIA Nemotron inspection agent.
A zero-download **web app**: a QR code on the door opens a guided photo checklist on the student's phone.

Full design and build plan: [`walkthrough_master_build_specification.md`](walkthrough_master_build_specification.md).

## Run it (2 minutes, no accounts needed)

```bash
npm install
npm run dev
```

Open the URL it prints. With no `.env.local`, the app runs in **mock mode**: all data is seeded in your browser and every rule
(locking, roles, disputes) behaves exactly like the real database. Click a **Demo quick login** button, or use the switcher in the header.

| Demo user | What to try |
|---|---|
| **Admin** | dashboard, charts, side-by-side comparator, Run Nemotron Review, QR generator |
| **Alex** (FH-304B) | completed room with a dispute |
| **Jordan** (FH-210A) | live move-in: photograph each item, lock and submit |
| **Sam** (BB-112) | live move-out with the move-in photo shown as a reference |

Typed logins work too: any demo email with password `demo1234`, then the 2FA code `123456`.
In mock mode a **"use a sample photo"** button replaces the camera (real mode has no file picker, so students can't upload from the camera roll).

## Run it on real Supabase

1. In Supabase, run `supabase/migrations/001_schema.sql`, `002_policies.sql`, `003_seed.sql` (one query each, in order), create the 5 demo users in Authentication → Users (Auto Confirm), then run `004_demo_roles.sql` and `005_evidence_paths.sql`.
2. `cp .env.example .env.local` and fill in `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PUBLIC_SITE_URL`, `VITE_DEMO_PASSWORD`.
3. Check NVIDIA with one command: `node --no-warnings scripts/verify-nvidia.mjs` (needs `NVIDIA_API_KEY`), then deploy the Nemotron Edge Functions: see [`supabase/functions/README.md`](supabase/functions/README.md).
4. Optional: `node scripts/hash-seed.mjs` prints SQL that fingerprints the seed photos (green integrity badges). Re-run it if you replace a photo in `public/seed/`.

The seed photos in `public/seed/` are drawn placeholders. **Replace them with real photos of a room** (under 150 KB, 1024 px wide) so Nemotron has something real to look at.

## Deploy

Vercel: import the repo, add the four `VITE_` variables, deploy. `vercel.json` makes QR links like `/inspect/FH-210A` work. Phones need HTTPS (Vercel provides it).

## Where things are

```
src/lib/dbService.js     THE contract: every screen calls this, never Supabase directly
src/lib/mockDb.js        offline database with the same rules as the SQL triggers
src/lib/supabaseDb.js    live database (Supabase)
src/auth/                login, 2FA, role guard, demo switcher
src/student/             guided inspection wizard, summary, disputes, camera
src/admin/               dashboard, comparator, AiReviewPanel, QR generator
src/report/              printable inspection report
supabase/migrations/     SQL (tables, security rules, seed data)
supabase/functions/      Nemotron Edge Functions (photo-check, ai-review)
```
