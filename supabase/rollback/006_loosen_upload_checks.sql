-- EMERGENCY ONLY. Run this if photo uploads stop working after 006_hardening.sql.
-- It loosens just the two new upload checks back to how they were before 006 (everything else in 006 stays),
-- so students can upload again while the cause is found. Run 006_hardening.sql again to restore them.

begin;

-- Back to: a path only has to be inside this item's folder (no "file exists", type, size or fingerprint checks).
create or replace function check_evidence(p_prefix text, p_path text, p_old_path text, p_type text, p_sha text)
returns void language plpgsql as $$
begin
  if p_path is not null and left(p_path, length(p_prefix)) <> p_prefix then
    raise exception 'Evidence must be a photo uploaded for this item';
  end if;
end $$;

-- Back to: any file name inside the student's own unit folder, while either phase is open.
drop policy if exists "media: student uploads to own open unit" on storage.objects;
create policy "media: student uploads to own open unit" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'inspection-media'
    and exists (select 1 from public.units u
                where u.id::text = (storage.foldername(name))[1]
                  and u.assigned_student_email = lower(auth.jwt()->>'email')
                  and u.inspection_phase in ('MOVE_IN_OPEN','MOVE_OUT_OPEN'))
  );

commit;
