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

1. In Supabase, run `supabase/migrations/001_schema.sql`, `002_policies.sql`, `003_seed.sql` (one query each, in order), create the 5 demo users in Authentication → Users (Auto Confirm), then run `004_demo_roles.sql`, `005_evidence_paths.sql`, `006_hardening.sql` and `008_server_fingerprints.sql`. Run `007_admin_mfa.sql` last, after the housing admin has set up two-factor on the site (see [`SECURITY.md`](SECURITY.md)).
2. `cp .env.example .env.local` and fill in `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_DEMO_PASSWORD`. Leave `VITE_PUBLIC_SITE_URL` empty unless you print QR codes from your laptop (then: your deployed link, never localhost).
3. Check NVIDIA with one command: `node --no-warnings scripts/verify-nvidia.mjs` (needs `NVIDIA_API_KEY`), then deploy the three Edge Functions (`register-evidence` is required: photo uploads go through it; the two Nemotron ones are the AI): see [`supabase/functions/README.md`](supabase/functions/README.md).
4. Optional: `node scripts/hash-seed.mjs` prints SQL that fingerprints the seed photos (green integrity badges). Re-run it if you replace a photo in `public/seed/`.

The seed photos in `public/seed/` are drawn placeholders. **Replace them with real photos of a room** (under 150 KB, 1024 px wide) so Nemotron has something real to look at.

## Deploy (this is what gives you a link that works on a phone)

1. vercel.com → **Add New → Project** → import this repo. Vercel detects Vite; keep its build settings.
2. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_DEMO_PASSWORD`. Leave `VITE_PUBLIC_SITE_URL` out: QR codes then use the deployed address automatically.
3. Deploy, then open the short **Production** link (Project → Domains, like `https://your-project.vercel.app`).
4. Tell the Edge Functions where the sample photos live: `npx supabase secrets set PUBLIC_SITE_URL=https://your-project.vercel.app --project-ref <ref>`.

If it won't open on a phone:
- `localhost` links only work on the laptop running `npm run dev`, and phones only open the camera on `https://` sites.
- A Vercel login page means you opened a per-deployment link: use the Production link above, or turn off Project → Settings → Deployment Protection.
- Scanned codes landing on someone else's site: an old `VITE_PUBLIC_SITE_URL` (for example `walkthru.vercel.app`, which is NOT this project). The QR page warns when codes point somewhere a phone can't reach.

`vercel.json` makes links like `/inspect/FH-210A` work.

## Tests

| Command | What it checks | Needs |
|---|---|---|
| `npm test` | Nemotron client (one retry, shared time limit, agent loop) and the prompt-injection and redirect guards | Node 22.18+ |
| `npm run test:e2e` | 74 browser checks under the production security headers: student wizard, admin dashboard, comparator, Nemotron panel, disputes, QR codes that scan (also printed), report, admin password, and live sign-in with a real authenticator flow (fake Supabase) | first time: `npx playwright install chromium` |
| `npm run test:functions` | the real `ai-review`, `photo-check` and `register-evidence` code under Deno against a fake Supabase + NVIDIA (51 checks) | Deno (fetched by npx if missing); port 8000 free |
| `npm run test:sql` | 102 attacks and must-work flows against every migration (backdating, tampering, privileges, admin MFA, server-computed fingerprints) | `psql` + a local Postgres (`SQL_TEST_URL`) |

No accounts or keys: every suite runs in mock mode or against local fakes.

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
supabase/functions/      Edge Functions: register-evidence (server fingerprints), Nemotron (photo-check, ai-review)
tests/                   unit, browser (Playwright), Edge Function and SQL tests
```
