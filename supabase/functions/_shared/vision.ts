// Vision calls (damage comparison and the photo coach) with an automatic fallback for models that accept
// only ONE image per request. Plain TypeScript with no Supabase imports, so scripts/verify-nvidia.mjs
// runs this exact code from Node.
import { type ContentPart, NemotronHttpError, nemotron } from './nemotron.ts';
import {
  damageDiffMessages,
  describePhotoMessages,
  diffAgainstDescriptionMessages,
  normalizeDiff,
  normalizePhotoCheck,
  parseModelJson,
  photoCheckMessages,
} from './prompts.mjs';

export type DiffItem = {
  item_name: string;
  before_notes?: string | null;
  after_notes?: string | null;
  before_captured_at?: string | null;
  after_captured_at?: string | null;
};

// True once we know the model takes one image per request: set by the NEMOTRON_IMAGES_PER_REQUEST=1 secret,
// or learned the first time NVIDIA rejects a two-image request (then later calls skip the failing attempt).
let singleImageOnly = Deno.env.get('NEMOTRON_IMAGES_PER_REQUEST') === '1';
export const visionMode = (): 'multi-image' | 'single-image' => (singleImageOnly ? 'single-image' : 'multi-image');
export const setSingleImageOnly = (value: boolean) => {
  singleImageOnly = value;
};

// Ask for JSON; if the answer can't be read (cut off or malformed), ask once more with reasoning off and twice
// the token budget. Seen on the real API: one of four comparisons came back cut off mid-JSON.
async function askJson(model: string, messages: Parameters<typeof nemotron>[1], maxTokens = 1500) {
  const first = await nemotron(model, messages, { maxTokens });
  try {
    return parseModelJson(first);
  } catch {
    let second: string;
    try {
      second = await nemotron(model, messages, { maxTokens: maxTokens * 2, thinking: false });
    } catch (err) {
      if (!(err instanceof NemotronHttpError) || err.status !== 400) throw err; // model rejects the reasoning switch
      second = await nemotron(model, messages, { maxTokens: maxTokens * 2 });
    }
    return parseModelJson(second); // still unreadable → the error quotes what the model said
  }
}

// A 4xx that is not auth (401/403), a wrong model ID (404) or rate limiting (429) means "this request shape
// isn't accepted", for example more than one image.
export const rejectsRequestShape = (err: unknown) =>
  err instanceof NemotronHttpError && [400, 413, 415, 422].includes(err.status);

/** Move-in vs move-out comparison. One call with both photos; two calls if the model takes one image at a time. */
export async function compareImages(model: string, item: DiffItem, before: ContentPart, after: ContentPart) {
  if (!singleImageOnly) {
    try {
      return normalizeDiff(await askJson(model, damageDiffMessages(item, before, after)));
    } catch (err) {
      if (!rejectsRequestShape(err)) throw err;
      singleImageOnly = true;
    }
  }
  // Step 1: describe the move-in photo. Step 2: judge the move-out photo against that description.
  const described = await askJson(model, describePhotoMessages(item, before, 'MOVE-IN'), 800);
  return normalizeDiff(await askJson(model, diffAgainstDescriptionMessages(item, after, described)));
}

/** Capture Coach. At move-out the move-in photo is a reference; with a one-image model the reference is dropped. */
export async function checkPhoto(
  model: string,
  item: { item_name: string; instruction_text: string },
  photo: ContentPart,
  reference: ContentPart | null,
) {
  const useReference = !!reference && !singleImageOnly;
  try {
    return normalizePhotoCheck(await askJson(model, photoCheckMessages(item, photo, useReference ? reference : null), 1200), useReference);
  } catch (err) {
    if (!useReference || !rejectsRequestShape(err)) throw err;
    singleImageOnly = true;
  }
  return normalizePhotoCheck(await askJson(model, photoCheckMessages(item, photo, null), 1200), false);
}
