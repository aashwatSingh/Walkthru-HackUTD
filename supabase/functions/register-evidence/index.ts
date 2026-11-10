// register-evidence: puts an uploaded photo or video on a checklist item, with a fingerprint the SERVER computed.
// POST { itemId, phase: 'before' | 'after', path } → the updated inspection_items row
//
// Why this exists: the browser used to hash the file and write the fingerprint itself, so a student calling the
// API directly could register a wrong one and later blame housing for the "Mismatch". Now (migration 008) nobody
// using the API can write a path, type or fingerprint; this function is the only way, and it:
//   1. authenticates the caller (requireUser) and reads the item and its unit AS the caller, so row security
//      decides whether they may see it; then checks they are the assigned student and that the phase is open
//   2. accepts only a path inside this item's folder for this phase: {unit}/{item}/{before|after}-{ms}.{jpg|mp4|webm}
//   3. downloads the stored file with the service role and computes SHA-256 over the bytes it received
//   4. calls register_evidence() (service role only), which repeats every check under a row lock and writes the
//      path, the type, the fingerprint and the database's own capture time
// Nothing the caller sends is stored except the path, and the file at that path is what gets hashed.
// Stored files cannot be overwritten or deleted through the API (no update or delete policy on the bucket).
import { json, preflight } from '../_shared/cors.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';

const BUCKET = 'inspection-media';
const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // same limit as check_evidence(); the app compresses photos to about 150 KB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // the bucket's own limit; the whole file is held in memory to hash it
const FILE_NAME = /^[0-9]{10,16}\.(jpg|mp4|webm)$/; // after the "{unit}/{item}/{phase}-" prefix; no slashes or dots to climb with

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
const phaseName = (phase: string) => (phase === 'before' ? 'move-in' : 'move-out');
// Students get a plain message; the detail (database or storage errors) stays in the function log.
const failed = (detail: unknown, status = 500) => {
  console.error('register-evidence failed', detail);
  return json({ error: 'Could not save the photo. Try again.' }, status);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;
  const email = auth.user.email?.trim().toLowerCase();

  let body: { itemId?: unknown; phase?: unknown; path?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON: { itemId, phase, path }' }, 400);
  }
  const { itemId, phase, path } = body ?? {};
  if (typeof itemId !== 'string' || !itemId || (phase !== 'before' && phase !== 'after') || typeof path !== 'string' || !path) {
    return json({ error: "Expected { itemId, phase: 'before' | 'after', path }" }, 400);
  }

  // 1. Read as the caller: RLS returns the rows only for the assigned student (or an admin).
  const { data: item, error: itemError } = await auth.userClient
    .from('inspection_items').select('id, unit_id').eq('id', itemId).maybeSingle();
  if (itemError || !item) return json({ error: 'Item not found' }, 404); // e.g. an id that is not a uuid: no database detail
  const { data: unit, error: unitError } = await auth.userClient
    .from('units').select('id, assigned_student_email, inspection_phase').eq('id', item.unit_id).maybeSingle();
  if (unitError || !unit) return json({ error: 'Item not found' }, 404);

  // An admin can read every item, but evidence belongs to the student.
  if (!email || email !== unit.assigned_student_email) {
    return json({ error: `Only the assigned student can edit ${phaseName(phase)} evidence` }, 403);
  }
  if (phase === 'before' && unit.inspection_phase !== 'MOVE_IN_OPEN') return json({ error: 'Move-in inspection is locked' }, 409);
  if (phase === 'after' && unit.inspection_phase !== 'MOVE_OUT_OPEN') return json({ error: 'Move-out inspection is not open' }, 409);

  // 2. A file uploaded for THIS item and phase (not another item, phase or unit, and not a seed file).
  const prefix = `${unit.id}/${item.id}/${phase}-`;
  if (!path.startsWith(prefix) || !FILE_NAME.test(path.slice(prefix.length))) {
    return json({ error: 'Evidence must be a photo uploaded for this item' }, 400);
  }

  // 3. Fingerprint the bytes that are actually stored.
  const admin = serviceClient();
  const { data: file, error: downloadError } = await admin.storage.from(BUCKET).download(path);
  if (downloadError || !file) {
    // Storage answers a missing object with HTTP 404, or HTTP 400 and statusCode "404" in the body (older versions).
    // deno-lint-ignore no-explicit-any
    const e = downloadError as any;
    const codes = [e?.status, e?.statusCode, e?.originalError?.status].map(String);
    if (codes.includes('404') || codes.includes('400')) {
      return json({ error: 'Upload the file first: nothing is stored at that path' }, 409);
    }
    return failed(downloadError ?? 'empty download', 502);
  }
  if (path.endsWith('.jpg') ? file.size > MAX_PHOTO_BYTES : file.size > MAX_VIDEO_BYTES) {
    return json({ error: path.endsWith('.jpg') ? 'Photos must be under 5 MB' : 'Video is over 50 MB. Record a shorter clip.' }, 413);
  }
  const sha256 = hex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));

  // 4. The database repeats the checks under a lock (the inspection may have been locked meanwhile) and writes.
  const { data: row, error: saveError } = await admin.rpc('register_evidence', {
    p_item_id: item.id, p_phase: phase, p_path: path, p_sha256: sha256, p_user_id: auth.user.id, p_email: email,
  });
  if (saveError) {
    // P0001 = one of the rules in register_evidence() / check_evidence() said no, in plain words.
    if (saveError.code === 'P0001') return json({ error: saveError.message }, 409);
    if (saveError.code === 'PGRST202') console.error('register_evidence() is missing: run supabase/migrations/008_server_fingerprints.sql');
    return failed(saveError.message);
  }
  if (!row?.id) return failed('register_evidence() returned no row');
  return json(row);
});
