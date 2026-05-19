import "server-only";

import { bearerKeyIsLatin1Safe, trimHeaderSafeSecret } from "@/lib/env/bearer-key";

const GEMINI_ENV_NAMES = [
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
] as const;

export type LlmKeyRejectReason = "missing" | "empty" | "non_ascii";

export type LlmKeyDiagnostic = {
  effective: boolean;
  envVar: string | null;
  rawLength: number;
  rejectReason: LlmKeyRejectReason | null;
};

function diagnoseEnv(names: readonly string[]): LlmKeyDiagnostic {
  let sawEmpty = false;
  let emptyVar: string | null = null;
  let nonAsciiVar: string | null = null;
  let nonAsciiLen = 0;

  for (const name of names) {
    const raw = process.env[name];
    if (raw === undefined) continue;
    const trimmed = raw.trim();
    if (!trimmed) {
      sawEmpty = true;
      emptyVar = name;
      continue;
    }
    if (!bearerKeyIsLatin1Safe(trimmed)) {
      nonAsciiVar = name;
      nonAsciiLen = trimmed.length;
      continue;
    }
    return {
      effective: true,
      envVar: name,
      rawLength: trimmed.length,
      rejectReason: null,
    };
  }

  if (nonAsciiVar) {
    return {
      effective: false,
      envVar: nonAsciiVar,
      rawLength: nonAsciiLen,
      rejectReason: "non_ascii",
    };
  }
  if (sawEmpty && emptyVar) {
    return {
      effective: false,
      envVar: emptyVar,
      rawLength: 0,
      rejectReason: "empty",
    };
  }
  return {
    effective: false,
    envVar: null,
    rawLength: 0,
    rejectReason: "missing",
  };
}

/** Model IDs to try in order (configured first, then known-good fallbacks). */
export function getGeminiModelCandidates(): string[] {
  const configured = process.env.GEMINI_MODEL?.trim();
  const fallbacks = ["gemini-2.0-flash-001", "gemini-1.5-flash", "gemini-1.5-pro"];
  if (!configured) return fallbacks;
  const extras: string[] = [];
  if (configured === "gemini-2.0-flash") {
    extras.push("gemini-2.0-flash-001");
  }
  return [...new Set([configured, ...extras, ...fallbacks])];
}

export function resolveGeminiApiKey(): string | undefined {
  for (const name of GEMINI_ENV_NAMES) {
    const v = trimHeaderSafeSecret(process.env[name]);
    if (v) return v;
  }
  return undefined;
}

export function resolveGroqApiKey(): string | undefined {
  return trimHeaderSafeSecret(process.env.GROQ_API_KEY);
}

export function resolveOpenAiApiKey(): string | undefined {
  return trimHeaderSafeSecret(process.env.OPENAI_API_KEY);
}

export function getLlmKeysDiagnostic() {
  return {
    gemini: diagnoseEnv(GEMINI_ENV_NAMES),
    groq: diagnoseEnv(["GROQ_API_KEY"]),
    openai: diagnoseEnv(["OPENAI_API_KEY"]),
    geminiModel: process.env.GEMINI_MODEL?.trim() || null,
  };
}

export function isAnyLlmApiKeyConfigured(): boolean {
  return !!(resolveGeminiApiKey() || resolveGroqApiKey() || resolveOpenAiApiKey());
}

/** Short Arabic hint for UI when keys are not effective (no secret values). */
export function llmKeysBannerHintAr(): string | null {
  if (isAnyLlmApiKeyConfigured()) return null;
  const d = getLlmKeysDiagnostic();
  if (d.gemini.rejectReason === "empty") {
    return `المتغير ${d.gemini.envVar ?? "GEMINI_API_KEY"} موجود لكن قيمته فارغة — الصق مفتاح Gemini من Google AI Studio في .env.local أو Netlify ثم أعد التشغيل.`;
  }
  if (d.gemini.rejectReason === "non_ascii") {
    return `قيمة ${d.gemini.envVar ?? "GEMINI_API_KEY"} تحتوي أحرفاً غير إنجليزية (مثل نص عربي من القالب) — استبدلها بمفتاح ASCII فقط.`;
  }
  if (d.gemini.rejectReason === "missing" && d.geminiModel) {
    return `GEMINI_MODEL مضبوط (${d.geminiModel}) لكن لا يوجد مفتاح فعّال — أضِف GEMINI_API_KEY (أو GOOGLE_API_KEY) بقيمة غير فارغة.`;
  }
  return null;
}
