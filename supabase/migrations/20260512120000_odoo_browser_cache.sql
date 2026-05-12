-- Cached snapshots from Odoo Browser Session fetches (per user, per kind).
-- RLS: users manage their own rows only.

create table public.odoo_browser_cache (
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now (),
  constraint odoo_browser_cache_kind_chk check (
    kind in ('workspace', 'tasks', 'projects', 'events', 'documents')
  ),
  constraint odoo_browser_cache_pkey primary key (user_id, kind)
);

create index odoo_browser_cache_user_updated_idx on public.odoo_browser_cache (user_id, updated_at desc);

alter table public.odoo_browser_cache enable row level security;

create policy odoo_browser_cache_select_own on public.odoo_browser_cache
for select using (user_id = auth.uid ());

create policy odoo_browser_cache_insert_own on public.odoo_browser_cache
for insert with check (user_id = auth.uid ());

create policy odoo_browser_cache_update_own on public.odoo_browser_cache
for update using (user_id = auth.uid ())
with check (user_id = auth.uid ());

create policy odoo_browser_cache_delete_own on public.odoo_browser_cache
for delete using (user_id = auth.uid ());

grant select, insert, update, delete on public.odoo_browser_cache to authenticated, service_role;
