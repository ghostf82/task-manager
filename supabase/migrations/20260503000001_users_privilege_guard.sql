-- Prevent non–super-admins from toggling privileged flags via the anon/authenticated API.
-- Service-role updates (server-side admin client) bypass the guard via JWT role check.

create or replace function public.users_prevent_privilege_escalation ()
returns trigger
language plpgsql
as $$
begin
  if (select auth.jwt () ->> 'role') = 'service_role' then
    return new;
  end if;

  if new.is_super_admin is distinct from old.is_super_admin then
    if not coalesce(
      (select u.is_super_admin from public.users u where u.id = auth.uid ()),
      false
    ) then
      new.is_super_admin := old.is_super_admin;
    end if;
  end if;

  if new.must_change_password is distinct from old.must_change_password then
    if not coalesce(
      (select u.is_super_admin from public.users u where u.id = auth.uid ()),
      false
    ) then
      new.must_change_password := old.must_change_password;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists users_prevent_privilege_escalation on public.users;

create trigger users_prevent_privilege_escalation
before update on public.users
for each row
execute function public.users_prevent_privilege_escalation ();
