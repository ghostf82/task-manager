import type { Metadata } from "next";
import { Cairo, Geist_Mono } from "next/font/google";
import "./globals.css";

import { getLocale, localeDir } from "@/lib/i18n/get-locale";
import { getTranslator } from "@/lib/i18n/get-translator";
import { getMetadataBase } from "@/lib/site-url";

const cairoSans = Cairo({
  variable: "--font-geist-sans",
  subsets: ["latin", "arabic"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const { t } = await getTranslator(locale);
  const metadataBase = getMetadataBase();
  return {
    ...(metadataBase ? { metadataBase } : {}),
    title: t("meta.title"),
    description: t("meta.description"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const dir = localeDir(locale);

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${cairoSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
