-- Phase 10: per-user AI assistant chat (separate from human DM messages)

create table public.ai_chat_messages (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now (),
  constraint ai_chat_body_nonempty check (char_length(trim(body)) > 0)
);

create index ai_chat_messages_user_created_idx on public.ai_chat_messages (user_id, created_at desc);

alter table public.ai_chat_messages enable row level security;

create policy ai_chat_messages_select_own on public.ai_chat_messages
for select using (user_id = auth.uid ());

create policy ai_chat_messages_insert_own on public.ai_chat_messages
for insert with check (user_id = auth.uid ());

grant select, insert on public.ai_chat_messages to authenticated, service_role;
