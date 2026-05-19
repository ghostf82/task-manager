-- AI chat sessions + notification archive/delete

create table public.ai_chat_sessions (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

create index ai_chat_sessions_user_updated_idx on public.ai_chat_sessions (user_id, updated_at desc);

alter table public.ai_chat_messages
  add column if not exists session_id uuid references public.ai_chat_sessions (id) on delete cascade;

create index if not exists ai_chat_messages_session_created_idx
  on public.ai_chat_messages (session_id, created_at);

-- Backfill legacy messages into one session per user
insert into public.ai_chat_sessions (user_id, title, created_at, updated_at)
select
  m.user_id,
  'محادثة سابقة',
  min(m.created_at),
  max(m.created_at)
from public.ai_chat_messages m
where m.session_id is null
group by m.user_id;

update public.ai_chat_messages m
set session_id = s.id
from public.ai_chat_sessions s
where m.session_id is null
  and s.user_id = m.user_id
  and s.title = 'محادثة سابقة';

alter table public.notifications
  add column if not exists archived_at timestamptz;

alter table public.ai_chat_sessions enable row level security;

create policy ai_chat_sessions_select_own on public.ai_chat_sessions
for select using (user_id = auth.uid ());

create policy ai_chat_sessions_insert_own on public.ai_chat_sessions
for insert with check (user_id = auth.uid ());

create policy ai_chat_sessions_update_own on public.ai_chat_sessions
for update using (user_id = auth.uid ())
with check (user_id = auth.uid ());

create policy ai_chat_sessions_delete_own on public.ai_chat_sessions
for delete using (user_id = auth.uid ());

create policy ai_chat_messages_delete_own on public.ai_chat_messages
for delete using (user_id = auth.uid ());

drop policy if exists notifications_delete_own on public.notifications;

create policy notifications_delete_own on public.notifications
for delete using (user_id = auth.uid ());

grant select, insert, update, delete on public.ai_chat_sessions to authenticated, service_role;
grant delete on public.ai_chat_messages to authenticated;
grant delete on public.notifications to authenticated;
