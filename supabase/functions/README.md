# Edge Functions

Three functions. `register-evidence` is part of every photo upload and has nothing to do with NVIDIA. The other two are
the NVIDIA part of Walkthrough (spec Section 8): Nemotron runs inside the inspection workflow at two points; nobody chats with it.

| Function | Who calls it | What it does |
|---|---|---|
| `register-evidence` | Student app, right after each upload (`uploadStudentMedia`) | Downloads the stored file, computes its SHA-256 **on the server**, and puts path, type, fingerprint and capture time on the checklist item through `register_evidence()` (migration `008`). The only way a photo gets onto an item: the browser cannot write those columns. Needs no secrets. |
| `photo-check` | Student app, after each photo upload | Capture Coach: is this the right item, framed, lit, sharp, and (at move-out) the same angle as move-in? Returns a retake tip. Advisory only. |
| `ai-review` | Admin, "Run Nemotron Review" on a `COMPLETED` unit | **Tool-calling agent:** the Nemotron text model plans the review and calls tools (`list_items`, `compare_photos` → Nemotron vision, `calculate_fee` → fee schedule in code, `get_dispute_evidence`, `submit_review`). Falls back to a fixed pipeline if tool calling fails. |

No function writes `condition_status` or `estimated_fine`; the admin applies a suggestion with `updateAdminAssessment`.

```
_shared/cors.ts       CORS headers + json() helper (every response carries CORS headers)
_shared/nemotron.ts   NVIDIA chat-completions client: temperature 0.1, top_p 0.9, tool calling, 20 s timeout per call
_shared/agent.ts      tool-calling loop: runs the model's tool calls in parallel, step/time budget, trace for the UI
_shared/prompts.mjs    the prompts, output checks, and fee rules (also used by the scripts)
_shared/vision.ts      photo comparison + Capture Coach, with an automatic fallback if the model takes one image per request
_shared/review-tools.ts  the agent's 5 tools (shared with scripts/verify-nvidia.mjs)
_shared/supabase.ts   sign-in check, service-role client, image loading
register-evidence/index.ts   uses only cors.ts and supabase.ts (which imports nemotron.ts)
photo-check/index.ts
ai-review/index.ts
```

## 0. Verify everything against the real NVIDIA API (one command, no Supabase)
```bash
node --no-warnings scripts/verify-nvidia.mjs
```
Set `NVIDIA_API_KEY` first (PowerShell: `$env:NVIDIA_API_KEY = "nvapi-..."`). It runs the **same code the Edge Functions run** on the seed photos and prints a checklist: key and model, JSON parsing, one photo, two photos in one request, the full comparison, tool calling, the **full multi-step agent with its timeline**, and whether turning reasoning off is faster. It ends with the exact secrets to set. Needs Node 22.18+. Your key is never printed.

## 1. Pick the models and try the prompts by hand (optional)
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
   node scripts/test-nemotron.mjs tools   # agent mode needs a text model that supports tool calling
   ```
   If a model rejects two images in one request or answers in prose instead of JSON, try the next model. Prompt changes go in `_shared/prompts.mjs`, so the deployed functions get them too.

## 2. Set the secrets
Supabase Dashboard → **Edge Functions → Secrets** (or `npx supabase secrets set NAME=value --project-ref <ref>`):

| Secret | Value |
|---|---|
| `NVIDIA_API_KEY` | `nvapi-...` |
| `NEMOTRON_VLM_MODEL` | `nvidia/nemotron-3.5-super-vl-120b-a12b` |
| `NEMOTRON_TEXT_MODEL` | `nvidia/nemotron-3.5-super-vl-120b-a12b` (same model) |
| `PUBLIC_SITE_URL` | YOUR deployed link, e.g. `https://YOUR-PROJECT.vercel.app` (used to load `/seed/` photos) |
| `AI_REVIEW_CONCURRENCY` | optional; max vision calls at once. `2` if NVIDIA returns 429 rate-limit errors (default `4`) |
| `NEMOTRON_IMAGES_PER_REQUEST` | optional; `1` if the verify script says your model accepts one image per request (skips the failed two-photo attempt every time; the app also learns this by itself) |
| `NEMOTRON_ENABLE_THINKING` | optional; `false` turns Nemotron's reasoning off (faster). Leave unset for models that don't accept the switch |
| `NEMOTRON_TIMEOUT_MS` | optional; per-call timeout, default `20000`. Raise to `60000` if the verify script shows slow calls |
| `AI_REVIEW_MODE` | optional; `pipeline` skips the agent (e.g. if your text model can't call tools). Default `agent` |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

## 3. Deploy
**CLI (recommended, keeps `_shared/` working):**
```bash
npx supabase login
npx supabase functions deploy register-evidence --no-verify-jwt --project-ref <project-ref>
npx supabase functions deploy photo-check --no-verify-jwt --project-ref <project-ref>
npx supabase functions deploy ai-review --no-verify-jwt --project-ref <project-ref>
```
`register-evidence` goes with `supabase/migrations/008_server_fingerprints.sql`; the order to roll them out is in [`SECURITY.md`](../../SECURITY.md).
`--no-verify-jwt` is required: each function checks the caller itself (`requireUser` in `_shared/supabase.ts`).

**Dashboard (no CLI or Docker):** Edge Functions → Deploy a new function → Via Editor, once per function. The editor deploys each function on its own, so add the `_shared/` files (`cors.ts`, `nemotron.ts`, `prompts.mjs`, `supabase.ts`, `vision.ts`, plus `agent.ts` and `review-tools.ts` for `ai-review`; `register-evidence` needs only `cors.ts`, `supabase.ts` and `nemotron.ts`) as files inside the function and change `'../_shared/` to `'./` in `index.ts`. Then turn **off** JWT verification in the function's settings.

## 4. Call them from the app
```js
// inside uploadStudentMedia(), after the file is in Storage. This one IS awaited: it returns the updated row.
const { data, error } = await supabase.functions.invoke('register-evidence', { body: { itemId, phase: 'before', path } });
// data: the inspection_items row, with before_media_path, before_media_type, before_sha256 and before_captured_at set by the server

// after uploadStudentMedia() succeeds — don't await it in the upload flow
const { data, error } = await supabase.functions.invoke('photo-check', { body: { itemId, phase: 'before' } });
// data: { ok, shows_item, framing_ok, lighting_ok, sharp, matches_reference_angle, retake_tip, media_path }
//    or { skipped: true, reason } for videos

const { data, error } = await supabase.functions.invoke('ai-review', { body: { unitId } });
// data: { unit_id, unit_code, mode: 'agent' | 'pipeline', vision_mode: 'multi-image' | 'single-image', models: { vision, text }, elapsed_ms,
//         items: [{ item_id, item_name, suggested_status, suggested_fine, waived_if_pre_existing,
//                   confidence, findings, rationale, error?, skipped? }],
//         memo: { admin_summary, student_note, dispute_briefs } | null, memo_error?,
//         agent: { rounds, tool_calls, fallback_reason?, trace: [{ round, tool, args, ok, ms, summary }] } }
```
`suggested_status` is one of `NO_CHANGE`, `PRE_EXISTING_DAMAGE`, `NEW_DAMAGE_BILLABLE`, `NEEDS_HUMAN_REVIEW`. An item that failed, timed out, or is a video comes back as `NEEDS_HUMAN_REVIEW` with `error` or `skipped`, so show "Review manually". `memo` is `null` only if the agent didn't submit one and the fallback summary call also failed.

`agent.trace` is the step-by-step record for the `AiReviewPanel` timeline. Steps with `round: 0` were run by code because the agent skipped them (every photo pair is always compared). If `mode` is `pipeline`, `fallback_reason` says why.

Results are also saved to `ai_reviews` and `ai_unit_reports`, so run `ai-review` on the seed units **before judging** and the dashboard can show saved results instantly.

Error responses are `{ error }` with status `401` (not signed in), `403` (not an admin; for `register-evidence`, not the assigned student), `404`, `409` (wrong phase / no photo yet / the database refused), or `502` (Nemotron failed in `photo-check`). `register-evidence` also answers `400` for a path that is not this item's upload for this phase and `413` for a photo over 5 MB. It holds the whole file in memory to hash it (videos go up to the bucket's 50 MB).
