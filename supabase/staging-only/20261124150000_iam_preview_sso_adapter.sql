-- PREVIEW / STAGING ONLY. Do not apply to Production.
--
-- Task-manager SSO adapter tables. Join key is platform_user_id (portal auth.users.id).
-- Email and username are never the durable join key. Passwords are never copied here.
-- Apply on a preview/staging Supabase project only, after the regular migration chain.

create table if not exists public.platform_identity_links (
  platform_user_id uuid primary key,
  local_user_id uuid not null references public.users (id) on delete cascade,
  local_role text not null default 'employee',
  link_status text not null default 'provisioned',
  grant_active boolean not null default true,
  suggested_by text,
  last_launch_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_identity_links_status_check check (
    link_status in ('none', 'suggested', 'linked', 'provisioned', 'not_ready', 'revoked')
  ),
  constraint platform_identity_links_role_check check (
    local_role in ('employee', 'member')
  )
);

comment on table public.platform_identity_links is
  'PREVIEW / STAGING ONLY. Maps portal platform_user_id to local auth.users.id. No password copy.';

create unique index if not exists platform_identity_links_local_unique
  on public.platform_identity_links (local_user_id)
  where link_status in ('linked', 'provisioned');

create index if not exists platform_identity_links_local_user_idx
  on public.platform_identity_links (local_user_id);

create table if not exists public.platform_sso_jti (
  jti text primary key,
  expires_at timestamptz not null,
  consumed_at timestamptz not null default now()
);

comment on table public.platform_sso_jti is
  'PREVIEW / STAGING ONLY. One-time launch JWT ids. Replay is denied.';

alter table public.platform_identity_links enable row level security;
alter table public.platform_sso_jti enable row level security;

-- No policies for anon/authenticated: service role only (launch/revoke routes).
revoke all on table public.platform_identity_links from public, anon, authenticated;
revoke all on table public.platform_sso_jti from public, anon, authenticated;

create or replace function public.sso_touch_identity_link ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  if new.local_role in ('admin', 'super_admin', 'owner', 'manager', 'tenant_admin')
     and (tg_op = 'INSERT' or old.local_role is distinct from new.local_role) then
    if new.suggested_by is distinct from 'manual' then
      new.local_role := 'employee';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists platform_identity_links_touch on public.platform_identity_links;
create trigger platform_identity_links_touch
before insert or update on public.platform_identity_links
for each row
execute function public.sso_touch_identity_link ();

-- GoTrue admin.signOut() requires a session JWT, not auth.users.id.
create or replace function public.sso_revoke_local_sessions(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.refresh_tokens where user_id = p_user;
  delete from auth.sessions where user_id = p_user;
end;
$$;

comment on function public.sso_revoke_local_sessions(uuid) is
  'PREVIEW / STAGING ONLY. Deletes GoTrue sessions/refresh tokens for a local user id.';

revoke all on function public.sso_revoke_local_sessions(uuid) from public, anon, authenticated;
