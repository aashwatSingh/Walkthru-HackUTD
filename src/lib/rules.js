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
