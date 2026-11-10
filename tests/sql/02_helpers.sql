-- who = an email, optionally with "#aal1" (password only; the default is a session that passed MFA), or null = signed out.
create or replace function public.test_as(p_who text) returns void language plpgsql as $$
declare v_email text := split_part(p_who, '#', 1);
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = v_email),
    'email', v_email, 'role', 'authenticated', 'aal', coalesce(nullif(split_part(p_who, '#', 2), ''), 'aal2'))::text, true);
end $$;
create or replace function public.path_for(code text, step int, fname text) returns text language sql security definer as $$
  select u.id::text || '/' || i.id::text || '/' || fname from units u join inspection_items i on i.unit_id = u.id where u.unit_code = code and i.step_order = step $$;

create or replace function public.uid_for(p_email text) returns uuid language sql security definer as $$
  select id from auth.users where email = p_email $$;

-- What the register-evidence Edge Function does last, once it has authenticated p_email and hashed the stored
-- file: one call to register_evidence(). Run it with who = 'service_role' (see t() below). fname decides the phase.
create or replace function public.reg(code text, step int, fname text, p_email text, sha text default repeat('a', 64))
returns public.inspection_items language sql as $$
  select public.register_evidence(i.id, split_part(fname, '-', 1), public.path_for(code, step, fname), sha,
                                  public.uid_for(p_email), p_email)
  from public.units u join public.inspection_items i on i.unit_id = u.id where u.unit_code = code and i.step_order = step $$;

-- t(label, who, sql, expect): run sql as a user (null = signed out, 'service_role' = an Edge Function's service
-- key) and compare the outcome with what a secure system does.
create or replace function public.t(label text, who text, sql text, expect text) returns text language plpgsql as $$
declare outcome text; detail text := ''; n bigint;
begin
  if who is null then perform set_config('request.jwt.claims', '', true); execute 'set local role anon';
  elsif who = 'service_role' then perform set_config('request.jwt.claims', '{"role":"service_role"}', true); execute 'set local role service_role';
  else perform public.test_as(who); execute 'set local role authenticated'; end if;
  begin
    execute sql; get diagnostics n = row_count;
    outcome := case when n = 0 then 'no-rows' else 'allowed' end;
  exception when others then outcome := 'blocked'; detail := ': ' || left(sqlerrm, 70);
  end;
  execute 'reset role';
  return format('%s %s -> %s%s', case when outcome = any(string_to_array(expect, '|')) then 'ok        ' else '!! HOLE   ' end, label, outcome, detail);
end $$;
