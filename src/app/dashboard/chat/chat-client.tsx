"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Phone, Send, Sparkles } from "lucide-react";

import { AiProposalReviewDialog } from "@/app/dashboard/chat/ai-proposal-review-dialog";
import {
  ensureDmConversationAction,
  sendChatMessageAction,
} from "@/app/dashboard/chat/actions";
import type { PendingProposalRow } from "@/app/dashboard/ai-agent/pending-proposals-panel";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export const AI_AGENT_PEER_ID = "__erp_ai_agent__";

export type ChatColleague = {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
};

type ChatMessage = {
  id: string;
  body: string;
  user_id: string;
  created_at: string;
};

type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  body: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type ProposalCard = { id: string; title: string; summary: string };

function parseProposalCards(meta: unknown): ProposalCard[] {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return [];
  const m = meta as Record<string, unknown>;
  const raw = m.proposals;
  if (!Array.isArray(raw)) return [];
  const out: ProposalCard[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const title = typeof o.title === "string" ? o.title : "";
    const summary = typeof o.summary === "string" ? o.summary : "";
    if (id) out.push({ id, title, summary });
  }
  return out;
}

export function ChatClient({
  currentUserId,
  currentUserName,
  colleagues,
}: {
  currentUserId: string;
  currentUserName: string;
  colleagues: ChatColleague[];
}) {
  const [pending, startTransition] = useTransition();
  const [peerId, setPeerId] = useState<string | null>(null);
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [draft, setDraft] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceLabel, setVoiceLabel] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewProposal, setReviewProposal] = useState<PendingProposalRow | null>(null);
  const [aiPending, setAiPending] = useState(false);

  const isAiThread = peerId === AI_AGENT_PEER_ID;

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    m.set(currentUserId, currentUserName);
    for (const c of colleagues) {
      m.set(c.id, c.full_name?.trim() || c.email);
    }
    m.set(AI_AGENT_PEER_ID, "المساعد الذكي");
    return m;
  }, [colleagues, currentUserId, currentUserName]);

  const loadMessages = useCallback(
    async (cid: string) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("messages")
        .select("id,body,user_id,created_at")
        .eq("conversation_id", cid)
        .order("created_at", { ascending: true });
      if (error) {
        toast.error(error.message);
        return;
      }
      setMessages((data ?? []) as ChatMessage[]);
      requestAnimationFrame(() =>
        bottomRef.current?.scrollIntoView({ behavior: "smooth" })
      );
    },
    []
  );

  const loadAiMessages = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("ai_chat_messages")
      .select("id,role,body,metadata,created_at")
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) {
      toast.error(error.message);
      return;
    }
    setAiMessages((data ?? []) as AiChatMessage[]);
    requestAnimationFrame(() =>
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    );
  }, [currentUserId]);

  useEffect(() => {
    if (!convId || isAiThread) return;
    void loadMessages(convId);
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${convId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${convId}`,
        },
        (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, row];
          });
          requestAnimationFrame(() =>
            bottomRef.current?.scrollIntoView({ behavior: "smooth" })
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [convId, isAiThread, loadMessages]);

  useEffect(() => {
    if (!isAiThread) return;
    void loadAiMessages();
    const supabase = createClient();
    const channel = supabase
      .channel(`ai_chat:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ai_chat_messages",
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          void loadAiMessages();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isAiThread, currentUserId, loadAiMessages]);

  async function openThread(other: ChatColleague) {
    setPeerId(other.id);
    startTransition(async () => {
      try {
        const id = await ensureDmConversationAction(other.id);
        setConvId(id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "تعذر فتح المحادثة");
      }
    });
  }

  function openAiAgent() {
    setPeerId(AI_AGENT_PEER_ID);
    setConvId(null);
    setMessages([]);
    void loadAiMessages();
  }

  async function openProposalReview(proposalId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("ai_agent_proposals")
      .select("id,kind,title,summary,detail_json,proposed_action,created_at")
      .eq("id", proposalId)
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "تعذّر تحميل المقترح");
      return;
    }
    setReviewProposal(data as PendingProposalRow);
    setReviewOpen(true);
  }

  async function sendHuman() {
    if (!convId || !draft.trim()) return;
    const text = draft.trim();
    setDraft("");
    startTransition(async () => {
      try {
        await sendChatMessageAction(convId, text);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "تعذر الإرسال");
      }
    });
  }

  async function sendAi() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setStreamingText("");
    setAiPending(true);
    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) {
        const err = await res.text();
        toast.error(err || "تعذّر الاتصال بالمساعد");
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) {
        toast.error("لا يوجد تدفق استجابة");
        return;
      }
      const decoder = new TextDecoder();
      let carry = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        carry += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = carry.indexOf("\n\n")) !== -1) {
          const block = carry.slice(0, idx);
          carry = carry.slice(idx + 2);
          if (!block.startsWith("data: ")) continue;
          let parsed: { type?: string; text?: string };
          try {
            parsed = JSON.parse(block.slice(6)) as { type?: string; text?: string };
          } catch {
            continue;
          }
          if (parsed.type === "text" && typeof parsed.text === "string") {
            setStreamingText((s) => s + parsed.text);
          }
          if (parsed.type === "done") {
            setStreamingText("");
            await loadAiMessages();
          }
        }
      }
      if (carry.startsWith("data: ")) {
        try {
          const parsed = JSON.parse(carry.slice(6)) as { type?: string };
          if (parsed.type === "done") {
            setStreamingText("");
            await loadAiMessages();
          }
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الطلب");
    } finally {
      setAiPending(false);
    }
  }

  const activePeer = colleagues.find((c) => c.id === peerId);

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <Card className="lg:w-72 shrink-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">الأعضاء</CardTitle>
          <CardDescription className="text-xs">
            محادثة مع الزملاء أو مع المساعد الذكي (سياق شركتك وأدواتك المصرّح بها).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[420px]">
            <ul className="divide-y divide-border">
              <li
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-sm",
                  isAiThread ? "bg-violet-500/10 ring-1 ring-violet-500/25" : "hover:bg-muted/40"
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-start"
                  onClick={() => openAiAgent()}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-700 ring-1 ring-violet-500/30 dark:text-violet-200">
                      <Sparkles className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">المساعد الذكي (AI Agent)</p>
                      <p className="text-muted-foreground truncate text-[11px]">
                        أسئلة عن المهام والمستندات ومقترحات تنفيذ
                      </p>
                    </div>
                  </div>
                </button>
              </li>
              {colleagues.length === 0 ? (
                <li className="text-muted-foreground px-4 py-4 text-center text-xs">
                  لا يوجد زملاء للعرض في نطاق شركتك.
                </li>
              ) : (
                colleagues.map((c) => (
                  <li
                    key={c.id}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 text-sm",
                      peerId === c.id ? "bg-muted/60" : "hover:bg-muted/40"
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-start"
                      onClick={() => void openThread(c)}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar src={c.avatar_url} label={c.full_name || c.email} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{c.full_name || c.email}</p>
                          <p className="text-muted-foreground truncate text-[11px]">
                            {c.email}
                          </p>
                        </div>
                      </div>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 text-muted-foreground"
                      title="اتصال صوتي (قريباً)"
                      onClick={() => {
                        setVoiceLabel(c.full_name || c.email);
                        setVoiceOpen(true);
                      }}
                    >
                      <Phone className="size-4" />
                    </Button>
                  </li>
                ))
              )}
            </ul>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="flex min-h-[min(460px,calc(100dvh-12rem))] flex-1 flex-col overflow-hidden shadow-sm ring-1 ring-border/40">
        <CardHeader className="shrink-0 border-b border-border pb-3">
          <CardTitle className="text-base">
            {isAiThread
              ? "المساعد الذكي"
              : activePeer
                ? `محادثة مع ${activePeer.full_name || activePeer.email}`
                : "اختر عضواً"}
          </CardTitle>
          <CardDescription className="text-xs">
            {isAiThread
              ? "ردود تدفقية عبر الخادم — التنفيذ الفعلي يمر دائماً بموافقة المقترحات."
              : "تحديثات فورية عبر Supabase Realtime"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-0 p-0">
          <ScrollArea className="min-h-0 flex-1 rounded-none border-x-0 border-t-0 border-b border-border bg-muted/20 p-3">
            <div className="flex flex-col gap-2">
              {isAiThread ? (
                <>
                  {aiMessages.map((m) => {
                    const mine = m.role === "user";
                    const cards = mine ? [] : parseProposalCards(m.metadata);
                    return (
                      <div key={m.id} className="flex flex-col gap-2">
                        <div
                          className={cn(
                            "max-w-[90%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                            mine
                              ? "self-end bg-primary text-primary-foreground"
                              : "self-start bg-background ring-1 ring-border"
                          )}
                        >
                          <p className="text-[10px] opacity-80">
                            {mine ? "أنت" : "المساعد الذكي"} ·{" "}
                            {new Date(m.created_at).toLocaleTimeString("ar-SA", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                        </div>
                        {!mine && cards.length > 0 ? (
                          <div className="flex max-w-[90%] flex-col gap-2 self-start">
                            {cards.map((p) => (
                              <div
                                key={p.id}
                                className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-3 text-sm shadow-sm"
                              >
                                <p className="text-[10px] font-medium text-violet-700 dark:text-violet-200">
                                  مقترح يحتاج موافقة
                                </p>
                                <p className="mt-1 font-semibold leading-snug">{p.title}</p>
                                <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                                  {p.summary}
                                </p>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="mt-3"
                                  variant="secondary"
                                  onClick={() => void openProposalReview(p.id)}
                                >
                                  مراجعة وموافقة
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {streamingText ? (
                    <div className="max-w-[90%] self-start rounded-2xl bg-background px-3 py-2 text-sm shadow-sm ring-1 ring-violet-500/20">
                      <p className="text-[10px] text-muted-foreground">المساعد الذكي · يكتب…</p>
                      <p className="whitespace-pre-wrap leading-relaxed">{streamingText}</p>
                    </div>
                  ) : null}
                </>
              ) : (
                messages.map((m) => {
                  const mine = m.user_id === currentUserId;
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                        mine
                          ? "self-end bg-primary text-primary-foreground"
                          : "self-start bg-background ring-1 ring-border"
                      )}
                    >
                      <p className="text-[10px] opacity-80">
                        {nameById.get(m.user_id) ?? "—"} ·{" "}
                        {new Date(m.created_at).toLocaleTimeString("ar-SA", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>
          <div className="shrink-0 space-y-2 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm md:bg-background">
            <div className="flex gap-2">
            <Input
              placeholder={
                isAiThread ? "اسأل عن المهام أو المستندات أو طلب إجراء…" : "اكتب رسالتك…"
              }
              value={draft}
              disabled={
                (!convId && !isAiThread) || pending || (isAiThread && aiPending)
              }
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (isAiThread) void sendAi();
                  else void sendHuman();
                }
              }}
            />
            <Button
              type="button"
              disabled={
                (!convId && !isAiThread) || pending || aiPending || !draft.trim()
              }
              onClick={() => (isAiThread ? void sendAi() : void sendHuman())}
            >
              <Send className="size-4" />
            </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={voiceOpen} onOpenChange={setVoiceOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>اتصال صوتي</DialogTitle>
            <DialogDescription>
              الميزة قيد التخطيط: ربط WebRTC أو مزود مثل LiveKit للمكالمات الآمنة بين الأعضاء.
            </DialogDescription>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            العضو: <strong>{voiceLabel}</strong>
          </p>
          <Button type="button" onClick={() => setVoiceOpen(false)}>
            حسناً
          </Button>
        </DialogContent>
      </Dialog>

      <AiProposalReviewDialog
        proposal={reviewProposal}
        open={reviewOpen}
        onOpenChange={(o) => {
          setReviewOpen(o);
          if (!o) setReviewProposal(null);
        }}
        onResolved={() => void loadAiMessages()}
      />
    </div>
  );
}

function Avatar({ src, label }: { src: string | null; label: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className="size-9 shrink-0 rounded-full object-cover ring-1 ring-border"
      />
    );
  }
  const ch = label.trim().charAt(0) || "?";
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase ring-1 ring-border">
      {ch}
    </div>
  );
}
