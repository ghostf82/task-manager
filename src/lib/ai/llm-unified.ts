import "server-only";

import OpenAI from "openai";

import { trimHeaderSafeSecret } from "@/lib/env/bearer-key";

export type CallLLMOptions = {
  systemPrompt: string;
  userPrompt: string;
  /** Prefer JSON object responses when the provider supports it */
  jsonMode?: boolean;
  maxTokens?: number;
  /** analysis = deeper reasoning, fast_text = concise/quick */
  mode?: "fast_text" | "analysis";
};

export type CallLLMResult = {
  text: string;
  provider: "gemini" | "groq" | "openai";
};

const NO_KEYS_AR =
  "لم يُضبط أي مفتاح ذكاء اصطناعي على الخادم. أضِف أحد المتغيرات في ملف .env.local (محلياً) أو في Netlify → Environment: GEMINI_API_KEY أو GROQ_API_KEY أو OPENAI_API_KEY، ثم أعد تشغيل الخادم/النشر. يجب أن تكون القيمة ASCII فقط (بدون نص عربي من القوالب).";

const ALL_PROVIDERS_FAILED_AR =
  "تعذّر الحصول على رد من المزودين المتاحين. راجع المفاتيح في إعدادات النشر (مثل Netlify) أو البيئة المحلية.";
let groqLogged = false;

function anyApiKeyConfigured(): boolean {
  return !!(
    trimHeaderSafeSecret(process.env.GEMINI_API_KEY) ||
    trimHeaderSafeSecret(process.env.GROQ_API_KEY) ||
    trimHeaderSafeSecret(process.env.OPENAI_API_KEY)
  );
}

/** When only Gemini is configured, Groq/OpenAI never run — tell ops to add fallbacks on Netlify etc. */
function fallbackKeysHint(): string {
  const gemini = !!trimHeaderSafeSecret(process.env.GEMINI_API_KEY);
  const groq = !!trimHeaderSafeSecret(process.env.GROQ_API_KEY);
  const openai = !!trimHeaderSafeSecret(process.env.OPENAI_API_KEY);
  if (gemini && !groq && !openai) {
    return " لم يُضبط GROQ_API_KEY أو OPENAI_API_KEY على الخادم — أضف أحدهما في متغيرات البيئة (مثل Netlify) كنسخة احتياطية عند حدّ Gemini أو رفضه.";
  }
  return "";
}

/** Short Arabic hints from "Provider HTTP nnn: …" without appending raw JSON bodies */
function summarizeProviderFailures(errors: string[]): string {
  if (!errors.length) return "";
  const hints: string[] = [];
  for (const err of errors) {
    const m = err.match(/^(Gemini|Groq|OpenAI) HTTP (\d{3})/);
    if (!m) continue;
    const [, name, codeStr] = m;
    const code = Number(codeStr);
    if (code === 400) {
      hints.push(`${name}: مفتاح غير صالح أو طلب مرفوض (400)`);
    } else if (code === 429) {
      hints.push(`${name}: تجاوز الحصة أو معدل الطلبات (429)`);
    } else if (code === 401 || code === 403) {
      hints.push(`${name}: رفض المصادقة (${code})`);
    } else {
      hints.push(`${name}: خطأ ${code}`);
    }
  }
  if (!hints.length) return "";
  const unique = [...new Set(hints)];
  return ` ${unique.join(" — ")}.`;
}

async function geminiGenerate(opts: CallLLMOptions, timeoutMs = 45_000): Promise<string | null> {
  const key = trimHeaderSafeSecret(process.env.GEMINI_API_KEY);
  if (!key) return null;

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-1.5-pro";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

  const body: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: `${opts.systemPrompt}\n\n---\n\n${opts.userPrompt}` }],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: opts.maxTokens ?? 8192,
      ...(opts.jsonMode ? { responseMimeType: "application/json" } : {}),
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return text.trim() || null;
}

async function groqChat(opts: CallLLMOptions): Promise<string | null> {
  const key = trimHeaderSafeSecret(process.env.GROQ_API_KEY);
  if (!key) return null;
  if (process.env.NODE_ENV !== "production" && !groqLogged) {
    console.info("[ai] Groq fallback enabled (GROQ_API_KEY detected).");
    groqLogged = true;
  }

  const model = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: opts.maxTokens ?? 8192,
      ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: opts.userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Groq HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  return text.trim() || null;
}

function providerFromError(msg: string): "gemini" | "groq" | "openai" | null {
  if (msg.startsWith("Gemini HTTP")) return "gemini";
  if (msg.startsWith("Groq HTTP")) return "groq";
  if (msg.startsWith("OpenAI HTTP")) return "openai";
  return null;
}

function codeFromError(msg: string): number | null {
  const m = msg.match(/HTTP (\d{3})/);
  return m ? Number(m[1]) : null;
}

async function openaiChat(opts: CallLLMOptions): Promise<string | null> {
  const key = trimHeaderSafeSecret(process.env.OPENAI_API_KEY);
  if (!key) return null;

  const openai = new OpenAI({ apiKey: key });
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    temperature: 0.7,
    max_tokens: opts.maxTokens ?? 8192,
    ...(opts.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userPrompt },
    ],
  });

  const text = completion.choices[0]?.message?.content ?? "";
  return text.trim() || null;
}

/**
 * Multi-provider text completion with Gemini-first strategy.
 * Priority: Gemini → Groq → OpenAI.
 * Groq/OpenAI are emergency fallbacks if Gemini fails.
 * Used by analysis flows; chat tool-loop may use Groq/OpenAI SDK separately.
 */
export async function callLLM(opts: CallLLMOptions): Promise<CallLLMResult> {
  const errors: string[] = [];
  const order: Array<"gemini" | "groq" | "openai"> = ["gemini", "groq", "openai"];

  for (const provider of order) {
    try {
      if (provider === "gemini") {
        const out = await geminiGenerate(opts, 5_000);
        if (out) return { text: out, provider: "gemini" };
        continue;
      }
      if (provider === "groq") {
        const out = await groqChat(opts);
        if (out) return { text: out, provider: "groq" };
        continue;
      }
      const out = await openaiChat(opts);
      if (out) return { text: out, provider: "openai" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg);
      const p = providerFromError(msg);
      const code = codeFromError(msg);
      // Keep this silent for end users: immediately continue to emergency fallback.
      if (p === "gemini" && code === 429) continue;
    }
  }

  if (!anyApiKeyConfigured()) {
    return { text: NO_KEYS_AR, provider: "gemini" };
  }

  const summary = summarizeProviderFailures(errors);
  const hint = fallbackKeysHint();
  return {
    text: `${ALL_PROVIDERS_FAILED_AR}${summary}${hint || " تحقّق من مفاتيح Gemini/Groq/OpenAI في Netlify أو البيئة المحلية ثم أعد المحاولة."}`,
    provider: "gemini",
  };
}

export function buildExecutiveSystemPrompt(input: {
  date: string;
  memory: string;
  tools: string;
}): string {
  return `أنت موظف إلكتروني متخصص في إدارة الأعمال. تاريخ اليوم: ${input.date}.
سياق المحادثة السابق:
${input.memory}

أدواتك المتاحة:
${input.tools}

قواعدك:
- تجيب بالعربية الفصحى إذا المستخدم يكتب عربي.
- تطلب الموافقة قبل أي إجراء حساس.
- تُبلّغ المستخدم بكل خطوة قبل تنفيذها.
- إذا لم تفهم الطلب، تطلب التوضيح بأدب.`;
}
