-- Phase 13: structured conversation memory for AI agent / planning context

create table public.ai_conversation_memory (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.users (id) on delete cascade,
  session_id text not null default 'default',
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now (),
  constraint ai_conversation_memory_content_nonempty check (char_length(trim(content)) > 0)
);

create index ai_conversation_memory_user_session_created_idx
  on public.ai_conversation_memory (user_id, session_id, created_at desc);

alter table public.ai_conversation_memory enable row level security;

create policy ai_conversation_memory_select_own on public.ai_conversation_memory
for select using (user_id = auth.uid ());

create policy ai_conversation_memory_insert_own on public.ai_conversation_memory
for insert with check (user_id = auth.uid ());

grant select, insert on public.ai_conversation_memory to authenticated, service_role;
