// MOCK database: the same functions as supabaseDb.js, running on localStorage, with the SAME rules the
// Postgres triggers enforce (same error messages), so the UI behaves identically offline.
import { DEMO_PASSWORD, USERS, TEMPLATE, blankItem, seedState } from './mockData.js';
import { sha256Hex } from './hash.js';
import { compressImage, MAX_VIDEO_BYTES } from './image.js';
import { applyFilters } from './rules.js';

const KEY = 'walkthru-mock-v2';
const USER_KEY = 'walkthru-mock-user';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

let state = null;
const memMedia = {}; // fallback when localStorage is full
function load() {
  if (state) return state;
  try {
    state = JSON.parse(localStorage.getItem(KEY));
  } catch { /* fall through */ }
  if (!state) state = seedState();
  return state;
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* quota: media stays in memMedia for this session */ }
}

const me = () => {
  const id = localStorage.getItem(USER_KEY);
  return USERS.find((u) => u.id === id) || null;
};
const need = (profile) => {
  if (!profile) throw new Error('Not signed in');
  return profile;
};
const unitOf = (id) => load().units.find((u) => u.id === id);
const owns = (profile, unit) => profile.role === 'student' && profile.email === unit.assigned_student_email;
const visible = (profile, unit) => profile.role === 'admin' || owns(profile, unit);

// ───────── auth ─────────
export async function restoreSession() {
  await sleep(50);
  return clone(me());
}
export async function signIn(email, password) {
  await sleep(250);
  const user = USERS.find((u) => u.email === email.trim().toLowerCase());
  if (!user || password !== DEMO_PASSWORD) throw new Error('Invalid login credentials');
  sessionStorage.removeItem(MFA_KEY);
  localStorage.setItem(USER_KEY, user.id);
  return clone(user);
}

// Second factor in demo mode: a fixed code shown on screen (the live app uses a real authenticator app).
const MFA_KEY = 'walkthru-mfa';
export const DEMO_2FA_CODE = '123456';
export async function getSecondFactor(profile) {
  return sessionStorage.getItem(MFA_KEY) === profile.id ? { kind: 'none' } : { kind: 'demo', code: DEMO_2FA_CODE };
}
export async function verifySecondFactor(_factor, code) {
  if (code !== DEMO_2FA_CODE) throw new Error('That code is not right. Try again.');
  sessionStorage.setItem(MFA_KEY, need(me()).id);
}
export async function skipSecondFactor(profile) {
  sessionStorage.setItem(MFA_KEY, profile.id); // one-click demo logins
}
export const startTotpEnrollment = async () => {
  throw new Error('Authenticator setup is only used on the live site.');
};
export async function signOut() {
  sessionStorage.removeItem(MFA_KEY);
  localStorage.removeItem(USER_KEY);
}
export async function resetDemo() {
  state = seedState();
  Object.keys(memMedia).forEach((k) => delete memMedia[k]);
  save();
}

// ───────── reads ─────────
export async function getMyUnits() {
  const p = need(me());
  await sleep(80);
  return clone(load().units.filter((u) => visible(p, u)).sort((a, b) => a.unit_code.localeCompare(b.unit_code)));
}
export async function getUnitByCode(code) {
  const p = need(me());
  await sleep(80);
  const u = load().units.find((x) => x.unit_code === code);
  return u && visible(p, u) ? clone(u) : null;
}
export async function getInspectionItems(unitId) {
  const p = need(me());
  const u = unitOf(unitId);
  if (!u || !visible(p, u)) return [];
  await sleep(60);
  return clone(load().items.filter((i) => i.unit_id === unitId).sort((a, b) => a.step_order - b.step_order));
}
function dashboardRows() {
  const s = load();
  return s.items.map((i) => {
    const u = s.units.find((x) => x.id === i.unit_id);
    return {
      ...i,
      unit_code: u.unit_code, building_name: u.building_name, room_number: u.room_number, semester: u.semester,
      assigned_student_name: u.assigned_student_name, assigned_student_email: u.assigned_student_email, inspection_phase: u.inspection_phase,
      waived_amount: i.condition_status === 'PRE_EXISTING_DAMAGE' ? i.standard_charge : 0,
      billable_amount: i.condition_status === 'NEW_DAMAGE_BILLABLE' ? i.estimated_fine : 0,
    };
  }).sort((a, b) => a.unit_code.localeCompare(b.unit_code) || a.step_order - b.step_order);
}
export async function getDashboardRows(filters = {}) {
  const p = need(me());
  if (p.role !== 'admin') return [];
  await sleep(80);
  return clone(applyFilters(dashboardRows(), filters));
}

// ───────── student writes (mirror protect_inspection_items / lock_inspection) ─────────
function editable(profile, item, phase) {
  const u = unitOf(item.unit_id);
  if (!owns(profile, u)) throw new Error(`Only the assigned student can edit ${phase === 'before' ? 'move-in' : 'move-out'} evidence`);
  if (phase === 'before' && u.inspection_phase !== 'MOVE_IN_OPEN') throw new Error('Move-in inspection is locked');
  if (phase === 'after' && u.inspection_phase !== 'MOVE_OUT_OPEN') throw new Error('Move-out inspection is not open');
}
const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
// The stored bytes of a demo file. Decoded here, not fetched: the site's Content-Security-Policy does not let
// fetch() read data: URLs.
function storedBlob(dataUrl) {
  const [head, data] = dataUrl.split(',');
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: head.slice(5).split(';')[0] });
}
const stored = (path) => memMedia[path] ?? load().media[path] ?? null;

export async function uploadStudentMedia({ item, phase, file, notes, sample }) {
  const p = need(me());
  const row = load().items.find((i) => i.id === item.id);
  editable(p, row, phase);
  const isVideo = file.type?.startsWith('video/');
  if (isVideo && file.size > MAX_VIDEO_BYTES) throw new Error('Video is over 50 MB. Record a shorter clip.');
  const blob = isVideo ? file : await compressImage(file);
  const ext = isVideo ? (file.type.includes('mp4') ? 'mp4' : 'webm') : 'jpg';
  const path = `mock/${row.unit_id}/${row.id}/${phase}-${Date.now()}.${ext}`;
  const dataUrl = await blobToDataUrl(blob);
  memMedia[path] = dataUrl;
  load().media[path] = dataUrl;
  if (sample) (load().samples ||= {})[path] = sample; // lets the mock AI recognise demo sample photos
  const out = await registerEvidence(row.id, phase, path);
  await sleep(200);
  return notes !== undefined ? updateNotes(row.id, phase, notes) : out;
}
// Mirrors the register-evidence Edge Function + register_evidence() (migration 008): the "server" checks the
// path belongs to this item and phase, fingerprints the bytes that are STORED there, and stamps the time.
export async function registerEvidence(itemId, phase, path) {
  const p = need(me());
  const row = load().items.find((i) => i.id === itemId);
  if (!row || !visible(p, unitOf(row.unit_id))) throw new Error('Item not found');
  editable(p, row, phase);
  const prefix = `mock/${row.unit_id}/${row.id}/${phase}-`;
  if (typeof path !== 'string' || !path.startsWith(prefix) || !/^[0-9]{10,16}\.(jpg|mp4|webm)$/.test(path.slice(prefix.length))) {
    throw new Error('Evidence must be a photo uploaded for this item');
  }
  const dataUrl = stored(path);
  if (!dataUrl) throw new Error('Upload the file first: nothing is stored at that path');
  const sha = await sha256Hex(storedBlob(dataUrl));
  if (row[`${phase}_media_path`] === path && row[`${phase}_sha256`] !== sha) {
    throw new Error("A file's type and fingerprint are set once, when it is uploaded");
  }
  Object.assign(row, {
    [`${phase}_media_path`]: path,
    [`${phase}_media_type`]: path.endsWith('.jpg') ? 'image' : 'video',
    [`${phase}_sha256`]: sha,
    [`${phase}_captured_at`]: new Date().toISOString(), // server time in the real database
  });
  save();
  return clone(row);
}
export async function removeStudentMedia(item, phase) {
  const p = need(me());
  const row = load().items.find((i) => i.id === item.id);
  editable(p, row, phase);
  Object.assign(row, { [`${phase}_media_path`]: null, [`${phase}_media_type`]: null, [`${phase}_sha256`]: null, [`${phase}_captured_at`]: null });
  save();
  return clone(row);
}
export async function updateNotes(itemId, phase, notes) {
  const p = need(me());
  const row = load().items.find((i) => i.id === itemId);
  editable(p, row, phase);
  row[`${phase}_notes`] = notes;
  save();
  return clone(row);
}
export async function lockInspection(unitId) {
  const p = need(me());
  const u = unitOf(unitId);
  if (!u) throw new Error('Unit not found');
  if (!owns(p, u)) throw new Error('Only the assigned student can submit this inspection');
  const items = load().items.filter((i) => i.unit_id === unitId);
  if (u.inspection_phase === 'MOVE_IN_OPEN') {
    const missing = items.filter((i) => !i.before_media_path).length;
    if (missing) throw new Error(`${missing} item(s) still need a photo or video`);
    Object.assign(u, { inspection_phase: 'MOVE_IN_LOCKED', move_in_locked_at: new Date().toISOString() });
  } else if (u.inspection_phase === 'MOVE_OUT_OPEN') {
    const missing = items.filter((i) => !i.after_media_path).length;
    if (missing) throw new Error(`${missing} item(s) still need a photo or video`);
    Object.assign(u, { inspection_phase: 'COMPLETED', move_out_locked_at: new Date().toISOString() });
  } else {
    throw new Error(`Nothing to submit while the unit is ${u.inspection_phase}`);
  }
  save();
  await sleep(250);
  return clone(u);
}
export async function submitDispute(itemId, reason) {
  const p = need(me());
  const row = load().items.find((i) => i.id === itemId);
  const u = unitOf(row.unit_id);
  if (!owns(p, u) || u.inspection_phase !== 'COMPLETED' || row.condition_status !== 'NEW_DAMAGE_BILLABLE' || row.dispute_reason) {
    throw new Error('Only housing admins can change assessments');
  }
  if (reason.trim().length < 10) throw new Error('Please explain your dispute in at least 10 characters.');
  Object.assign(row, { condition_status: 'DISPUTE_UNDER_REVIEW', dispute_reason: reason.trim(), disputed_at: new Date().toISOString() });
  save();
  return clone(row);
}

// ───────── admin writes ─────────
export async function openMoveOut(unitId) {
  const p = need(me());
  if (p.role !== 'admin') throw new Error('Admins only');
  const u = unitOf(unitId);
  if (!u || u.inspection_phase !== 'MOVE_IN_LOCKED') throw new Error('Move-out can only open after move-in is locked');
  u.inspection_phase = 'MOVE_OUT_OPEN';
  save();
  return clone(u);
}
export async function updateAdminAssessment(itemId, { status, fine, comments }) {
  const p = need(me());
  const row = load().items.find((i) => i.id === itemId);
  const u = unitOf(row.unit_id);
  if (p.role !== 'admin') throw new Error('Only housing admins can change assessments');
  if (u.inspection_phase !== 'COMPLETED') throw new Error('Assess items after move-out is submitted');
  Object.assign(row, { condition_status: status, estimated_fine: Number(fine) || 0, admin_comments: comments ?? row.admin_comments, reviewed_by: p.id, reviewed_at: new Date().toISOString() });
  save();
  return clone(row);
}
export async function createUnit({ buildingName, roomNumber, semester, studentName, studentEmail }) {
  const p = need(me());
  if (p.role !== 'admin') throw new Error('Only housing admins can create units');
  const initials = buildingName.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase();
  const code = `${initials}-${roomNumber.replace(/[^a-z0-9]/gi, '').toUpperCase()}`;
  const s = load();
  if (s.units.some((u) => u.unit_code === code)) throw new Error(`A unit with code ${code} already exists`);
  const unit = {
    id: `u-${code.toLowerCase()}`, unit_code: code, building_name: buildingName.trim(), room_number: roomNumber.trim(), semester: semester.trim(),
    assigned_student_name: studentName.trim(), assigned_student_email: studentEmail.trim().toLowerCase(),
    inspection_phase: 'MOVE_IN_OPEN', move_in_locked_at: null, move_out_locked_at: null, created_at: new Date().toISOString(),
  };
  s.units.push(unit);
  s.items.push(...TEMPLATE.map((t) => blankItem(unit.id, t)));
  save();
  return clone(unit);
}

// ───────── media ─────────
export async function getMediaUrl(path) {
  if (!path) return null;
  if (path.startsWith('/seed/')) return path;
  return stored(path);
}
export async function verifyMedia(path, expectedSha) {
  const url = await getMediaUrl(path);
  if (!url) throw new Error('File not found');
  const blob = url.startsWith('data:') ? storedBlob(url) : await (await fetch(url)).blob();
  return (await sha256Hex(blob)) === expectedSha;
}

// ───────── Nemotron (canned in mock mode; same response shape as the Edge Functions) ─────────
const coachSeen = new Set();
export async function runPhotoCheck(itemId, phase) {
  need(me());
  const row = load().items.find((i) => i.id === itemId);
  await sleep(700);
  if (row[`${phase}_media_type`] !== 'image') return { skipped: true, reason: 'AI check is available for photos only' };
  const key = `${itemId}:${phase}`;
  const firstTime = !coachSeen.has(key);
  coachSeen.add(key);
  if (row.item_name.includes('Blinds') && firstTime) {
    return { ok: false, shows_item: true, framing_ok: false, lighting_ok: true, sharp: true, matches_reference_angle: phase === 'after' ? true : null, retake_tip: 'Lower the blinds fully so every slat is visible, then retake.' };
  }
  return { ok: true, shows_item: true, framing_ok: true, lighting_ok: true, sharp: true, matches_reference_angle: phase === 'after' ? true : null, retake_tip: '' };
}

const base = (p) => (p?.startsWith('/seed/') ? p.split('/').pop().replace(/\.\w+$/, '') : load().samples?.[p] || null);
function mockCompare(item) {
  const b = base(item.before_media_path), a = base(item.after_media_path);
  const mk = (status, conf, findings, rationale) => ({
    change_detected: findings.some((f) => !f.present_at_move_in), findings, model_status: status, confidence: conf, rationale,
  });
  const at = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (b === a && (b === 'desk' || b === 'sink')) {
    const what = b === 'desk' ? 'Scratch on the front-left corner' : 'Hairline crack near the drain';
    return mk('PRE_EXISTING_DAMAGE', 0.9, [{ description: what, location: b === 'desk' ? 'front-left' : 'drain', present_at_move_in: true, severity: 'moderate' }],
      `${what} is visible in both photos; the move-in photo (${at(item.before_captured_at)}) already shows it.`);
  }
  if (b === a) return mk('NO_CHANGE', 0.94, [], 'No visible differences between the move-in and move-out photos.');
  if (b === 'blinds' && a === 'blinds-broken') {
    return mk('NEW_DAMAGE_BILLABLE', 0.92, [{ description: 'Two bottom slats snapped', location: 'bottom of blinds', present_at_move_in: false, severity: 'moderate' }],
      `Move-in photo (${at(item.before_captured_at)}) shows all slats intact; the move-out photo shows two broken slats.`);
  }
  if (b === 'desk' && a === 'desk-water-ring') {
    return mk('NEW_DAMAGE_BILLABLE', 0.88, [{ description: 'Water ring on the desk surface', location: 'center', present_at_move_in: false, severity: 'moderate' }],
      `The water ring is not in the move-in photo (${at(item.before_captured_at)}); the old corner scratch was already there.`);
  }
  return mk('NEEDS_HUMAN_REVIEW', 0.4, [], 'The photos differ, but the mock reviewer cannot tell if this is damage. A person should look.');
}
const SEVERITY = { minor: 0.5, moderate: 1, severe: 1.5 };
function mockFees(diff, charge) {
  let status = diff.confidence < 0.6 ? 'NEEDS_HUMAN_REVIEW' : diff.model_status;
  let fine = 0;
  if (status === 'NEW_DAMAGE_BILLABLE') {
    const worst = diff.findings.filter((f) => !f.present_at_move_in).reduce((w, f) => (SEVERITY[f.severity] > SEVERITY[w] ? f.severity : w), 'minor');
    fine = Math.round(charge * SEVERITY[worst] * 100) / 100;
  }
  return { ...diff, suggested_status: status, suggested_fine: fine, waived_if_pre_existing: status === 'PRE_EXISTING_DAMAGE' ? charge : 0 };
}

export async function runAiReview(unitId) {
  const p = need(me());
  if (p.role !== 'admin') throw new Error('Admins only');
  const s = load();
  const unit = unitOf(unitId);
  if (unit.inspection_phase !== 'COMPLETED') throw new Error('Run the review after the student submits move-out');
  const items = s.items.filter((i) => i.unit_id === unitId).sort((a, b) => a.step_order - b.step_order);
  await sleep(1800);
  const started = Date.now();
  const results = items.map((item) => {
    const r = mockFees(mockCompare(item), item.standard_charge);
    return { item_id: item.id, item_name: item.item_name, ...r };
  });
  const trace = [];
  const step = (round, tool, summary, ms, args = {}) => trace.push({ round, tool, args, ok: true, ms, summary });
  step(1, 'list_items', `${items.length} items loaded`, 12);
  results.forEach((r) => step(2, 'compare_photos', `${r.item_name}: ${r.suggested_status} (${Math.round(r.confidence * 100)}% confident)`, 2400 + Math.round(Math.random() * 900), { item_id: r.item_id }));
  const disputed = items.filter((i) => i.condition_status === 'DISPUTE_UNDER_REVIEW');
  disputed.forEach((i) => step(2, 'get_dispute_evidence', `${i.item_name}: dispute evidence loaded`, 8, { item_id: i.id }));
  results.filter((r) => ['NEW_DAMAGE_BILLABLE', 'PRE_EXISTING_DAMAGE'].includes(r.suggested_status)).forEach((r) =>
    step(3, 'calculate_fee', r.suggested_fine > 0 ? `${r.item_name}: $${r.suggested_fine.toFixed(2)} suggested` : `${r.item_name}: $${r.waived_if_pre_existing.toFixed(2)} waived`, 4, { item_id: r.item_id }));
  step(4, 'submit_review', 'review submitted', 1);

  const billable = results.filter((r) => r.suggested_status === 'NEW_DAMAGE_BILLABLE');
  const waived = results.filter((r) => r.suggested_status === 'PRE_EXISTING_DAMAGE');
  const memo = {
    admin_summary: [
      billable.length ? `${billable.map((r) => r.item_name).join(', ')}: new damage, ${billable.map((r) => '$' + r.suggested_fine.toFixed(2)).join(' + ')} suggested.` : 'No new billable damage found.',
      waived.length ? `${waived.map((r) => r.item_name).join(', ')}: already documented at move-in, charge waived.` : 'No pre-existing damage found.',
      disputed.length ? `${disputed.length} dispute(s) open; evidence brief attached.` : 'No open disputes.',
    ],
    student_note: `${billable.length ? `We found new damage on ${billable.map((r) => r.item_name).join(' and ')}, charged at the standard rate. ` : 'We found no new damage. '}${waived.length ? `Damage on ${waived.map((r) => r.item_name).join(' and ')} was already in your move-in photos, so those charges are waived. ` : ''}You can dispute any charge from your summary page.`,
    dispute_briefs: disputed.map((i) => ({
      item_id: i.id,
      brief: `The move-in photo (${new Date(i.before_captured_at).toLocaleString()}) and the move-out photo (${new Date(i.after_captured_at).toLocaleString()}) show the same condition. The student's reason is consistent with the evidence. Recommendation: waive the charge (this is a recommendation; the housing admin decides).`,
    })),
  };
  const agent = { rounds: 4, tool_calls: trace.length, trace, fallback_reason: undefined };
  const response = {
    unit_id: unitId, unit_code: unit.unit_code, mode: 'agent', models: { vision: 'mock-nemotron-vl', text: 'mock-nemotron' },
    items: results, memo, agent, elapsed_ms: Date.now() - started + 1800,
  };
  s.reviews = s.reviews.filter((r) => !items.some((i) => i.id === r.item_id));
  results.forEach(({ item_id, item_name: _n, ...result }) => s.reviews.push({ id: `r-${item_id}-${Date.now()}`, item_id, kind: 'DAMAGE_DIFF', model: 'mock-nemotron-vl', result, created_at: new Date().toISOString() }));
  s.reports = s.reports.filter((r) => r.unit_id !== unitId);
  s.reports.push({ id: `rep-${unitId}`, unit_id: unitId, model: 'mock-nemotron', result: { ...memo, mode: 'agent', agent }, created_at: new Date().toISOString() });
  save();
  return clone(response);
}
export async function getAiReviews(itemIds) {
  const p = need(me());
  if (p.role !== 'admin') return {};
  const out = {};
  for (const r of load().reviews) if (itemIds.includes(r.item_id)) out[r.item_id] = { ...(out[r.item_id] || {}), [r.kind]: clone(r) };
  return out;
}
export async function getLatestUnitReport(unitId) {
  const p = need(me());
  if (p.role !== 'admin') return null;
  return clone(load().reports.find((r) => r.unit_id === unitId) || null);
}
