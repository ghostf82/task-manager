-- Phase 3: corporate tasks, notifications, tenant default roles, RLS fixes

-- ---------------------------------------------------------------------------
-- Fix: super admin must be able to read all application users
-- ---------------------------------------------------------------------------
drop policy if exists users_select_self_or_privileged on public.users;

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

-- ---------------------------------------------------------------------------
-- Membership job title (shown in footer / profile)
-- ---------------------------------------------------------------------------
alter table public.tenant_memberships
  add column if not exists job_title text;

-- ---------------------------------------------------------------------------
-- Corporate tasks
-- ---------------------------------------------------------------------------
create table public.corporate_tasks (
  id uuid primary key default gen_random_uuid (),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  display_number integer not null default -1,
  title text not null,
  assignee_id uuid references public.users (id) on delete set null,
  manager_id uuid references public.users (id) on delete set null,
  issued_on date not null default ((now() at time zone 'utc')::date),
  due_on date not null,
  follow_up_on date,
  status text not null default 'not_started'
    check (
      status in (
        'not_started',
        'in_progress',
        'completed',
        'on_hold',
        'cancelled'
      )
    ),
  completion_percent numeric(5, 2) not null default 0
    check (completion_percent >= 0 and completion_percent <= 100),
  notes text,
  followed_up_on date,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  unique (tenant_id, display_number)
);

create index corporate_tasks_tenant_due_idx on public.corporate_tasks (tenant_id, due_on);
create index corporate_tasks_assignee_idx on public.corporate_tasks (assignee_id);

create trigger corporate_tasks_set_updated_at
before update on public.corporate_tasks
for each row
execute function public.set_updated_at ();

-- Per-tenant sequential display number (الرقم)
create or replace function public.corporate_tasks_assign_display_number ()
returns trigger
language plpgsql
as $$
begin
  if new.display_number is not null and new.display_number <> -1 then
    return new;
  end if;
  select coalesce(max(display_number), 0) + 1
    into new.display_number
  from public.corporate_tasks
  where tenant_id = new.tenant_id;
  return new;
end;
$$;

drop trigger if exists corporate_tasks_assign_display_number on public.corporate_tasks;

create trigger corporate_tasks_assign_display_number
before insert on public.corporate_tasks
for each row
execute function public.corporate_tasks_assign_display_number ();

-- ---------------------------------------------------------------------------
-- Notifications (in-app; rows inserted by SECURITY DEFINER trigger)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null default 'info',
  title text not null,
  body text,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now ()
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Notify manager + super admins when «followed up today» is set to today (UTC date)
-- ---------------------------------------------------------------------------
create or replace function public.corporate_tasks_notify_follow_up ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_name text;
  v_today date := (now() at time zone 'utc')::date;
  v_fire boolean;
begin
  v_fire :=
    new.followed_up_on is not null
    and new.followed_up_on = v_today;

  if not v_fire then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.followed_up_on is not distinct from new.followed_up_on then
    return new;
  end if;

  select t.name into v_tenant_name from public.tenants t where t.id = new.tenant_id;

  insert into public.notifications (user_id, type, title, body, payload)
  select
    u.id,
    'task_follow_up',
    N'متابعة يومية للمهمة',
    format(
      N'تم اختيار «نعم» لمتابعة المهمة «%s» في شركة %s.',
      new.title,
      coalesce(v_tenant_name, N'—')
    ),
    jsonb_build_object('corporate_task_id', new.id, 'tenant_id', new.tenant_id)
  from public.users u
  where u.is_super_admin = true;

  if new.manager_id is not null then
    insert into public.notifications (user_id, type, title, body, payload)
    values (
      new.manager_id,
      'task_follow_up',
      N'متابعة يومية للمهمة',
      format(
        N'تم اختيار «نعم» لمتابعة المهمة «%s» في شركة %s.',
        new.title,
        coalesce(v_tenant_name, N'—')
      ),
      jsonb_build_object('corporate_task_id', new.id, 'tenant_id', new.tenant_id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists corporate_tasks_notify_follow_up on public.corporate_tasks;

create trigger corporate_tasks_notify_follow_up
after insert or update of followed_up_on on public.corporate_tasks
for each row
execute function public.corporate_tasks_notify_follow_up ();

-- ---------------------------------------------------------------------------
-- Default roles when a tenant is created
-- ---------------------------------------------------------------------------
create or replace function public.create_default_roles_for_tenant ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.roles (tenant_id, name, slug)
  values
    (new.id, N'مدير النظام', 'tenant_admin'),
    (new.id, N'مدير', 'manager'),
    (new.id, N'موظف', 'employee');
  return new;
end;
$$;

drop trigger if exists tenants_create_default_roles on public.tenants;

create trigger tenants_create_default_roles
after insert on public.tenants
for each row
execute function public.create_default_roles_for_tenant ();

-- Backfill roles for tenants that have none (idempotent)
insert into public.roles (tenant_id, name, slug)
select t.id, v.name, v.slug
from public.tenants t
cross join (
  values
    (N'مدير النظام', 'tenant_admin'),
    (N'مدير', 'manager'),
    (N'موظف', 'employee')
) as v (name, slug)
where not exists (
  select 1 from public.roles r where r.tenant_id = t.id and r.slug = v.slug
);

-- ---------------------------------------------------------------------------
-- RLS: corporate_tasks
-- ---------------------------------------------------------------------------
alter table public.corporate_tasks enable row level security;

create policy corporate_tasks_select on public.corporate_tasks
for select using (
  public.is_super_admin ()
  or tenant_id in (select public.user_tenant_ids ())
);

create policy corporate_tasks_insert on public.corporate_tasks
for insert with check (
  public.is_super_admin ()
  or tenant_id in (select public.user_tenant_ids ())
);

create policy corporate_tasks_update on public.corporate_tasks
for update using (
  public.is_super_admin ()
  or tenant_id in (select public.user_tenant_ids ())
) with check (
  public.is_super_admin ()
  or tenant_id in (select public.user_tenant_ids ())
);

create policy corporate_tasks_delete on public.corporate_tasks
for delete using (
  public.is_super_admin ()
  or tenant_id in (select public.user_tenant_ids ())
);

-- ---------------------------------------------------------------------------
-- RLS: notifications (read own)
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
for select using (user_id = auth.uid ());

create policy notifications_update_own on public.notifications
for update using (user_id = auth.uid ()) with check (user_id = auth.uid ());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.corporate_tasks to authenticated, service_role;
grant select, update on public.notifications to authenticated, service_role;
