// Minimal tool-calling agent loop for Nemotron (OpenAI-compatible `tools` API).
// The model plans; code executes tools, enforces a step/time budget, and records a trace for the UI.
import { chat, type ChatMessage, type ToolDef } from './nemotron.ts';

export type Tool = { def: ToolDef; run: (args: Record<string, unknown>) => unknown };

export type TraceStep = {
  round: number;
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  ms: number;
  summary: string; // one line for the AiReviewPanel timeline
};

const MAX_RESULT_CHARS = 3000; // keeps tool results (and so prompt tokens) small

function parseArgs(raw: string): Record<string, unknown> {
  if (!raw?.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('tool arguments were not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('arguments must be an object');
  return parsed as Record<string, unknown>;
}

export async function runAgent(opts: {
  model: string;
  system: string;
  task: string;
  tools: Tool[];
  finalTool: string; // calling this tool ends the run; its arguments are the result
  summarize: (tool: string, args: Record<string, unknown>, result: unknown) => string;
  maxRounds?: number;
  deadline: number; // epoch ms; no new round starts if it can't finish in time
  callDeadline?: number; // epoch ms; every model call (planning included) ends by then, even mid-round
  roundTimeoutMs?: number;
}): Promise<{ final: Record<string, unknown> | null; trace: TraceStep[]; rounds: number }> {
  const { model, tools, finalTool, summarize, maxRounds = 6, deadline, callDeadline, roundTimeoutMs = 20_000 } = opts;
  const byName = new Map(tools.map((t) => [t.def.function.name, t]));
  const defs = tools.map((t) => t.def);
  const messages: ChatMessage[] = [
    { role: 'system', content: opts.system },
    { role: 'user', content: opts.task },
  ];
  const trace: TraceStep[] = [];
  let nudged = false;

  for (let round = 1; round <= maxRounds; round++) {
    // A round = one model call (≤ roundTimeoutMs) + its tools (vision calls ≤ 20 s). Stop early, not late.
    if (Date.now() + 2 * roundTimeoutMs > deadline) break;

    const reply = await chat(model, messages, { tools: defs, maxTokens: 1000, timeoutMs: roundTimeoutMs, deadline: callDeadline });

    if (reply.tool_calls.length === 0) {
      if (nudged) break;
      nudged = true; // one reminder, then give up and let the caller fall back
      messages.push({ role: 'assistant', content: reply.content || '' });
      messages.push({ role: 'user', content: `Use the tools. Call ${finalTool} when the review is complete.` });
      continue;
    }

    messages.push({ role: 'assistant', content: reply.content || null, tool_calls: reply.tool_calls });

    // Run every tool the model asked for this round in parallel.
    const outcomes = await Promise.all(reply.tool_calls.map(async (call) => {
      const started = Date.now();
      const name = call.function?.name ?? '';
      let args: Record<string, unknown> = {};
      try {
        args = parseArgs(call.function?.arguments ?? '');
        if (name === finalTool) return { call, name, args, ok: true, result: { accepted: true }, ms: 0 };
        const tool = byName.get(name);
        if (!tool) throw new Error(`unknown tool ${name}`);
        const result = await tool.run(args);
        return { call, name, args, ok: true, result, ms: Date.now() - started };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return { call, name, args, ok: false, result: { error }, ms: Date.now() - started };
      }
    }));

    let final: Record<string, unknown> | null = null;
    for (const o of outcomes) {
      trace.push({
        round, tool: o.name, args: o.name === finalTool ? {} : o.args, ok: o.ok, ms: o.ms,
        summary: o.ok ? summarize(o.name, o.args, o.result) : `failed: ${(o.result as { error: string }).error}`,
      });
      messages.push({
        role: 'tool',
        tool_call_id: o.call.id,
        content: JSON.stringify(o.result).slice(0, MAX_RESULT_CHARS),
      });
      if (o.name === finalTool && o.ok) final = o.args;
    }
    if (final) return { final, trace, rounds: round };
  }
  return { final: null, trace, rounds: trace.length ? trace[trace.length - 1].round : 0 };
}
