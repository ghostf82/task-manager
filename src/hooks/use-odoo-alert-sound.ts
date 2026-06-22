"use client";

import { useEffect, useRef } from "react";

import { markSoundInteractionOk, playOdooAlertSound } from "@/lib/odoo-alerts/notification-sound";

/** Watch for new critical Odoo notifications and play sound after user interaction. */
export function useOdooAlertSoundWatcher(items: Array<{ id: string; type: string; read_at: string | null; payload?: Record<string, unknown> | null }>) {
  const seenRef = useRef<Set<string>>(new Set());
  const bootRef = useRef(false);

  useEffect(() => {
    const onInteract = () => markSoundInteractionOk();
    window.addEventListener("click", onInteract, { once: true });
    window.addEventListener("keydown", onInteract, { once: true });
    return () => {
      window.removeEventListener("click", onInteract);
      window.removeEventListener("keydown", onInteract);
    };
  }, []);

  useEffect(() => {
    if (!bootRef.current) {
      for (const item of items) seenRef.current.add(item.id);
      bootRef.current = true;
      return;
    }

    for (const item of items) {
      if (!item.type.startsWith("odoo_")) continue;
      if (item.read_at) continue;
      if (seenRef.current.has(item.id)) continue;
      seenRef.current.add(item.id);
      const sev = (item.payload?.severity as "critical" | "warning" | "info") ?? "info";
      playOdooAlertSound(sev);
    }
  }, [items]);
}
