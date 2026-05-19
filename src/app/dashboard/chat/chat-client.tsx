"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { History, Phone, Send, Sparkles, X } from "lucide-react";

import {
  advanceExecutionPlanStepAction,
  approveExecutionPlanAction,
} from "@/app/dashboard/ai-agent/actions";
import { AiProposalReviewDialog } from "@/app/dashboard/chat/ai-proposal-review-dialog";
import {
  createAiChatSessionAction,
  deleteAiChatSessionsAction,
  deleteAllAiChatSessionsAction,
  ensureDmConversationAction,
  listAiChatSessionsAction,
  sendChatMessageAction,
  type AiChatSessionRow,
} from "@/app/dashboard/chat/actions";
import type { PendingProposalRow } from "@/app/dashboard/ai-agent/pending-proposals-panel";
import { useDashboardI18n } from "@/contexts/dashboard-i18n";
import { createClient } from "@/lib/supabase/client";
import { isLegacyAiChatSessionId, isMissingColumn } from "@/lib/supabase/schema-compat";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  className,
}: {
  currentUserId: string;
  currentUserName: string;
  colleagues: ChatColleague[];
  className?: string;
}) {
  const { t, dateLocale } = useDashboardI18n();
  const router = useRouter();
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
  const aiChatAbortRef = useRef<AbortController | null>(null);
  const skipAiRealtimeReloadRef = useRef(false);
  const aiSendInFlightRef = useRef(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewProposal, setReviewProposal] = useState<PendingProposalRow | null>(null);
  const [aiPending, setAiPending] = useState(false);
  const [planCard, setPlanCard] = useState<{
    proposalId: string;
    intent: string;
    steps: { tool: string; description: string; requiresApproval: boolean }[];
  } | null>(null);
  const [planIncludeChat, setPlanIncludeChat] = useState<boolean[]>([]);
  const [planPhaseChat, setPlanPhaseChat] = useState<"plan_review" | "running">("plan_review");
  const [planBusy, startPlanChat] = useTransition();
  const [aiSessionId, setAiSessionId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [aiSessions, setAiSessions] = useState<AiChatSessionRow[]>([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const scrollRafRef = useRef<number | null>(null);

  const isAiThread = peerId === AI_AGENT_PEER_ID;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior, block: "end" });
      scrollRafRef.current = null;
    });
  }, []);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    m.set(currentUserId, currentUserName);
    for (const c of colleagues) {
      m.set(c.id, c.full_name?.trim() || c.email);
    }
    m.set(AI_AGENT_PEER_ID, t("chatClient.aiAssistant"));
    return m;
  }, [colleagues, currentUserId, currentUserName, t]);

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
      scrollToBottom();
    },
    [scrollToBottom]
  );

  const loadAiMessages = useCallback(
    async (sessionId?: string | null) => {
      const sid = sessionId ?? aiSessionId;
      if (!sid) {
        setAiMessages([]);
        return;
      }
      const supabase = createClient();
      let query = supabase
        .from("ai_chat_messages")
        .select("id,role,body,metadata,created_at")
        .eq("user_id", currentUserId)
        .order("created_at", { ascending: false })
        .limit(150);
      if (!isLegacyAiChatSessionId(sid)) {
        query = query.eq("session_id", sid);
      }
      let { data, error } = await query;
      if (error && isMissingColumn(error, "session_id") && !isLegacyAiChatSessionId(sid)) {
        ({ data, error } = await supabase
          .from("ai_chat_messages")
          .select("id,role,body,metadata,created_at")
          .eq("user_id", currentUserId)
          .order("created_at", { ascending: false })
          .limit(150));
      }
      if (error) {
        toast.error(t("chatClient.toastSessionsFail"));
        return;
      }
      const chronological = [...(data ?? [])].reverse();
      setAiMessages(chronological as AiChatMessage[]);
      scrollToBottom();
    },
    [aiSessionId, currentUserId, scrollToBottom, t]
  );

  const refreshAiSessions = useCallback(async () => {
    try {
      const rows = await listAiChatSessionsAction();
      setAiSessions(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("chatClient.toastSessionsFail"));
    }
  }, [t]);

  const closeThread = useCallback(() => {
    aiChatAbortRef.current?.abort();
    setPeerId(null);
    setConvId(null);
    setMessages([]);
    setAiMessages([]);
    setAiSessionId(null);
    setStreamingText("");
    setDraft("");
    setPlanCard(null);
    setPlanIncludeChat([]);
    setPlanPhaseChat("plan_review");
    setAiPending(false);
  }, []);

  const startNewAiChat = useCallback(async () => {
    try {
      const id = await createAiChatSessionAction();
      setPeerId(AI_AGENT_PEER_ID);
      setConvId(null);
      setMessages([]);
      setAiSessionId(id);
      setAiMessages([]);
      setStreamingText("");
      setDraft("");
      setPlanCard(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("chatClient.toastOpenThreadFail"));
    }
  }, [t]);

  const openAiSession = useCallback(
    async (sessionId: string) => {
      setPeerId(AI_AGENT_PEER_ID);
      setConvId(null);
      setMessages([]);
      setAiSessionId(sessionId);
      setHistoryOpen(false);
      await loadAiMessages(sessionId);
    },
    [loadAiMessages]
  );

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, aiMessages.length, streamingText, scrollToBottom]);

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
          scrollToBottom();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [convId, isAiThread, loadMessages, scrollToBottom]);

  useEffect(() => {
    if (!isAiThread) {
      setPlanCard(null);
      setPlanIncludeChat([]);
      setPlanPhaseChat("plan_review");
      return;
    }
    if (aiSessionId) void loadAiMessages(aiSessionId);
    if (!aiSessionId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`ai_chat:${currentUserId}:${aiSessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ai_chat_messages",
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload) => {
          if (skipAiRealtimeReloadRef.current) return;
          const row = payload.new as { session_id?: string };
          if (row.session_id && row.session_id !== aiSessionId) return;
          void loadAiMessages(aiSessionId);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isAiThread, aiSessionId, currentUserId, loadAiMessages]);

  async function openThread(other: ChatColleague) {
    setPeerId(other.id);
    startTransition(async () => {
      try {
        const id = await ensureDmConversationAction(other.id);
        setConvId(id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("chatClient.toastOpenThreadFail"));
      }
    });
  }

  function openAiAgent() {
    void startNewAiChat();
  }

  async function openProposalReview(proposalId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("ai_agent_proposals")
      .select("id,kind,title,summary,detail_json,proposed_action,created_at")
      .eq("id", proposalId)
      .single();
    if (error || !data) {
      toast.error(error?.message ?? t("chatClient.toastLoadProposalFail"));
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
        scrollToBottom();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("chatClient.toastSendFail"));
      }
    });
  }

  useEffect(() => {
    return () => {
      aiChatAbortRef.current?.abort();
    };
  }, []);

  async function sendAi() {
    const text = draft.trim();
    if (!text || aiSendInFlightRef.current) return;

    let sessionId = aiSessionId;
    if (!sessionId) {
      try {
        sessionId = await createAiChatSessionAction();
        setAiSessionId(sessionId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("chatClient.toastOpenThreadFail"));
        return;
      }
    }

    const optimisticId = `temp-user-${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();
    setAiMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        role: "user",
        body: text,
        metadata: null,
        created_at: nowIso,
      },
    ]);
    setDraft("");
    setStreamingText("");
    setPlanCard(null);
    setPlanIncludeChat([]);
    setPlanPhaseChat("plan_review");
    scrollToBottom();

    aiSendInFlightRef.current = true;
    setAiPending(true);
    skipAiRealtimeReloadRef.current = true;

    aiChatAbortRef.current?.abort();
    const ac = new AbortController();
    aiChatAbortRef.current = ac;

    const rollbackOptimistic = () => {
      setAiMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    };

    try {
      const endpoint = new URL("/api/ai-chat", window.location.origin).href;
      /**
       * Browser extensions sometimes log `message channel closed` / `runtime.lastError` during long-lived
       * fetch + SSE reads; that noise cannot be removed from application code. AbortController + single in-flight
       * POST reduce dangling reads and false “hang” states from overlapping requests.
       */
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ content: text, sessionId }),
        signal: ac.signal,
      });

      if (!res.ok) {
        rollbackOptimistic();
        let errDetail = "";
        try {
          errDetail = await res.text();
        } catch {
          /* ignore */
        }
        toast.error(errDetail || t("chatClient.toastAiConnectFail"));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        rollbackOptimistic();
        toast.error(t("chatClient.toastNoResponseStream"));
        return;
      }

      const decoder = new TextDecoder();
      let carry = "";

      const drainSse = () => {
        carry = carry.replace(/\r\n/g, "\n");
        let idx: number;
        while ((idx = carry.indexOf("\n\n")) !== -1) {
          const block = carry.slice(0, idx);
          carry = carry.slice(idx + 2);
          const dataLines = block
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart());
          if (!dataLines.length) continue;
          const jsonPayload = dataLines.join("\n").replace(/^\uFEFF/, "");
          let parsed: {
            type?: string;
            text?: string;
            proposalId?: string;
            plan?: {
              intent: string;
              steps: { tool: string; description: string; requiresApproval: boolean }[];
            };
          };
          try {
            parsed = JSON.parse(jsonPayload) as typeof parsed;
          } catch {
            continue;
          }
          if (parsed.type === "plan_proposal" && parsed.proposalId && parsed.plan?.steps) {
            setPlanCard({
              proposalId: parsed.proposalId,
              intent: parsed.plan.intent,
              steps: parsed.plan.steps,
            });
            setPlanIncludeChat(parsed.plan.steps.map(() => true));
            setPlanPhaseChat("plan_review");
          }
          if (parsed.type === "text" && typeof parsed.text === "string") {
            setStreamingText((s) => s + parsed.text);
            scrollToBottom("auto");
          }
          /* Do not clear on "done" here: the same tick would wipe streamed text before
           * the assistant row is readable from Supabase. Clear after loadAiMessages(). */
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (value) {
            carry += decoder.decode(value, { stream: !done });
          }
          if (done) {
            carry += decoder.decode();
            drainSse();
            break;
          }
          drainSse();
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
          /* stream may already be closed */
        }
      }

      drainSse();
      await loadAiMessages();
      setStreamingText("");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        await loadAiMessages();
        setStreamingText("");
        return;
      }
      toast.error(e instanceof Error ? e.message : t("chatClient.toastRequestFail"));
      await loadAiMessages();
    } finally {
      skipAiRealtimeReloadRef.current = false;
      setAiPending(false);
      aiSendInFlightRef.current = false;
      aiChatAbortRef.current = null;
    }
  }

  const activePeer = colleagues.find((c) => c.id === peerId);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-4 lg:flex-row", className)}>
      <Card className="premium-surface w-full shrink-0 lg:w-72 lg:max-w-xs">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("chatClient.membersTitle")}</CardTitle>
          <CardDescription className="text-xs">{t("chatClient.membersSubtitle")}</CardDescription>
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
                      <p className="truncate font-medium">{t("chatClient.aiAssistantCardTitle")}</p>
                      <p className="text-muted-foreground truncate text-[11px]">
                        {t("chatClient.aiAssistantCardHint")}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
              {colleagues.length === 0 ? (
                <li className="text-muted-foreground px-4 py-4 text-center text-xs">
                  {t("chatClient.noColleagues")}
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
                      title={t("chatClient.voiceCallSoonTitle")}
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

      <Card className="premium-surface flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:max-h-[calc(100dvh-11.5rem)]">
        <CardHeader className="shrink-0 border-b border-border pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-base">
                {isAiThread
                  ? t("chatClient.threadTitleAi")
                  : activePeer
                    ? t("chatClient.threadTitleWithPeer").replace(
                        "{name}",
                        activePeer.full_name || activePeer.email
                      )
                    : t("chatClient.pickMember")}
              </CardTitle>
              <CardDescription className="text-xs">
                {isAiThread ? t("chatClient.threadDescAi") : t("chatClient.threadDescDm")}
              </CardDescription>
            </div>
            {peerId ? (
              <div className="flex shrink-0 gap-1">
                {isAiThread ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title={t("chatClient.historyTitle")}
                    onClick={() => {
                      void refreshAiSessions();
                      setHistoryOpen(true);
                    }}
                  >
                    <History className="size-4" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title={t("chatClient.closeThread")}
                  onClick={closeThread}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-0 p-0">
          {isAiThread && planCard ? (
            <div className="border-border/80 bg-muted/30 shrink-0 space-y-3 border-b p-3">
              <p className="text-xs font-medium text-violet-800 dark:text-violet-100">
                {t("chatClient.planCardTitle")}{" "}
                <span className="font-mono text-[10px] [direction:ltr]">({planCard.intent})</span>
              </p>
              <ul className="max-h-40 space-y-2 overflow-auto text-sm">
                {planCard.steps.map((step, i) => (
                  <li
                    key={i}
                    className="border-border/60 flex items-start gap-2 rounded-md border bg-background/80 p-2"
                  >
                    {planPhaseChat === "plan_review" ? (
                      <Checkbox
                        checked={planIncludeChat[i] ?? true}
                        onCheckedChange={(v) => {
                          setPlanIncludeChat((prev) => {
                            const next = [...prev];
                            next[i] = v === true;
                            return next;
                          });
                        }}
                      />
                    ) : (
                      <span className="text-muted-foreground w-5 text-center font-mono text-[10px]">
                        {i + 1}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[10px] text-violet-700 dark:text-violet-200">
                        {step.tool}
                      </p>
                      <p className="leading-relaxed">{step.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
              {planPhaseChat === "running" ? (
                <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-violet-500/70" />
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {planPhaseChat === "plan_review" ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      disabled={planBusy}
                      onClick={() => {
                        startPlanChat(async () => {
                          const skipped = planCard.steps
                            .map((_, i) => i)
                            .filter((i) => !planIncludeChat[i]);
                          const res = await approveExecutionPlanAction({
                            proposalId: planCard.proposalId,
                            skippedStepIndexes: skipped,
                          });
                          if (res.ok) {
                            toast.success(res.message);
                            setPlanPhaseChat("running");
                          } else {
                            toast.error(res.error);
                          }
                          router.refresh();
                        });
                      }}
                    >
                      {t("chatClient.planApprove")}
                    </Button>
                    <Link
                      prefetch={false}
                      href="/dashboard/ai-agent"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      {t("chatClient.planEdit")}
                    </Link>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setPlanCard(null);
                        setPlanIncludeChat([]);
                        setPlanPhaseChat("plan_review");
                      }}
                    >
                      {t("chatClient.planCancel")}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      disabled={planBusy}
                      onClick={() => {
                        startPlanChat(async () => {
                          const res = await advanceExecutionPlanStepAction(planCard.proposalId);
                          if (res.ok) {
                            toast.success(res.message.slice(0, 120));
                            if (res.done) {
                              setPlanCard(null);
                              setPlanPhaseChat("plan_review");
                            }
                          } else {
                            toast.error(res.error);
                          }
                          router.refresh();
                          void loadAiMessages();
                        });
                      }}
                    >
                      {t("chatClient.planNextStep")}
                    </Button>
                    <Link
                      prefetch={false}
                      href="/dashboard/ai-agent"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      {t("chatClient.planOpenAgent")}
                    </Link>
                  </>
                )}
              </div>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-none border-x-0 border-t-0 border-b border-border bg-muted/20 p-3">
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
                            {mine ? t("chatClient.labelYou") : t("chatClient.aiAssistant")} ·{" "}
                            <span suppressHydrationWarning>
                              {new Date(m.created_at).toLocaleTimeString(dateLocale, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
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
                                  {t("chatClient.proposalNeedsApproval")}
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
                                  {t("chatClient.reviewAndApprove")}
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {isAiThread && aiPending && !streamingText ? (
                    <div className="text-muted-foreground max-w-[90%] self-start rounded-lg px-2 py-1.5 text-xs italic">
                      {t("chatClient.assistantWritingNow")}
                    </div>
                  ) : null}
                  {streamingText &&
                  !(() => {
                    const last = aiMessages.at(-1);
                    return (
                      last?.role === "assistant" && last.body === streamingText
                    );
                  })() ? (
                    <div className="max-w-[90%] self-start rounded-2xl bg-background px-3 py-2 text-sm shadow-sm ring-1 ring-violet-500/20">
                      <p className="text-[10px] text-muted-foreground">{t("chatClient.aiAssistant")}</p>
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
                        <span suppressHydrationWarning>
                          {new Date(m.created_at).toLocaleTimeString(dateLocale, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </p>
                      <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>
          </div>
          <div className="shrink-0 space-y-2 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm md:bg-background">
            <div className="flex gap-2">
            <Input
              placeholder={isAiThread ? t("chatClient.placeholderAi") : t("chatClient.placeholderDm")}
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
            <DialogTitle>{t("chatClient.voiceTitle")}</DialogTitle>
            <DialogDescription>{t("chatClient.voiceDescription")}</DialogDescription>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            {t("chatClient.voicePeerLabel")} <strong>{voiceLabel}</strong>
          </p>
          <Button type="button" onClick={() => setVoiceOpen(false)}>
            {t("chatClient.voiceOk")}
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

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("chatClient.historyTitle")}</DialogTitle>
            <DialogDescription>{t("chatClient.historyDesc")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => void startNewAiChat()}>
              {t("chatClient.newChat")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={selectedSessionIds.size === 0}
              onClick={() => {
                const ids = [...selectedSessionIds];
                if (!ids.length) return;
                if (!confirm(t("chatClient.confirmDeleteSessions"))) return;
                startTransition(async () => {
                  try {
                    await deleteAiChatSessionsAction(ids);
                    setSelectedSessionIds(new Set());
                    if (aiSessionId && ids.includes(aiSessionId)) closeThread();
                    await refreshAiSessions();
                    toast.success(t("chatClient.sessionsDeleted"));
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : t("chatClient.toastSessionsFail"));
                  }
                });
              }}
            >
              {t("chatClient.deleteSelected")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => {
                if (!confirm(t("chatClient.confirmDeleteAllSessions"))) return;
                startTransition(async () => {
                  try {
                    await deleteAllAiChatSessionsAction();
                    setSelectedSessionIds(new Set());
                    closeThread();
                    await refreshAiSessions();
                    toast.success(t("chatClient.sessionsDeleted"));
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : t("chatClient.toastSessionsFail"));
                  }
                });
              }}
            >
              {t("chatClient.deleteAllHistory")}
            </Button>
          </div>
          <ScrollArea className="max-h-72">
            <ul className="divide-y divide-border">
              {aiSessions.length === 0 ? (
                <li className="text-muted-foreground px-2 py-6 text-center text-xs">
                  {t("chatClient.noSessions")}
                </li>
              ) : (
                aiSessions.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 px-1 py-2">
                    <Checkbox
                      checked={selectedSessionIds.has(s.id)}
                      onCheckedChange={(v) => {
                        setSelectedSessionIds((prev) => {
                          const next = new Set(prev);
                          if (v === true) next.add(s.id);
                          else next.delete(s.id);
                          return next;
                        });
                      }}
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-start text-sm"
                      onClick={() => void openAiSession(s.id)}
                    >
                      <p className="truncate font-medium">
                        {s.title?.trim() || t("chatClient.untitledSession")}
                      </p>
                      <p className="text-muted-foreground text-[10px]" suppressHydrationWarning>
                        {new Date(s.updated_at).toLocaleString(dateLocale, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </p>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </ScrollArea>
        </DialogContent>
      </Dialog>
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
