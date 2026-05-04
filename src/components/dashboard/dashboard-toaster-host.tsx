"use client";

import dynamic from "next/dynamic";

const Toaster = dynamic(
  () => import("@/components/ui/sonner").then((m) => m.Toaster),
  { ssr: false }
);

/** Sonner only mounts in the browser — avoids hydration mismatches from toast internals. */
export function DashboardToasterHost() {
  return <Toaster richColors position="top-center" />;
}
