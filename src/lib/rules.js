// UI mirror of the database rules (spec Section 3). The database ENFORCES these; this file only decides
// which buttons to show. Keep it in sync with supabase/migrations/001_schema.sql.

export const phaseKey = (unit) =>
  unit?.inspection_phase === 'MOVE_IN_OPEN' ? 'before' : unit?.inspection_phase === 'MOVE_OUT_OPEN' ? 'after' : null;

export const isOwner = (profile, unit) =>
  profile?.role === 'student' && !!unit && profile.email?.toLowerCase() === unit.assigned_student_email?.toLowerCase();

/** Student may add/replace/remove evidence for `phase` only while that phase is open. */
export const canEditEvidence = (profile, unit, phase) =>
  isOwner(profile, unit) &&
  ((phase === 'before' && unit.inspection_phase === 'MOVE_IN_OPEN') ||
    (phase === 'after' && unit.inspection_phase === 'MOVE_OUT_OPEN'));

/** Admin may assess items only after move-out is submitted. */
export const canAssess = (profile, unit) => profile?.role === 'admin' && unit?.inspection_phase === 'COMPLETED';

/** Student may dispute a billable item once, after move-out is submitted. */
export const canDispute = (profile, unit, item) =>
  isOwner(profile, unit) &&
  unit.inspection_phase === 'COMPLETED' &&
  item.condition_status === 'NEW_DAMAGE_BILLABLE' &&
  !item.dispute_reason;

export const homeFor = (profile) => (profile?.role === 'admin' ? '/admin' : '/my-unit');

// Where to go after login. Only paths on this site: "/inspect/FH-210A" yes; "//evil.com", "https://…" and "/\\evil.com" no.
export const safeNext = (next) => (typeof next === 'string' && /^\/(?![/\\])/.test(next) ? next : null);

// Room codes to try for a new unit, best first: building initials + room ("FH-304B"). Two buildings can share
// initials (Founders Hall, Fairview Hall), so the later ones are longer or numbered ("FAIH-304B", "FH2-304B").
export function unitCodeCandidates(buildingName, roomNumber) {
  const words = String(buildingName).trim().split(/\s+/).filter(Boolean);
  const clean = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const room = clean(String(roomNumber));
  const initials = clean(words.map((w) => w[0]).join('')) || 'U';
  const longer = clean((words[0] || '').slice(0, 3) + words.slice(1).map((w) => w[0]).join(''));
  const list = [`${initials}-${room}`];
  if (longer && longer !== initials) list.push(`${longer}-${room}`);
  for (let n = 2; n <= 9; n++) list.push(`${initials}${n}-${room}`);
  return list;
}

// Search text that is safe to put inside a PostgREST filter (and short enough to be a search, not a payload).
export const cleanSearch = (text) => String(text ?? '').replace(/[,()*%"\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

// Which column each sortable header of the admin table sorts by.
export const SORT_COLUMNS = { student: 'assigned_student_name', room: 'unit_code', item: 'item_name', in: 'before_captured_at', out: 'after_captured_at', status: 'condition_status', fine: 'estimated_fine' };

// Filters for the admin table (also used by the mock database).
export function applyFilters(rows, { building, unitCode, zone, status } = {}) {
  return rows.filter(
    (r) =>
      (!building || r.building_name === building) &&
      (!unitCode || r.unit_code === unitCode) &&
      (!zone || r.zone_category === zone) &&
      (!status || r.condition_status === status),
  );
}
