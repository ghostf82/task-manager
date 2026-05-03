-- Phase 8: AI tool licenses per user (governance). Super admin assigns; users read own licenses.

-- ---------------------------------------------------------------------------
-- user_ai_tools
-- ---------------------------------------------------------------------------
create table public.user_ai_tools (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.users (id) on delete cascade,
  tool_slug text not null,
  assigned_by uuid references public.users (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  constraint user_ai_tools_slug_nonempty check (char_length(trim(tool_slug)) > 0),
  constraint user_ai_tools_slug_format check (tool_slug ~ '^[a-z][a-z0-9_]*$'),
  unique (user_id, tool_slug)
);

create index user_ai_tools_user_active_idx on public.user_ai_tools (user_id)
  where is_active = true;

create trigger user_ai_tools_set_updated_at
before update on public.user_ai_tools
for each row
execute function public.set_updated_at ();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.user_ai_tools enable row level security;

create policy user_ai_tools_select_own_or_super on public.user_ai_tools
for select using (
  user_id = auth.uid ()
  or public.is_super_admin ()
);

create policy user_ai_tools_insert_super on public.user_ai_tools
for insert with check (public.is_super_admin ());

create policy user_ai_tools_update_super on public.user_ai_tools
for update using (public.is_super_admin ())
with check (public.is_super_admin ());

create policy user_ai_tools_delete_super on public.user_ai_tools
for delete using (public.is_super_admin ());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.user_ai_tools to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Backfill: grant odoo + email to all existing users (super can revoke later)
-- ---------------------------------------------------------------------------
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
    ('odoo'),
    ('email')
) as v (slug)
on conflict (user_id, tool_slug) do nothing;
