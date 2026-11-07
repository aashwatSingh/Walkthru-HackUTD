// Nemotron prompts + output checks for Walkthrough (spec Section 8).
// Plain JavaScript on purpose: the Edge Functions (Deno) and scripts/test-nemotron.mjs (Node)
// both import this file, so the prompts you test locally are exactly the ones deployed.

export const STATUSES = ['NO_CHANGE', 'PRE_EXISTING_DAMAGE', 'NEW_DAMAGE_BILLABLE', 'NEEDS_HUMAN_REVIEW'];
const SEVERITY_MULTIPLIER = { minor: 0.5, moderate: 1, severe: 1.5 };
const SEVERITY_RANK = { minor: 1, moderate: 2, severe: 3 };
export const MIN_CONFIDENCE = 0.6;

/** @typedef {{ role: 'system' | 'user' | 'assistant', content: string | object[] }} Message */

const text = (t) => ({ type: 'text', text: t });

/** @param {string | null | undefined} iso */
const when = (iso) => (iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'unknown time');

// ───────────── 1. Capture Coach ─────────────
/**
 * @param {{ item_name: string, instruction_text: string }} item
 * @param {object} newPhoto     image part for the photo just taken
 * @param {object|null} reference image part for the move-in photo (move-out only)
 * @returns {Message[]}
 */
export function photoCheckMessages(item, newPhoto, reference = null) {
  const content = [text('Image 1 is the photo the student just took.'), newPhoto];
  if (reference) content.push(text('Image 2 is the move-in photo of the same item, taken earlier.'), reference);
  content.push(
    text(
      `Checklist item: "${item.item_name}". Framing instruction: "${item.instruction_text}".\n` +
        (reference ? 'Judge whether image 1 uses a similar angle and framing to image 2.\n' : '') +
        'Return exactly this JSON and nothing else:\n' +
        '{"shows_item": boolean, "framing_ok": boolean, "lighting_ok": boolean, "sharp": boolean, ' +
        `"matches_reference_angle": ${reference ? 'boolean' : 'null'}, ` +
        '"retake_tip": "one short, friendly sentence telling the student how to retake; empty string if the photo is fine"}',
    ),
  );
  return [
    { role: 'system', content: 'You check photos for a university housing inspection. Reply with JSON only.' },
    { role: 'user', content },
  ];
}

export function normalizePhotoCheck(raw, hasReference) {
  const b = (v) => v === true || v === 'true';
  const out = {
    shows_item: b(raw.shows_item),
    framing_ok: b(raw.framing_ok),
    lighting_ok: b(raw.lighting_ok),
    sharp: b(raw.sharp),
    matches_reference_angle: hasReference ? b(raw.matches_reference_angle) : null,
    retake_tip: typeof raw.retake_tip === 'string' ? raw.retake_tip.trim() : '',
  };
  const problems = !out.shows_item || !out.framing_ok || !out.lighting_ok || !out.sharp ||
    out.matches_reference_angle === false;
  out.ok = !problems;
  if (problems && !out.retake_tip) out.retake_tip = 'Try again with the whole item in frame, in good light, holding steady.';
  if (!problems) out.retake_tip = '';
  return out;
}

// ───────────── 2. Damage Diff ─────────────
/**
 * @param {{ item_name: string, before_notes?: string | null, after_notes?: string | null,
 *           before_captured_at?: string | null, after_captured_at?: string | null }} item
 * @param {object} beforePhoto
 * @param {object} afterPhoto
 * @returns {Message[]}
 */
export function damageDiffMessages(item, beforePhoto, afterPhoto) {
  return [
    {
      role: 'system',
      content:
        'You are a careful housing damage inspector. Compare only the named item. Ignore differences in lighting, ' +
        'camera angle, clutter, and image quality. Never invent damage you cannot see. Reply with JSON only.',
    },
    {
      role: 'user',
      content: [
        text(`Image 1: MOVE-IN photo, captured ${when(item.before_captured_at)}.`),
        beforePhoto,
        text(`Image 2: MOVE-OUT photo, captured ${when(item.after_captured_at)}.`),
        afterPhoto,
        text(
          `Item: "${item.item_name}". Student move-in note: "${item.before_notes ?? ''}". ` +
            `Student move-out note: "${item.after_notes ?? ''}".\n` +
            'Return exactly this JSON and nothing else:\n' +
            '{"change_detected": boolean, ' +
            '"findings": [{"description": string, "location": string, "present_at_move_in": boolean, ' +
            '"severity": "minor" | "moderate" | "severe"}], ' +
            '"suggested_status": "NO_CHANGE" | "PRE_EXISTING_DAMAGE" | "NEW_DAMAGE_BILLABLE" | "NEEDS_HUMAN_REVIEW", ' +
            '"confidence": number between 0 and 1, ' +
            '"rationale": "max 2 sentences; cite the move-in photo/note and timestamp when relevant"}',
        ),
      ],
    },
  ];
}

export function normalizeDiff(raw) {
  const findings = Array.isArray(raw.findings)
    ? raw.findings
        .filter((f) => f && typeof f === 'object')
        .map((f) => ({
          description: String(f.description ?? '').slice(0, 300),
          location: String(f.location ?? '').slice(0, 120),
          present_at_move_in: f.present_at_move_in === true || f.present_at_move_in === 'true',
          severity: ['minor', 'moderate', 'severe'].includes(f.severity) ? f.severity : 'moderate',
        }))
    : [];
  let confidence = Number(raw.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.min(1, Math.max(0, confidence));
  const modelStatus = STATUSES.includes(raw.suggested_status) ? raw.suggested_status : 'NEEDS_HUMAN_REVIEW';
  return {
    change_detected: raw.change_detected === true || raw.change_detected === 'true',
    findings,
    model_status: modelStatus,
    confidence,
    rationale: String(raw.rationale ?? '').slice(0, 500),
  };
}

// Step B: money is computed by code from the fee schedule, never by the model.
export function applyFees(diff, standardCharge) {
  let suggested = diff.model_status;
  if (diff.confidence < MIN_CONFIDENCE) suggested = 'NEEDS_HUMAN_REVIEW';
  let suggestedFine = 0;
  if (suggested === 'NEW_DAMAGE_BILLABLE') {
    const newFindings = diff.findings.filter((f) => !f.present_at_move_in);
    const counted = newFindings.length ? newFindings : diff.findings;
    // Worst severity among the new findings; 'moderate' (full standard charge) if the model listed none
    const worst = counted.length
      ? counted.reduce((w, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[w] ? f.severity : w), counted[0].severity)
      : 'moderate';
    suggestedFine = Math.round(Number(standardCharge) * SEVERITY_MULTIPLIER[worst] * 100) / 100;
  }
  return {
    ...diff,
    suggested_status: suggested,
    suggested_fine: suggestedFine,
    waived_if_pre_existing: suggested === 'PRE_EXISTING_DAMAGE' ? Number(standardCharge) : 0,
  };
}

// ───────────── 3. Review Memo + Dispute Briefs ─────────────
/**
 * @param {object} unit
 * @param {object[]} items
 * @returns {Message[]}
 */
export function memoMessages(unit, items) {
  return [
    {
      role: 'system',
      content: 'You write concise, neutral housing inspection summaries. Never invent evidence. Reply with JSON only.',
    },
    {
      role: 'user',
      content:
        JSON.stringify({ unit, items }) +
        '\n\nReturn exactly this JSON and nothing else:\n' +
        '{"admin_summary": ["at most 3 short bullets"], ' +
        '"student_note": "plain-language explanation of each charge or waiver, 4 sentences max", ' +
        '"dispute_briefs": [{"item_id": "id of an item whose condition_status is DISPUTE_UNDER_REVIEW", ' +
        '"brief": "what the move-in and move-out evidence shows, with timestamps; end with a recommendation and say it is a recommendation"}]}',
    },
  ];
}

export function normalizeMemo(raw, disputedIds) {
  return {
    admin_summary: (Array.isArray(raw.admin_summary) ? raw.admin_summary : []).map(String).slice(0, 3),
    student_note: String(raw.student_note ?? ''),
    dispute_briefs: (Array.isArray(raw.dispute_briefs) ? raw.dispute_briefs : [])
      .filter((d) => d && disputedIds.includes(String(d.item_id)))
      .map((d) => ({ item_id: String(d.item_id), brief: String(d.brief ?? '') })),
  };
}

// ───────────── Parsing ─────────────
// Models sometimes add reasoning (<think>…</think>), code fences, or chatter around the JSON.
export function parseModelJson(answer) {
  const cleaned = String(answer)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Model did not return JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}
