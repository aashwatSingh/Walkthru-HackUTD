-- Attacks and must-keep-working flows. Each line states what a secure system does; "!! HOLE" fails the run.
\pset tuples_only on
\pset format unaligned
\set J '''jordan.lee@university.edu'''
\set S '''sam.patel@university.edu'''
\set A '''alex.rivera@university.edu'''
\set M '''mallory@university.edu'''
\set H '''housing.admin@university.edu'''
-- The register-evidence Edge Function, after it authenticated the student and hashed the stored file (helper: reg()).
\set SRV '''service_role'''

\echo == 1. Backdating move-in evidence (set a path to a file that does not exist yet, lock, upload it months later)
begin;
select t('1a set move-in path to a file that was never uploaded', :J, $$update inspection_items set before_media_path = path_for('FH-210A', step_order, 'before-999.jpg'), before_media_type = 'image' where unit_id = (select id from units where unit_code = 'FH-210A')$$, 'blocked');
select t('1b lock move-in with no real files', :J, $$select lock_inspection((select id from units where unit_code = 'FH-210A'))$$, 'blocked');
select t('   (admin opens move-out)', :H, $$select open_move_out((select id from units where unit_code = 'FH-210A'))$$, 'allowed|blocked');
select t('1c upload the "move-in" photo during move-out', :J, $$insert into storage.objects (bucket_id, name) values ('inspection-media', path_for('FH-210A', 1, 'before-999.jpg'))$$, 'blocked');
rollback;

\echo == 2. Storage uploads
begin;
select t('2a upload a before- file while move-out is open', :S, $$insert into storage.objects (bucket_id, name) values ('inspection-media', path_for('BB-112', 1, 'before-5.jpg'))$$, 'blocked');
select t('2b upload any file name into own unit folder (svg)', :S, $$insert into storage.objects (bucket_id, name) select 'inspection-media', id::text || '/junk/evil.svg' from units where unit_code = 'BB-112'$$, 'blocked');
select t('2c upload into another student''s unit', :M, $$insert into storage.objects (bucket_id, name) values ('inspection-media', path_for('BB-112', 1, 'after-5.jpg'))$$, 'blocked');
select t('2d upload into a locked unit', :A, $$insert into storage.objects (bucket_id, name) values ('inspection-media', path_for('FH-304B', 1, 'after-5.jpg'))$$, 'blocked');
select t('2e LEGIT upload an after- photo for own open move-out', :S, $$insert into storage.objects (bucket_id, name) values ('inspection-media', path_for('BB-112', 1, 'after-1700000000000.jpg'))$$, 'allowed');
select t('2f point the row at the uploaded file, with a bogus fingerprint', :S, $$update inspection_items set after_media_path = path_for('BB-112', 1, 'after-1700000000000.jpg'), after_media_type = 'image', after_sha256 = 'abc' where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 1)$$, 'blocked');
select t('2g point the row at it with a well-formed fingerprint of the student''s choosing', :S, $$update inspection_items set after_media_path = path_for('BB-112', 1, 'after-1700000000000.jpg'), after_media_type = 'image', after_sha256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 1)$$, 'blocked');
select t('2i LEGIT the server registers it with the fingerprint it computed', :SRV, $$select reg('BB-112', 1, 'after-1700000000000.jpg', 'sam.patel@university.edu')$$, 'allowed');
select t('2h read another student''s files', :M, $$select 1 from storage.objects$$, 'no-rows');
rollback;

\echo == 3. Row tampering by students
begin;
select t('3a change an item''s id', :J, $$update inspection_items set id = gen_random_uuid() where unit_id = (select id from units where unit_code = 'FH-210A') and step_order = 4$$, 'blocked');
select t('3b notes of 100,000 characters', :J, $$update inspection_items set before_notes = repeat('x', 100000) where unit_id = (select id from units where unit_code = 'FH-210A') and step_order = 4$$, 'blocked');
select t('3c edit locked move-in notes', :A, $$update inspection_items set before_notes = 'edited' where unit_id = (select id from units where unit_code = 'FH-304B')$$, 'blocked');
select t('3d zero own fine', :A, $$update inspection_items set estimated_fine = 0 where unit_id = (select id from units where unit_code = 'FH-304B') and condition_status = 'NEW_DAMAGE_BILLABLE'$$, 'blocked');
select t('3e change the fee schedule on own item', :A, $$update inspection_items set standard_charge = 0 where unit_id = (select id from units where unit_code = 'FH-304B')$$, 'blocked');
select t('3f make self admin', :J, $$update profiles set role = 'admin' where email = 'jordan.lee@university.edu'$$, 'no-rows|blocked');
select t('3g read another student''s items', :M, $$select 1 from inspection_items$$, 'no-rows');
select t('3h read other profiles', :M, $$select 1 from profiles where email <> 'mallory@university.edu'$$, 'no-rows');
select t('3i write AI results', :J, $$insert into ai_reviews (item_id, kind, model, result) select id, 'DAMAGE_DIFF', 'x', '{}' from inspection_items limit 1$$, 'blocked|no-rows');
select t('3j delete own checklist item', :J, $$delete from inspection_items where unit_id = (select id from units where unit_code = 'FH-210A')$$, 'no-rows|blocked');
select t('3k lock someone else''s unit', :M, $$select lock_inspection((select id from units where unit_code = 'FH-210A'))$$, 'blocked');
select t('3l open move-out as a student', :J, $$select open_move_out((select id from units where unit_code = 'FH-304B'))$$, 'blocked');
select t('3m second dispute on the same item', :A, $$update inspection_items set condition_status = 'DISPUTE_UNDER_REVIEW', dispute_reason = 'another long reason here' where unit_id = (select id from units where unit_code = 'FH-304B') and dispute_reason is not null$$, 'blocked|no-rows');
rollback;
begin;
select t('3n TRUNCATE the evidence table (bypasses row security)', :J, $$truncate inspection_items cascade$$, 'blocked');
rollback;

\echo == 4. Signed-out visitors
begin;
select t('4a read units', null, $$select 1 from units$$, 'no-rows|blocked');
select t('4b read the dashboard view', null, $$select 1 from item_dashboard$$, 'no-rows|blocked');
select t('4c call is_admin()', null, $$select is_admin()$$, 'blocked');
select t('4d call lock_inspection()', null, $$select lock_inspection((select id from units limit 1))$$, 'blocked');
rollback;

\echo == 5. Housing admin vs. the "not even housing" promise
begin;
select t('5a edit a student''s move-in notes', :H, $$update inspection_items set before_notes = 'clean' where unit_id = (select id from units where unit_code = 'FH-210A')$$, 'blocked');
select t('5b change a phase directly', :H, $$update units set inspection_phase = 'MOVE_IN_OPEN' where unit_code = 'FH-304B'$$, 'blocked');
select t('5c edit a student''s dispute text', :H, $$update inspection_items set dispute_reason = 'never mind' where dispute_reason is not null$$, 'blocked');
select t('   (student uploads a move-in photo)', :J, $$insert into storage.objects (bucket_id, name) values ('inspection-media', path_for('FH-210A', 1, 'before-1700000000001.jpg'))$$, 'allowed');
select t('   (the server registers it)', :SRV, $$select reg('FH-210A', 1, 'before-1700000000001.jpg', 'jordan.lee@university.edu')$$, 'allowed');
select t('5d reassign a room to yourself after evidence exists', :H, $$update units set assigned_student_email = 'housing.admin@university.edu' where unit_code = 'FH-210A'$$, 'blocked');
rollback;

\echo == 6. Things that must keep working
begin;
select t('6a student: 4 uploads', :J, $$insert into storage.objects (bucket_id, name) select 'inspection-media', path_for('FH-210A', s, 'before-170000000000' || s || '.jpg') from generate_series(1, 4) s$$, 'allowed');
select t('6b server: register all 4', :SRV, $$select reg('FH-210A', s, 'before-170000000000' || s || '.jpg', 'jordan.lee@university.edu') from generate_series(1, 4) s$$, 'allowed');
select t('6c student: remove one photo', :J, $$update inspection_items set before_media_path = null, before_media_type = null, before_sha256 = null where unit_id = (select id from units where unit_code = 'FH-210A') and step_order = 2$$, 'allowed');
select t('   (a missing photo still stops the lock)', :J, $$select lock_inspection((select id from units where unit_code = 'FH-210A'))$$, 'blocked');
select t('6c server: put it back', :SRV, $$select reg('FH-210A', 2, 'before-1700000000002.jpg', 'jordan.lee@university.edu')$$, 'allowed');
select t('6d student: notes', :J, $$update inspection_items set before_notes = 'scuff on the wall' where unit_id = (select id from units where unit_code = 'FH-210A') and step_order = 1$$, 'allowed');
select t('6e student: lock move-in', :J, $$select lock_inspection((select id from units where unit_code = 'FH-210A'))$$, 'allowed');
select t('6f admin: open move-out', :H, $$select open_move_out((select id from units where unit_code = 'FH-210A'))$$, 'allowed');
select t('6g admin: assess an item', :H, $$update inspection_items set condition_status = 'NO_CHANGE', estimated_fine = 0, admin_comments = 'ok' where unit_id = (select id from units where unit_code = 'BB-118') and step_order = 1$$, 'allowed');
select t('6h admin: create a unit (mixed-case email)', :H, $$insert into units (unit_code, building_name, room_number, semester, assigned_student_name, assigned_student_email) values ('LH-7C', 'Lakeside Hall', '7-C', 'Fall 2026', 'Mallory', 'Mallory@University.edu')$$, 'allowed');
select t('6i new student sees the unit made with a mixed-case email', :M, $$select 1 from units where unit_code = 'LH-7C'$$, 'allowed');
select t('6j student: dispute a charge', :A, $$update inspection_items set condition_status = 'DISPUTE_UNDER_REVIEW', dispute_reason = 'This was already damaged at move-in.' where unit_id = (select id from units where unit_code = 'FH-304B') and condition_status = 'NEW_DAMAGE_BILLABLE' and dispute_reason is null$$, 'allowed');
select t('6k admin: read every item', :H, $$select 1 from item_dashboard$$, 'allowed');
select t('6l student: read own items only (4)', :J, $$select 1 from inspection_items$$, 'allowed');
rollback;

\echo == 7. New rules
begin;
select t('7a upload with a file name the app never produces', :S, $$insert into storage.objects (bucket_id, name) values ('inspection-media', path_for('BB-112', 1, 'after-1700000000000.svg'))$$, 'blocked');
select t('7b upload into a folder that is not one of the unit''s items', :S, $$insert into storage.objects (bucket_id, name) select 'inspection-media', id::text || '/' || gen_random_uuid()::text || '/after-1700000000000.jpg' from units where unit_code = 'BB-112'$$, 'blocked');
select t('   (60 uploads for one item)', :S, $$insert into storage.objects (bucket_id, name) select 'inspection-media', path_for('BB-112', 2, 'after-17000000000' || lpad(s::text, 2, '0') || '.jpg') from generate_series(1, 60) s$$, 'allowed');
select t('7c the 61st upload for that item', :S, $$insert into storage.objects (bucket_id, name) values ('inspection-media', path_for('BB-112', 2, 'after-1700000000099.jpg'))$$, 'blocked');
select t('   (the server registers file 01)', :SRV, $$select reg('BB-112', 2, 'after-1700000000001.jpg', 'sam.patel@university.edu')$$, 'allowed');
select t('7d swap the fingerprint of a registered file', :S, $$update inspection_items set after_sha256 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 2)$$, 'blocked');
select t('7e call a photo a video', :S, $$update inspection_items set after_media_path = path_for('BB-112', 2, 'after-1700000000002.jpg'), after_media_type = 'video', after_sha256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 2)$$, 'blocked');
select t('7f point at another item''s uploaded file', :S, $$update inspection_items set after_media_path = path_for('BB-112', 2, 'after-1700000000003.jpg'), after_media_type = 'image', after_sha256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 3)$$, 'blocked');
select t('7g keep the path but drop the fingerprint', :S, $$update inspection_items set after_sha256 = null where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 2)$$, 'blocked');
select t('7h LEGIT retake: the server registers a newer file', :SRV, $$select reg('BB-112', 2, 'after-1700000000004.jpg', 'sam.patel@university.edu', repeat('c', 64))$$, 'allowed');
select t('7i LEGIT notes on an item that already has a file', :S, $$update inspection_items set after_notes = 'two slats bent' where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 2)$$, 'allowed');
select t('7j LEGIT admin reassigns a room that has no evidence yet', :H, $$update units set assigned_student_email = 'mallory@university.edu', assigned_student_name = 'Mallory' where unit_code = 'FH-210A'$$, 'allowed');
select t('7k signed-out visitor calls owns_unit()', null, $$select owns_unit(gen_random_uuid())$$, 'blocked');
select t('7l student deletes with a table DELETE', :S, $$delete from units$$, 'blocked|no-rows');
rollback;

\echo == 8. Admin without the second factor (password only)
begin;
select t('8a read the dashboard', 'housing.admin@university.edu#aal1', $$select 1 from item_dashboard$$, 'no-rows');
select t('8b open a move-out', 'housing.admin@university.edu#aal1', $$select open_move_out((select id from units where unit_code = 'FH-304B'))$$, 'blocked');
select t('8c approve a fine', 'housing.admin@university.edu#aal1', $$update inspection_items set condition_status = 'NO_CHANGE'$$, 'no-rows|blocked');
select t('8d create a unit', 'housing.admin@university.edu#aal1', $$insert into units (unit_code, building_name, room_number, semester, assigned_student_name, assigned_student_email) values ('X-1', 'X', '1', 'Fall 2026', 'X', 'x@university.edu')$$, 'blocked');
select t('8e LEGIT read own profile (so the app can ask for the code)', 'housing.admin@university.edu#aal1', $$select 1 from profiles where role = 'admin'$$, 'allowed');
select t('   (student uploads a 9 MB "photo")', :S, $$insert into storage.objects (bucket_id, name, metadata) values ('inspection-media', path_for('BB-112', 4, 'after-1700000000000.jpg'), '{"size": 9000000}')$$, 'allowed');
select t('8f a photo over 5 MB as evidence', :SRV, $$select reg('BB-112', 4, 'after-1700000000000.jpg', 'sam.patel@university.edu')$$, 'blocked');
rollback;

\echo == 9. Fingerprints are computed by the server (008): no API call lets a student choose one
begin;
select t('   (student uploads two move-out photos for item 1, one for item 3)', :S, $$insert into storage.objects (bucket_id, name) values ('inspection-media', path_for('BB-112', 1, 'after-1700000000010.jpg')), ('inspection-media', path_for('BB-112', 1, 'after-1700000000011.jpg')), ('inspection-media', path_for('BB-112', 3, 'after-1700000000010.jpg'))$$, 'allowed');
select t('9a student registers an uploaded file directly, fingerprint of their choosing', :S, $$update inspection_items set after_media_path = path_for('BB-112', 1, 'after-1700000000010.jpg'), after_media_type = 'image', after_sha256 = repeat('b', 64) where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 1)$$, 'blocked');
select t('9b student sets only a path (no fingerprint)', :S, $$update inspection_items set after_media_path = path_for('BB-112', 1, 'after-1700000000010.jpg') where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 1)$$, 'blocked');
select t('9c student calls register_evidence() itself', :S, $$select reg('BB-112', 1, 'after-1700000000010.jpg', 'sam.patel@university.edu', repeat('b', 64))$$, 'blocked');
select t('9d signed-out visitor calls register_evidence()', null, $$select register_evidence(gen_random_uuid(), 'after', 'x', repeat('b', 64), gen_random_uuid(), 'sam.patel@university.edu')$$, 'blocked');
select t('9e admin sets a path on a student''s item', :H, $$update inspection_items set after_media_path = path_for('BB-112', 1, 'after-1700000000010.jpg'), after_media_type = 'image', after_sha256 = repeat('b', 64) where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 1)$$, 'blocked');
select t('9f server: a caller who is not the assigned student', :SRV, $$select reg('BB-112', 1, 'after-1700000000010.jpg', 'mallory@university.edu')$$, 'blocked');
select t('9g server: the housing admin as caller', :SRV, $$select reg('BB-112', 1, 'after-1700000000010.jpg', 'housing.admin@university.edu')$$, 'blocked');
select t('9h server: a file that was never uploaded', :SRV, $$select reg('BB-112', 1, 'after-1700000000099.jpg', 'sam.patel@university.edu')$$, 'blocked');
select t('9i server: another item''s uploaded file', :SRV, $$select register_evidence(i.id, 'after', path_for('BB-112', 3, 'after-1700000000010.jpg'), repeat('a', 64), uid_for('sam.patel@university.edu'), 'sam.patel@university.edu') from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 1$$, 'blocked');
select t('9j server: a move-in file while move-out is open', :SRV, $$select reg('BB-112', 1, 'before-1700000000010.jpg', 'sam.patel@university.edu')$$, 'blocked');
select t('9k server: the move-in photo again as the move-out photo', :SRV, $$select register_evidence(i.id, 'after', i.before_media_path, repeat('a', 64), uid_for('sam.patel@university.edu'), 'sam.patel@university.edu') from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 1$$, 'blocked');
select t('9l server: a unit whose inspection is locked', :SRV, $$select reg('FH-304B', 1, 'after-1700000000010.jpg', 'alex.rivera@university.edu')$$, 'blocked');
select t('9m server: a fingerprint that is not 64 hex characters', :SRV, $$select reg('BB-112', 1, 'after-1700000000010.jpg', 'sam.patel@university.edu', 'abc')$$, 'blocked');
select t('9n LEGIT server registers the uploaded file', :SRV, $$select reg('BB-112', 1, 'after-1700000000010.jpg', 'sam.patel@university.edu')$$, 'allowed');
select t('9o ...path, type and fingerprint stored, capture time is the database clock', :S, $$select 1 from inspection_items where after_media_path = path_for('BB-112', 1, 'after-1700000000010.jpg') and after_media_type = 'image' and after_sha256 = repeat('a', 64) and after_captured_at = now()$$, 'allowed');
select t('9p ...and the audit log names the student', :H, $$select 1 from audit_log where table_name = 'inspection_items' and actor_email = 'sam.patel@university.edu' and actor = uid_for('sam.patel@university.edu') and new_row->>'after_sha256' = repeat('a', 64)$$, 'allowed');
select t('9q LEGIT the same file registered again (a retry)', :SRV, $$select reg('BB-112', 1, 'after-1700000000010.jpg', 'sam.patel@university.edu')$$, 'allowed');
select t('9r server: a registered file given a different fingerprint', :SRV, $$select reg('BB-112', 1, 'after-1700000000010.jpg', 'sam.patel@university.edu', repeat('b', 64))$$, 'blocked');
select t('9s student swaps the fingerprint', :S, $$update inspection_items set after_sha256 = repeat('b', 64) where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 1)$$, 'blocked');
select t('9t student points the row at their other uploaded file', :S, $$update inspection_items set after_media_path = path_for('BB-112', 1, 'after-1700000000011.jpg') where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 1)$$, 'blocked');
select t('9u student changes only the media type', :S, $$update inspection_items set after_media_type = 'video' where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 1)$$, 'blocked');
select t('9v student removes the path but leaves a fingerprint behind', :S, $$update inspection_items set after_media_path = null, after_media_type = null, after_sha256 = repeat('b', 64) where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 1)$$, 'blocked');
select t('9w student backdates the capture time (ignored, so nothing matches)', :S, $$update inspection_items set after_captured_at = '2020-01-01' where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 1); select 1 from inspection_items where after_captured_at = '2020-01-01'$$, 'no-rows');
select t('9x LEGIT student edits notes', :S, $$update inspection_items set after_notes = 'small chip on the frame' where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 1)$$, 'allowed');
select t('9y LEGIT student removes the photo', :S, $$update inspection_items set after_media_path = null, after_media_type = null, after_sha256 = null where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 1)$$, 'allowed');
select t('9z ...which clears the capture time and keeps the notes', :S, $$select 1 from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 1 and i.after_media_path is null and i.after_sha256 is null and i.after_captured_at is null and i.after_notes = 'small chip on the frame'$$, 'allowed');
select t('9aa LEGIT retake after removing: the server registers the newer file', :SRV, $$select reg('BB-112', 1, 'after-1700000000011.jpg', 'sam.patel@university.edu', repeat('d', 64))$$, 'allowed');
select t('9ab student removes a photo from a locked inspection', :A, $$update inspection_items set after_media_path = null, after_media_type = null, after_sha256 = null where unit_id = (select id from units where unit_code = 'FH-304B')$$, 'blocked');
select t('9ac student removes the locked move-in photo during move-out', :S, $$update inspection_items set before_media_path = null, before_media_type = null, before_sha256 = null where unit_id = (select id from units where unit_code = 'BB-112')$$, 'blocked');
rollback;
