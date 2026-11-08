// Retry and time-limit rules of the Nemotron client, against a local fake of NVIDIA's chat API.
// Runs the real Edge Function code in Node 22.18+ (like scripts/verify-nvidia.mjs). No network, no API key.
//   npm test
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, test } from 'node:test';

// ── fake NVIDIA: each request takes the next scripted reply ──
let script = [];
let calls = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const sent = JSON.parse(body);
    calls.push(sent);
    const step = script.shift() ?? { content: '{}' };
    const timer = setTimeout(() => {
      if (step.status) {
        res.writeHead(step.status, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: step.error ?? 'error' }));
      }
      const message = step.tool_calls ? { role: 'assistant', content: null, tool_calls: step.tool_calls } : { role: 'assistant', content: step.content ?? '' };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message, finish_reason: step.finish ?? 'stop' }] }));
    }, step.delayMs ?? 5);
    res.on('close', () => clearTimeout(timer)); // the client aborted
  });
});

let nim, vision, agent;
before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  process.env.NIM_BASE_URL = `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
  process.env.NVIDIA_API_KEY = 'nvapi-test';
  delete process.env.NEMOTRON_ENABLE_THINKING;
  globalThis.Deno ??= { env: { get: (k) => process.env[k] } };
  nim = await import('../../supabase/functions/_shared/nemotron.ts');
  vision = await import('../../supabase/functions/_shared/vision.ts');
  agent = await import('../../supabase/functions/_shared/agent.ts');
});
after(() => server.close());
beforeEach(() => {
  script = [];
  calls = [];
  vision?.setSingleImageOnly(false);
});

const parse = (s) => JSON.parse(s);
const msgs = [{ role: 'user', content: 'Reply with JSON' }];
const timed = async (fn) => {
  const t = Date.now();
  try {
    return { value: await fn(), ms: Date.now() - t };
  } catch (error) {
    return { error, ms: Date.now() - t };
  }
};

test('a cut-off answer gets exactly one retry, with reasoning off and 3x the tokens', async () => {
  script = [{ content: '{"a":', finish: 'length' }, { content: '{"a":1}' }];
  const value = await nim.completeWithRetry('m', msgs, parse, { maxTokens: 1500 });
  assert.deepEqual(value, { a: 1 });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].max_tokens, 4500);
  assert.equal(calls[1].chat_template_kwargs?.enable_thinking, false);
});

test('an unreadable answer is retried once, then the error surfaces (2 calls, not 4)', async () => {
  script = [{ content: 'not json' }, { content: 'still not json' }, { content: '{"never":"asked"}' }];
  await assert.rejects(nim.completeWithRetry('m', msgs, parse));
  assert.equal(calls.length, 2);
});

test('a model that rejects the reasoning switch is retried without it', async () => {
  script = [{ content: '', finish: 'length' }, { status: 400, error: 'unknown field chat_template_kwargs' }, { content: '{"ok":true}' }];
  assert.deepEqual(await nim.completeWithRetry('m', msgs, parse), { ok: true });
  assert.equal(calls.length, 3);
  assert.equal(calls[2].chat_template_kwargs, undefined);
});

test('a slow answer is cut off at the shared deadline, not at the 20 s timeout', async () => {
  script = [{ delayMs: 15_000, content: '{}' }];
  const { error, ms } = await timed(() => nim.chat('m', msgs, { deadline: Date.now() + 3_500 }));
  assert.match(String(error?.message), /timed out after [34] s/);
  assert.ok(ms >= 3_000 && ms < 5_000, `took ${ms} ms`);
});

test('no call starts when too little time is left', async () => {
  const { error } = await timed(() => nim.chat('m', msgs, { deadline: Date.now() + 2_000 }));
  assert.ok(error instanceof nim.OutOfTimeError);
  assert.equal(calls.length, 0);
});

test('a retry that would not fit before the deadline is skipped', async () => {
  script = [{ delayMs: 1_500, content: '{"a":', finish: 'length' }];
  const { error, ms } = await timed(() => nim.completeWithRetry('m', msgs, parse, { deadline: Date.now() + 4_000 }));
  assert.ok(error instanceof nim.OutOfTimeError, String(error));
  assert.equal(calls.length, 1);
  assert.ok(ms < 2_500, `took ${ms} ms`);
});

test('one photo comparison makes at most 2 model calls when every answer is cut off', async () => {
  script = Array.from({ length: 6 }, () => ({ content: '{"suggested_status":', finish: 'length' }));
  const img = nim.imagePart('AAAA');
  await assert.rejects(vision.compareImages('vl', { item_name: 'Desk' }, img, img));
  assert.equal(calls.length, 2);
});

test('with a one-image model, the two-step comparison also obeys the deadline', async () => {
  vision.setSingleImageOnly(true);
  script = [{ delayMs: 15_000, content: '{}' }];
  const img = nim.imagePart('AAAA');
  const { error, ms } = await timed(() => vision.compareImages('vl', { item_name: 'Desk' }, img, img, { deadline: Date.now() + 3_500 }));
  assert.ok(error, 'expected a timeout');
  assert.equal(calls.length, 1);
  assert.ok(ms < 5_000, `took ${ms} ms`);
});

test("the agent's planning call obeys callDeadline", async () => {
  script = [{ delayMs: 15_000, content: '' }];
  const run = () => agent.runAgent({
    model: 'text', system: 's', task: 't', tools: [], finalTool: 'submit_review', summarize: () => '',
    deadline: Date.now() + 60_000, callDeadline: Date.now() + 3_500,
  });
  const { error, ms } = await timed(run);
  assert.match(String(error?.message), /timed out/);
  assert.ok(ms < 5_000, `took ${ms} ms`);
});

test('the agent stops at submit_review and records a trace', async () => {
  const call = (id, name, args = {}) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
  script = [
    { tool_calls: [call('1', 'list_items')] },
    { tool_calls: [call('2', 'submit_review', { admin_summary: ['done'], student_note: 'ok', dispute_briefs: [] })] },
  ];
  const tools = [{ def: { type: 'function', function: { name: 'list_items', description: '', parameters: { type: 'object', properties: {} } } }, run: () => [1, 2] }];
  const out = await agent.runAgent({
    model: 'text', system: 's', task: 't', tools, finalTool: 'submit_review', summarize: (t) => t,
    deadline: Date.now() + 60_000, callDeadline: Date.now() + 60_000,
  });
  assert.deepEqual(out.final.admin_summary, ['done']);
  assert.equal(out.rounds, 2);
  assert.deepEqual(out.trace.map((s) => s.tool), ['list_items', 'submit_review']);
});
