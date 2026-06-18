-- Company-wide Odoo URL and connection mode (super-admin managed).
-- Per-user credentials remain in user_odoo_credentials (username + encrypted password).

create table public.company_odoo_settings (
  id text primary key default 'default',
  base_url text,
  connection_mode text not null default 'browser_session'
    check (connection_mode in ('browser_session', 'api')),
  api_database_name text,
  updated_at timestamptz not null default now (),
  updated_by uuid references public.users (id) on delete set null,
  constraint company_odoo_settings_singleton check (id = 'default')
);

create trigger company_odoo_settings_set_updated_at
before update on public.company_odoo_settings
for each row
execute function public.set_updated_at ();

alter table public.company_odoo_settings enable row level security;

-- Base URL is not a secret; employees need read access for linking UI.
create policy company_odoo_settings_select_authenticated on public.company_odoo_settings
for select to authenticated
using (true);

create policy company_odoo_settings_write_super on public.company_odoo_settings
for all to authenticated
using (public.is_super_admin ())
with check (public.is_super_admin ());

grant select, insert, update, delete on public.company_odoo_settings to authenticated, service_role;

insert into public.company_odoo_settings (id)
values ('default')
on conflict (id) do nothing;
