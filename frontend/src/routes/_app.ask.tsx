import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRepos } from "@/lib/repo-store";
import {
  Send,
  FileCode,
  ArrowRight,
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

export const Route = createFileRoute("/_app/ask")({
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
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 hover:text-foreground transition text-[11px]"
        >
          {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-foreground/90 leading-relaxed whitespace-pre font-mono">
        {code}
      </pre>
    </div>
  );
}

function FormattedMessageText({ text }: { text: string }) {
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "code", language: match[1] || "typescript", content: match[2].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.slice(lastIndex) });
  }

  return (
    <div className="space-y-2 text-[14px] leading-relaxed text-foreground/90 font-sans">
      {parts.map((p, i) =>
        p.type === "code" ? (
          <CodeBlock key={i} code={p.content} language={p.language} />
        ) : (
          <div key={i} className="whitespace-pre-wrap">
            {p.content.split("\n\n").map((para, j) => (
              <p key={j} className={j > 0 ? "mt-3" : ""}>
                {para}
              </p>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function Ask() {
  const { repos } = useRepos();
  const [repoId, setRepoId] = useState<string>(repos[0]?.id ?? "");
  const [input, setInput] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [copiedMsgIdx, setCopiedMsgIdx] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!repoId && repos[0]?.id) setRepoId(repos[0].id);
  }, [repos, repoId]);

  const activeRepo = repos.find((r) => r.id === repoId);

  const conversationQuery = useQuery({
    queryKey: ["conversation", repoId],
    queryFn: async () => {
      const res = await fetch(`/api/repos/${repoId}/conversation`);
      if (!res.ok) return { messages: [] as Message[] };
      return res.json() as Promise<{ messages: Message[] }>;
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

  const askMutation = useMutation({
    mutationFn: async (question: string) => {
      const res = await fetch(`/api/repos/${repoId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) throw new Error("Failed to get an answer");
      return res.json() as Promise<Message>;
    },
    onSuccess: () => {
      setPendingQuestion(null);
      queryClient.invalidateQueries({ queryKey: ["conversation", repoId || ""] });
    },
    onError: () => setPendingQuestion(null),
  });

  const messages = conversationQuery.data?.messages ?? [];
  const suggested = suggestedQuery.data?.questions ?? fallbackSuggestedQuestions;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, pendingQuestion]);

  function handleAsk(question: string) {
    const trimmed = question.trim();
    if (!trimmed || askMutation.isPending || !repoId) return;
    setPendingQuestion(trimmed);
    setInput("");
    askMutation.mutate(trimmed);
  }

  function handleRepoChange(nextId: string) {
    setRepoId(nextId);
    setInput("");
    setPendingQuestion(null);
  }

  function copyMessage(text: string, idx: number) {
    navigator.clipboard.writeText(text);
    setCopiedMsgIdx(idx);
    setTimeout(() => setCopiedMsgIdx(null), 2000);
  }

  return (
    <div className="flex h-[calc(100vh-6.5rem)] rounded-2xl border border-border bg-surface-1 overflow-hidden shadow-sm">
      {/* Left Sidebar: Threads & Context */}
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
                    <option key={r.id} value={r.id} className="bg-background">
                      {r.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-0 pointer-events-none" />
              </div>
            </label>
          )}

          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["conversation", repoId] })}
            className="w-full inline-flex items-center justify-center gap-2 h-8 rounded-lg border border-border bg-surface-2 hover:bg-surface-3 text-foreground text-xs font-medium transition"
          >
            <Plus className="w-3.5 h-3.5 text-primary" /> New Conversation
          </button>
        </div>

        {/* Thread History list */}
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Recent Questions</div>
          {messages.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground text-center">No messages yet.</div>
          ) : (
            messages
              .filter((m) => m.role === "user")
              .slice(-10)
              .map((m, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAsk(m.text)}
                  className="w-full flex items-center gap-2 px-2.5 h-8 rounded-lg text-left text-xs text-muted-foreground hover:text-foreground hover:bg-surface-2 transition truncate"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-primary shrink-0 opacity-70" />
                  <span className="truncate">{m.text}</span>
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
              onClick={() => queryClient.invalidateQueries({ queryKey: ["conversation", repoId] })}
              className="text-xs text-muted-foreground hover:text-foreground transition inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Reset
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
                        {msg.files.map((f, i) => (
                          <div
                            key={f.name + i}
                            className="p-2.5 rounded-lg bg-surface-2 border border-border hover:border-primary/40 transition flex items-center gap-2.5 text-left"
                          >
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
            <>
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-tr-xs bg-primary text-primary-foreground px-4 py-3 text-xs md:text-sm font-medium">
                  {pendingQuestion}
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface-1 p-4 text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                Searching codebase chunks & generating response...
              </div>
            </>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 md:p-4 border-t border-border bg-surface-1/80 space-y-2 shrink-0">
          <div className="relative flex items-center">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAsk(input);
              }}
              placeholder={activeRepo ? `Ask anything about ${activeRepo.name}...` : "Ask a technical question..."}
              className="w-full h-11 pl-4 pr-12 rounded-xl bg-surface-2 border border-border text-xs md:text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition"
            />
            <button
              onClick={() => handleAsk(input)}
              disabled={askMutation.isPending || !input.trim()}
              className="absolute right-1.5 h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:brightness-95 transition disabled:opacity-40"
            >
              {askMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
            <span>Press Enter to send</span>
            <span>AutoScribe Vector RAG</span>
          </div>
        </div>
      </div>
    </div>
  );
}