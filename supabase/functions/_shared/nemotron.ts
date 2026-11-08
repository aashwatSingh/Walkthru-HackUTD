// Thin client for NVIDIA's OpenAI-compatible chat completions API (Nemotron models).
// The API key lives only in Edge Function secrets; it never reaches the browser.

const NIM_URL = Deno.env.get('NIM_BASE_URL') ?? 'https://integrate.api.nvidia.com/v1/chat/completions';

// Low temperature + top_p for deterministic JSON and tool selection.
export const SAMPLING = { temperature: 0.1, top_p: 0.9 } as const;

// Per-call timeout (spec: 20 s). Reasoning models can be slower: raise it with the NEMOTRON_TIMEOUT_MS secret.
export const DEFAULT_TIMEOUT_MS = Number(Deno.env.get('NEMOTRON_TIMEOUT_MS')) || 20_000;

// Nemotron 3.5 can "think" before answering, which adds seconds per call. NEMOTRON_ENABLE_THINKING=false turns
// that off (sent as chat_template_kwargs.enable_thinking). Unset = don't send anything (works with any model).
const thinkingFromEnv = (): boolean | undefined => {
  const v = Deno.env.get('NEMOTRON_ENABLE_THINKING')?.toLowerCase();
  return v === 'true' ? true : v === 'false' ? false : undefined;
};

export const VLM_MODEL = () => requireEnv('NEMOTRON_VLM_MODEL');
export const TEXT_MODEL = () => requireEnv('NEMOTRON_TEXT_MODEL');

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing Edge Function secret ${name}`);
  return value;
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };

export type ChatMessage = {
  role: string;
  content: unknown;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

export type ToolDef = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export const imagePart = (base64: string, mime = 'image/jpeg'): ContentPart => ({
  type: 'image_url',
  image_url: { url: `data:${mime};base64,${base64}` },
});

/** Raised for HTTP errors so callers can tell "model doesn't support tools" (4xx) from outages. */
export class NemotronHttpError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`Nemotron ${status}: ${body.slice(0, 500)}`);
    this.status = status;
  }
}

// One chat completion. Every call gets its own AbortController timeout (default 20 s),
// so one slow model response can't hang a whole function run.
export async function chat(
  model: string,
  messages: ReadonlyArray<ChatMessage>,
  { maxTokens = 1500, timeoutMs = DEFAULT_TIMEOUT_MS, tools, thinking = thinkingFromEnv() }:
    { maxTokens?: number; timeoutMs?: number; tools?: ToolDef[]; thinking?: boolean } = {},
): Promise<{ content: string; tool_calls: ToolCall[]; finish_reason: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(NIM_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requireEnv('NVIDIA_API_KEY')}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        ...SAMPLING,
        max_tokens: maxTokens,
        stream: false,
        ...(thinking !== undefined ? { chat_template_kwargs: { enable_thinking: thinking } } : {}),
        ...(tools ? { tools, tool_choice: 'auto' } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new NemotronHttpError(res.status, await res.text());
    const choice = (await res.json())?.choices?.[0] ?? {};
    const message = choice.message ?? {};
    return {
      content: typeof message.content === 'string' ? message.content : '',
      tool_calls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
      finish_reason: String(choice.finish_reason ?? ''),
    };
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`Nemotron timed out after ${timeoutMs / 1000} s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Plain completion that must return text (vision checks, fallback memo).
// A reasoning model can spend its whole token budget thinking, so the answer arrives CUT OFF (finish_reason
// "length") or empty. Retry once with 3x the budget and reasoning off, instead of failing on half a JSON.
export async function nemotron(
  model: string,
  messages: ReadonlyArray<ChatMessage>,
  options: { maxTokens?: number; timeoutMs?: number; thinking?: boolean } = {},
): Promise<string> {
  const first = await chat(model, messages, options);
  if (first.finish_reason !== 'length' && first.content.trim()) return first.content;

  const maxTokens = Math.min((options.maxTokens ?? 1500) * 3, 6000);
  let second;
  try {
    second = await chat(model, messages, { ...options, maxTokens, thinking: false });
  } catch (err) {
    // A model that rejects the reasoning switch (HTTP 400): retry with just the bigger budget.
    if (!(err instanceof NemotronHttpError) || err.status !== 400) throw err;
    second = await chat(model, messages, { ...options, maxTokens });
  }
  if (!second.content.trim()) throw new Error('Nemotron returned an empty answer');
  return second.content;
}
