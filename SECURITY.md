# Security audit (post-hackathon, Nov 2026)

Each fix has a test that fails on the old code. Run them: `npm test`, `npm run test:e2e`,
`npm run test:functions`, `npm run test:sql`.

## What was wrong, and what changed

| # | Severity | Problem | Fix |
|---|---|---|---|
| 1 | High | **Move-in evidence could be backdated.** A student could point a move-in photo at a file that did not exist yet, lock, then upload that "move-in" photo months later during move-out. | `006`: a row can only point at a file that already exists; `before-` files upload only during move-in, `after-` files only during move-out, only into that item's folder. |
| 2 | High | **2FA was fake.** The code was a constant checked in the browser, so the admin password alone was enough. | Real authenticator-app codes for the housing admin (`TwoFactorModal`, `supabaseDb.js`), enforced by the database (`007`: `is_admin()` needs an MFA session). Students sign in with a password; the fixed demo code exists only in demo mode. |
| 3 | Medium | **Student notes could steer the AI.** Notes and dispute text went into the Nemotron prompts as plain text. | Notes are quoted as data and capped; prompts say they are unverified claims; a note that reads like instructions sends the item to a human (in code, not by the model). |
| 4 | Medium | **Housing could take over a room's evidence** by reassigning the room to itself before the student locked. | `006`: a room cannot be reassigned once it has move-in evidence. |
| 5 | Medium | **API roles had every table privilege**, including `TRUNCATE` (which skips row security); signed-out visitors could call the functions. | `006`: only the privileges the app uses. |
| 6 | Low | Students could change an item's id, store megabytes of notes, swap a file's fingerprint, or upload SVG and other file types. | `006`: ids fixed, text capped, fingerprint required and set once, JPEG/MP4/WebM only, 60 files per item, photos under 5 MB. |
| 7 | Low | No security headers (the site could be framed; no Content-Security-Policy). | `vercel.json`: CSP, no framing, nosniff, referrer and permissions policies. |
| 8 | Low | A crafted `?next=` link broke login; error messages showed internal details to students; room emails with capitals never matched. | `safeNext()`; plain messages from `photo-check`; emails stored in lowercase. |
| 9 | Medium | **Fingerprints came from the student's browser.** The database checked that a fingerprint looked right, not that it matched the file. A student calling the API directly could register a wrong one, then point at the admin screen's "Mismatch: file changed since upload" as proof that housing altered the photo. | `008` + the `register-evidence` Edge Function: the server downloads the stored file and computes SHA-256 itself. Nobody using the API can write a file path, type or fingerprint any more (a student can still remove a photo and edit notes). See "How a photo is registered now". |
| 10 | Medium | **No limit on the calls that cost money or memory.** A signed-in user could call `register-evidence` (downloads up to 50 MB each time) or `ai-review` (spends NVIDIA credits) in a loop. | `010`: a rate limiter in the database. 30 registrations per 10 minutes per student, 20 reviews per hour per admin; over that the function answers 429 before doing any work. |
| 11 | Medium | **The audit log could be rewritten** by anything holding the service-role key, without a trace. | `010`: the log is append-only for every API role, and each entry carries the SHA-256 of the room's previous entry. The newest hash (the "record seal") and every photo's full fingerprint are printed on the inspection report, so a copy the student keeps pins the history housing holds. |
| 12 | Medium | **Every admin saw every building.** | `010`: `admin_scopes`. An admin listed there sees and acts on those buildings only, in the database, the storage bucket and `ai-review`. An admin with no rows there keeps full access. |
| 13 | Medium | **A deployed site with no database settings silently ran as the sample-data demo**: inspections would be saved nowhere. | A production build without `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` shows "not connected to its database" instead of the app. A deliberate demo sets `VITE_DEMO_MODE=true`. |
| 14 | Low | **Risky project settings were invisible** (open sign-ups, email confirmation off, a skipped migration, the demo password still set). | The admin dashboard checks them on every load and lists what is wrong, with the fix. |
| 15 | Low | **The dashboard loaded every item into the browser** and asked for AI results with every id in one URL, which fails at a few thousand items. | Totals and chart data are aggregated in the database; the table and the room cards load one page at a time, with filtering, search and sorting in the query (`010`). |
| 16 | Low | **Room codes collided** for buildings with the same initials (Founders Hall, Fairview Hall). | The next free code is used (`FAIH-304B`, `FH2-304B`). |
| 17 | Low | **Tests only ran when someone remembered**, and **Edge Functions pulled the newest library version at deploy time.** | A GitHub Action runs all four suites on every pull request; the functions import exact versions. |

## What you need to do

1. Run `supabase/migrations/006_hardening.sql` in the Supabase SQL Editor. It should print `hardening_installed = true`.
   Then upload one photo in a test room. If uploads fail, run `supabase/rollback/006_loosen_upload_checks.sql` and report the error.
2. Redeploy both Edge Functions (`photo-check`, `ai-review`).
3. Sign in as the housing admin on the deployed site and finish "Set up two-factor". **Then** run `007_admin_mfa.sql`.
4. Change the admin password, and remove `VITE_DEMO_PASSWORD` in Vercel when the public demo is over
   (it is readable in the site's code; change the demo users' passwords too).
5. Turn on server fingerprints (fix 9). Three steps, in this order. Photo uploads fail between steps 2 and 3
   (the old site writes the fingerprint itself, which the database now refuses), so do them back to back,
   when nobody is in the middle of an inspection.
   1. Deploy the new Edge Function. It does nothing until the site calls it:
      ```bash
      npx supabase functions deploy register-evidence --no-verify-jwt --project-ref <project-ref>
      ```
      It needs no new secrets. (`--no-verify-jwt` as for the other two: the function checks the caller itself.
      No CLI? Dashboard steps are in [`supabase/functions/README.md`](supabase/functions/README.md).)
   2. Run `supabase/migrations/008_server_fingerprints.sql` in the Supabase SQL Editor.
      It should print `server_fingerprints_installed = true`.
   3. Deploy the site from this version (merging to the branch Vercel builds does it).

   Then upload one photo in a test room: the wizard shows its fingerprint, and the admin comparator shows
   "Fingerprint matches upload". If the wizard says "Could not save the photo", open the function's log
   (Edge Functions → register-evidence → Logs); it names what is missing.

6. Install the scale and safety update (fixes 10 to 15). In this order; nothing breaks in between, because
   `010` only adds things and the functions work with or without it:
   1. Run `supabase/migrations/010_scale_and_safety.sql` in the SQL Editor. It should print `scale_and_safety_installed = true`.
   2. Redeploy the two functions that changed:
      ```bash
      npx supabase functions deploy register-evidence --no-verify-jwt --project-ref <project-ref>
      ```
      ```bash
      npx supabase functions deploy ai-review --no-verify-jwt --project-ref <project-ref>
      ```
   3. Deploy the site (merge to the branch Vercel builds).

   Then open the admin dashboard. If a red "setup problems" box appears at the top, do what it says: it reads
   the project's real settings.
7. In Supabase → Authentication, turn **off** "Allow new users to sign up" and keep "Confirm email" **on**.
   Rooms are matched by email address, so only housing should be able to create accounts.

## Admins for one building

By default an admin sees every building. To limit one to a building, run this in the SQL Editor (once per
building they should see):

```sql
insert into admin_scopes select id, 'Founders Hall' from profiles where email = 'north.campus@university.edu';
```

Delete their rows from `admin_scopes` to give full access back. There is no screen for this yet, on purpose:
it cannot be changed through the API, by anyone.

## The record seal

Every change to a room or one of its items adds an entry to the audit log. Since `010` each entry includes the
SHA-256 of the room's previous entry, so entries cannot be altered, removed or reordered without breaking every
later one. `select verify_audit_chain('<unit id>');` re-computes a room's chain, and the inspection report
prints the newest hash as the "record seal", next to the full fingerprint of every photo. Someone with the
database password could still rebuild a whole chain, but not one that matches a report a student already saved.
Entries written before `010` are not part of a chain.

## How a photo is registered now

1. The browser uploads the file to Storage. The storage rules from `006` still apply: only into that item's
   folder, only while that phase is open, and a stored file can never be overwritten or deleted.
2. The browser calls `register-evidence` with `{ itemId, phase, path }`. Nothing else it sends is used.
3. The function checks who is calling, reads the item and its unit as that user (row security), and refuses
   anyone but the assigned student, a locked phase, and any path outside `{unit}/{item}/{before|after}-…`.
4. It downloads the stored file with the service role, computes SHA-256 over those bytes, and calls
   `register_evidence()`. Only the service role may call that database function. It repeats every check while
   holding the lock that `lock_inspection()` takes, then writes the path, the type, the fingerprint and the
   database's own time, and records the student in the audit log.

So the fingerprint in the database is always the hash of the file that was in Storage when it was registered.
A later "Mismatch" on the admin screen means the stored file changed afterwards, which no student or admin
can do through the app or the API.

`008` adds its own trigger and does not edit the older ones, so running `005` or `006` again does not undo it.

## Known limits (not fixed)

- **Photos registered before `008` keep the fingerprint their browser sent.** The migration cannot read files, so it
  does not recompute them. Unlocked ones can be retaken; for locked ones, a mismatch is not proof of tampering.
- **"Live camera only" is a rule of the page, not the server.** Someone calling the API directly can upload any JPEG.
  The fingerprint proves the stored file has not changed since upload, not that it shows the room.
- **Whoever holds the database password can still change anything**, fingerprints included. Since `010` they cannot
  do it unnoticed for a room whose report someone else has kept (see "The record seal").
- **Stored files are kept forever.** Nothing deletes retakes, abandoned uploads or old semesters, and a video can be
  50 MB. The dashboard shows how much is stored and how much of it no checklist item points to. Deleting anything
  is a policy decision (how long must evidence be kept?) that has not been made.
- **Rate limits are per signed-in user**, not per network address, and `photo-check` keeps its own per-photo cap.
- **Rooms are matched by email**, not user id. Keep sign-ups off and email confirmation on (step 7); the dashboard
  warns if either is wrong.
- The demo students share one password while `VITE_DEMO_PASSWORD` is set.
