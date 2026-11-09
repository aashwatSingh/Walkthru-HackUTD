-- who = an email, optionally with "#aal1" (password only; the default is a session that passed MFA), or null = signed out.
create or replace function public.test_as(p_who text) returns void language plpgsql as $$
declare v_email text := split_part(p_who, '#', 1);
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = v_email),
    'email', v_email, 'role', 'authenticated', 'aal', coalesce(nullif(split_part(p_who, '#', 2), ''), 'aal2'))::text, true);
end $$;
create or replace function public.path_for(code text, step int, fname text) returns text language sql security definer as $$
  select u.id::text || '/' || i.id::text || '/' || fname from units u join inspection_items i on i.unit_id = u.id where u.unit_code = code and i.step_order = step $$;

-- t(label, who, sql, expect): run sql as a user (null = signed out) and compare the outcome with what a secure system does.
create or replace function public.t(label text, who text, sql text, expect text) returns text language plpgsql as $$
declare outcome text; detail text := ''; n bigint;
begin
  if who is null then perform set_config('request.jwt.claims', '', true); execute 'set local role anon';
  else perform public.test_as(who); execute 'set local role authenticated'; end if;
  begin
    execute sql; get diagnostics n = row_count;
    outcome := case when n = 0 then 'no-rows' else 'allowed' end;
  exception when others then outcome := 'blocked'; detail := ': ' || left(sqlerrm, 70);
  end;
  execute 'reset role';
  return format('%s %s -> %s%s', case when outcome = any(string_to_array(expect, '|')) then 'ok        ' else '!! HOLE   ' end, label, outcome, detail);
end $$;
