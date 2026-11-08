// LIVE database: the same functions as mockDb.js, backed by Supabase (Postgres + Auth + Storage + Edge Functions).
// All security rules live in Postgres (RLS + triggers + RPCs). This file just calls the API.
import { supabase } from './supabaseClient.js';
import { sha256Hex } from './hash.js';
import { compressImage, MAX_VIDEO_BYTES } from './image.js';
import { applyFilters } from './rules.js';

const BUCKET = 'inspection-media';

function unwrap({ data, error }) {
  if (error) throw new Error(error.message || String(error));
  return data;
}

// ───────── auth ─────────
async function loadProfile(id) {
  return unwrap(await supabase.from('profiles').select('id, full_name, email, role').eq('id', id).single());
}
export async function restoreSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ? loadProfile(data.session.user.id) : null;
}
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw new Error(error.message);
  return loadProfile(data.user.id);
}
export async function signOut() {
  await supabase.auth.signOut();
}
export const resetDemo = async () => {
  throw new Error('Reset is only available in mock mode. Re-run supabase/migrations/003_seed.sql instead.');
};

// ───────── reads (RLS decides what each user can see) ─────────
export async function getMyUnits() {
  return unwrap(await supabase.from('units').select('*').order('unit_code'));
}
export async function getUnitByCode(code) {
  return unwrap(await supabase.from('units').select('*').eq('unit_code', code).maybeSingle());
}
export async function getInspectionItems(unitId) {
  return unwrap(await supabase.from('inspection_items').select('*').eq('unit_id', unitId).order('step_order'));
}
export async function getDashboardRows(filters = {}) {
  const rows = unwrap(await supabase.from('item_dashboard').select('*').order('unit_code').order('step_order'));
  return applyFilters(rows, filters);
}

// ───────── student writes ─────────
export async function uploadStudentMedia({ item, phase, file, notes }) {
  const isVideo = !!file.type?.startsWith('video/');
  if (isVideo && file.size > MAX_VIDEO_BYTES) throw new Error('Video is over 50 MB. Record a shorter clip.');
  const blob = isVideo ? file : await compressImage(file); // 1024 px, quality 0.75
  const sha = await sha256Hex(blob);
  const ext = isVideo ? (file.type.includes('mp4') ? 'mp4' : 'webm') : 'jpg';
  const path = `${item.unit_id}/${item.id}/${phase}-${Date.now()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: isVideo ? file.type.split(';')[0] : 'image/jpeg',
    upsert: false, // uploaded files are immutable
  });
  if (up.error) throw new Error(up.error.message);
  const patch = {
    [`${phase}_media_path`]: path,
    [`${phase}_media_type`]: isVideo ? 'video' : 'image',
    [`${phase}_sha256`]: sha,
  };
  if (notes !== undefined) patch[`${phase}_notes`] = notes;
  // The database stamps *_captured_at with its own clock.
  return unwrap(await supabase.from('inspection_items').update(patch).eq('id', item.id).select().single());
}
export async function removeStudentMedia(item, phase) {
  const patch = { [`${phase}_media_path`]: null, [`${phase}_media_type`]: null, [`${phase}_sha256`]: null };
  return unwrap(await supabase.from('inspection_items').update(patch).eq('id', item.id).select().single());
}
export async function updateNotes(itemId, phase, notes) {
  return unwrap(await supabase.from('inspection_items').update({ [`${phase}_notes`]: notes }).eq('id', itemId).select().single());
}
export async function lockInspection(unitId) {
  return unwrap(await supabase.rpc('lock_inspection', { p_unit_id: unitId }));
}
export async function submitDispute(itemId, reason) {
  return unwrap(
    await supabase.from('inspection_items')
      .update({ condition_status: 'DISPUTE_UNDER_REVIEW', dispute_reason: reason.trim() })
      .eq('id', itemId).select().single(),
  );
}

// ───────── admin writes ─────────
export async function openMoveOut(unitId) {
  return unwrap(await supabase.rpc('open_move_out', { p_unit_id: unitId }));
}
export async function updateAdminAssessment(itemId, { status, fine, comments }) {
  const patch = { condition_status: status, estimated_fine: Number(fine) || 0 };
  if (comments !== undefined) patch.admin_comments = comments;
  return unwrap(await supabase.from('inspection_items').update(patch).eq('id', itemId).select().single());
}
export async function createUnit({ buildingName, roomNumber, semester, studentName, studentEmail }) {
  const initials = buildingName.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase();
  const code = `${initials}-${roomNumber.replace(/[^a-z0-9]/gi, '').toUpperCase()}`;
  const { data, error } = await supabase.from('units').insert({
    unit_code: code, building_name: buildingName.trim(), room_number: roomNumber.trim(), semester: semester.trim(),
    assigned_student_name: studentName.trim(), assigned_student_email: studentEmail.trim().toLowerCase(),
  }).select().single();
  if (error) throw new Error(error.code === '23505' ? `A unit with code ${code} (or this room and semester) already exists` : error.message);
  return data; // the 4 checklist items are created by a database trigger
}

// ───────── media ─────────
const signed = new Map(); // path → { url, exp }
export async function getMediaUrl(path) {
  if (!path) return null;
  if (path.startsWith('/seed/')) return path;
  const hit = signed.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  signed.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}
export async function verifyMedia(path, expectedSha) {
  const res = await fetch(await getMediaUrl(path));
  if (!res.ok) throw new Error(`Could not load the file (HTTP ${res.status})`);
  return (await sha256Hex(await res.blob())) === expectedSha;
}

// ───────── Nemotron Edge Functions ─────────
async function invoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    try {
      const j = await error.context.json();
      if (j?.error) message = j.error;
    } catch { /* keep the generic message */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
export const runPhotoCheck = (itemId, phase) => invoke('photo-check', { itemId, phase });
export const runAiReview = (unitId) => invoke('ai-review', { unitId });

export async function getAiReviews(itemIds) {
  if (!itemIds.length) return {};
  const rows = unwrap(await supabase.from('ai_reviews').select('*').in('item_id', itemIds).order('created_at', { ascending: false }));
  const out = {};
  for (const r of rows) {
    out[r.item_id] ??= {};
    out[r.item_id][r.kind] ??= r; // newest first
  }
  return out;
}
export async function getLatestUnitReport(unitId) {
  return unwrap(await supabase.from('ai_unit_reports').select('*').eq('unit_id', unitId).order('created_at', { ascending: false }).limit(1).maybeSingle());
}
