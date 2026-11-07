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
import { runAgent, type Tool, type TraceStep } from '../_shared/agent.ts';
import { json, preflight } from '../_shared/cors.ts';
import { nemotron, TEXT_MODEL, VLM_MODEL } from '../_shared/nemotron.ts';
import {
  AGENT_SYSTEM,
  agentTask,
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
type Review = ReturnType<typeof applyFees>;

const MODE = Deno.env.get('AI_REVIEW_MODE') === 'pipeline' ? 'pipeline' : 'agent';
// Max vision calls at once. Set the AI_REVIEW_CONCURRENCY secret to 2 if NVIDIA returns 429s.
const CONCURRENCY = Math.max(1, Number(Deno.env.get('AI_REVIEW_CONCURRENCY') ?? 4) || 4);
const BUDGET_MS = 100_000; // stays inside the Edge Function wall-clock limit

const message = (err: unknown) => String(err instanceof Error ? err.message : err);
const isPhotoPair = (i: Item) =>
  i.before_media_type === 'image' && i.after_media_type === 'image' && !!i.before_media_path && !!i.after_media_path;

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
  const byId = new Map(items.map((i) => [i.id, i]));
  const disputedIds = items.filter((i) => i.condition_status === 'DISPUTE_UNDER_REVIEW').map((i) => i.id);

  let vlm: string, textModel: string;
  try {
    vlm = VLM_MODEL();
    textModel = TEXT_MODEL();
  } catch (err) {
    return json({ error: message(err) }, 500);
  }

  // ── Vision comparison: cached per item, concurrency-limited, 20 s timeout per call ──
  const limit = limiter(CONCURRENCY);
  const comparisons = new Map<string, Promise<Review>>();
  const compare = (item: Item): Promise<Review> => {
    if (!comparisons.has(item.id)) {
      comparisons.set(item.id, limit(async () => {
        const [before, after] = await Promise.all([
          loadImage(admin, item.before_media_path!),
          loadImage(admin, item.after_media_path!),
        ]);
        const answer = await nemotron(vlm, damageDiffMessages(item, before, after));
        return applyFees(normalizeDiff(parseModelJson(answer)), item.standard_charge);
      }));
    }
    return comparisons.get(item.id)!;
  };
  const itemFor = (args: Record<string, unknown>) => {
    const item = byId.get(String(args.item_id ?? ''));
    if (!item) throw new Error(`unknown item_id ${args.item_id}`);
    return item;
  };

  // ── Tools the agent can call (results are compact JSON: no images, few tokens) ──
  const tools: Tool[] = [
    {
      def: { type: 'function', function: { name: 'list_items', description: 'List the checklist items of this unit with notes, status, and whether photos exist.', parameters: { type: 'object', properties: {} } } },
      run: () => items.map((i) => ({
        item_id: i.id, item: i.item_name, zone: i.zone_category, has_photos: isPhotoPair(i),
        status: i.condition_status, disputed: i.condition_status === 'DISPUTE_UNDER_REVIEW',
        move_in_note: i.before_notes, move_out_note: i.after_notes,
      })),
    },
    {
      def: { type: 'function', function: { name: 'compare_photos', description: 'Compare the move-in and move-out photos of one item with the Nemotron vision model. Returns findings and a suggested status.', parameters: { type: 'object', properties: { item_id: { type: 'string' } }, required: ['item_id'] } } },
      run: async (args) => {
        const item = itemFor(args);
        if (!isPhotoPair(item)) throw new Error('this item has no photo pair (video or missing)');
        const { suggested_fine: _f, waived_if_pre_existing: _w, model_status: _m, ...r } = await compare(item);
        return { item_id: item.id, ...r };
      },
    },
    {
      def: { type: 'function', function: { name: 'calculate_fee', description: 'Fee-schedule lookup for one compared item: suggested fine (new damage) or waived amount (pre-existing). Computed by code.', parameters: { type: 'object', properties: { item_id: { type: 'string' } }, required: ['item_id'] } } },
      run: async (args) => {
        const item = itemFor(args);
        if (!isPhotoPair(item)) throw new Error('no photo comparison for this item');
        const r = await compare(item);
        return {
          item_id: item.id, suggested_status: r.suggested_status, standard_charge: item.standard_charge,
          suggested_fine: r.suggested_fine, waived_if_pre_existing: r.waived_if_pre_existing,
          rule: 'new damage: standard charge × 0.5 minor, × 1 moderate, × 1.5 severe',
        };
      },
    },
    {
      def: { type: 'function', function: { name: 'get_dispute_evidence', description: "A student's dispute for one item: their reason, the current charge, and both timestamps and notes.", parameters: { type: 'object', properties: { item_id: { type: 'string' } }, required: ['item_id'] } } },
      run: (args) => {
        const item = itemFor(args);
        if (!item.dispute_reason) return { item_id: item.id, has_dispute: false };
        return {
          item_id: item.id, has_dispute: true, reason: item.dispute_reason, current_fine: item.estimated_fine,
          move_in: { note: item.before_notes, captured_at: item.before_captured_at },
          move_out: { note: item.after_notes, captured_at: item.after_captured_at },
        };
      },
    },
    {
      def: { type: 'function', function: { name: 'submit_review', description: 'Finish: submit the admin summary, the note to the student, and one brief per disputed item.', parameters: {
        type: 'object',
        properties: {
          admin_summary: { type: 'array', items: { type: 'string' }, description: 'at most 3 short bullets' },
          student_note: { type: 'string', description: 'plain language, 4 sentences max' },
          dispute_briefs: { type: 'array', items: { type: 'object', properties: { item_id: { type: 'string' }, brief: { type: 'string' } }, required: ['item_id', 'brief'] } },
        },
        required: ['admin_summary', 'student_note', 'dispute_briefs'],
      } } },
      run: () => ({ accepted: true }), // handled by runAgent as the final tool
    },
  ];

  const name = (args: Record<string, unknown>) => byId.get(String(args.item_id))?.item_name ?? String(args.item_id);
  const summarize = (tool: string, args: Record<string, unknown>, result: unknown): string => {
    const r = result as Record<string, unknown>;
    if (tool === 'list_items') return `${(result as unknown[]).length} items loaded`;
    if (tool === 'compare_photos') return `${name(args)}: ${r.suggested_status} (${Math.round(Number(r.confidence) * 100)}% confident)`;
    if (tool === 'calculate_fee') {
      return Number(r.suggested_fine) > 0 ? `${name(args)}: $${Number(r.suggested_fine).toFixed(2)} suggested`
        : Number(r.waived_if_pre_existing) > 0 ? `${name(args)}: $${Number(r.waived_if_pre_existing).toFixed(2)} waived` : `${name(args)}: $0`;
    }
    if (tool === 'get_dispute_evidence') return r.has_dispute ? `${name(args)}: dispute evidence loaded` : `${name(args)}: no dispute`;
    if (tool === 'submit_review') return 'review submitted';
    return tool;
  };

  // ── 1. Agent (default) ──
  let agent: { final: Record<string, unknown> | null; trace: TraceStep[]; rounds: number } | null = null;
  let agentError: string | undefined;
  if (MODE === 'agent') {
    try {
      agent = await runAgent({
        model: textModel, system: AGENT_SYSTEM, task: agentTask(unit), tools, finalTool: 'submit_review',
        summarize, deadline: startedAt + BUDGET_MS,
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
      const answer = await nemotron(textModel, memoMessages(unit, memoInput), { maxTokens: 2000 });
      memo = normalizeMemo(parseModelJson(answer), disputedIds);
    } catch (err) {
      memoError = message(err);
    }
  }

  const mode = agent?.final ? 'agent' : 'pipeline';
  const agentInfo = {
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
    unit_id: unit.id, model: textModel, result: { ...(memo ?? {}), memo_error: memoError, mode, agent: agentInfo },
  });
  if (reportError) console.error('ai_unit_reports insert failed', reportError.message);

  return json({
    unit_id: unit.id, unit_code: unit.unit_code, mode, models: { vision: vlm, text: textModel },
    items: results, memo, memo_error: memoError, agent: agentInfo, elapsed_ms: Date.now() - startedAt,
  });
});
