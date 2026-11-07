# Nemotron Edge Functions

The NVIDIA part of Walkthrough (spec Section 8). Nemotron runs inside the inspection workflow at two points; nobody chats with it.

| Function | Who calls it | What it does |
|---|---|---|
| `photo-check` | Student app, after each photo upload | Capture Coach: is this the right item, framed, lit, sharp, and (at move-out) the same angle as move-in? Returns a retake tip. Advisory only. |
| `ai-review` | Admin, "Run Nemotron Review" on a `COMPLETED` unit | Damage diff for every photo pair (in parallel, 20 s timeout each), fee suggestion from the fee schedule (code, not AI), then a memo with dispute briefs. |

Neither function writes `condition_status` or `estimated_fine`; the admin applies a suggestion with `updateAdminAssessment`.

```
_shared/cors.ts       CORS headers + json() helper (every response carries CORS headers)
_shared/nemotron.ts   NVIDIA chat-completions client with a per-call 20 s timeout
_shared/prompts.js    the prompts, output checks, and fee rules (also used by scripts/test-nemotron.mjs)
_shared/supabase.ts   sign-in check, service-role client, image loading
photo-check/index.ts
ai-review/index.ts
```

## 1. Pick the models and try the prompts (no Supabase needed)
1. Get an API key at build.nvidia.com (`nvapi-...`). Ask the NVIDIA mentors which Nemotron models count for the challenge.
2. From the repo root:
   ```bash
   export NVIDIA_API_KEY=nvapi-...
   node scripts/test-nemotron.mjs models
   ```
   Pick a Nemotron **vision** model (usually has `vl` in the name) and a Nemotron **text** model:
   ```bash
   export NEMOTRON_VLM_MODEL=nvidia/<vision-model> NEMOTRON_TEXT_MODEL=nvidia/<text-model>
   node scripts/test-nemotron.mjs diff public/seed/blinds.jpg public/seed/blinds-broken.jpg "Window Blinds & Slats" 45
   node scripts/test-nemotron.mjs photo public/seed/blinds.jpg "Window Blinds & Slats" "Lower blinds completely and take a straight-on photo showing all horizontal slats."
   node scripts/test-nemotron.mjs memo
   ```
   If a model rejects two images in one request or answers in prose instead of JSON, try the next model. Prompt changes go in `_shared/prompts.js`, so the deployed functions get them too.

## 2. Set the secrets
Supabase Dashboard → **Edge Functions → Secrets** (or `npx supabase secrets set NAME=value --project-ref <ref>`):

| Secret | Value |
|---|---|
| `NVIDIA_API_KEY` | `nvapi-...` |
| `NEMOTRON_VLM_MODEL` | the vision model ID from step 1 |
| `NEMOTRON_TEXT_MODEL` | the text model ID from step 1 |
| `PUBLIC_SITE_URL` | the Vercel URL, e.g. `https://walkthru.vercel.app` (used to load `/seed/` photos) |
| `AI_REVIEW_CONCURRENCY` | optional; `2` if NVIDIA returns 429 rate-limit errors (default `4` = all items at once) |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

## 3. Deploy
**CLI (recommended, keeps `_shared/` working):**
```bash
npx supabase login
npx supabase functions deploy photo-check --no-verify-jwt --project-ref <project-ref>
npx supabase functions deploy ai-review --no-verify-jwt --project-ref <project-ref>
```
`--no-verify-jwt` is required: each function checks the caller itself (`requireUser` in `_shared/supabase.ts`).

**Dashboard (no CLI or Docker):** Edge Functions → Deploy a new function → Via Editor, once per function. The editor deploys each function on its own, so add the four `_shared/` files as files inside the function and change `'../_shared/` to `'./` in `index.ts`. Then turn **off** JWT verification in the function's settings.

## 4. Call them from the app
```js
// after uploadStudentMedia() succeeds — don't await it in the upload flow
const { data, error } = await supabase.functions.invoke('photo-check', { body: { itemId, phase: 'before' } });
// data: { ok, shows_item, framing_ok, lighting_ok, sharp, matches_reference_angle, retake_tip, media_path }
//    or { skipped: true, reason } for videos

const { data, error } = await supabase.functions.invoke('ai-review', { body: { unitId } });
// data: { unit_id, unit_code, model, memo, memo_error?, items: [{ item_id, item_name, suggested_status,
//         suggested_fine, waived_if_pre_existing, confidence, findings, rationale, error?, skipped? }] }
```
`suggested_status` is one of `NO_CHANGE`, `PRE_EXISTING_DAMAGE`, `NEW_DAMAGE_BILLABLE`, `NEEDS_HUMAN_REVIEW`. An item that failed, timed out, or is a video comes back as `NEEDS_HUMAN_REVIEW` with `error` or `skipped`, so show "Review manually". `memo` is `null` if the summary call failed; the item results are still there.

Results are also saved to `ai_reviews` and `ai_unit_reports`, so run `ai-review` on the seed units **before judging** and the dashboard can show saved results instantly.

Error responses are `{ error }` with status `401` (not signed in), `403` (not an admin), `404`, `409` (wrong phase / no photo yet), or `502` (Nemotron failed in `photo-check`).
