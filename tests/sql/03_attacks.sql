-- Attacks and must-keep-working flows. Each line states what a secure system does; "!! HOLE" fails the run.
\pset tuples_only on
\pset format unaligned
\set J '''jordan.lee@university.edu'''
\set S '''sam.patel@university.edu'''
\set A '''alex.rivera@university.edu'''
\set M '''mallory@university.edu'''
\set H '''housing.admin@university.edu'''

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
select t('2g LEGIT point the row at it with a real fingerprint', :S, $$update inspection_items set after_media_path = path_for('BB-112', 1, 'after-1700000000000.jpg'), after_media_type = 'image', after_sha256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 1)$$, 'allowed');
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
select t('   (student points the row at it)', :J, $$update inspection_items set before_media_path = path_for('FH-210A', 1, 'before-1700000000001.jpg'), before_media_type = 'image', before_sha256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'FH-210A' and i.step_order = 1)$$, 'allowed');
select t('5d reassign a room to yourself after evidence exists', :H, $$update units set assigned_student_email = 'housing.admin@university.edu' where unit_code = 'FH-210A'$$, 'blocked');
rollback;

\echo == 6. Things that must keep working
begin;
select t('6a student: 4 uploads', :J, $$insert into storage.objects (bucket_id, name) select 'inspection-media', path_for('FH-210A', s, 'before-170000000000' || s || '.jpg') from generate_series(1, 4) s$$, 'allowed');
select t('6b student: point all 4 rows at them', :J, $$update inspection_items i set before_media_path = path_for('FH-210A', i.step_order, 'before-170000000000' || i.step_order || '.jpg'), before_media_type = 'image', before_sha256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' where unit_id = (select id from units where unit_code = 'FH-210A')$$, 'allowed');
select t('6c student: remove one photo, then put it back', :J, $$update inspection_items set before_media_path = null, before_media_type = null, before_sha256 = null where unit_id = (select id from units where unit_code = 'FH-210A') and step_order = 2; update inspection_items i set before_media_path = path_for('FH-210A', 2, 'before-1700000000002.jpg'), before_media_type = 'image', before_sha256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' where unit_id = (select id from units where unit_code = 'FH-210A') and step_order = 2$$, 'allowed');
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
select t('   (register file 01)', :S, $$update inspection_items set after_media_path = path_for('BB-112', 2, 'after-1700000000001.jpg'), after_media_type = 'image', after_sha256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 2)$$, 'allowed');
select t('7d swap the fingerprint of a registered file', :S, $$update inspection_items set after_sha256 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 2)$$, 'blocked');
select t('7e call a photo a video', :S, $$update inspection_items set after_media_path = path_for('BB-112', 2, 'after-1700000000002.jpg'), after_media_type = 'video', after_sha256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 2)$$, 'blocked');
select t('7f point at another item''s uploaded file', :S, $$update inspection_items set after_media_path = path_for('BB-112', 2, 'after-1700000000003.jpg'), after_media_type = 'image', after_sha256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 3)$$, 'blocked');
select t('7g keep the path but drop the fingerprint', :S, $$update inspection_items set after_sha256 = null where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 2)$$, 'blocked');
select t('7h LEGIT retake: point at a newer file', :S, $$update inspection_items set after_media_path = path_for('BB-112', 2, 'after-1700000000004.jpg'), after_media_type = 'image', after_sha256 = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 2)$$, 'allowed');
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
select t('8f a photo over 5 MB as evidence', 'sam.patel@university.edu', $$insert into storage.objects (bucket_id, name, metadata) values ('inspection-media', path_for('BB-112', 4, 'after-1700000000000.jpg'), '{"size": 9000000}'); update inspection_items set after_media_path = path_for('BB-112', 4, 'after-1700000000000.jpg'), after_media_type = 'image', after_sha256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' where id = (select i.id from inspection_items i join units u on u.id = i.unit_id where u.unit_code = 'BB-112' and i.step_order = 4)$$, 'blocked');
rollback;
