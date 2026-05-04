-- Grant new catalog tools (excel / calendar / file) to all users; super admin can revoke.

insert into public.user_ai_tools (user_id, tool_slug, assigned_by, is_active)
select
  u.id,
  v.slug,
  (
    select su.id
    from public.users su
    where su.is_super_admin = true
    order by su.created_at asc
    limit 1
  ),
  true
from public.users u
cross join (
  values
    ('excel'),
    ('calendar'),
    ('file')
) as v (slug)
on conflict (user_id, tool_slug) do nothing;
