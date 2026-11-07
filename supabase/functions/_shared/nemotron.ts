// Thin client for NVIDIA's OpenAI-compatible chat completions API (Nemotron models).
// The API key lives only in Edge Function secrets; it never reaches the browser.

const NIM_URL = Deno.env.get('NIM_BASE_URL') ?? 'https://integrate.api.nvidia.com/v1/chat/completions';

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

export type Message = { role: 'system' | 'user' | 'assistant'; content: string | ContentPart[] };

export const imagePart = (base64: string, mime = 'image/jpeg'): ContentPart => ({
  type: 'image_url',
  image_url: { url: `data:${mime};base64,${base64}` },
});

export const textPart = (text: string): ContentPart => ({ type: 'text', text });

// Every call gets its own AbortController timeout (default 20 s), so one slow
// model response can't hang a whole function run.
export async function nemotron(
  model: string,
  messages: ReadonlyArray<{ role: string; content: unknown }>,
  { maxTokens = 1500, timeoutMs = 20_000 }: { maxTokens?: number; timeoutMs?: number } = {},
): Promise<string> {
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
      body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: maxTokens, stream: false }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Nemotron ${res.status}: ${(await res.text()).slice(0, 500)}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('Nemotron returned an empty answer');
    return content;
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`Nemotron timed out after ${timeoutMs / 1000} s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
