import { PROGRAM_AUDIENCE, PROGRAM_SLUG } from "./contract";

/**
 * Exclusive portal catalog row this adapter binds to.
 * Almudayfer Vite at hr-task-manager stays `taskmanager` — not this product.
 */
export const CATALOG_SLUG = PROGRAM_SLUG;
export const CATALOG_AUDIENCE = PROGRAM_AUDIENCE;
export const CATALOG_PUBLIC_ORIGIN = "https://fared-taskmanager.netlify.app" as const;
export const CATALOG_TITLE = "إدارة مهام أودو";
export const CATALOG_KIND = "external" as const;
export const CATALOG_EXCLUSIVE = true;
export const CATALOG_EXCLUSIVE_TO = "portal_super_admin" as const;
export const CATALOG_FORBIDDEN_ORIGINS = [
  "https://hr-task-manager.netlify.app",
] as const;

export type ExclusiveCatalogRow = {
  slug: typeof CATALOG_SLUG;
  audience: typeof CATALOG_AUDIENCE;
  origin: typeof CATALOG_PUBLIC_ORIGIN;
  title: typeof CATALOG_TITLE;
  kind: typeof CATALOG_KIND;
  exclusive: true;
  exclusiveTo: typeof CATALOG_EXCLUSIVE_TO;
};

export function exclusiveCatalogRow(): ExclusiveCatalogRow {
  return {
    slug: CATALOG_SLUG,
    audience: CATALOG_AUDIENCE,
    origin: CATALOG_PUBLIC_ORIGIN,
    title: CATALOG_TITLE,
    kind: CATALOG_KIND,
    exclusive: true,
    exclusiveTo: CATALOG_EXCLUSIVE_TO,
  };
}

export function isForbiddenCatalogOrigin(origin: string): boolean {
  const trimmed = origin.trim().replace(/\/+$/, "");
  return (CATALOG_FORBIDDEN_ORIGINS as readonly string[]).includes(trimmed);
}
