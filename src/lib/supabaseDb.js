// LIVE database: the same functions as mockDb.js, backed by Supabase (Postgres + Auth + Storage + Edge Functions).
// All security rules live in Postgres (RLS + triggers + RPCs). This file just calls the API.
import { supabase, supabaseKey, supabaseUrl } from './supabaseClient.js';
import { sha256Hex } from './hash.js';
import { compressImage, MAX_VIDEO_BYTES } from './image.js';
import { SORT_COLUMNS, cleanSearch, unitCodeCandidates } from './rules.js';

const BUCKET = 'inspection-media';

function unwrap({ data, error }) {
  if (error) throw new Error(error.message || String(error));
  return data;
}

// ───────── auth ─────────
async function loadProfile(id) {
  const profile = unwrap(await supabase.from('profiles').select('id, full_name, email, role').eq('id', id).maybeSingle());
  // An account made before the SQL ran (or outside the app) has no profile row: say so instead of a database error.
  if (!profile) throw new Error('This account has no Walkthrough profile yet. Ask housing to add you.');
  return profile;
}
export async function restoreSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ? loadProfile(data.session.user.id) : null;
}
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw new Error(error.message);
  try {
    return await loadProfile(data.user.id);
  } catch (err) {
    await supabase.auth.signOut(); // don't leave a half-signed-in session behind
    throw err;
  }
}
export async function signOut() {
  await supabase.auth.signOut();
}

// ───────── second factor ─────────
// Students sign in with a password. The housing admin also needs a code from an authenticator app (TOTP),
// and the DATABASE enforces it: is_admin() is only true for a session that passed it (migration 007).
// VITE_REQUIRE_ADMIN_MFA=false turns the prompt off (emergency lever; 007 still decides what an admin can do).
const ADMIN_MFA = import.meta.env.VITE_REQUIRE_ADMIN_MFA !== 'false';
const mfa = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};
export async function getSecondFactor(profile) {
  if (profile.role !== 'admin' || !ADMIN_MFA) return { kind: 'none' };
  if (mfa(await supabase.auth.mfa.getAuthenticatorAssuranceLevel()).currentLevel === 'aal2') return { kind: 'none' };
  const verified = mfa(await supabase.auth.mfa.listFactors()).totp?.[0];
  return verified ? { kind: 'totp', factorId: verified.id } : { kind: 'enroll' };
}
export async function startTotpEnrollment() {
  // A setup that was started but never finished blocks a new one: remove those leftovers first.
  for (const f of mfa(await supabase.auth.mfa.listFactors()).all ?? []) {
    if (f.factor_type === 'totp' && f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  // Names must be unique per user, and two setups can start at once (two tabs): give each its own name.
  const friendlyName = `Authenticator app ${Math.random().toString(36).slice(2, 8)}`;
  const f = mfa(await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName }));
  return { factorId: f.id, qr: f.totp.qr_code, secret: f.totp.secret };
}
export async function verifySecondFactor(factor, code) {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.factorId, code });
  if (!error) return;
  const wrongCode = error.code === 'mfa_verification_failed' || error.status === 422;
  throw new Error(wrongCode ? 'That code is not right. Try again.' : error.message);
}
export const skipSecondFactor = async () => {}; // one-click demo logins are students: nothing to skip

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

// ───────── admin dashboard: aggregated and paged in the database (migration 010) ─────────
const NOT_INSTALLED = 'PGRST202'; // PostgREST: no such function, i.e. the migration that adds it has not run
const EMPTY_SUMMARY = { units: 0, inspected: 0, items: 0, saved: 0, billable: 0, disputes: 0, by_building: [], by_status: [], buildings: [], zones: [], unit_codes: [] };

export async function getDashboardSummary() {
  const { data, error } = await supabase.rpc('dashboard_summary');
  if (error && error.code !== NOT_INSTALLED) throw new Error(error.message);
  const d = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  return {
    ...EMPTY_SUMMARY, ...d,
    saved: Number(d.saved || 0), billable: Number(d.billable || 0),
    by_building: (d.by_building || []).map((b) => ({ ...b, waived: Number(b.waived || 0), billable: Number(b.billable || 0) })),
  };
}

// One page of the items table. Filtering, search and sorting happen in the database.
export async function getDashboardPage({ filters = {}, search = '', sort = null, page = 0, pageSize = 50 } = {}) {
  let q = supabase.from('item_dashboard').select('*', { count: 'exact' });
  if (filters.building) q = q.eq('building_name', filters.building);
  if (filters.unitCode) q = q.eq('unit_code', filters.unitCode);
  if (filters.zone) q = q.eq('zone_category', filters.zone);
  if (filters.status) q = q.eq('condition_status', filters.status);
  const term = cleanSearch(search);
  if (term) q = q.or(['assigned_student_name', 'unit_code', 'item_name', 'building_name'].map((c) => `${c}.ilike."*${term}*"`).join(','));
  if (sort && SORT_COLUMNS[sort.key]) q = q.order(SORT_COLUMNS[sort.key], { ascending: sort.dir === 1, nullsFirst: false });
  const { data, error, count } = await q.order('unit_code').order('step_order').range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw new Error(error.message);
  return { rows: data || [], total: count ?? (data || []).length };
}

// One page of rooms with their photo counts.
export async function getUnitsPage({ search = '', page = 0, pageSize = 12 } = {}) {
  const { data, error } = await supabase.rpc('units_overview', { p_search: cleanSearch(search) || null, p_limit: pageSize, p_offset: page * pageSize });
  if (!error && data && !Array.isArray(data)) return { units: data.units || [], total: Number(data.total || 0) };
  if (error && error.code !== NOT_INSTALLED) throw new Error(error.message);
  // Before migration 010: plain rooms, no counts.
  const plain = await supabase.from('units').select('*', { count: 'exact' }).order('unit_code').range(page * pageSize, page * pageSize + pageSize - 1);
  if (plain.error) throw new Error(plain.error.message);
  return { units: plain.data || [], total: plain.count ?? (plain.data || []).length };
}

// What is missing or risky in this project's setup, for the banner on the admin dashboard.
// { checks: [{ level: 'bad' | 'warn', text }], storage: { files, bytes, unreferenced_files, unreferenced_bytes } | null }
export async function getSetupChecks() {
  const checks = [];
  let storage = null;
  const { data, error } = await supabase.rpc('security_status');
  if (error?.code === NOT_INSTALLED) {
    checks.push({ level: 'bad', text: 'Database update 010 has not been run: rate limits, the tamper-evident audit log and the faster dashboard queries are off. Run supabase/migrations/010_scale_and_safety.sql in the SQL Editor.' });
  } else if (!error && data && !Array.isArray(data)) {
    storage = data.storage || null;
    if (data.hardening === false) checks.push({ level: 'bad', text: 'Upload rules are missing. Run supabase/migrations/006_hardening.sql.' });
    if (data.server_fingerprints === false) checks.push({ level: 'bad', text: 'Fingerprints still come from the browser. Run supabase/migrations/008_server_fingerprints.sql.' });
    if (data.admin_mfa_required === false) checks.push({ level: 'bad', text: 'Admin two-factor is not enforced by the database yet: the admin password alone still works through the API. You are signed in with two-factor now, so it is safe to run supabase/migrations/007_admin_mfa.sql.' });
    if (data.seed_photos_fingerprinted === false) checks.push({ level: 'warn', text: 'Sample photos have no fingerprint. Run supabase/migrations/009_seed_photo_fingerprints.sql.' });
  }
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabaseKey } });
    const settings = res.ok ? await res.json() : null;
    if (settings?.mailer_autoconfirm === true) {
      checks.push({ level: 'bad', text: 'Email confirmation is off: anyone can create an account with a student’s email address and open that student’s room. Turn on "Confirm email" in Supabase → Authentication → Sign In / Providers.' });
    }
    if (settings?.disable_signup === false) {
      checks.push({ level: settings.mailer_autoconfirm === true ? 'bad' : 'warn', text: 'Sign-ups are open to the public. Rooms are matched by email, so only housing should create accounts: turn off "Allow new users to sign up" in Supabase → Authentication.' });
    }
  } catch { /* the settings endpoint is a nice-to-have */ }
  if (import.meta.env.VITE_DEMO_PASSWORD) {
    checks.push({ level: 'warn', text: 'Demo logins are on: the demo students’ password is readable in the site’s code. When the public demo is over, remove VITE_DEMO_PASSWORD in Vercel and change those passwords.' });
  }
  return { checks, storage };
}

// { ok, entries, head } for a room's audit chain, or null where it is not available.
export async function getAuditHead(unitId) {
  const { data, error } = await supabase.rpc('verify_audit_chain', { p_unit_id: unitId });
  return !error && data && !Array.isArray(data) && data.head ? data : null;
}

// ───────── student writes ─────────
export async function uploadStudentMedia({ item, phase, file, notes }) {
  const isVideo = !!file.type?.startsWith('video/');
  if (isVideo && file.size > MAX_VIDEO_BYTES) throw new Error('Video is over 50 MB. Record a shorter clip.');
  const blob = isVideo ? file : await compressImage(file); // 1024 px, quality 0.75
  const ext = isVideo ? (file.type.includes('mp4') ? 'mp4' : 'webm') : 'jpg';
  const path = `${item.unit_id}/${item.id}/${phase}-${Date.now()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: isVideo ? file.type.split(';')[0] : 'image/jpeg',
    upsert: false, // uploaded files are immutable
  });
  if (up.error) throw new Error(up.error.message);
  const row = await registerEvidence(item.id, phase, path);
  return notes !== undefined ? updateNotes(item.id, phase, notes) : row;
}
// Puts an uploaded file on its checklist item. The SERVER fingerprints the stored file (register-evidence Edge
// Function) and stamps the capture time: since migration 008 the browser cannot write a path, type or
// fingerprint itself, so a fingerprint can never disagree with the file it was registered for.
export async function registerEvidence(itemId, phase, path) {
  return invoke('register-evidence', { itemId, phase, path });
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
  // Building initials can collide (Founders Hall, Fairview Hall): try the next code until one is free.
  for (const code of unitCodeCandidates(buildingName, roomNumber)) {
    const { data, error } = await supabase.from('units').insert({
      unit_code: code, building_name: buildingName.trim(), room_number: roomNumber.trim(), semester: semester.trim(),
      assigned_student_name: studentName.trim(), assigned_student_email: studentEmail.trim().toLowerCase(),
    }).select().single();
    if (!error) return data; // the 4 checklist items are created by a database trigger
    if (error.code !== '23505') throw new Error(error.message);
    if (!/unit_code/.test(`${error.message} ${error.details || ''}`)) throw new Error('That room already exists for this semester.');
  }
  throw new Error('Could not find a free room code for this building. Rename the building or the room.');
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

// ───────── Edge Functions (register-evidence, and Nemotron's photo-check and ai-review) ─────────
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
