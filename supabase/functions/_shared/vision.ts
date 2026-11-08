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

// A 4xx that is not auth (401/403), a wrong model ID (404) or rate limiting (429) means "this request shape
// isn't accepted", for example more than one image.
export const rejectsRequestShape = (err: unknown) =>
  err instanceof NemotronHttpError && [400, 413, 415, 422].includes(err.status);

/** Move-in vs move-out comparison. One call with both photos; two calls if the model takes one image at a time. */
export async function compareImages(model: string, item: DiffItem, before: ContentPart, after: ContentPart) {
  if (!singleImageOnly) {
    try {
      return normalizeDiff(parseModelJson(await nemotron(model, damageDiffMessages(item, before, after))));
    } catch (err) {
      if (!rejectsRequestShape(err)) throw err;
      singleImageOnly = true;
    }
  }
  // Step 1: describe the move-in photo. Step 2: judge the move-out photo against that description.
  const described = parseModelJson(await nemotron(model, describePhotoMessages(item, before, 'MOVE-IN'), { maxTokens: 800 }));
  return normalizeDiff(parseModelJson(await nemotron(model, diffAgainstDescriptionMessages(item, after, described))));
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
    const answer = await nemotron(model, photoCheckMessages(item, photo, useReference ? reference : null), { maxTokens: 1200 });
    return normalizePhotoCheck(parseModelJson(answer), useReference);
  } catch (err) {
    if (!useReference || !rejectsRequestShape(err)) throw err;
    singleImageOnly = true;
  }
  const answer = await nemotron(model, photoCheckMessages(item, photo, null), { maxTokens: 1200 });
  return normalizePhotoCheck(parseModelJson(answer), false);
}
