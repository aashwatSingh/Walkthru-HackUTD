// Vision calls (damage comparison and the photo coach) with an automatic fallback for models that accept
// only ONE image per request. Plain TypeScript with no Supabase imports, so scripts/verify-nvidia.mjs
// runs this exact code from Node.
import { type CallOptions, type ChatMessage, type ContentPart, completeWithRetry, NemotronHttpError } from './nemotron.ts';
import {
  damageDiffMessages,
  describePhotoMessages,
  diffAgainstDescriptionMessages,
  normalizeDiff,
  normalizePhotoCheck,
  parseModelJson,
  photoCheckMessages,
  reviewNoteRisk,
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

// Ask for JSON. A cut-off, empty or unreadable answer gets exactly one retry (see completeWithRetry), so one
// question costs at most 2 model calls, all ending by `deadline` when one is given.
const askJson = (model: string, messages: ReadonlyArray<ChatMessage>, maxTokens: number, deadline?: number) =>
  completeWithRetry(model, messages, parseModelJson, { maxTokens, deadline });

// A 4xx that is not auth (401/403), a wrong model ID (404) or rate limiting (429) means "this request shape
// isn't accepted", for example more than one image.
export const rejectsRequestShape = (err: unknown) =>
  err instanceof NemotronHttpError && [400, 413, 415, 422].includes(err.status);

/** Move-in vs move-out comparison. One call with both photos; two calls if the model takes one image at a time. */
export async function compareImages(
  model: string, item: DiffItem, before: ContentPart, after: ContentPart, { deadline }: Pick<CallOptions, 'deadline'> = {},
) {
  if (!singleImageOnly) {
    try {
      return reviewNoteRisk(item, normalizeDiff(await askJson(model, damageDiffMessages(item, before, after), 1500, deadline)));
    } catch (err) {
      if (!rejectsRequestShape(err)) throw err;
      singleImageOnly = true;
    }
  }
  // Step 1: describe the move-in photo. Step 2: judge the move-out photo against that description.
  const described = await askJson(model, describePhotoMessages(item, before, 'MOVE-IN'), 800, deadline);
  return reviewNoteRisk(item, normalizeDiff(await askJson(model, diffAgainstDescriptionMessages(item, after, described), 1500, deadline)));
}

/** Capture Coach. At move-out the move-in photo is a reference; with a one-image model the reference is dropped. */
export async function checkPhoto(
  model: string,
  item: { item_name: string; instruction_text: string },
  photo: ContentPart,
  reference: ContentPart | null,
  { deadline }: Pick<CallOptions, 'deadline'> = {},
) {
  const useReference = !!reference && !singleImageOnly;
  try {
    return normalizePhotoCheck(await askJson(model, photoCheckMessages(item, photo, useReference ? reference : null), 1200, deadline), useReference);
  } catch (err) {
    if (!useReference || !rejectsRequestShape(err)) throw err;
    singleImageOnly = true;
  }
  return normalizePhotoCheck(await askJson(model, photoCheckMessages(item, photo, null), 1200, deadline), false);
}
