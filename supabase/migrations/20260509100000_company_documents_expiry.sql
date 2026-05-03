-- Phase 9: company documents (expiry tracking) + idempotent cron alert dedupe

-- ---------------------------------------------------------------------------
-- company_documents
-- ---------------------------------------------------------------------------
create table public.company_documents (
  id uuid primary key default gen_random_uuid (),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  document_name text not null,
  document_number text,
  expiry_date date not null,
  alert_days_before integer not null default 30
    check (alert_days_before >= 0 and alert_days_before <= 730),
  status text not null default 'valid'
    check (status in ('valid', 'expired', 'renewal_pending')),
  file_url text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  constraint company_documents_name_nonempty check (char_length(trim(document_name)) > 0)
);

create index company_documents_tenant_expiry_idx on public.company_documents (tenant_id, expiry_date);

create trigger company_documents_set_updated_at
before update on public.company_documents
for each row
execute function public.set_updated_at ();

-- ---------------------------------------------------------------------------
-- Cron dedupe: one notification (per kind) per source per UTC calendar day
-- ---------------------------------------------------------------------------
create table public.expiry_alert_dedupe (
  id uuid primary key default gen_random_uuid (),
  source_type text not null check (source_type in ('company_document', 'corporate_task')),
  source_id uuid not null,
  alert_kind text not null check (alert_kind in ('approaching', 'overdue')),
  calendar_date date not null,
  created_at timestamptz not null default now (),
  unique (source_type, source_id, alert_kind, calendar_date)
);

create index expiry_alert_dedupe_calendar_idx on public.expiry_alert_dedupe (calendar_date);

-- ---------------------------------------------------------------------------
-- RLS: company_documents (same tenant scope as corporate_tasks)
-- ---------------------------------------------------------------------------
alter table public.company_documents enable row level security;

create policy company_documents_select on public.company_documents
for select using (
  public.is_super_admin ()
  or tenant_id in (select public.user_tenant_ids ())
);

create policy company_documents_insert on public.company_documents
for insert with check (
  public.is_super_admin ()
  or tenant_id in (select public.user_tenant_ids ())
);

create policy company_documents_update on public.company_documents
for update using (
  public.is_super_admin ()
  or tenant_id in (select public.user_tenant_ids ())
) with check (
  public.is_super_admin ()
  or tenant_id in (select public.user_tenant_ids ())
);

create policy company_documents_delete on public.company_documents
for delete using (
  public.is_super_admin ()
  or tenant_id in (select public.user_tenant_ids ())
);

-- Dedupe table: no client access; cron uses service_role (bypasses RLS)
alter table public.expiry_alert_dedupe enable row level security;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.company_documents to authenticated, service_role;
grant select, insert, delete on public.expiry_alert_dedupe to service_role;

-- Cron inserts notifications for other users (bypasses RLS but needs INSERT privilege)
grant insert on public.notifications to service_role;
