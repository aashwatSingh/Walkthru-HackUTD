#!/usr/bin/env node
// Try Walkthrough's Nemotron prompts on local photos, no Supabase needed.
// Uses the SAME prompts as the Edge Functions (supabase/functions/_shared/prompts.js).
//
//   export NVIDIA_API_KEY=nvapi-...                 # from build.nvidia.com
//   node scripts/test-nemotron.mjs models            # list Nemotron models your key can call
//   export NEMOTRON_VLM_MODEL=nvidia/<vision-model>  NEMOTRON_TEXT_MODEL=nvidia/<text-model>
//   node scripts/test-nemotron.mjs photo public/seed/blinds.jpg "Window Blinds & Slats" "Lower blinds completely..."
//   node scripts/test-nemotron.mjs photo new.jpg "Window Blinds & Slats" "Lower blinds..." public/seed/blinds.jpg
//   node scripts/test-nemotron.mjs diff public/seed/blinds.jpg public/seed/blinds-broken.jpg "Window Blinds & Slats" 45
//   node scripts/test-nemotron.mjs memo
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import {
  applyFees, damageDiffMessages, memoMessages, normalizeDiff, normalizeMemo,
  normalizePhotoCheck, parseModelJson, photoCheckMessages,
} from '../supabase/functions/_shared/prompts.js';

const BASE = (process.env.NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1/chat/completions').replace(/\/chat\/completions$/, '');
const KEY = process.env.NVIDIA_API_KEY;
const [cmd, ...args] = process.argv.slice(2);

function need(name) {
  if (!process.env[name]) { console.error(`Set ${name} first (see the top of this file).`); process.exit(1); }
  return process.env[name];
}

async function image(path) {
  const mime = { '.png': 'image/png', '.webp': 'image/webp' }[extname(path).toLowerCase()] ?? 'image/jpeg';
  const bytes = await readFile(path);
  if (bytes.length > 250_000) console.warn(`⚠️  ${path} is ${Math.round(bytes.length / 1000)} KB (spec: seed photos < 250 KB)`);
  return { type: 'image_url', image_url: { url: `data:${mime};base64,${bytes.toString('base64')}` } };
}

async function chat(model, messages, maxTokens = 1500) {
  const started = Date.now();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: maxTokens, stream: false }),
    signal: AbortSignal.timeout(20_000), // same 20 s budget as the Edge Functions
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 600)}`);
  const answer = JSON.parse(body).choices?.[0]?.message?.content ?? '';
  console.log(`\n── raw answer from ${model} (${((Date.now() - started) / 1000).toFixed(1)} s) ──\n${answer}\n`);
  return answer;
}

const show = (label, value) => console.log(`── ${label} ──\n${JSON.stringify(value, null, 2)}`);

try {
  need('NVIDIA_API_KEY');
  if (cmd === 'models') {
    const res = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${KEY}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const ids = (await res.json()).data.map((m) => m.id).filter((id) => /nemotron/i.test(id)).sort();
    console.log(ids.join('\n') || 'No Nemotron models found for this key.');
    console.log('\nVision models usually have "vl" in the name → NEMOTRON_VLM_MODEL. Pick a text one → NEMOTRON_TEXT_MODEL.');
  } else if (cmd === 'photo') {
    const [photoPath, itemName, instruction, referencePath] = args;
    if (!photoPath || !itemName || !instruction) throw new Error('Usage: photo <image> "<item name>" "<instruction>" [move-in reference image]');
    const reference = referencePath ? await image(referencePath) : null;
    const answer = await chat(need('NEMOTRON_VLM_MODEL'),
      photoCheckMessages({ item_name: itemName, instruction_text: instruction }, await image(photoPath), reference), 1200);
    show('what the app will show (normalized)', normalizePhotoCheck(parseModelJson(answer), !!reference));
  } else if (cmd === 'diff') {
    const [beforePath, afterPath, itemName, charge = '85'] = args;
    if (!beforePath || !afterPath || !itemName) throw new Error('Usage: diff <move-in image> <move-out image> "<item name>" [standard charge]');
    const item = { item_name: itemName, before_notes: '', after_notes: '',
      before_captured_at: '2026-08-18T15:14:00Z', after_captured_at: '2026-11-07T15:30:00Z' };
    const answer = await chat(need('NEMOTRON_VLM_MODEL'), damageDiffMessages(item, await image(beforePath), await image(afterPath)));
    show('suggestion + fee (normalized)', applyFees(normalizeDiff(parseModelJson(answer)), Number(charge)));
  } else if (cmd === 'memo') {
    const unit = { unit_code: 'FH-304B', building_name: 'Founders Hall', room_number: '304-B', assigned_student_name: 'Alex Rivera' };
    const items = [
      { item_id: 'desk', item_name: 'Study Desk Surface', condition_status: 'UNREVIEWED', before: { notes: 'Deep scratch, front-left corner', captured_at: '2026-08-18T15:14:00Z' },
        after: { notes: 'Same scratch', captured_at: '2026-11-07T15:30:00Z' }, ai: { suggested_status: 'PRE_EXISTING_DAMAGE', waived_if_pre_existing: 85 } },
      { item_id: 'sink', item_name: 'Porcelain Sink', condition_status: 'DISPUTE_UNDER_REVIEW', estimated_fine: 120,
        before: { notes: 'Hairline crack near drain', captured_at: '2026-08-18T15:19:00Z' }, after: { notes: 'Same crack', captured_at: '2026-11-07T15:36:00Z' },
        dispute_reason: 'Crack was documented at move-in.', ai: { suggested_status: 'PRE_EXISTING_DAMAGE', confidence: 0.82 } },
    ];
    const answer = await chat(need('NEMOTRON_TEXT_MODEL'), memoMessages(unit, items), 2000);
    show('memo (normalized)', normalizeMemo(parseModelJson(answer), ['sink']));
  } else {
    console.log('Commands: models | photo | diff | memo  (examples at the top of scripts/test-nemotron.mjs)');
  }
} catch (err) {
  console.error(`\n❌ ${err.message}`);
  if (/did not return JSON/.test(err.message)) console.error('   The model answered in prose. Try another model, or tighten the prompt in prompts.js.');
  if (/HTTP 4\d\d/.test(err.message)) console.error('   Check the API key and the model ID (run: node scripts/test-nemotron.mjs models).');
  process.exit(1);
}
