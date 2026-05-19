import "server-only";

import { trimHeaderSafeSecret } from "@/lib/env/bearer-key";

export function isAnyLlmApiKeyConfigured(): boolean {
  return !!(
    trimHeaderSafeSecret(process.env.GEMINI_API_KEY) ||
    trimHeaderSafeSecret(process.env.GROQ_API_KEY) ||
    trimHeaderSafeSecret(process.env.OPENAI_API_KEY)
  );
}
