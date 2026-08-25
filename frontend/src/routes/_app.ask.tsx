import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRepos } from "@/lib/repo-store";
import { z } from "zod";
import {
  Send,
  FileCode,
  ArrowRight,
  ArrowUpRight,
  Loader2,
  ChevronDown,
  Plus,
  MessageSquare,
  Bot,
  User as UserIcon,
  Copy,
  Check,
  Sparkles,
  RefreshCw,
  Code2,
  Layers,
  Terminal,
  GitBranch,
} from "lucide-react";

const searchSchema = z.object({
  repo: z.string().optional(),
  conversationId: z.string().optional(),
  new: z.string().optional(),
});

export const Route = createFileRoute("/_app/ask")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Ask AI · AutoScribe" },
      { name: "description", content: "Ask any question about your codebase and get answers grounded in real files, modules and architecture." },
      { property: "og:title", content: "Ask AI · AutoScribe" },
      { property: "og:description", content: "Conversational answers grounded in your repository." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Ask,
});

type FlowStep = { label: string; meta: string };
type SourceFile = { name: string; path: string };
type Message = {
  role: "user" | "assistant";
  text: string;
  flow: FlowStep[];
  files: SourceFile[];
  followups: string[];
};
type Conversation = {
  id: number;
  title: string;
  created_at: string;
};

const fallbackSuggestedQuestions = [
  "Where is authentication implemented?",
  "What does this repository do?",
  "What's the overall architecture?",
  "How are database models configured?",
  "List main API endpoints",
];

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="my-4 rounded-xl border border-border bg-surface-2 overflow-hidden shadow-xs font-mono text-[13px]">
      <div className="flex items-center justify-between px-4 py-2 bg-surface-3/80 border-b border-border text-muted-foreground text-[11px]">
        <span className="flex items-center gap-1.5 text-foreground/80 font-medium">
          <Terminal className="w-3.5 h-3.5 text-primary" /> {language || "code"}
        </span>
        <button onClick={handleCopy} className="inline-flex items-center gap-1 hover:text-foreground transition text-[11px] px-2 py-1 rounded-md hover:bg-surface-2">
          {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="p-5 overflow-x-auto text-foreground/90 leading-relaxed whitespace-pre font-mono">{code}</pre>
    </div>
  );
}

function FormattedMessageText({ text }: { text: string }) {
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  const parts: { type: string; content: string; language?: string }[] = [];
  let lastIndex = 0;
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
    parts.push({ type: "code", language: match[1] || "typescript", content: match[2].trim() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push({ type: "text", content: text.slice(lastIndex) });
  return (
    <div className="space-y-3 text-[15px] leading-[1.75] text-foreground/90 font-sans">
      {parts.map((p, i) =>
        p.type === "code" ? (
          <CodeBlock key={i} code={p.content} language={p.language || "typescript"} />
        ) : (
          <div key={i} className="whitespace-pre-wrap">
            {p.content.split("\n\n").map((para, j) => (
              <p key={j} className={j > 0 ? "mt-4" : ""}>{para}</p>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function Ask() {
  const { repos } = useRepos();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const queryClient = useQueryClient();

  const repoId = search.repo ?? repos[0]?.id ?? "";
  const conversationId = search.conversationId ? Number(search.conversationId) : null;

  const [input, setInput] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null);
  const [copiedMsgIdx, setCopiedMsgIdx] = useState<number | null>(null);
  const [activeConvId, setActiveConvId] = useState<number | null>(conversationId);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!search.repo && repos[0]?.id) {
      navigate({ to: "/ask", search: { repo: repos[0].id }, replace: true });
    }
  }, [repos, search.repo, navigate]);

  useEffect(() => {
    setActiveConvId(conversationId);
  }, [conversationId]);

  const activeRepo = repos.find((r) => r.id === repoId);

  const conversationsQuery = useQuery({
    queryKey: ["conversations", repoId],
    queryFn: async () => {
      const res = await fetch(`/api/repos/${repoId}/conversations`);
      if (!res.ok) return [] as Conversation[];
      return res.json() as Promise<Conversation[]>;
    },
    enabled: !!repoId,
  });

  const conversationQuery = useQuery({
    queryKey: ["conversation", repoId, activeConvId],
    queryFn: async () => {
      const url = activeConvId
        ? `/api/repos/${repoId}/conversation?conversation_id=${activeConvId}`
        : `/api/repos/${repoId}/conversation`;
      const res = await fetch(url);
      if (!res.ok) return { messages: [] as Message[], conversationId: null };
      return res.json() as Promise<{ messages: Message[]; conversationId: number | null }>;
    },
    enabled: !!repoId,
  });

  const suggestedQuery = useQuery({
    queryKey: ["suggested-questions", repoId],
    queryFn: async () => {
      const res = await fetch(`/api/repos/${repoId}/suggested-questions`);
      if (!res.ok) return { questions: fallbackSuggestedQuestions };
      return res.json() as Promise<{ questions: string[] }>;
    },
    enabled: !!repoId,
  });

  const messages = conversationQuery.data?.messages ?? [];
  const suggested = suggestedQuery.data?.questions ?? fallbackSuggestedQuestions;
  const conversations = conversationsQuery.data ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, pendingQuestion]);

  async function handleAsk(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isStreaming || !repoId) return;
    setIsStreaming(true);
    setPendingQuestion(trimmed);
    setInput("");
    setStreamingMessage({ role: "assistant", text: "", flow: [], files: [], followups: [] });

    let finalConvId = activeConvId;

    try {
      const convParam = activeConvId ? `?conversation_id=${activeConvId}` : "";
      const res = await fetch(`/api/repos/${repoId}/ask/stream${convParam}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      if (!res.ok) throw new Error("Failed to connect to AI assistant server");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      if (!reader) throw new Error("Stream response body unavailable");

      let done = false;
      let accText = "";
      let buffer = "";

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          for (const line of parts) {
            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6);
              try {
                const data = JSON.parse(dataStr);
                if (data.error) {
                  accText += `\n\n*(Error: ${data.error})*`;
                  setStreamingMessage((prev) => (prev ? { ...prev, text: accText } : null));
                } else if (data.token) {
                  accText += data.token;
                  setStreamingMessage((prev) => (prev ? { ...prev, text: accText } : null));
                } else if (data.done) {
                  if (data.conversationId) {
                    finalConvId = data.conversationId;
                  }
                  setStreamingMessage((prev) =>
                    prev ? { ...prev, flow: data.flow, files: data.files, followups: data.followups } : null
                  );
                }
              } catch (e) {
                console.error("Failed to parse SSE event", e, dataStr);
              }
            }
          }
        }
      }

      if (finalConvId) {
        setActiveConvId(finalConvId);
        queryClient.invalidateQueries({ queryKey: ["conversation", repoId, finalConvId] });
        queryClient.invalidateQueries({ queryKey: ["conversations", repoId] });
        navigate({
          to: "/ask",
          search: { repo: repoId, conversationId: String(finalConvId) },
          replace: true,
        });
      }
    } catch (e: any) {
      console.error(e);
      setStreamingMessage({
        role: "assistant",
        text: `Sorry, an error occurred: ${e?.message || "Unknown error"}. Please check your connection or LLM status in Settings.`,
        flow: [],
        files: [],
        followups: [],
      });
    } finally {
      setIsStreaming(false);
      setPendingQuestion(null);
      setStreamingMessage(null);
    }
  }

  function handleRepoChange(nextId: string) {
    setActiveConvId(null);
    navigate({ to: "/ask", search: { repo: nextId }, replace: true });
  }

  function handleSelectConversation(conv: Conversation) {
    setActiveConvId(conv.id);
    navigate({ to: "/ask", search: { repo: repoId, conversationId: String(conv.id) } });
  }

  function handleNewConversation() {
    setActiveConvId(null);
    setStreamingMessage(null);
    setPendingQuestion(null);
    setInput("");
    navigate({ to: "/ask", search: { repo: repoId }, replace: true });
  }

  function copyMessage(text: string, idx: number) {
    navigator.clipboard.writeText(text);
    setCopiedMsgIdx(idx);
    setTimeout(() => setCopiedMsgIdx(null), 2000);
  }

  const hasMessages = messages.length > 0 || !!pendingQuestion;

  return (
    <div className="flex h-[calc(100vh-6.5rem)] rounded-2xl border border-border bg-background overflow-hidden shadow-sm">
      {/* ─── Sidebar ──────────────────────────────────────────────────────── */}
      <div
        className={`${sidebarOpen ? "w-64" : "w-0"} shrink-0 border-r border-border bg-surface-1 flex flex-col h-full transition-all duration-300 overflow-hidden`}
      >
        {/* Sidebar header */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[13px] font-semibold text-foreground">Ask AI</span>
            </div>
            <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-primary/10 border border-primary/20 text-primary font-medium">
              RAG
            </span>
          </div>

          {/* Repo selector */}
          {repos.length > 0 && (
            <div className="flex items-center gap-2 h-9 px-3 rounded-xl border border-border bg-surface-2 text-xs cursor-pointer hover:border-primary/30 transition">
              <GitBranch className="w-3.5 h-3.5 text-primary shrink-0" />
              <div className="relative flex-1 flex items-center min-w-0">
                <select
                  value={repoId}
                  onChange={(e) => handleRepoChange(e.target.value)}
                  className="w-full appearance-none bg-transparent text-foreground font-medium text-xs pr-4 focus:outline-none cursor-pointer truncate"
                >
                  {repos.map((r) => (
                    <option key={r.id} value={r.id} className="bg-background">
                      {r.org}/{r.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-0 pointer-events-none" />
              </div>
            </div>
          )}

          <button
            onClick={handleNewConversation}
            className="w-full inline-flex items-center justify-center gap-2 h-9 rounded-xl border border-border bg-surface-2 hover:bg-surface-3 hover:border-primary/30 text-foreground text-xs font-medium transition"
          >
            <Plus className="w-3.5 h-3.5 text-primary" />
            New chat
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-0.5">
          <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Conversations
          </div>
          {conversations.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground text-center">No conversations yet.</div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => handleSelectConversation(conv)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs transition truncate ${
                  activeConvId === conv.id
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-70" />
                <span className="truncate">{conv.title}</span>
              </button>
            ))
          )}
        </div>

        <div className="p-3 border-t border-border text-[11px] text-muted-foreground text-center">
          Answers grounded in your codebase
        </div>
      </div>

      {/* ─── Main Chat Area ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative">

        {/* Top bar */}
        <div className="h-12 px-4 border-b border-border bg-background flex items-center justify-between shrink-0">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-surface-2 text-muted-foreground hover:text-foreground transition"
            title="Toggle sidebar"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-primary/15 flex items-center justify-center">
              <Bot className="w-3 h-3 text-primary" />
            </div>
            <span className="text-sm font-semibold text-foreground">
              {activeRepo ? `${activeRepo.org}/${activeRepo.name}` : "AutoScribe AI"}
            </span>
          </div>
          <button
            onClick={handleNewConversation}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition px-2 py-1 rounded-lg hover:bg-surface-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New chat</span>
          </button>
        </div>

        {/* Messages viewport — fills all available space */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {!hasMessages ? (
            /* ── Welcome / empty state ─────────────────────────────────── */
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm mb-6">
                <Sparkles className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                {activeRepo ? `Ask anything about ${activeRepo.name}` : "What would you like to know?"}
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mb-8">
                AutoScribe AI answers using real files, modules, and architecture from your connected repository.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
                {suggested.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleAsk(q)}
                    className="group p-4 text-left rounded-xl border border-border bg-surface-1 hover:border-primary/40 hover:bg-surface-2 transition shadow-xs"
                  >
                    <div className="flex items-center justify-between text-muted-foreground group-hover:text-primary transition mb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider">Suggestion</span>
                      <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition" />
                    </div>
                    <div className="text-[13px] text-foreground/90 line-clamp-2 leading-snug">{q}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ── Message thread ─────────────────────────────────────────── */
            <div className="max-w-3xl mx-auto w-full px-4 py-8 space-y-8">
              {messages.map((msg, idx) =>
                msg.role === "user" ? (
                  /* User bubble */
                  <div key={idx} className="flex items-start justify-end gap-3">
                    <div className="max-w-[75%] bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-5 py-3.5 text-sm font-medium shadow-sm leading-relaxed">
                      {msg.text}
                    </div>
                    <div className="w-8 h-8 rounded-full bg-surface-2 border border-border flex items-center justify-center shrink-0">
                      <UserIcon className="w-4 h-4 text-foreground" />
                    </div>
                  </div>
                ) : (
                  /* Assistant bubble */
                  <div key={idx} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0 mt-1">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Answer text */}
                      <FormattedMessageText text={msg.text} />

                      {/* Execution flow */}
                      {msg.flow.length > 0 && (
                        <div className="mt-5 rounded-xl bg-surface-1 border border-border p-4 space-y-2">
                          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-3">
                            <Layers className="w-3.5 h-3.5 text-primary" /> Execution Flow
                          </div>
                          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                            {msg.flow.map((f, i) => (
                              <div key={f.label + i} className="flex items-center gap-2 shrink-0">
                                <div className="px-3 py-2 rounded-lg bg-surface-2 border border-border text-xs">
                                  <div className="font-medium text-foreground">{f.label}</div>
                                  <div className="text-[10px] text-muted-foreground mt-0.5">({f.meta})</div>
                                </div>
                                {i < msg.flow.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Source files */}
                      {msg.files.length > 0 && (
                        <div className="mt-4 space-y-2">
                          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <Code2 className="w-3.5 h-3.5 text-primary" /> Source Files ({msg.files.length})
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {msg.files.map((f, i) => {
                              const githubUrl = activeRepo
                                ? `https://github.com/${activeRepo.org}/${activeRepo.name}/blob/${activeRepo.branch}/${f.path}`
                                : "#";
                              return (
                                <a
                                  key={f.name + i}
                                  href={githubUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-3 rounded-xl bg-surface-1 border border-border hover:border-primary/40 hover:bg-surface-2 transition flex items-center gap-3 group"
                                >
                                  <FileCode className="w-4 h-4 text-primary shrink-0" />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-medium truncate text-foreground flex items-center gap-1">
                                      <span>{f.name}</span>
                                      <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition shrink-0 text-primary" />
                                    </div>
                                    <div className="text-[10px] text-muted-foreground truncate">{f.path}</div>
                                  </div>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Follow-ups */}
                      {msg.followups.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-border/50">
                          <div className="text-[11px] font-medium text-muted-foreground mb-2">Suggested follow-ups:</div>
                          <div className="flex flex-wrap gap-2">
                            {msg.followups.map((q) => (
                              <button
                                key={q}
                                onClick={() => handleAsk(q)}
                                className="text-xs px-3 py-1.5 rounded-full bg-surface-1 border border-border hover:border-primary/40 hover:bg-surface-2 transition text-foreground/90"
                              >
                                {q} →
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Copy button */}
                      <button
                        onClick={() => copyMessage(msg.text, idx)}
                        className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition px-2 py-1 rounded-lg hover:bg-surface-1"
                      >
                        {copiedMsgIdx === idx ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedMsgIdx === idx ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                  </div>
                )
              )}

              {/* Pending user message */}
              {pendingQuestion && (
                <div className="flex items-start justify-end gap-3">
                  <div className="max-w-[75%] bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-5 py-3.5 text-sm font-medium shadow-sm">
                    {pendingQuestion}
                  </div>
                  <div className="w-8 h-8 rounded-full bg-surface-2 border border-border flex items-center justify-center shrink-0">
                    <UserIcon className="w-4 h-4 text-foreground" />
                  </div>
                </div>
              )}

              {/* Streaming response */}
              {streamingMessage && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-primary animate-pulse" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {streamingMessage.text ? (
                      <FormattedMessageText text={streamingMessage.text} />
                    ) : (
                      <div className="flex items-center gap-2.5 text-sm text-muted-foreground py-2">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        <span>Searching codebase &amp; generating response…</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* ─── Input Bar ─────────────────────────────────────────────────── */}
        <div className="border-t border-border bg-background px-4 py-4 shrink-0">
          <div className="max-w-3xl mx-auto">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAsk(input);
              }}
              className="relative"
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  // Auto-resize up to ~6 lines
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAsk(input);
                  }
                }}
                placeholder={
                  activeRepo
                    ? `Ask anything about ${activeRepo.org}/${activeRepo.name}…`
                    : "Ask a technical question about your codebase…"
                }
                rows={1}
                className="w-full resize-none pl-5 pr-14 py-4 rounded-2xl bg-surface-1 border border-border text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition shadow-sm leading-relaxed"
                style={{ minHeight: "56px", maxHeight: "160px" }}
              />
              <button
                type="submit"
                disabled={isStreaming || !input.trim()}
                className="absolute right-3 bottom-3 h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:brightness-95 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
            <p className="text-center text-[11px] text-muted-foreground mt-2.5">
              Press <kbd className="px-1 py-0.5 rounded bg-surface-2 border border-border font-mono text-[10px]">Enter</kbd> to send &nbsp;·&nbsp; <kbd className="px-1 py-0.5 rounded bg-surface-2 border border-border font-mono text-[10px]">Shift+Enter</kbd> for new line &nbsp;·&nbsp; AutoScribe Vector RAG
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
