"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import { dig } from "@/lib/i18n/dig";
import { dateLocaleFor, type AppLocale } from "@/lib/i18n/locale-core";
import type { MessageCatalog } from "@/lib/i18n/get-translator";

type DashboardI18nValue = {
  locale: AppLocale;
  dateLocale: string;
  t: (path: string) => string;
  catalog: MessageCatalog;
};

const DashboardI18nContext = createContext<DashboardI18nValue | null>(null);

export function DashboardI18nProvider({
  locale,
  catalog,
  children,
}: {
  locale: AppLocale;
  catalog: MessageCatalog;
  children: ReactNode;
}) {
  const t = useCallback(
    (path: string) => {
      const v = dig(catalog, path);
      if (v !== undefined) return v;
      if (process.env.NODE_ENV === "development") {
        console.warn(`[i18n] Missing key for locale "${locale}": ${path}`);
      }
      return path;
    },
    [catalog, locale],
  );

  const dl = dateLocaleFor(locale);
  const value = useMemo(
    () => ({
      locale,
      dateLocale: dl,
      t,
      catalog,
    }),
    [locale, dl, t, catalog],
  );

  return (
    <DashboardI18nContext.Provider value={value}>{children}</DashboardI18nContext.Provider>
  );
}

export function useDashboardI18n(): DashboardI18nValue {
  const ctx = useContext(DashboardI18nContext);
  if (!ctx) {
    throw new Error("useDashboardI18n must be used inside DashboardI18nProvider");
  }
  return ctx;
}
