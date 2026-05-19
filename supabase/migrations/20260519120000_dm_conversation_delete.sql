-- Allow participants to delete DM threads (messages cascade from conversations)

drop policy if exists messages_delete_participant on public.messages;
create policy messages_delete_participant on public.messages
for delete using (
  public.is_super_admin ()
  or conversation_id in (select public.user_conversation_ids ())
);

drop policy if exists conversations_delete_participant on public.conversations;
create policy conversations_delete_participant on public.conversations
for delete using (
  public.is_super_admin ()
  or id in (select public.user_conversation_ids ())
);
