import { getTranslator } from "@/lib/i18n/get-translator";

/** Global footer line; copy comes from `footer.tagline` in locale catalogs. */
export async function AppFooter() {
  const { t } = await getTranslator();
  return (
    <footer className="border-t border-border/60 bg-background/80 px-4 py-3 text-center backdrop-blur-sm supports-[backdrop-filter]:bg-background/60">
      <p className="text-xs font-medium text-muted-foreground">{t("footer.tagline")}</p>
    </footer>
  );
}
