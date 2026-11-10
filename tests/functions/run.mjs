#!/usr/bin/env node
// Edge Function tests: runs the REAL ai-review, photo-check and register-evidence code under Deno against a local fake of
// Supabase + NVIDIA (fake-supabase.mjs). No accounts, no API key, nothing leaves your machine.
//   npm run test:functions     (uses `deno` if installed, otherwise downloads it once through npx)
// The functions listen on port 8000 while the test runs.
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
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
    check('A student note with instructions for the AI sends the item to a human', by.i3?.suggested_status === 'NEEDS_HUMAN_REVIEW' && by.i3?.note_flag === true && by.i3?.suggested_fine === 0, JSON.stringify(by.i3));
    check('...and the model never sees that note through the agent tools', !s.nimCalls.some((c) => c.sawInjection));
    check('Unknown tools and broken arguments are recorded, not fatal', r.body.agent?.trace?.filter((t) => !t.ok).length >= 2);
    check("The agent's summary is returned", r.body.memo?.admin_summary?.length > 0);
    check('Text model never receives photos', s.nimCalls.filter((c) => c.model === 'nvidia/test-text').every((c) => c.images === 0));
    check('Results are saved (4 item reviews + 1 unit report)', s.reviews.filter((x) => x.kind === 'DAMAGE_DIFF').length === 4 && s.reports.length === 1);

    check('Each run is counted against the admin\'s hourly allowance', s.rateCalls.length === 1 && s.rateCalls[0].p_action === 'ai-review' && s.rateCalls[0].p_subject === 'admin-1', JSON.stringify(s.rateCalls));
    await ctl({ reset: true, rateLimited: true });
    r = await post('admin-token', { unitId: 'u1' });
    s = await ctl();
    check('Over the hourly limit: 429, and NVIDIA is not called', r.status === 429 && s.nimCalls.length === 0, `${r.status} ${s.nimCalls.length}`);

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
    check('...and the student sees a plain message, not the upstream error', !/upstream|Nemotron|exploded/i.test(JSON.stringify(r.body)), JSON.stringify(r.body));
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

  await withFunction('register-evidence', async () => {
    await ctl({ reset: true });
    const sha = (buf) => createHash('sha256').update(buf).digest('hex');
    const calls = async () => (await ctl()).registered;
    const refused = async (name, tokenName, body, status, message) => {
      const before = (await calls()).length;
      const r = await post(tokenName, body);
      check(name, r.status === status && (!message || message.test(r.body.error ?? '')) && (await calls()).length === before, `${r.status} ${JSON.stringify(r.body)}`);
    };

    // The happy path: the fingerprint is the SHA-256 of the bytes Storage returns for that path, nothing else.
    const photo = randomBytes(2048);
    const P1 = 'u3/r1/before-1700000000001.jpg';
    await ctl({ files: { [P1]: { base64: photo.toString('base64') } } });
    let r = await post('student-token', { itemId: 'r1', phase: 'before', path: P1, sha256: 'f'.repeat(64), before_sha256: 'f'.repeat(64), mediaType: 'video' });
    let s = await ctl();
    const call = s.registered[0];
    check('The fingerprint is the SHA-256 of the bytes the function downloaded', r.status === 200 && call?.p_sha256 === sha(photo), `${r.status} ${JSON.stringify(r.body)}`);
    check('...a fingerprint or type sent by the caller is ignored', r.body.before_sha256 === sha(photo) && r.body.before_media_type === 'image' && !JSON.stringify(call).includes('ffff'));
    check('...the file is read and the row written with the service role, for the caller it authenticated',
      s.downloads.some((d) => d.path === P1 && d.by === 'service-key') && call?.p_item_id === 'r1' && call?.p_phase === 'before' && call?.p_path === P1
      && call?.p_email === 'alex.rivera@university.edu' && call?.p_user_id === 'stu-1', JSON.stringify(call));
    check('...and the updated row comes back', r.body.id === 'r1' && r.body.before_media_path === P1 && !!r.body.before_captured_at);

    const other = randomBytes(4096);
    const P2 = 'u3/r2/before-1700000000002.jpg';
    await ctl({ files: { [P2]: { base64: other.toString('base64') } } });
    r = await post('student-token', { itemId: 'r2', phase: 'before', path: P2 });
    check('A different file gets a different fingerprint', r.status === 200 && r.body.before_sha256 === sha(other) && sha(other) !== sha(photo));

    const clip = randomBytes(8192);
    const V = 'u5/r4/after-1700000000003.mp4';
    await ctl({ files: { [V]: { base64: clip.toString('base64') } } });
    r = await post('student-token', { itemId: 'r4', phase: 'after', path: V });
    check('Move-out video: fingerprinted, stored as a video', r.status === 200 && r.body.after_sha256 === sha(clip) && r.body.after_media_type === 'video', JSON.stringify(r.body));

    // Who may register, and when
    await refused('Not signed in: 401', 'nobody', { itemId: 'r1', phase: 'before', path: P1 }, 401);
    await refused("Another student's item: 404 (row security hides it)", 'other-token', { itemId: 'r1', phase: 'before', path: P1 }, 404);
    await refused('...and the other way round', 'student-token', { itemId: 'r5', phase: 'before', path: 'u6/r5/before-1700000000001.jpg' }, 404);
    await refused("A housing admin cannot add evidence to a student's item: 403", 'admin-token', { itemId: 'r1', phase: 'before', path: P1 }, 403, /assigned student/);
    await refused('Move-in is locked: 409', 'student-token', { itemId: 'r3', phase: 'before', path: 'u4/r3/before-1700000000001.jpg' }, 409, /locked/);
    await refused('Move-out has not opened yet: 409', 'student-token', { itemId: 'r3', phase: 'after', path: 'u4/r3/after-1700000000001.jpg' }, 409, /not open/);
    await refused('A move-in photo while move-out is open: 409', 'student-token', { itemId: 'r4', phase: 'before', path: 'u5/r4/before-1700000000001.jpg' }, 409, /locked/);
    await refused('A move-out photo while move-in is open: 409', 'student-token', { itemId: 'r1', phase: 'after', path: 'u3/r1/after-1700000000001.jpg' }, 409, /not open/);

    // Which file
    const wrongPath = (name, path, body = {}) => refused(name, 'student-token', { itemId: 'r1', phase: 'before', path, ...body }, 400, /uploaded for this item/);
    await wrongPath("A path in another item's folder: 400", P2);
    await wrongPath('A path for the other phase: 400', 'u3/r1/after-1700000000001.jpg');
    await wrongPath("A path in another unit's folder: 400", 'u6/r5/before-1700000000001.jpg');
    await wrongPath('A path that climbs out of the folder: 400', 'u3/r1/before-1700000000001.jpg/../../r2/before-1700000000002.jpg');
    await wrongPath('A seed photo: 400', '/seed/door.jpg');
    await wrongPath('A file type the app never produces: 400', 'u3/r1/before-1700000000001.svg');
    s = await ctl();
    check('...and none of those files was even downloaded', s.downloads.length === 3, JSON.stringify(s.downloads));

    await ctl({ files: { 'u3/r1/before-1700000000009.jpg': null } });
    await refused('A file that was never uploaded: 409', 'student-token', { itemId: 'r1', phase: 'before', path: 'u3/r1/before-1700000000009.jpg' }, 409, /Upload the file first/);
    await ctl({ files: { 'u3/r1/before-1700000000008.jpg': { size: 5 * 1024 * 1024 + 1 } } });
    await refused('A "photo" over 5 MB: 413', 'student-token', { itemId: 'r1', phase: 'before', path: 'u3/r1/before-1700000000008.jpg' }, 413, /5 MB/);
    await refused('Missing path: 400', 'student-token', { itemId: 'r1', phase: 'before' }, 400);
    await refused('A phase that does not exist: 400', 'student-token', { itemId: 'r1', phase: 'during', path: P1 }, 400);

    // Rationing: each call downloads a file
    await ctl({ rateLimited: true });
    const downloadsBefore = (await ctl()).downloads.length;
    await refused('Over the rate limit: 429', 'student-token', { itemId: 'r1', phase: 'before', path: 'u3/r1/before-1700000000006.jpg' }, 429, /Too many uploads/);
    check('...and the file is not downloaded', (await ctl()).downloads.length === downloadsBefore);
    await ctl({ rateLimited: 'missing' });
    r = await post('student-token', { itemId: 'r1', phase: 'before', path: 'u3/r1/before-1700000000005.jpg' });
    await ctl({ rateLimited: false });
    check('Limiter not installed yet (migration 010 not run): uploads still work', r.status === 200, `${r.status} ${JSON.stringify(r.body)}`);

    // The database has the last word (e.g. the student locked the inspection while the file was being hashed).
    await ctl({ registerError: 'Move-in inspection is locked' });
    r = await post('student-token', { itemId: 'r1', phase: 'before', path: 'u3/r1/before-1700000000007.jpg' });
    await ctl({ registerError: null });
    check('The database refuses at the last step: 409 with its message', r.status === 409 && r.body.error === 'Move-in inspection is locked', `${r.status} ${JSON.stringify(r.body)}`);
  });
} catch (err) {
  failed++;
  console.error(`\n${err.message}`);
} finally {
  fake.close();
}
console.log(`\n${passed}/${passed + failed} function checks passed`);
process.exit(failed ? 1 : 0);
