-- Phase 4: personal reminders, chat (DM), avatar column, storage, realtime

-- ---------------------------------------------------------------------------
-- User avatar URL
-- ---------------------------------------------------------------------------
alter table public.users
  add column if not exists avatar_url text;

-- ---------------------------------------------------------------------------
-- Personal reminders
-- ---------------------------------------------------------------------------
create table public.personal_reminders (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  remind_at timestamptz not null,
  recurrence text not null default 'once'
    check (recurrence in ('once', 'daily', 'weekly')),
  sound_enabled boolean not null default true,
  email_enabled boolean not null default true,
  is_active boolean not null default true,
  last_fired_at timestamptz,
  last_email_at timestamptz,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

create index personal_reminders_user_next_idx on public.personal_reminders (user_id, remind_at)
  where is_active = true;

create trigger personal_reminders_set_updated_at
before update on public.personal_reminders
for each row
execute function public.set_updated_at ();

-- ---------------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid (),
  tenant_id uuid references public.tenants (id) on delete set null,
  kind text not null default 'dm' check (kind in ('dm', 'tenant_channel')),
  title text,
  dm_key text unique,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now ()
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  joined_at timestamptz not null default now (),
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid (),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now (),
  constraint messages_body_nonempty check (char_length(trim(body)) > 0)
);

create index messages_conversation_created_idx on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Chat helper
-- ---------------------------------------------------------------------------
create or replace function public.user_conversation_ids ()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select cp.conversation_id
  from public.conversation_participants cp
  where cp.user_id = auth.uid ();
$$;

grant execute on function public.user_conversation_ids () to authenticated, anon;

-- ---------------------------------------------------------------------------
-- RLS: personal_reminders
-- ---------------------------------------------------------------------------
alter table public.personal_reminders enable row level security;

create policy personal_reminders_select_own on public.personal_reminders
for select using (user_id = auth.uid () or public.is_super_admin ());

create policy personal_reminders_insert_own on public.personal_reminders
for insert with check (user_id = auth.uid ());

create policy personal_reminders_update_own on public.personal_reminders
for update using (user_id = auth.uid () or public.is_super_admin ())
with check (user_id = auth.uid () or public.is_super_admin ());

create policy personal_reminders_delete_own on public.personal_reminders
for delete using (user_id = auth.uid () or public.is_super_admin ());

-- ---------------------------------------------------------------------------
-- RLS: chat
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

create policy conversations_select on public.conversations
for select using (
  public.is_super_admin ()
  or id in (select public.user_conversation_ids ())
);

create policy conversations_insert on public.conversations
for insert with check (created_by = auth.uid () or public.is_super_admin ());

create policy conversation_participants_select on public.conversation_participants
for select using (
  public.is_super_admin ()
  or user_id = auth.uid ()
  or conversation_id in (select public.user_conversation_ids ())
);

create policy conversation_participants_insert on public.conversation_participants
for insert with check (
  public.is_super_admin ()
  or conversation_id in (
    select c.id
    from public.conversations c
    where c.created_by = auth.uid ()
  )
);

create policy messages_select on public.messages
for select using (
  public.is_super_admin ()
  or conversation_id in (select public.user_conversation_ids ())
);

create policy messages_insert on public.messages
for insert with check (
  user_id = auth.uid ()
  and conversation_id in (select public.user_conversation_ids ())
);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.personal_reminders to authenticated, service_role;
grant select, insert, update, delete on public.conversations to authenticated, service_role;
grant select, insert, update, delete on public.conversation_participants to authenticated, service_role;
grant select, insert, update, delete on public.messages to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Realtime (Supabase): stream new messages
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.messages';
  exception
    when duplicate_object then null;
    when undefined_object then null;
    when others then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage bucket: avatars
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_insert_own" on storage.objects;
drop policy if exists "avatars_update_own" on storage.objects;
drop policy if exists "avatars_delete_own" on storage.objects;

create policy "avatars_public_read"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "avatars_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername (name))[1] = auth.uid ()::text
);

create policy "avatars_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername (name))[1] = auth.uid ()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername (name))[1] = auth.uid ()::text
);

create policy "avatars_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername (name))[1] = auth.uid ()::text
);
