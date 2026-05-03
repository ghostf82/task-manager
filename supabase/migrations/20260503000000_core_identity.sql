-- Phase 2: core identity, memberships, roles, RLS
-- Requires Supabase (PostgreSQL + auth.users)

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create unique index tenants_slug_unique on public.tenants (lower(slug));

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  national_id text,
  must_change_password boolean not null default true,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index users_email_idx on public.users (lower(email));

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  created_at timestamptz not null default now(),
  constraint roles_slug_nonempty check (char_length(slug) > 0)
);

create unique index roles_system_slug_unique
  on public.roles (lower(slug))
  where tenant_id is null;

create unique index roles_tenant_slug_unique
  on public.roles (tenant_id, lower(slug))
  where tenant_id is not null;

create table public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete restrict,
  status text not null default 'active' check (status in ('pending', 'active', 'suspended')),
  invited_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index tenant_memberships_user_idx on public.tenant_memberships (user_id);
create index tenant_memberships_tenant_idx on public.tenant_memberships (tenant_id);

-- ---------------------------------------------------------------------------
-- Sync profile row when an auth user is created
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, must_change_password, is_super_admin)
  values (new.id, new.email, true, false)
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user ();

-- Backfill existing auth users (e.g. first deploy) — safe to run repeatedly
insert into public.users (id, email, must_change_password, is_super_admin)
select au.id, au.email, true, false
from auth.users au
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- updated_at touch
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tenants_set_updated_at
before update on public.tenants
for each row
execute function public.set_updated_at ();

create trigger users_set_updated_at
before update on public.users
for each row
execute function public.set_updated_at ();

create trigger tenant_memberships_set_updated_at
before update on public.tenant_memberships
for each row
execute function public.set_updated_at ();

-- ---------------------------------------------------------------------------
-- RLS helpers (SECURITY DEFINER — bypasses RLS for the lookup body)
-- ---------------------------------------------------------------------------
create or replace function public.is_super_admin ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.is_super_admin from public.users u where u.id = auth.uid()),
    false
  );
$$;

create or replace function public.user_tenant_ids ()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tm.tenant_id
  from public.tenant_memberships tm
  where tm.user_id = auth.uid()
    and tm.status = 'active';
$$;

grant execute on function public.is_super_admin () to authenticated, anon;
grant execute on function public.user_tenant_ids () to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.tenants enable row level security;
alter table public.users enable row level security;
alter table public.roles enable row level security;
alter table public.tenant_memberships enable row level security;

-- tenants
create policy tenants_select on public.tenants
for select using (
  public.is_super_admin ()
  or id in (select public.user_tenant_ids ())
);

create policy tenants_insert on public.tenants
for insert with check (public.is_super_admin ());

create policy tenants_update on public.tenants
for update using (public.is_super_admin ()) with check (public.is_super_admin ());

create policy tenants_delete on public.tenants
for delete using (public.is_super_admin ());

-- users (application profile; credentials live in auth.users)
create policy users_select_self_or_privileged on public.users
for select using (
  id = auth.uid ()
  or public.is_super_admin ()
  or id in (
    select tm.user_id
    from public.tenant_memberships tm
    where tm.tenant_id in (select public.user_tenant_ids ())
      and tm.status = 'active'
  )
);

create policy users_update_self_or_super on public.users
for update using (
  id = auth.uid ()
  or public.is_super_admin ()
) with check (
  id = auth.uid ()
  or public.is_super_admin ()
);

-- roles
create policy roles_select on public.roles
for select using (
  public.is_super_admin ()
  or tenant_id is null
  or tenant_id in (select public.user_tenant_ids ())
);

create policy roles_write_super on public.roles
for all using (public.is_super_admin ()) with check (public.is_super_admin ());

-- tenant_memberships
create policy tenant_memberships_select on public.tenant_memberships
for select using (
  public.is_super_admin ()
  or user_id = auth.uid ()
  or tenant_id in (select public.user_tenant_ids ())
);

create policy tenant_memberships_write_super on public.tenant_memberships
for all using (public.is_super_admin ()) with check (public.is_super_admin ());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.tenants to authenticated, service_role;
grant select, insert, update, delete on public.users to authenticated, service_role;
grant select, insert, update, delete on public.roles to authenticated, service_role;
grant select, insert, update, delete on public.tenant_memberships to authenticated, service_role;
