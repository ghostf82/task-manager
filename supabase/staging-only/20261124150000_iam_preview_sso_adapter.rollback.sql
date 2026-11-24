-- PREVIEW / STAGING ONLY rollback. Do not run on Production.
-- Inverse of 20261124150000_iam_preview_sso_adapter.sql

drop trigger if exists platform_identity_links_touch on public.platform_identity_links;
drop function if exists public.sso_revoke_local_sessions(uuid);
drop function if exists public.sso_touch_identity_link ();
drop table if exists public.platform_sso_jti;
drop table if exists public.platform_identity_links;
