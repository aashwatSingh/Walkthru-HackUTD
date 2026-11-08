// The Nemotron inspection agent's tools (spec Section 8.3). Shared by the ai-review Edge Function and
// scripts/verify-nvidia.mjs, so the verification script tests the exact tools the live function offers.
// Tool results are compact JSON (no images, few tokens).
import type { Tool } from './agent.ts';
import type { applyFees } from './prompts.mjs';

export type Item = {
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

export type Review = ReturnType<typeof applyFees>;

export const isPhotoPair = (i: Item) =>
  i.before_media_type === 'image' && i.after_media_type === 'image' && !!i.before_media_path && !!i.after_media_path;

/** `compare(item)` runs the vision comparison (cached by the caller); everything else is plain data access. */
export function buildReviewTools(items: Item[], compare: (item: Item) => Promise<Review>) {
  const byId = new Map(items.map((i) => [i.id, i]));
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

  return { tools, summarize };
}
