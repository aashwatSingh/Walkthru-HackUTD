-- Walkthrough 003_seed.sql (copied from the build spec, Section 4.5).
-- Paste the whole file into Supabase → SQL Editor → New query → Run.

insert into checklist_template (step_order, zone_category, item_name, instruction_text, standard_charge) values
 (1, 'Entryway',    'Main Door & Deadbolt Lock',      'Capture both sides of the entry door, frame, and deadbolt latch.', 150),
 (2, 'Living Area', 'Study Desk Surface',             'Stand 3 feet back and capture the entire top wood grain surface under bright room lighting.', 85),
 (3, 'Living Area', 'Window Blinds & Slats',          'Lower blinds completely and take a straight-on photo showing all horizontal slats.', 45),
 (4, 'Bathroom',    'Porcelain Sink & Vanity Mirror', 'Take a close-up photo of the sink basin drain and full vanity mirror.', 120);

-- Inserting units auto-creates their 4 checklist items (trigger)
insert into units (unit_code, building_name, room_number, semester, assigned_student_name, assigned_student_email,
                   inspection_phase, move_in_locked_at, move_out_locked_at) values
 ('FH-304B', 'Founders Hall',   '304-B', 'Fall 2026', 'Alex Rivera', 'alex.rivera@university.edu', 'COMPLETED',     '2026-08-18 10:25-05', '2026-11-07 09:40-06'),
 ('FH-210A', 'Founders Hall',   '210-A', 'Fall 2026', 'Jordan Lee',  'jordan.lee@university.edu',  'MOVE_IN_OPEN',  null, null),
 ('BB-112',  'Bluebonnet Hall', '112',   'Fall 2026', 'Sam Patel',   'sam.patel@university.edu',   'MOVE_OUT_OPEN', '2026-08-19 14:05-05', null),
 ('BB-118',  'Bluebonnet Hall', '118',   'Fall 2026', 'Priya Nair',  'priya.nair@university.edu',  'COMPLETED',     '2026-08-19 15:20-05', '2026-11-06 16:45-06');

update inspection_items i set
  before_media_path  = v.bp,  before_media_type = case when v.bp is null then null else 'image' end,
  before_notes       = v.bn,  before_captured_at = v.bt::timestamptz,
  after_media_path   = v.ap,  after_media_type  = case when v.ap is null then null else 'image' end,
  after_notes        = v.an,  after_captured_at  = v.at::timestamptz,
  condition_status   = v.st,  estimated_fine = v.fine::numeric, admin_comments = v.ac,
  dispute_reason     = v.dr,  disputed_at = v.dt::timestamptz
from units u, (values
 -- FH-304B: the four headline scenarios
 ('FH-304B', 1, '/seed/door.jpg',   'Paint clean, lock works smoothly.', '2026-08-18 10:11-05',
                '/seed/door.jpg',   'Clean, keys returned.',             '2026-11-07 09:28-06',
                'NO_CHANGE', 0, null, null, null),
 ('FH-304B', 2, '/seed/desk.jpg',   'Deep 4-inch scratch on front-left corner already here when I picked up keys.', '2026-08-18 10:14-05',
                '/seed/desk.jpg',   'Exact same scratch from move-in. No new marks.', '2026-11-07 09:30-06',
                'PRE_EXISTING_DAMAGE', 0, 'Scratch documented at move-in. $85 refinishing charge waived.', null, null),
 ('FH-304B', 3, '/seed/blinds.jpg', 'All slats intact and string mechanism works.', '2026-08-18 10:16-05',
                '/seed/blinds-broken.jpg', 'Bottom two slats snapped accidentally while moving boxes.', '2026-11-07 09:33-06',
                'NEW_DAMAGE_BILLABLE', 45, 'Two slats broken; student acknowledged in notes.', null, null),
 ('FH-304B', 4, '/seed/sink.jpg',   'Hairline crack near drain present at move-in.', '2026-08-18 10:19-05',
                '/seed/sink.jpg',   'Same hairline crack near the drain. Nothing new.', '2026-11-07 09:36-06',
                'DISPUTE_UNDER_REVIEW', 120, null,
                'The crack was documented at move-in on Aug 18 at 10:19 AM. Please compare the photos.', '2026-11-07 12:02-06'),
 -- BB-112: move-in locked, move-out OPEN (judges do the move-out live)
 ('BB-112', 1, '/seed/door.jpg',   'Door and lock fine.',            '2026-08-19 13:58-05', null, null, null, 'UNREVIEWED', 0, null, null, null),
 ('BB-112', 2, '/seed/desk.jpg',   'Scratch on front-left corner.',  '2026-08-19 14:00-05', null, null, null, 'UNREVIEWED', 0, null, null, null),
 ('BB-112', 3, '/seed/blinds.jpg', 'All slats fine.',                '2026-08-19 14:02-05', null, null, null, 'UNREVIEWED', 0, null, null, null),
 ('BB-112', 4, '/seed/sink.jpg',   'Small crack near drain.',        '2026-08-19 14:03-05', null, null, null, 'UNREVIEWED', 0, null, null, null),
 -- BB-118: second completed unit so the per-building chart has two bars
 ('BB-118', 1, '/seed/door.jpg',   'Looks good.',                    '2026-08-19 15:10-05', '/seed/door.jpg', 'Returned keys.', '2026-11-06 16:30-06', 'NO_CHANGE', 0, null, null, null),
 ('BB-118', 2, '/seed/desk.jpg',   'Scratch on corner.',             '2026-08-19 15:12-05', '/seed/desk-water-ring.jpg', 'Cleaned the desk, light mark left.', '2026-11-06 16:33-06', 'NEW_DAMAGE_BILLABLE', 85, 'New water ring in center of desk.', null, null),
 ('BB-118', 3, '/seed/blinds.jpg', 'All fine.',                      '2026-08-19 15:14-05', '/seed/blinds.jpg', 'All fine.', '2026-11-06 16:36-06', 'NO_CHANGE', 0, null, null, null),
 ('BB-118', 4, '/seed/sink.jpg',   'Small crack near drain.',        '2026-08-19 15:16-05', '/seed/sink.jpg', 'Same crack.', '2026-11-06 16:39-06', 'PRE_EXISTING_DAMAGE', 0, 'Documented at move-in. $120 waived.', null, null)
) as v(code, step, bp, bn, bt, ap, an, at, st, fine, ac, dr, dt)
where u.id = i.unit_id and u.unit_code = v.code and i.step_order = v.step;
