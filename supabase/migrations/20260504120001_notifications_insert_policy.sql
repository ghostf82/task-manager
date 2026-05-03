-- Allow authenticated users to insert their own in-app notifications (e.g. personal reminders).

drop policy if exists notifications_insert_self on public.notifications;

create policy notifications_insert_self on public.notifications
for insert with check (user_id = auth.uid ());

grant insert on public.notifications to authenticated;
