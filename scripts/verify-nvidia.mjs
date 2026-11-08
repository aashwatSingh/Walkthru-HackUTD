#!/usr/bin/env node
// ONE command that checks the whole NVIDIA part against the REAL API, using the same code the Edge Functions run.
// No Supabase, no photo prep (it uses public/seed/*.jpg). Your API key is never printed.
//
//   PowerShell:  $env:NVIDIA_API_KEY = "nvapi-..."
//                node --no-warnings scripts/verify-nvidia.mjs
//   Mac/Linux:   NVIDIA_API_KEY=nvapi-... node --no-warnings scripts/verify-nvidia.mjs
//
// Optional: your own photos for the photo checks (keep them under ~300 KB):
//                node --no-warnings scripts/verify-nvidia.mjs before-small.jpg after-small.jpg
//
// Needs Node 22.18+ (it imports the TypeScript helpers directly).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const KEY = process.env.NVIDIA_API_KEY;
if (!KEY) {
  console.error('Set NVIDIA_API_KEY first. PowerShell:  $env:NVIDIA_API_KEY = "nvapi-..."');
  process.exit(1);
}
const VLM = (process.env.NEMOTRON_VLM_MODEL ||= 'nvidia/nemotron-3.5-super-vl-120b-a12b');
const TEXT = (process.env.NEMOTRON_TEXT_MODEL ||= 'nvidia/nemotron-3.5-super-vl-120b-a12b');
process.env.NEMOTRON_TIMEOUT_MS ||= '60000'; // generous here, so we can SEE how slow the real model is

const scrub = (s) => String(s).split(KEY).join('nvapi-***');
const out = (...a) => console.log(...a.map(scrub));

// Run the real Edge Function code in Node: give it the one Deno API it uses.
globalThis.Deno ??= { env: { get: (k) => process.env[k] } };
let nim, agent, vision, tools, P;
try {
  nim = await import('../supabase/functions/_shared/nemotron.ts');
  agent = await import('../supabase/functions/_shared/agent.ts');
  vision = await import('../supabase/functions/_shared/vision.ts');
  tools = await import('../supabase/functions/_shared/review-tools.ts');
  P = await import('../supabase/functions/_shared/prompts.mjs');
} catch (e) {
  console.error(`Could not load the helpers (${e.message}). You need Node 22.18 or newer: you have ${process.version}.`);
  process.exit(1);
}

const BASE = (process.env.NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1/chat/completions').replace(/\/chat\/completions$/, '');
const seed = (name) => fileURLToPath(new URL(`../public/seed/${name}`, import.meta.url));
const [argBefore, argAfter] = process.argv.slice(2);
const FILES = { before: argBefore || seed('blinds.jpg'), after: argAfter || seed('blinds-broken.jpg') };

async function image(path) {
  const bytes = await readFile(path);
  if (bytes.length > 300_000) out(`   ⚠️  ${path} is ${Math.round(bytes.length / 1000)} KB; NVIDIA may reject big photos (HTTP 415). Shrink it to under 150 KB.`);
  const ext = path.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  return nim.imagePart(bytes.toString('base64'), ext);
}

const item = {
  item_name: 'Window Blinds & Slats',
  instruction_text: 'Lower blinds completely and take a straight-on photo showing all horizontal slats.',
  before_notes: 'All slats intact.', after_notes: 'Two slats snapped.',
  before_captured_at: '2026-08-18T15:16:00Z', after_captured_at: '2026-11-07T15:33:00Z',
};

// ───────────── tiny test runner ─────────────
const results = [];
const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;
async function check(name, fn) {
  const t0 = Date.now();
  out(`\n▶ ${name}`);
  try {
    const r = (await fn()) || {};
    const ms = Date.now() - t0;
    const status = r.status || 'pass';
    results.push({ name, status, ms, note: r.note });
    out(`  ${status === 'pass' ? '✅' : '⚠️ '} ${secs(ms)}${r.note ? `: ${r.note}` : ''}`);
    return r;
  } catch (e) {
    const ms = Date.now() - t0;
    results.push({ name, status: 'fail', ms, note: e.message });
    out(`  ❌ ${secs(ms)}: ${e.message}`);
    if (/HTTP 415|Unsupported Media/i.test(e.message)) out('     Hint: the photo is too large for NVIDIA. Use photos under ~150 KB.');
    if (/\b40[13]\b/.test(e.message)) out('     Hint: check the API key (it may be revoked or mistyped).');
    if (/\b404\b/.test(e.message)) out(`     Hint: NVIDIA does not know the model "${VLM}". Check the exact model ID on build.nvidia.com.`);
    if (/timed out/i.test(e.message)) out('     Hint: the model is slow. In Supabase set the secret NEMOTRON_TIMEOUT_MS=60000 (and try NEMOTRON_ENABLE_THINKING=false).');
    return { status: 'fail' };
  }
}

out('Walkthrough: NVIDIA verification');
out(`  vision model: ${VLM}\n  text model:   ${TEXT}\n  photos:       ${FILES.before.split(/[\\/]/).pop()} → ${FILES.after.split(/[\\/]/).pop()}`);

// 1. key + model
await check('1. API key works and the model exists', async () => {
  const res = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}. ${res.status === 401 || res.status === 403 ? 'The key was rejected.' : ''}`);
  const ids = (await res.json()).data?.map((m) => m.id) ?? [];
  const listed = ids.includes(VLM) && ids.includes(TEXT);
  return listed ? { note: 'key accepted; both models are listed' } : { status: 'warn', note: `key accepted, but "${VLM}" is not in the model list (it may still work)` };
});

// 2. text → JSON
await check('2. A text answer parses as JSON', async () => {
  const answer = await nim.nemotron(TEXT, [
    { role: 'system', content: 'Reply with JSON only.' },
    { role: 'user', content: 'Return exactly {"ok": true, "word": "<any one word>"}' },
  ], { maxTokens: 400 });
  const j = P.parseModelJson(answer);
  if (j.ok !== true) throw new Error(`unexpected JSON: ${JSON.stringify(j)}`);
  return { note: `parsed ${JSON.stringify(j)}` };
});

// 3. one photo (Capture Coach, no reference photo)
const beforePart = await image(FILES.before);
const afterPart = await image(FILES.after);
await check('3. One photo accepted: the Capture Coach', async () => {
  const r = await vision.checkPhoto(VLM, item, beforePart, null);
  return { note: `ok=${r.ok}${r.retake_tip ? `, tip: "${r.retake_tip}"` : ''}` };
});

// 4. two photos in ONE request (the thing the model card hinted might not work)
let twoImages = 'unknown';
await check('4. Two photos in ONE request (move-in + move-out)', async () => {
  try {
    const d = P.normalizeDiff(P.parseModelJson(await nim.nemotron(VLM, P.damageDiffMessages(item, beforePart, afterPart))));
    twoImages = 'yes';
    return { note: `accepted. Nemotron says ${d.model_status} (${Math.round(d.confidence * 100)}% confident)` };
  } catch (e) {
    if (vision.rejectsRequestShape(e)) {
      twoImages = 'no';
      return { status: 'warn', note: `NVIDIA accepts only one image per request (${e.message.slice(0, 90)}). The app switches to its two-step fallback automatically.` };
    }
    throw e;
  }
});

// 5. the real comparison, with the automatic fallback
let diff;
await check('5. Full photo comparison (uses the fallback if needed)', async () => {
  diff = await vision.compareImages(VLM, item, beforePart, afterPart);
  const found = diff.findings.map((f) => f.description).join('; ') || 'none';
  return { note: `${vision.visionMode()} mode → ${diff.model_status}, ${Math.round(diff.confidence * 100)}% confident. Findings: ${found}` };
});

// 6. tool calling
await check('6. Tool calling works', async () => {
  const r = await nim.chat(TEXT, [
    { role: 'system', content: 'You are an inspection agent. Work only through the tools.' },
    { role: 'user', content: 'Review unit FH-304B. Start with list_items.' },
  ], { tools: [{ type: 'function', function: { name: 'list_items', description: 'List the checklist items of this unit.', parameters: { type: 'object', properties: {} } } }], maxTokens: 400 });
  if (!r.tool_calls.length) return { status: 'warn', note: 'the model answered in text instead of calling the tool; ai-review would run in pipeline mode' };
  return { note: `called ${r.tool_calls.map((c) => c.function.name).join(', ')}` };
});

// 7. the whole agent loop: multi-step + tools, with the SAME tool definitions as the live function
let agentRun;
await check('7. Full inspection agent (multi-step workflow + tool integration)', async () => {
  const mk = (id, step, name, charge, before, after, extra = {}) => ({
    id, step_order: step, zone_category: 'Test', item_name: name, standard_charge: charge,
    before_media_path: before, before_media_type: 'image', before_notes: '', before_captured_at: '2026-08-18T15:00:00Z',
    after_media_path: after, after_media_type: 'image', after_notes: '', after_captured_at: '2026-11-07T15:00:00Z',
    condition_status: 'UNREVIEWED', estimated_fine: 0, dispute_reason: null, ...extra,
  });
  const items = [
    mk('i1', 1, 'Main Door & Deadbolt Lock', 150, seed('door.jpg'), seed('door.jpg')),
    mk('i2', 2, 'Study Desk Surface', 85, seed('desk.jpg'), seed('desk-water-ring.jpg')),
    mk('i3', 3, 'Window Blinds & Slats', 45, FILES.before, FILES.after),
    mk('i4', 4, 'Porcelain Sink & Vanity Mirror', 120, seed('sink.jpg'), seed('sink.jpg'),
      { condition_status: 'DISPUTE_UNDER_REVIEW', estimated_fine: 120, dispute_reason: 'The crack was already there at move-in.' }),
  ];
  const cache = new Map();
  const compare = (it) => {
    if (!cache.has(it.id)) {
      cache.set(it.id, (async () => P.applyFees(await vision.compareImages(VLM, it, await image(it.before_media_path), await image(it.after_media_path)), it.standard_charge))());
    }
    return cache.get(it.id);
  };
  const { tools: reviewTools, summarize } = tools.buildReviewTools(items, compare);
  agentRun = await agent.runAgent({
    model: TEXT, system: P.AGENT_SYSTEM, task: P.agentTask({ unit_code: 'TEST-1', building_name: 'Test Hall', room_number: '1' }),
    tools: reviewTools, finalTool: 'submit_review', summarize, deadline: Date.now() + 240_000,
  });
  out('   agent timeline:');
  for (const s of agentRun.trace) out(`     round ${s.round}  ${s.ok ? '✓' : '✗'} ${s.tool.padEnd(21)} ${String(s.ms).padStart(6)} ms  ${s.summary}`);
  if (!agentRun.final) return { status: 'warn', note: `the agent did not call submit_review within ${agentRun.rounds} rounds, so ai-review would fall back to pipeline mode` };
  const used = new Set(agentRun.trace.filter((s) => s.ok).map((s) => s.tool)); // only calls that worked
  const wanted = ['list_items', 'compare_photos', 'submit_review'];
  const missing = wanted.filter((w) => !used.has(w));
  const memo = P.normalizeMemo(agentRun.final, ['i4']);
  out(`   summary: ${memo.admin_summary.join(' | ')}`);
  return missing.length
    ? { status: 'warn', note: `finished in ${agentRun.rounds} rounds but never used: ${missing.join(', ')}` }
    : { note: `finished in ${agentRun.rounds} rounds using ${used.size} different tools (${[...used].join(', ')})` };
});

// 8. does turning reasoning off help? (optional speed-up)
let thinkingNote = '';
await check('8. Is reasoning-off faster? (optional speed-up)', async () => {
  const ask = (thinking) => async () => {
    const t0 = Date.now();
    await nim.nemotron(TEXT, [{ role: 'user', content: 'Reply with JSON only: {"answer": 2+2}' }], { maxTokens: 400, thinking });
    return Date.now() - t0;
  };
  const normal = await ask(undefined)();
  let off;
  try {
    off = await ask(false)();
  } catch (e) {
    thinkingNote = 'leave NEMOTRON_ENABLE_THINKING unset (this model rejects the switch)';
    return { status: 'warn', note: `the switch is not accepted (${e.message.slice(0, 80)})` };
  }
  thinkingNote = off < normal * 0.8 ? 'set the secret NEMOTRON_ENABLE_THINKING=false' : 'no need to change anything';
  return { note: `default ${secs(normal)} vs reasoning off ${secs(off)}` };
});

// ───────────── verdict ─────────────
const slowest = Math.max(...results.map((r) => r.ms));
out('\n══════════ SUMMARY ══════════');
for (const r of results) out(`${r.status === 'pass' ? '✅' : r.status === 'warn' ? '⚠️ ' : '❌'} ${r.name}  (${secs(r.ms)})`);
const fails = results.filter((r) => r.status === 'fail');
const warns = results.filter((r) => r.status === 'warn');
const agentOk = !!agentRun?.final;
out('\nNVIDIA challenge criteria');
out(`  Multi-step workflow : ${agentOk ? `✅ ${agentRun.rounds} planning rounds, ${agentRun.trace.length} tool calls` : '⚠️  agent did not finish; pipeline mode is the fallback'}`);
out(`  Tool integration    : ${agentRun && new Set(agentRun.trace.filter((s) => s.ok).map((s) => s.tool)).size >= 3 ? '✅ the model chose and called tools itself' : '⚠️  tools were not used as designed'}`);
out(`  Vision inside agent : ${diff ? `✅ the compare_photos tool runs Nemotron vision (${vision.visionMode()} mode)` : '❌ the vision comparison failed'}`);

out('\nSecrets to set in Supabase → Edge Functions → Secrets');
out('  NVIDIA_API_KEY        = (your key)');
out(`  NEMOTRON_VLM_MODEL    = ${VLM}`);
out(`  NEMOTRON_TEXT_MODEL   = ${TEXT}`);
if (twoImages === 'no') out('  NEMOTRON_IMAGES_PER_REQUEST = 1      (optional: skips the rejected two-photo attempt every time)');
if (thinkingNote.startsWith('set')) out('  NEMOTRON_ENABLE_THINKING = false     (reasoning off: faster)');
if (slowest > 18_000) out('  NEMOTRON_TIMEOUT_MS   = 60000        (some calls took longer than the 20 s default)');

out(`\n${fails.length ? `❌ ${fails.length} check(s) failed.` : warns.length ? `✅ Nothing is broken. ${warns.length} note(s) above explain what the app adapts to.` : '✅ Everything works.'}`);
out('Copy this whole output and send it back. Your key is not in it.');
process.exit(fails.length ? 1 : 0);
