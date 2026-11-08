#!/usr/bin/env node
// Edge Function tests: runs the REAL ai-review and photo-check code under Deno against a local fake of
// Supabase + NVIDIA (fake-supabase.mjs). No accounts, no API key, nothing leaves your machine.
//   npm run test:functions     (uses `deno` if installed, otherwise downloads it once through npx)
// The functions listen on port 8000 while the test runs.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFake } from './fake-supabase.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const FAKE_PORT = 54399;
const FAKE = `http://127.0.0.1:${FAKE_PORT}`;
const FN = 'http://127.0.0.1:8000';
const win = process.platform === 'win32';

// The Deno binary itself (not an npx wrapper, so stopping it really stops it): DENO_BIN, `deno` on PATH,
// or the one npx downloads, asked for its own path.
function findDeno() {
  if (process.env.DENO_BIN) return process.env.DENO_BIN;
  const probe = spawnSync('deno', ['--version'], { shell: win, stdio: 'ignore' });
  if (!probe.error && probe.status === 0) return 'deno';
  console.log('Deno is not installed; fetching it once through npx…');
  const r = spawnSync('npx', ['--yes', 'deno@2', 'eval', 'console.log(Deno.execPath())'], { shell: win, encoding: 'utf8' });
  const found = r.stdout?.trim().split(/\r?\n/).pop();
  if (r.status !== 0 || !found) throw new Error(`Could not get Deno through npx:\n${r.stderr ?? ''}`);
  return found;
}
const DENO = findDeno();

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  ok ? passed++ : failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  → ${detail}` : ''}`);
};
const ctl = async (patch) => (await fetch(`${FAKE}/__ctl`, patch ? { method: 'POST', body: JSON.stringify(patch) } : undefined)).json();
const post = async (tokenName, body) => {
  const r = await fetch(FN, { method: 'POST', headers: { Authorization: `Bearer ${tokenName}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

async function withFunction(name, fn) {
  const env = {
    ...process.env, SUPABASE_URL: FAKE, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service-key', NVIDIA_API_KEY: 'nvapi-test',
    NEMOTRON_VLM_MODEL: 'nvidia/test-vl', NEMOTRON_TEXT_MODEL: 'nvidia/test-text', NIM_BASE_URL: `${FAKE}/nim/v1/chat/completions`,
    PUBLIC_SITE_URL: FAKE, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost', DENO_NO_UPDATE_CHECK: '1',
  };
  // Something else on port 8000 would answer instead of the function under test.
  const portBusy = await fetch(FN, { method: 'OPTIONS' }).then(() => true, () => false);
  if (portBusy) throw new Error('Port 8000 is already in use. Stop whatever runs there and try again.');
  const child = spawn(DENO, ['run', '-q', '--allow-net', '--allow-env', '--allow-read', `${name}/index.ts`],
    { cwd: path.join(root, 'supabase', 'functions'), env, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  try {
    for (let end = Date.now() + 120_000; ; await new Promise((r) => setTimeout(r, 300))) {
      try {
        if ((await fetch(FN, { method: 'OPTIONS' })).ok) break;
      } catch { /* starting */ }
      if (child.exitCode !== null || Date.now() > end) throw new Error(`${name} did not start:\n${stderr.slice(-2000)}`);
    }
    console.log(`\n── ${name}`);
    await fn();
  } finally {
    child.kill();
    await new Promise((r) => (child.exitCode !== null ? r() : child.on('exit', r)));
  }
}

// Same id photo-check derives for "this item's photo": SHA-256 → UUID layout.
const claimId = (text) => {
  const b = createHash('sha256').update(text).digest().subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

const fake = await startFake(FAKE_PORT);
try {
  await withFunction('ai-review', async () => {
    await ctl({ reset: true });
    let r = await post('student-token', { unitId: 'u1' });
    check('Students are refused (admins only)', r.status === 403, JSON.stringify(r.body));

    r = await post('admin-token', { unitId: 'u1' });
    const by = Object.fromEntries((r.body.items ?? []).map((i) => [i.item_id, i]));
    let s = await ctl();
    check('Agent run completes in agent mode', r.status === 200 && r.body.mode === 'agent', `${r.status} ${r.body.mode} ${r.body.error ?? ''}`);
    check('New damage is priced by the fee schedule, not the model', by.i1?.suggested_status === 'NEW_DAMAGE_BILLABLE' && by.i1?.suggested_fine === 22.5, JSON.stringify(by.i1));
    check('A failing vision call becomes "needs human review"', by.i2?.suggested_status === 'NEEDS_HUMAN_REVIEW' && /500/.test(by.i2?.error ?? ''), JSON.stringify(by.i2));
    check('Videos are skipped, not guessed', by.i4?.suggested_status === 'NEEDS_HUMAN_REVIEW' && !!by.i4?.skipped);
    check('Unknown tools and broken arguments are recorded, not fatal', r.body.agent?.trace?.filter((t) => !t.ok).length >= 2);
    check("The agent's summary is returned", r.body.memo?.admin_summary?.length > 0);
    check('Text model never receives photos', s.nimCalls.filter((c) => c.model === 'nvidia/test-text').every((c) => c.images === 0));
    check('Results are saved (4 item reviews + 1 unit report)', s.reviews.filter((x) => x.kind === 'DAMAGE_DIFF').length === 4 && s.reports.length === 1);

    await ctl({ reset: true, agent: 'notools' });
    r = await post('admin-token', { unitId: 'u1' });
    check('Model without tool calling → fixed pipeline with a summary', r.body.mode === 'pipeline' && /tools/.test(r.body.agent?.fallback_reason ?? '') && r.body.memo?.admin_summary?.length > 0,
      `${r.body.mode} ${r.body.agent?.fallback_reason}`);
  });

  await withFunction('photo-check', async () => {
    await ctl({ reset: true });
    const nimCount = async () => (await ctl()).nimCalls.length;

    let r = await post('student-token', { itemId: 'p1', phase: 'before' });
    let s = await ctl();
    const row = s.reviews.find((x) => x.id === claimId('p1:PHOTO_CHECK_BEFORE:u1/p1/before-1.jpg'));
    check('First check returns the coach result', r.status === 200 && !!r.body.retake_tip, `${r.status} ${JSON.stringify(r.body)}`);
    check('...saved under the photo’s own id, finished', !!row && !row.result.pending);

    r = await post('student-token', { itemId: 'p1', phase: 'before' });
    check('Same photo again: saved answer, no new NVIDIA call', r.status === 200 && r.body.retake_tip === row?.result.retake_tip && (await nimCount()) === 1);

    await ctl({ photoDelayMs: 1500 });
    const pair = await Promise.all([post('student-token', { itemId: 'p3', phase: 'before' }), post('student-token', { itemId: 'p3', phase: 'before' })]);
    await ctl({ photoDelayMs: 20 });
    check('Two requests at once: one runs (200), one is refused (429)', pair.map((x) => x.status).sort().join(',') === '200,429', pair.map((x) => x.status).join(','));
    check('...and NVIDIA is called once for the pair', (await nimCount()) === 2);

    await ctl({ addReviews: Array.from({ length: 12 }, (_, n) => ({ id: `cap-${n}`, item_id: 'p3', kind: 'PHOTO_CHECK_AFTER', model: 'm', result: { ok: true }, created_at: new Date().toISOString() })) });
    r = await post('student-token', { itemId: 'p3', phase: 'after' });
    check('12 checks for one item: the coach goes quiet (skipped, no NVIDIA call)', r.status === 200 && r.body.skipped === true && (await nimCount()) === 2, JSON.stringify(r.body));

    await ctl({ photoNim: 'fail' });
    r = await post('student-token', { itemId: 'p2', phase: 'before' });
    await ctl({ photoNim: 'ok' });
    s = await ctl();
    check('NVIDIA failure: 502, and the photo is released for a retry', r.status === 502 && !s.reviews.some((x) => x.id === claimId('p2:PHOTO_CHECK_BEFORE:u1/p2/before-1.jpg')));
    r = await post('student-token', { itemId: 'p2', phase: 'before' });
    check('...the next request runs the check', r.status === 200 && !!r.body.retake_tip);

    const now = new Date().toISOString();
    const old = new Date(Date.now() - 120_000).toISOString();
    await ctl({ addReviews: [
      { id: claimId('p1:PHOTO_CHECK_AFTER:u1/p1/after-1.jpg'), item_id: 'p1', kind: 'PHOTO_CHECK_AFTER', model: 'm', result: { pending: true }, created_at: now },
      { id: claimId('p4:PHOTO_CHECK_BEFORE:u1/p4/before-1.jpg'), item_id: 'p4', kind: 'PHOTO_CHECK_BEFORE', model: 'm', result: { pending: true }, created_at: old },
    ] });
    r = await post('student-token', { itemId: 'p1', phase: 'after' });
    check('A check already running for this photo: 429', r.status === 429, String(r.status));
    r = await post('student-token', { itemId: 'p4', phase: 'before' });
    check('A claim left by a crashed run (>90 s): replaced and checked', r.status === 200 && !!r.body.retake_tip, String(r.status));

    r = await post('student-token', { itemId: 'p2', phase: 'after' });
    check('No photo for this phase yet: 409', r.status === 409);
    r = await post('nobody', { itemId: 'p1', phase: 'before' });
    check('Not signed in: 401', r.status === 401);
  });
} catch (err) {
  failed++;
  console.error(`\n${err.message}`);
} finally {
  fake.close();
}
console.log(`\n${passed}/${passed + failed} function checks passed`);
process.exit(failed ? 1 : 0);
