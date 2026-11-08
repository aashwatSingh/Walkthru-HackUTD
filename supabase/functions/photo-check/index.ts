// photo-check: Nemotron "Capture Coach" (spec Section 8.2).
// POST { itemId, phase: 'before' | 'after' } → { ok, shows_item, framing_ok, ..., retake_tip }
// Advisory only: the student flow never waits on or is blocked by this result.
//
// Cost guard (a signed-in student could otherwise call this in a loop and spend the NVIDIA credits):
//   - each uploaded photo is checked ONCE. Asking again returns the saved answer; a parallel request gets 429.
//     The claim is atomic: the review row's id is derived from the photo, so a second insert fails.
//   - at most MAX_CHECKS_PER_ITEM checks per item and phase (retakes included), then the coach stays quiet.
import { json, preflight } from '../_shared/cors.ts';
import { VLM_MODEL } from '../_shared/nemotron.ts';
import { loadImage, requireUser, serviceClient } from '../_shared/supabase.ts';
import { checkPhoto } from '../_shared/vision.ts';

const MAX_CHECKS_PER_ITEM = 12;
const DEADLINE_MS = 45_000; // the student is waiting: every Nemotron call ends by then
const STALE_CLAIM_MS = 90_000; // a claim this old belongs to a run that crashed: reuse it

// A stable UUID for "this item's photo at this path", so the database's primary key makes the claim atomic.
async function claimIdFor(text: string): Promise<string> {
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // name-based UUID (version 5 layout)
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const busy = () => json({ error: 'This photo is already being checked' }, 429);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const startedAt = Date.now();

  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  let body: { itemId?: string; phase?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON: { itemId, phase }' }, 400);
  }
  const { itemId, phase } = body;
  if (!itemId || (phase !== 'before' && phase !== 'after')) {
    return json({ error: "Expected { itemId, phase: 'before' | 'after' }" }, 400);
  }

  // Read as the caller: RLS returns the row only for the assigned student (or an admin).
  const { data: item, error } = await auth.userClient
    .from('inspection_items')
    .select('id, item_name, instruction_text, before_media_path, before_media_type, after_media_path, after_media_type')
    .eq('id', itemId)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!item) return json({ error: 'Item not found' }, 404);

  const path = item[`${phase}_media_path`];
  const type = item[`${phase}_media_type`];
  if (!path) return json({ error: `No ${phase} photo uploaded yet` }, 409);
  if (type !== 'image') return json({ skipped: true, reason: 'AI check is available for photos only' });

  let model: string;
  try {
    model = VLM_MODEL();
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
  const admin = serviceClient();
  const kind = phase === 'before' ? 'PHOTO_CHECK_BEFORE' : 'PHOTO_CHECK_AFTER';
  const claimId = await claimIdFor(`${item.id}:${kind}:${path}`);

  // 1. This exact photo was already checked, or is being checked right now: never pay twice for one photo.
  const { data: existing, error: existingError } = await admin
    .from('ai_reviews').select('result, created_at').eq('id', claimId).maybeSingle();
  if (existingError) return json({ error: existingError.message }, 500);
  if (existing) {
    if (!existing.result?.pending) return json(existing.result);
    if (Date.now() - Date.parse(existing.created_at) < STALE_CLAIM_MS) return busy();
    await admin.from('ai_reviews').delete().eq('id', claimId);
  }

  // 2. Per item and phase cap: a student retakes a few times at most.
  const { count, error: countError } = await admin
    .from('ai_reviews').select('id', { count: 'exact', head: true }).eq('item_id', item.id).eq('kind', kind);
  if (countError) return json({ error: countError.message }, 500);
  if ((count ?? 0) >= MAX_CHECKS_PER_ITEM) return json({ skipped: true, reason: 'Photo coach limit reached for this item' });

  // 3. Claim the photo. Two requests at once: the second insert hits the same primary key and gets 429.
  const { error: claimError } = await admin
    .from('ai_reviews').insert({ id: claimId, item_id: item.id, kind, model, result: { pending: true, media_path: path } });
  if (claimError) return claimError.code === '23505' ? busy() : json({ error: claimError.message }, 500);

  try {
    const useReference = phase === 'after' && item.before_media_type === 'image' && !!item.before_media_path;
    const [photo, reference] = await Promise.all([
      loadImage(admin, path),
      useReference ? loadImage(admin, item.before_media_path) : Promise.resolve(null),
    ]);

    const result = { ...(await checkPhoto(model, item, photo, reference, { deadline: startedAt + DEADLINE_MS })), media_path: path };

    const { error: saveError } = await admin.from('ai_reviews').update({ result }).eq('id', claimId);
    if (saveError) console.error('ai_reviews update failed', saveError.message);

    return json(result);
  } catch (err) {
    await admin.from('ai_reviews').delete().eq('id', claimId); // free the photo so a later request can try again
    console.error('photo-check failed', err);
    return json({ error: String(err instanceof Error ? err.message : err) }, 502);
  }
});
