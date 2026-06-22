"use client";

const STORAGE_KEY = "odoo_alert_sound_enabled";
const INTERACTION_KEY = "odoo_sound_interaction_ok";

/** Web Audio — soft chime for warnings, stronger pattern for critical. */
export function isOdooSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const v = localStorage.getItem(STORAGE_KEY);
  return v !== "false";
}

export function setOdooSoundEnabled(enabled: boolean) {
  localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
}

export function markSoundInteractionOk() {
  sessionStorage.setItem(INTERACTION_KEY, "1");
}

function canPlaySound(): boolean {
  return isOdooSoundEnabled() && sessionStorage.getItem(INTERACTION_KEY) === "1";
}

function playTone(freq: number, duration: number, gain = 0.08) {
  if (!canPlaySound() || typeof window === "undefined") return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
    osc.onended = () => void ctx.close();
  } catch {
    /* browser blocked */
  }
}

export function playOdooAlertSound(severity: "critical" | "warning" | "info") {
  if (!canPlaySound()) return;
  if (severity === "critical") {
    playTone(880, 0.12, 0.1);
    setTimeout(() => playTone(660, 0.15, 0.09), 140);
  } else if (severity === "warning") {
    playTone(740, 0.1, 0.06);
  } else {
    playTone(520, 0.06, 0.04);
  }
}
