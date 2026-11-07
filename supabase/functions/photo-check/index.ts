// photo-check: Nemotron "Capture Coach" (spec Section 8.2).
// POST { itemId, phase: 'before' | 'after' } → { ok, shows_item, framing_ok, ..., retake_tip }
// Advisory only: the student flow never waits on or is blocked by this result.
import { json, preflight } from '../_shared/cors.ts';
import { nemotron, VLM_MODEL } from '../_shared/nemotron.ts';
import { normalizePhotoCheck, parseModelJson, photoCheckMessages } from '../_shared/prompts.js';
import { loadImage, requireUser, serviceClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

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

  try {
    const admin = serviceClient();
    const useReference = phase === 'after' && item.before_media_type === 'image' && !!item.before_media_path;
    const [photo, reference] = await Promise.all([
      loadImage(admin, path),
      useReference ? loadImage(admin, item.before_media_path) : Promise.resolve(null),
    ]);

    const model = VLM_MODEL();
    const answer = await nemotron(model, photoCheckMessages(item, photo, reference), { maxTokens: 1200 });
    const result = { ...normalizePhotoCheck(parseModelJson(answer), !!reference), media_path: path };

    const { error: insertError } = await admin.from('ai_reviews').insert({
      item_id: item.id,
      kind: phase === 'before' ? 'PHOTO_CHECK_BEFORE' : 'PHOTO_CHECK_AFTER',
      model,
      result,
    });
    if (insertError) console.error('ai_reviews insert failed', insertError.message);

    return json(result);
  } catch (err) {
    console.error('photo-check failed', err);
    return json({ error: String(err instanceof Error ? err.message : err) }, 502);
  }
});
