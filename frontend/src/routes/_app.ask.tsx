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
    <div className="my-3 rounded-xl border border-border bg-surface-2 overflow-hidden shadow-xs font-mono text-[12.5px]">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-surface-3/80 border-b border-border text-muted-foreground text-[11px]">
        <span className="flex items-center gap-1.5 text-foreground/80 font-medium">
          <Terminal className="w-3.5 h-3.5 text-primary" /> {language || "code"}
        </span>
        <button onClick={handleCopy} className="inline-flex items-center gap-1 hover:text-foreground transition text-[11px]">
          {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-foreground/90 leading-relaxed whitespace-pre font-mono">{code}</pre>
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
    <div className="space-y-2 text-[14px] leading-relaxed text-foreground/90 font-sans">
      {parts.map((p, i) =>
        p.type === "code" ? (
          <CodeBlock key={i} code={p.content} language={p.language || "typescript"} />
        ) : (
          <div key={i} className="whitespace-pre-wrap">
            {p.content.split("\n\n").map((para, j) => (
              <p key={j} className={j > 0 ? "mt-3" : ""}>{para}</p>
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
  const isNewSession = search.new === "1";

  const [input, setInput] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null);
  const [copiedMsgIdx, setCopiedMsgIdx] = useState<number | null>(null);
  const [activeConvId, setActiveConvId] = useState<number | null>(conversationId);

  const bottomRef = useRef<HTMLDivElement>(null);

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
        text: `Sorry, an error occurred while processing your request: ${e?.message || "Unknown error"}. Please check your connection or LLM status in Settings.`,
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
    // Don't navigate to new:1 — just clear the conversation state.
    // The next question will lazily create a new conversation.
    navigate({ to: "/ask", search: { repo: repoId }, replace: true });
  }

  function copyMessage(text: string, idx: number) {
    navigator.clipboard.writeText(text);
    setCopiedMsgIdx(idx);
    setTimeout(() => setCopiedMsgIdx(null), 2000);
  }

  return (
    <div className="flex h-[calc(100vh-6.5rem)] rounded-2xl border border-border bg-surface-1 overflow-hidden shadow-sm">
      {/* Left Sidebar */}
      <div className="w-64 border-r border-border bg-surface-1/60 flex flex-col h-full shrink-0">
        <div className="p-3 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">AI Assistant</span>
            <span className="px-2 py-0.5 text-[10px] rounded-full bg-primary/10 border border-primary/30 text-primary font-medium">
              v2.0 Vector RAG
            </span>
          </div>

          {repos.length > 0 && (
            <label className="flex items-center gap-2 h-9 px-2.5 rounded-lg border border-border bg-surface-2 text-xs">
              <span className="text-muted-foreground text-xs shrink-0">Repo</span>
              <div className="relative flex-1 flex items-center min-w-0">
                <select
                  value={repoId}
                  onChange={(e) => handleRepoChange(e.target.value)}
                  className="w-full appearance-none bg-transparent text-foreground font-medium text-xs pr-4 focus:outline-none cursor-pointer truncate"
                >
                  {repos.map((r) => (
                    <option key={r.id} value={r.id} className="bg-background">{r.name}</option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-0 pointer-events-none" />
              </div>
            </label>
          )}

          <button
            onClick={handleNewConversation}
            className="w-full inline-flex items-center justify-center gap-2 h-8 rounded-lg border border-border bg-surface-2 hover:bg-surface-3 text-foreground text-xs font-medium transition"
          >
            <Plus className="w-3.5 h-3.5 text-primary" />
            New Conversation
          </button>
        </div>

        {/* Conversation History */}
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Conversations</div>
          {conversations.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground text-center">No conversations yet.</div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => handleSelectConversation(conv)}
                className={`w-full flex items-center gap-2 px-2.5 h-9 rounded-lg text-left text-xs transition truncate ${
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

        <div className="p-3 border-t border-border bg-surface-2/40 text-[11px] text-muted-foreground flex items-center justify-between">
          <span>Grounded on codebase</span>
          <RefreshCw className="w-3 h-3 text-muted-foreground" />
        </div>
      </div>

      {/* Main Chat Viewport */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-background">
        {/* Header Bar */}
        <div className="h-12 px-5 border-b border-border bg-surface-1/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center text-primary">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <span className="font-semibold text-xs text-foreground truncate">
              {activeRepo ? activeRepo.name : "Codebase AI Assistant"}
            </span>
            <span className="text-[11px] text-muted-foreground hidden sm:inline">• RAG Vector Search</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleNewConversation}
              className="text-xs text-muted-foreground hover:text-foreground transition inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> New Chat
            </button>
          </div>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-6">
          {messages.length === 0 && !pendingQuestion && (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
                <Sparkles className="w-7 h-7" />
              </div>
              <div className="max-w-md space-y-1">
                <h3 className="text-base font-semibold text-foreground">What would you like to know?</h3>
                <p className="text-xs text-muted-foreground">
                  Ask AutoScribe AI anything about architecture, route handlers, components, or databases.
                </p>
              </div>
              <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {suggested.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleAsk(q)}
                    className="p-3 text-left rounded-xl border border-border bg-surface-1 hover:border-primary/40 hover:bg-surface-2 transition group text-xs text-foreground/90 space-y-1 shadow-xs"
                  >
                    <div className="flex items-center justify-between text-muted-foreground group-hover:text-primary transition">
                      <span className="font-medium">Suggestion</span>
                      <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition" />
                    </div>
                    <div className="line-clamp-2">{q}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, idx) =>
            msg.role === "user" ? (
              <div key={idx} className="flex items-start justify-end gap-2.5">
                <div className="max-w-[80%] rounded-2xl rounded-tr-xs bg-primary text-primary-foreground px-4 py-3 text-xs md:text-sm font-medium shadow-xs">
                  {msg.text}
                </div>
                <div className="w-7 h-7 rounded-full bg-surface-3 border border-border flex items-center justify-center text-foreground shrink-0 text-xs">
                  <UserIcon className="w-3.5 h-3.5" />
                </div>
              </div>
            ) : (
              <div key={idx} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0 mt-1">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 space-y-4 rounded-2xl border border-border bg-surface-1 p-5 shadow-xs">
                  <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                    <span className="text-[11px] font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3" /> AutoScribe Response
                    </span>
                    <button
                      onClick={() => copyMessage(msg.text, idx)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition px-2 py-0.5 rounded bg-surface-2 border border-border"
                    >
                      {copiedMsgIdx === idx ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedMsgIdx === idx ? "Copied" : "Copy"}</span>
                    </button>
                  </div>

                  <FormattedMessageText text={msg.text} />

                  {msg.flow.length > 0 && (
                    <div className="rounded-xl bg-surface-2/70 border border-border p-3.5 space-y-2">
                      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-primary" /> Execution Flow
                      </div>
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {msg.flow.map((f, i) => (
                          <div key={f.label + i} className="flex items-center gap-2 shrink-0">
                            <div className="px-3 py-1.5 rounded-lg bg-surface-1 border border-border text-xs">
                              <div className="font-medium text-foreground">{f.label}</div>
                              <div className="text-[10px] text-muted-foreground">({f.meta})</div>
                            </div>
                            {i < msg.flow.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {msg.files.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Code2 className="w-3.5 h-3.5 text-primary" /> Source Files ({msg.files.length})
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {msg.files.map((f, i) => {
                          const githubUrl = activeRepo ? `https://github.com/${activeRepo.org}/${activeRepo.name}/blob/${activeRepo.branch}/${f.path}` : "#";
                          return (
                            <a
                              key={f.name + i}
                              href={githubUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="p-2.5 rounded-lg bg-surface-2 border border-border hover:border-primary/50 hover:bg-surface-3 transition flex items-center gap-2.5 text-left group"
                              title={`View ${f.path} on GitHub`}
                            >
                              <FileCode className="w-4 h-4 text-primary shrink-0 group-hover:scale-110 transition-transform" />
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium truncate text-foreground flex items-center gap-1">
                                  <span>{f.name}</span>
                                  <ArrowUpRight className="w-3 h-3 text-muted-foreground group-hover:text-primary transition shrink-0 opacity-0 group-hover:opacity-100" />
                                </div>
                                <div className="text-[10px] text-muted-foreground truncate">{f.path}</div>
                              </div>
                            </a>
                          );
                        })}

                      </div>
                    </div>
                  )}

                  {msg.followups.length > 0 && (
                    <div className="pt-2 border-t border-border/60">
                      <div className="text-[11px] font-medium text-muted-foreground mb-2">Suggested follow-ups:</div>
                      <div className="flex flex-wrap gap-2">
                        {msg.followups.map((q) => (
                          <button
                            key={q}
                            onClick={() => handleAsk(q)}
                            className="text-xs px-3 py-1 rounded-full bg-surface-2 border border-border hover:border-primary/40 transition text-foreground/90 hover:text-foreground"
                          >
                            {q} →
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          )}

          {pendingQuestion && (
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-tr-xs bg-primary text-primary-foreground px-4 py-3 text-xs md:text-sm font-medium">
                {pendingQuestion}
              </div>
            </div>
          )}

          {streamingMessage && (
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0 mt-1">
                <Bot className="w-4 h-4 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0 space-y-4 rounded-2xl border border-border bg-surface-1 p-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                  <span className="text-[11px] font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" /> AutoScribe Response
                  </span>
                </div>
                {streamingMessage.text ? (
                  <FormattedMessageText text={streamingMessage.text} />
                ) : (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                    Searching codebase &amp; generating response...
                  </div>
                )}
                {streamingMessage.files && streamingMessage.files.length > 0 && (
                  <div className="space-y-2 mt-4 pt-4 border-t border-border/60">
                    <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Code2 className="w-3.5 h-3.5 text-primary" /> Source Files ({streamingMessage.files.length})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {streamingMessage.files.map((f, i) => (
                        <div key={f.name + i} className="p-2.5 rounded-lg bg-surface-2 border border-border flex items-center gap-2.5 text-left opacity-70">
                          <FileCode className="w-4 h-4 text-primary shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium truncate text-foreground">{f.name}</div>
                            <div className="text-[10px] text-muted-foreground truncate">{f.path}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk(input);
          }}
          className="p-3 md:p-4 border-t border-border bg-surface-1/80 space-y-2 shrink-0"
        >
          <div className="relative flex items-center">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAsk(input);
                }
              }}
              placeholder={activeRepo ? `Ask anything about ${activeRepo.name}...` : "Ask a technical question..."}
              className="w-full h-11 pl-4 pr-12 rounded-xl bg-surface-2 border border-border text-xs md:text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition"
            />
            <button
              type="submit"
              disabled={isStreaming || !input.trim()}
              className="absolute right-1.5 h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:brightness-95 transition disabled:opacity-40"
            >
              {isStreaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
            <span>Press Enter to send</span>
            <span>AutoScribe Vector RAG</span>
          </div>
        </form>
      </div>
    </div>
  );
}
