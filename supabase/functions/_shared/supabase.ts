import { createClient, type SupabaseClient, type User } from 'jsr:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { json } from './cors.ts';
import { imagePart, type ContentPart } from './nemotron.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'inspection-media';

// JWT verification is OFF at the gateway (spec Section 5), so this is the only auth gate.
// Returns a client that acts as the caller (RLS applies), or a ready-made 401 response.
export async function requireUser(
  req: Request,
): Promise<{ userClient: SupabaseClient; user: User } | { error: Response }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return { error: json({ error: 'Not signed in' }, 401) };
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser(authHeader.slice('Bearer '.length));
  if (error || !data.user) return { error: json({ error: 'Not signed in' }, 401) };
  return { userClient, user: data.user };
}

// Service role bypasses RLS: use it only to read media and write AI results, after requireUser().
export const serviceClient = () =>
  createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // seed photos are < 250 KB, uploads ~150–250 KB

// Loads a stored photo as a Nemotron image part.
// '/seed/...' paths are served by the Vercel app; everything else lives in the private bucket.
export async function loadImage(admin: SupabaseClient, path: string): Promise<ContentPart> {
  let blob: Blob;
  if (path.startsWith('/seed/')) {
    const site = Deno.env.get('PUBLIC_SITE_URL');
    if (!site) throw new Error('Missing Edge Function secret PUBLIC_SITE_URL (needed for /seed/ images)');
    const res = await fetch(new URL(path, site));
    if (!res.ok) throw new Error(`Could not load ${path}: HTTP ${res.status}`);
    blob = await res.blob();
  } else {
    const { data, error } = await admin.storage.from(BUCKET).download(path);
    if (error || !data) throw new Error(`Could not load ${path}: ${error?.message ?? 'not found'}`);
    blob = data;
  }
  if (blob.size > MAX_IMAGE_BYTES) throw new Error(`${path} is ${(blob.size / 1e6).toFixed(1)} MB; compress it first`);
  const mime = blob.type?.startsWith('image/') ? blob.type : 'image/jpeg';
  return imagePart(encodeBase64(new Uint8Array(await blob.arrayBuffer())), mime);
}
