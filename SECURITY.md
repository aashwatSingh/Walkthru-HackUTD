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

## What you need to do

1. Run `supabase/migrations/006_hardening.sql` in the Supabase SQL Editor. It should print `hardening_installed = true`.
   Then upload one photo in a test room. If uploads fail, run `supabase/rollback/006_loosen_upload_checks.sql` and report the error.
2. Redeploy both Edge Functions (`photo-check`, `ai-review`).
3. Sign in as the housing admin on the deployed site and finish "Set up two-factor". **Then** run `007_admin_mfa.sql`.
4. Change the admin password, and remove `VITE_DEMO_PASSWORD` in Vercel when the public demo is over
   (it is readable in the site's code; change the demo users' passwords too).

## Known limits (not fixed)

- **Fingerprints come from the student's browser.** The server stores them and locks them, but does not recompute
  them. A student could register a wrong fingerprint and later claim tampering. Fix: compute SHA-256 in an Edge Function.
- **"Live camera only" is a rule of the page, not the server.** Someone calling the API directly can upload any JPEG.
- **Rooms are matched by email**, not user id. Keep sign-ups off and email confirmation on.
- The demo students share one password while `VITE_DEMO_PASSWORD` is set.
