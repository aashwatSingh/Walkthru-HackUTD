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
- **Whoever holds the service-role key or the database password can still change anything**, fingerprints included.
  That is Supabase project access, not the app.
- **Rooms are matched by email**, not user id. Keep sign-ups off and email confirmation on.
- The demo students share one password while `VITE_DEMO_PASSWORD` is set.
