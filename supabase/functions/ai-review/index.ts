// ai-review: Nemotron inspection agent (spec Section 8.3). Admin only.
// POST { unitId } → { mode, items, memo, agent: { trace, ... }, ... }
//
// Multi-step, tool-using workflow:
//   the Nemotron TEXT model plans the review and calls tools →
//     list_items · compare_photos (runs the Nemotron VISION model) · calculate_fee (fee schedule, code)
//     get_dispute_evidence · submit_review (memo + dispute briefs)
// Guarantees regardless of what the model does:
//   - every photo pair is compared (code fills in anything the agent skipped)
//   - money comes from the fee schedule in code, never from the model
//   - if tool calling fails or isn't supported, the fixed pipeline runs instead (mode: 'pipeline')
// Nothing here writes condition_status or estimated_fine: the admin applies suggestions.
import { runAgent, type TraceStep } from '../_shared/agent.ts';
import { json, preflight } from '../_shared/cors.ts';
import { callBudget, nemotron, TEXT_MODEL, VLM_MODEL } from '../_shared/nemotron.ts';
import { AGENT_SYSTEM, agentTask, applyFees, memoMessages, normalizeMemo, parseModelJson } from '../_shared/prompts.mjs';
import { loadImage, requireUser, serviceClient } from '../_shared/supabase.ts';
import { buildReviewTools, isPhotoPair, type Item, type Review } from '../_shared/review-tools.ts';
import { compareImages, visionMode } from '../_shared/vision.ts';


const MODE = Deno.env.get('AI_REVIEW_MODE') === 'pipeline' ? 'pipeline' : 'agent';
// Max vision calls at once. Set the AI_REVIEW_CONCURRENCY secret to 2 if NVIDIA returns 429s.
const CONCURRENCY = Math.max(1, Number(Deno.env.get('AI_REVIEW_CONCURRENCY') ?? 4) || 4);
// Time plan. Supabase stops an Edge Function at 150 s, and a stopped run saves nothing.
//   - no new agent round starts unless it can finish by AGENT_ROUNDS_MS (a round = planning call + its tools)
//   - EVERY Nemotron call (agent, vision, retries, the fallback memo) ends by CALLS_END_MS, even ones already running
//   - what's left (saving results, the response) has 35 s of slack
const AGENT_ROUNDS_MS = 100_000;
const CALLS_END_MS = 115_000;

const message = (err: unknown) => String(err instanceof Error ? err.message : err);
function limiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const startedAt = Date.now();

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

  const { data: rows, error: itemsError } = await admin
    .from('inspection_items')
    .select('id, step_order, zone_category, item_name, standard_charge, before_media_path, before_media_type, before_notes, before_captured_at, after_media_path, after_media_type, after_notes, after_captured_at, condition_status, estimated_fine, dispute_reason')
    .eq('unit_id', unitId)
    .order('step_order');
  if (itemsError) return json({ error: itemsError.message }, 500);
  const items = rows as Item[];
  const disputedIds = items.filter((i) => i.condition_status === 'DISPUTE_UNDER_REVIEW').map((i) => i.id);

  let vlm: string, textModel: string;
  try {
    vlm = VLM_MODEL();
    textModel = TEXT_MODEL();
  } catch (err) {
    return json({ error: message(err) }, 500);
  }

  // ── Vision comparison: cached per item, concurrency-limited, 20 s timeout per call, all ending by callDeadline ──
  const callDeadline = startedAt + CALLS_END_MS;
  const limit = limiter(CONCURRENCY);
  const comparisons = new Map<string, Promise<Review>>();
  const compare = (item: Item): Promise<Review> => {
    if (!comparisons.has(item.id)) {
      comparisons.set(item.id, limit(async () => {
        callBudget(20_000, callDeadline); // out of time while queued → fail fast, skip the photo downloads
        const [before, after] = await Promise.all([
          loadImage(admin, item.before_media_path!),
          loadImage(admin, item.after_media_path!),
        ]);
        // One call with both photos; two calls automatically if the model accepts one image per request.
        return applyFees(await compareImages(vlm, item, before, after, { deadline: callDeadline }), item.standard_charge);
      }).catch((err) => {
        comparisons.delete(item.id); // don't cache failures: the agent's next call for this item retries for real
        throw err;
      }));
    }
    return comparisons.get(item.id)!;
  };
  const { tools, summarize } = buildReviewTools(items, compare);

  // ── 1. Agent (default) ──
  let agent: { final: Record<string, unknown> | null; trace: TraceStep[]; rounds: number } | null = null;
  let agentError: string | undefined;
  if (MODE === 'agent') {
    try {
      agent = await runAgent({
        model: textModel, system: AGENT_SYSTEM, task: agentTask(unit), tools, finalTool: 'submit_review',
        summarize, deadline: startedAt + AGENT_ROUNDS_MS, callDeadline,
      });
      if (!agent.final) agentError = 'agent did not call submit_review in time';
    } catch (err) {
      agentError = message(err); // e.g. this model doesn't support tool calling → pipeline below
    }
  }
  const trace: TraceStep[] = agent?.trace ?? [];

  // ── 2. Coverage guarantee: compare every photo pair (cached ones return instantly) ──
  const results = await Promise.all(items.map(async (item) => {
    if (!isPhotoPair(item)) {
      return { item_id: item.id, item_name: item.item_name, suggested_status: 'NEEDS_HUMAN_REVIEW', suggested_fine: 0, skipped: 'AI review is available for photos only' };
    }
    const byAgent = comparisons.has(item.id);
    const started = Date.now();
    try {
      const r = await compare(item);
      if (!byAgent) trace.push({ round: 0, tool: 'compare_photos', args: { item_id: item.id }, ok: true, ms: Date.now() - started, summary: `${item.item_name}: ${r.suggested_status} (run by code)` });
      return { item_id: item.id, item_name: item.item_name, ...r };
    } catch (err) {
      if (!byAgent) trace.push({ round: 0, tool: 'compare_photos', args: { item_id: item.id }, ok: false, ms: Date.now() - started, summary: `failed: ${message(err)}` });
      return { item_id: item.id, item_name: item.item_name, suggested_status: 'NEEDS_HUMAN_REVIEW', suggested_fine: 0, error: message(err) };
    }
  }));

  // ── 3. Memo: the agent's submit_review, or a single fallback call ──
  let memo: ReturnType<typeof normalizeMemo> | null = null;
  let memoError: string | undefined;
  if (agent?.final) {
    memo = normalizeMemo(agent.final, disputedIds);
  } else {
    try {
      const memoInput = items.map((item, n) => ({
        item_id: item.id, item_name: item.item_name, zone: item.zone_category,
        condition_status: item.condition_status, estimated_fine: item.estimated_fine,
        before: { notes: item.before_notes, captured_at: item.before_captured_at },
        after: { notes: item.after_notes, captured_at: item.after_captured_at },
        dispute_reason: item.dispute_reason, ai: results[n],
      }));
      const answer = await nemotron(textModel, memoMessages(unit, memoInput), { maxTokens: 2000, deadline: callDeadline });
      memo = normalizeMemo(parseModelJson(answer), disputedIds);
    } catch (err) {
      memoError = message(err);
    }
  }

  const mode = agent?.final ? 'agent' : 'pipeline';
  const agentInfo = {
    vision_mode: visionMode(),
    rounds: agent?.rounds ?? 0,
    tool_calls: trace.filter((s) => s.round > 0).length,
    trace,
    fallback_reason: mode === 'pipeline' ? (MODE === 'pipeline' ? 'AI_REVIEW_MODE=pipeline' : agentError) : undefined,
  };

  // ── Save (the dashboard shows saved results instantly next time) ──
  const { error: reviewsError } = await admin.from('ai_reviews').insert(
    results.map(({ item_id, item_name: _n, ...result }) => ({ item_id, kind: 'DAMAGE_DIFF', model: vlm, result })),
  );
  if (reviewsError) console.error('ai_reviews insert failed', reviewsError.message);
  const { error: reportError } = await admin.from('ai_unit_reports').insert({
    unit_id: unit.id, model: textModel, result: { ...(memo ?? {}), memo_error: memoError, mode, vision_mode: visionMode(), agent: agentInfo },
  });
  if (reportError) console.error('ai_unit_reports insert failed', reportError.message);

  return json({
    unit_id: unit.id, unit_code: unit.unit_code, mode, vision_mode: visionMode(), models: { vision: vlm, text: textModel },
    items: results, memo, memo_error: memoError, agent: agentInfo, elapsed_ms: Date.now() - startedAt,
  });
});
