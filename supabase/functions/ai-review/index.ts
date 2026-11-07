// ai-review: Nemotron unit review (spec Section 8.3). Admin only.
// POST { unitId } → { unit_id, items: [...per-item results], memo | null }
//   Step A  Damage Diff  — vision model, one call per item, in parallel, 20 s timeout each
//   Step B  Fees         — plain code from the fee schedule (the model never sets money)
//   Step C  Memo         — text model: admin summary, student note, dispute briefs
// Nothing here writes condition_status or estimated_fine: the admin applies suggestions.
import { json, preflight } from '../_shared/cors.ts';
import { nemotron, TEXT_MODEL, VLM_MODEL } from '../_shared/nemotron.ts';
import {
  applyFees,
  damageDiffMessages,
  memoMessages,
  normalizeDiff,
  normalizeMemo,
  parseModelJson,
} from '../_shared/prompts.js';
import { loadImage, requireUser, serviceClient } from '../_shared/supabase.ts';

type Item = {
  id: string;
  step_order: number;
  zone_category: string;
  item_name: string;
  standard_charge: number;
  before_media_path: string | null;
  before_media_type: string | null;
  before_notes: string | null;
  before_captured_at: string | null;
  after_media_path: string | null;
  after_media_type: string | null;
  after_notes: string | null;
  after_captured_at: string | null;
  condition_status: string;
  estimated_fine: number;
  dispute_reason: string | null;
};

// 4 = all items at once. Set the AI_REVIEW_CONCURRENCY secret to 2 if NVIDIA returns 429s.
const CONCURRENCY = Math.max(1, Number(Deno.env.get('AI_REVIEW_CONCURRENCY') ?? 4) || 4);

async function inBatches<T, R>(list: T[], size: number, fn: (x: T) => Promise<R>) {
  const settled: PromiseSettledResult<R>[] = [];
  for (let n = 0; n < list.length; n += size) {
    settled.push(...(await Promise.allSettled(list.slice(n, n + size).map(fn))));
  }
  return settled;
}

const message = (err: unknown) => String(err instanceof Error ? err.message : err);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;
  const { data: isAdmin, error: adminError } = await auth.userClient.rpc('is_admin');
  if (adminError) return json({ error: adminError.message }, 500);
  if (isAdmin !== true) return json({ error: 'Admins only' }, 403);

  let unitId: string | undefined;
  try {
    ({ unitId } = await req.json());
  } catch { /* handled below */ }
  if (!unitId) return json({ error: 'Expected { unitId }' }, 400);

  const admin = serviceClient();
  const { data: unit, error: unitError } = await admin
    .from('units')
    .select('id, unit_code, building_name, room_number, semester, assigned_student_name, inspection_phase, move_in_locked_at, move_out_locked_at')
    .eq('id', unitId)
    .maybeSingle();
  if (unitError) return json({ error: unitError.message }, 500);
  if (!unit) return json({ error: 'Unit not found' }, 404);
  if (unit.inspection_phase !== 'COMPLETED') {
    return json({ error: 'Run the review after the student submits move-out' }, 409);
  }

  const { data: items, error: itemsError } = await admin
    .from('inspection_items')
    .select('id, step_order, zone_category, item_name, standard_charge, before_media_path, before_media_type, before_notes, before_captured_at, after_media_path, after_media_type, after_notes, after_captured_at, condition_status, estimated_fine, dispute_reason')
    .eq('unit_id', unitId)
    .order('step_order');
  if (itemsError) return json({ error: itemsError.message }, 500);

  let vlm: string;
  try {
    vlm = VLM_MODEL();
  } catch (err) {
    return json({ error: message(err) }, 500);
  }

  // ── Step A + B: per-item damage diff, in parallel; one failure never fails the run ──
  const isPhotoPair = (i: Item) =>
    i.before_media_type === 'image' && i.after_media_type === 'image' && !!i.before_media_path && !!i.after_media_path;
  const pairs = (items as Item[]).filter(isPhotoPair);

  const diffItem = async (item: Item) => {
    const [before, after] = await Promise.all([
      loadImage(admin, item.before_media_path!),
      loadImage(admin, item.after_media_path!),
    ]);
    const answer = await nemotron(vlm, damageDiffMessages(item, before, after));
    return applyFees(normalizeDiff(parseModelJson(answer)), item.standard_charge);
  };
  const settled = await inBatches(pairs, CONCURRENCY, diffItem);

  const byId = new Map<string, Record<string, unknown>>();
  settled.forEach((r, n) => {
    byId.set(
      pairs[n].id,
      r.status === 'fulfilled'
        ? r.value
        : { suggested_status: 'NEEDS_HUMAN_REVIEW', suggested_fine: 0, error: message(r.reason) },
    );
  });
  const results = (items as Item[]).map((item) => ({
    item_id: item.id,
    item_name: item.item_name,
    ...(byId.get(item.id) ??
      { suggested_status: 'NEEDS_HUMAN_REVIEW', suggested_fine: 0, skipped: 'AI review is available for photos only' }),
  }));

  const { error: insertError } = await admin.from('ai_reviews').insert(
    results.map(({ item_id, item_name: _name, ...result }) => ({ item_id, kind: 'DAMAGE_DIFF', model: vlm, result })),
  );
  if (insertError) console.error('ai_reviews insert failed', insertError.message);

  // ── Step C: memo + dispute briefs; if it fails, still return Steps A and B ──
  let memo = null;
  let memoError: string | undefined;
  try {
    const textModel = TEXT_MODEL();
    const memoInput = (items as Item[]).map((item, n) => ({
      item_id: item.id,
      item_name: item.item_name,
      zone: item.zone_category,
      condition_status: item.condition_status,
      estimated_fine: item.estimated_fine,
      before: { notes: item.before_notes, captured_at: item.before_captured_at },
      after: { notes: item.after_notes, captured_at: item.after_captured_at },
      dispute_reason: item.dispute_reason,
      ai: results[n],
    }));
    const disputedIds = (items as Item[]).filter((i) => i.condition_status === 'DISPUTE_UNDER_REVIEW').map((i) => i.id);
    const answer = await nemotron(textModel, memoMessages(unit, memoInput), { maxTokens: 2000 });
    memo = normalizeMemo(parseModelJson(answer), disputedIds);
    const { error } = await admin.from('ai_unit_reports').insert({ unit_id: unit.id, model: textModel, result: memo });
    if (error) console.error('ai_unit_reports insert failed', error.message);
  } catch (err) {
    memoError = message(err);
    console.error('memo failed', memoError);
  }

  return json({ unit_id: unit.id, unit_code: unit.unit_code, model: vlm, items: results, memo, memo_error: memoError });
});
