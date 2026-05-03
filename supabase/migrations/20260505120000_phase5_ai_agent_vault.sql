-- Phase 5: encrypted credential vault (ciphertext only; app decrypts server-side),
-- AI agent proposals (human-in-the-loop), activity audit log.
-- Secrets are encrypted in Node (AES-256-GCM) before storage; never store plaintext passwords.

-- ---------------------------------------------------------------------------
-- Odoo integration (password_encrypted = app-layer ciphertext)
-- ---------------------------------------------------------------------------
create table public.user_odoo_credentials (
  user_id uuid primary key references public.users (id) on delete cascade,
  base_url text not null,
  database_name text,
  login_username text not null,
  password_encrypted text not null,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  constraint user_odoo_base_url_nonempty check (char_length(trim(base_url)) > 0),
  constraint user_odoo_login_nonempty check (char_length(trim(login_username)) > 0)
);

create trigger user_odoo_credentials_set_updated_at
before update on public.user_odoo_credentials
for each row
execute function public.set_updated_at ();

-- ---------------------------------------------------------------------------
-- Email IMAP / SMTP
-- ---------------------------------------------------------------------------
create table public.user_email_credentials (
  user_id uuid primary key references public.users (id) on delete cascade,
  imap_host text not null,
  imap_port int not null default 993,
  imap_use_tls boolean not null default true,
  imap_username text not null,
  imap_password_encrypted text not null,
  smtp_host text not null,
  smtp_port int not null default 465,
  smtp_use_tls boolean not null default true,
  smtp_username text not null,
  smtp_password_encrypted text not null,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  constraint user_email_imap_host_nonempty check (char_length(trim(imap_host)) > 0),
  constraint user_email_smtp_host_nonempty check (char_length(trim(smtp_host)) > 0)
);

create trigger user_email_credentials_set_updated_at
before update on public.user_email_credentials
for each row
execute function public.set_updated_at ();

-- ---------------------------------------------------------------------------
-- AI proposals
-- ---------------------------------------------------------------------------
create table public.ai_agent_proposals (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.users (id) on delete cascade,
  tenant_id uuid references public.tenants (id) on delete set null,
  kind text not null
    check (kind in ('email_reply', 'task_create', 'odoo_sync', 'generic', 'analysis')),
  title text not null,
  summary text not null,
  detail_json jsonb not null default '{}'::jsonb,
  proposed_action jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'rejected', 'executed', 'failed')),
  execution_error text,
  created_at timestamptz not null default now (),
  resolved_at timestamptz,
  executed_at timestamptz
);

create index ai_agent_proposals_user_status_idx on public.ai_agent_proposals (user_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Activity log
-- ---------------------------------------------------------------------------
create table public.ai_agent_activity_log (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.users (id) on delete cascade,
  proposal_id uuid references public.ai_agent_proposals (id) on delete set null,
  event_type text not null,
  message text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now ()
);

create index ai_agent_activity_log_user_created_idx on public.ai_agent_activity_log (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: vault — owner only (no super-admin read of personal secrets)
-- ---------------------------------------------------------------------------
alter table public.user_odoo_credentials enable row level security;

create policy user_odoo_credentials_select_own on public.user_odoo_credentials
for select using (user_id = auth.uid ());

create policy user_odoo_credentials_insert_own on public.user_odoo_credentials
for insert with check (user_id = auth.uid ());

create policy user_odoo_credentials_update_own on public.user_odoo_credentials
for update using (user_id = auth.uid ())
with check (user_id = auth.uid ());

create policy user_odoo_credentials_delete_own on public.user_odoo_credentials
for delete using (user_id = auth.uid ());

alter table public.user_email_credentials enable row level security;

create policy user_email_credentials_select_own on public.user_email_credentials
for select using (user_id = auth.uid ());

create policy user_email_credentials_insert_own on public.user_email_credentials
for insert with check (user_id = auth.uid ());

create policy user_email_credentials_update_own on public.user_email_credentials
for update using (user_id = auth.uid ())
with check (user_id = auth.uid ());

create policy user_email_credentials_delete_own on public.user_email_credentials
for delete using (user_id = auth.uid ());

-- ---------------------------------------------------------------------------
-- RLS: proposals & log — owner only
-- ---------------------------------------------------------------------------
alter table public.ai_agent_proposals enable row level security;

create policy ai_agent_proposals_select_own on public.ai_agent_proposals
for select using (user_id = auth.uid ());

create policy ai_agent_proposals_insert_own on public.ai_agent_proposals
for insert with check (user_id = auth.uid ());

create policy ai_agent_proposals_update_own on public.ai_agent_proposals
for update using (user_id = auth.uid ())
with check (user_id = auth.uid ());

create policy ai_agent_proposals_delete_own on public.ai_agent_proposals
for delete using (user_id = auth.uid ());

alter table public.ai_agent_activity_log enable row level security;

create policy ai_agent_activity_log_select_own on public.ai_agent_activity_log
for select using (user_id = auth.uid ());

create policy ai_agent_activity_log_insert_own on public.ai_agent_activity_log
for insert with check (user_id = auth.uid ());

create policy ai_agent_activity_log_delete_own on public.ai_agent_activity_log
for delete using (user_id = auth.uid ());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.user_odoo_credentials to authenticated, service_role;
grant select, insert, update, delete on public.user_email_credentials to authenticated, service_role;
grant select, insert, update, delete on public.ai_agent_proposals to authenticated, service_role;
grant select, insert, delete on public.ai_agent_activity_log to authenticated, service_role;
