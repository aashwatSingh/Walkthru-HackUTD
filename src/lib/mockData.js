// Seed data for MOCK mode: the same rows as supabase/migrations/003_seed.sql.
import seedHashes from './seedHashes.json';

export const DEMO_PASSWORD = 'demo1234';

export const USERS = [
  { id: 'p-admin', full_name: 'Housing Admin', email: 'housing.admin@university.edu', role: 'admin' },
  { id: 'p-alex', full_name: 'Alex Rivera', email: 'alex.rivera@university.edu', role: 'student' },
  { id: 'p-jordan', full_name: 'Jordan Lee', email: 'jordan.lee@university.edu', role: 'student' },
  { id: 'p-sam', full_name: 'Sam Patel', email: 'sam.patel@university.edu', role: 'student' },
  { id: 'p-priya', full_name: 'Priya Nair', email: 'priya.nair@university.edu', role: 'student' },
];

export const TEMPLATE = [
  { step_order: 1, zone_category: 'Entryway', item_name: 'Main Door & Deadbolt Lock', instruction_text: 'Capture both sides of the entry door, frame, and deadbolt latch.', standard_charge: 150 },
  { step_order: 2, zone_category: 'Living Area', item_name: 'Study Desk Surface', instruction_text: 'Stand 3 feet back and capture the entire top wood grain surface under bright room lighting.', standard_charge: 85 },
  { step_order: 3, zone_category: 'Living Area', item_name: 'Window Blinds & Slats', instruction_text: 'Lower blinds completely and take a straight-on photo showing all horizontal slats.', standard_charge: 45 },
  { step_order: 4, zone_category: 'Bathroom', item_name: 'Porcelain Sink & Vanity Mirror', instruction_text: 'Take a close-up photo of the sink basin drain and full vanity mirror.', standard_charge: 120 },
];

const hash = (p) => (p ? seedHashes[p] ?? null : null);

export const blankItem = (unit_id, t) => ({
  id: `i-${unit_id}-${t.step_order}`,
  unit_id,
  ...t,
  before_media_path: null, before_media_type: null, before_sha256: null, before_notes: null, before_captured_at: null,
  after_media_path: null, after_media_type: null, after_sha256: null, after_notes: null, after_captured_at: null,
  condition_status: 'UNREVIEWED', estimated_fine: 0, admin_comments: null, reviewed_by: null, reviewed_at: null,
  dispute_reason: null, disputed_at: null,
});

// [unit_id, step, beforePath, beforeNote, beforeAt, afterPath, afterNote, afterAt, status, fine, adminComment, disputeReason, disputedAt]
const ROWS = [
  ['u-fh304b', 1, '/seed/door.jpg', 'Paint clean, lock works smoothly.', '2026-08-18T10:11:00-05:00', '/seed/door.jpg', 'Clean, keys returned.', '2026-11-07T09:28:00-06:00', 'NO_CHANGE', 0, null, null, null],
  ['u-fh304b', 2, '/seed/desk.jpg', 'Deep 4-inch scratch on front-left corner already here when I picked up keys.', '2026-08-18T10:14:00-05:00', '/seed/desk.jpg', 'Exact same scratch from move-in. No new marks.', '2026-11-07T09:30:00-06:00', 'PRE_EXISTING_DAMAGE', 0, 'Scratch documented at move-in. $85 refinishing charge waived.', null, null],
  ['u-fh304b', 3, '/seed/blinds.jpg', 'All slats intact and string mechanism works.', '2026-08-18T10:16:00-05:00', '/seed/blinds-broken.jpg', 'Bottom two slats snapped accidentally while moving boxes.', '2026-11-07T09:33:00-06:00', 'NEW_DAMAGE_BILLABLE', 45, 'Two slats broken; student acknowledged in notes.', null, null],
  ['u-fh304b', 4, '/seed/sink.jpg', 'Hairline crack near drain present at move-in.', '2026-08-18T10:19:00-05:00', '/seed/sink.jpg', 'Same hairline crack near the drain. Nothing new.', '2026-11-07T09:36:00-06:00', 'DISPUTE_UNDER_REVIEW', 120, null, 'The crack was documented at move-in on Aug 18 at 10:19 AM. Please compare the photos.', '2026-11-07T12:02:00-06:00'],
  ['u-bb112', 1, '/seed/door.jpg', 'Door and lock fine.', '2026-08-19T13:58:00-05:00', null, null, null, 'UNREVIEWED', 0, null, null, null],
  ['u-bb112', 2, '/seed/desk.jpg', 'Scratch on front-left corner.', '2026-08-19T14:00:00-05:00', null, null, null, 'UNREVIEWED', 0, null, null, null],
  ['u-bb112', 3, '/seed/blinds.jpg', 'All slats fine.', '2026-08-19T14:02:00-05:00', null, null, null, 'UNREVIEWED', 0, null, null, null],
  ['u-bb112', 4, '/seed/sink.jpg', 'Small crack near drain.', '2026-08-19T14:03:00-05:00', null, null, null, 'UNREVIEWED', 0, null, null, null],
  ['u-bb118', 1, '/seed/door.jpg', 'Looks good.', '2026-08-19T15:10:00-05:00', '/seed/door.jpg', 'Returned keys.', '2026-11-06T16:30:00-06:00', 'NO_CHANGE', 0, null, null, null],
  ['u-bb118', 2, '/seed/desk.jpg', 'Scratch on corner.', '2026-08-19T15:12:00-05:00', '/seed/desk-water-ring.jpg', 'Cleaned the desk, light mark left.', '2026-11-06T16:33:00-06:00', 'NEW_DAMAGE_BILLABLE', 85, 'New water ring in center of desk.', null, null],
  ['u-bb118', 3, '/seed/blinds.jpg', 'All fine.', '2026-08-19T15:14:00-05:00', '/seed/blinds.jpg', 'All fine.', '2026-11-06T16:36:00-06:00', 'NO_CHANGE', 0, null, null, null],
  ['u-bb118', 4, '/seed/sink.jpg', 'Small crack near drain.', '2026-08-19T15:16:00-05:00', '/seed/sink.jpg', 'Same crack.', '2026-11-06T16:39:00-06:00', 'PRE_EXISTING_DAMAGE', 0, 'Documented at move-in. $120 waived.', null, null],
];

export function seedState() {
  const units = [
    { id: 'u-fh304b', unit_code: 'FH-304B', building_name: 'Founders Hall', room_number: '304-B', semester: 'Fall 2026', assigned_student_name: 'Alex Rivera', assigned_student_email: 'alex.rivera@university.edu', inspection_phase: 'COMPLETED', move_in_locked_at: '2026-08-18T10:25:00-05:00', move_out_locked_at: '2026-11-07T09:40:00-06:00', created_at: '2026-08-01T00:00:00Z' },
    { id: 'u-fh210a', unit_code: 'FH-210A', building_name: 'Founders Hall', room_number: '210-A', semester: 'Fall 2026', assigned_student_name: 'Jordan Lee', assigned_student_email: 'jordan.lee@university.edu', inspection_phase: 'MOVE_IN_OPEN', move_in_locked_at: null, move_out_locked_at: null, created_at: '2026-08-01T00:00:00Z' },
    { id: 'u-bb112', unit_code: 'BB-112', building_name: 'Bluebonnet Hall', room_number: '112', semester: 'Fall 2026', assigned_student_name: 'Sam Patel', assigned_student_email: 'sam.patel@university.edu', inspection_phase: 'MOVE_OUT_OPEN', move_in_locked_at: '2026-08-19T14:05:00-05:00', move_out_locked_at: null, created_at: '2026-08-01T00:00:00Z' },
    { id: 'u-bb118', unit_code: 'BB-118', building_name: 'Bluebonnet Hall', room_number: '118', semester: 'Fall 2026', assigned_student_name: 'Priya Nair', assigned_student_email: 'priya.nair@university.edu', inspection_phase: 'COMPLETED', move_in_locked_at: '2026-08-19T15:20:00-05:00', move_out_locked_at: '2026-11-06T16:45:00-06:00', created_at: '2026-08-01T00:00:00Z' },
  ];
  const items = units.flatMap((u) => TEMPLATE.map((t) => blankItem(u.id, t)));
  for (const [uid, step, bp, bn, bt, ap, an, at, st, fine, ac, dr, dt] of ROWS) {
    const it = items.find((i) => i.unit_id === uid && i.step_order === step);
    Object.assign(it, {
      before_media_path: bp, before_media_type: bp ? 'image' : null, before_sha256: hash(bp), before_notes: bn, before_captured_at: bt,
      after_media_path: ap, after_media_type: ap ? 'image' : null, after_sha256: hash(ap), after_notes: an, after_captured_at: at,
      condition_status: st, estimated_fine: fine, admin_comments: ac, dispute_reason: dr, disputed_at: dt,
      reviewed_by: ['NO_CHANGE', 'PRE_EXISTING_DAMAGE', 'NEW_DAMAGE_BILLABLE'].includes(st) ? 'p-admin' : null,
      reviewed_at: ['NO_CHANGE', 'PRE_EXISTING_DAMAGE', 'NEW_DAMAGE_BILLABLE'].includes(st) ? '2026-11-07T11:00:00-06:00' : null,
    });
  }
  return { units, items, reviews: [], reports: [], media: {} };
}
