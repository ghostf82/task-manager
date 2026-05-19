-- Chat attachments + peer ping notifications + storage bucket

alter table public.messages
  add column if not exists attachment_url text,
  add column if not exists attachment_type text,
  add column if not exists attachment_name text;

alter table public.messages drop constraint if exists messages_body_nonempty;

alter table public.messages
  add constraint messages_content_present check (
    char_length(trim(body)) > 0
    or attachment_url is not null
  );

-- Allow inserting chat_ping notifications for DM peers
drop policy if exists notifications_insert_chat_peer on public.notifications;

create policy notifications_insert_chat_peer on public.notifications
for insert
with check (
  public.is_super_admin ()
  or (
    type in ('chat_ping', 'chat_message')
    and user_id <> auth.uid ()
    and exists (
      select 1
      from public.conversation_participants cp_me
      join public.conversation_participants cp_them
        on cp_me.conversation_id = cp_them.conversation_id
      where cp_me.user_id = auth.uid ()
        and cp_them.user_id = notifications.user_id
    )
  )
);

insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

drop policy if exists chat_attachments_select on storage.objects;
create policy chat_attachments_select on storage.objects
for select to authenticated
using (
  bucket_id = 'chat-attachments'
  and (storage.foldername (name))[1]::uuid in (select public.user_conversation_ids ())
);

drop policy if exists chat_attachments_insert on storage.objects;
create policy chat_attachments_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'chat-attachments'
  and (storage.foldername (name))[1]::uuid in (select public.user_conversation_ids ())
  and (storage.foldername (name))[2] = auth.uid ()::text
);

drop policy if exists chat_attachments_delete on storage.objects;
create policy chat_attachments_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'chat-attachments'
  and (storage.foldername (name))[2] = auth.uid ()::text
);
