/** UI line for header strip; `stale` when last sync is older than six hours. */
export function formatOdooLastSyncLine(opts: {
  locale: "ar" | "en";
  iso: string | null;
}): { text: string | null; stale: boolean } {
  if (!opts.iso) return { text: null, stale: false };
  const d = new Date(opts.iso);
  if (Number.isNaN(d.getTime())) return { text: null, stale: false };
  const hours = (Date.now() - d.getTime()) / 3600000;
  const stale = hours > 6;
  const pad = (n: number) => String(n).padStart(2, "0");
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const h = Math.max(0, Math.floor(hours));
  if (opts.locale === "ar") {
    return {
      text: `آخر مزامنة Odoo: منذ ${h} ساعة (${dd}/${mm} ${hh}:${mi})`,
      stale,
    };
  }
  return {
    text: `Last Odoo sync: ${h}h ago (${dd}/${mm} ${hh}:${mi})`,
    stale,
  };
}
