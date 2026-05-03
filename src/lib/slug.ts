export function slugify(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.length >= 2 ? s : `tenant-${crypto.randomUUID().slice(0, 8)}`;
}
