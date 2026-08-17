import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRepos } from "@/lib/repo-store";
import { Search, Send, FileCode, ThumbsUp, ThumbsDown, ArrowRight, Loader2, ChevronDown } from "lucide-react";

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
];

function Ask() {
  const { repos } = useRepos();
  const [repoId, setRepoId] = useState<string>(repos[0]?.id ?? "");
  const [input, setInput] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
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
      queryClient.invalidateQueries({ queryKey: ["conversation", repoId] });
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

  function copyText(text: string, idx: number) {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl tracking-tight font-semibold">AutoScribe AI Chat</h1>
            <span className="px-2 py-0.5 text-[10px] rounded-full bg-primary/10 border border-primary/30 text-primary font-medium">
              v2.0 Vector RAG
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Ask technical questions about your codebase, architecture flows, and APIs.
          </p>
        </div>

        {repos.length > 0 && (
          <label className="flex items-center gap-2 h-9 pl-3 pr-2 rounded-xl border border-border bg-surface-1 text-xs shadow-sm">
            <span className="text-muted-foreground text-xs hidden sm:inline">Active Context:</span>
            <div className="relative flex items-center">
              <select
                value={repoId}
                onChange={(e) => handleRepoChange(e.target.value)}
                className="appearance-none bg-transparent text-foreground font-medium text-xs pr-5 focus:outline-none cursor-pointer"
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
      </div>

      {repos.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-16 rounded-2xl border border-dashed border-border bg-surface-1/50">
          Connect a repository first to start asking questions about it.
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAsk(input);
              }}
              placeholder={activeRepo ? `Ask anything about ${activeRepo.name} codebase...` : "Ask a technical question..."}
              className="w-full h-12 pl-11 pr-14 rounded-xl bg-surface-1 border border-border text-[14px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition shadow-sm"
            />
            <button
              onClick={() => handleAsk(input)}
              disabled={askMutation.isPending || !input.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:brightness-95 transition disabled:opacity-40"
            >
              {askMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {suggested.map((q) => (
              <button
                key={q}
                onClick={() => handleAsk(q)}
                className="text-xs px-3 py-1.5 rounded-lg bg-surface-1 border border-border text-muted-foreground hover:text-foreground hover:bg-surface-2 hover:border-primary/30 transition shadow-xs"
              >
                💡 {q}
              </button>
            ))}
          </div>

          {/* Conversation */}
          <div className="space-y-6 pt-2">
            {messages.length === 0 && !pendingQuestion && (
              <div className="text-center py-16 rounded-2xl border border-dashed border-border/80 bg-surface-1/30 space-y-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary">
                  <FileCode className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-medium text-foreground">Ready to explore your codebase</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Ask questions about authentication, endpoints, database schemas, or code architecture.
                </p>
              </div>
            )}

            {messages.map((msg, idx) =>
              msg.role === "user" ? (
                <div key={idx} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-xs bg-primary text-primary-foreground px-4 py-3 text-sm font-medium shadow-sm">
                    {msg.text}
                  </div>
                </div>
              ) : (
                <div key={idx} className="rounded-2xl border border-border bg-surface-1 p-5 md:p-6 space-y-5 shadow-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary font-bold text-xs">
                        AS
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-foreground">AutoScribe AI</div>
                        <div className="text-[10px] text-muted-foreground">Grounded answer</div>
                      </div>
                    </div>

                    <button
                      onClick={() => copyText(msg.text, idx)}
                      className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded bg-surface-2 border border-border transition"
                    >
                      {copiedIdx === idx ? "✓ Copied" : "Copy"}
                    </button>
                  </div>

                  <div className="text-[14px] leading-relaxed text-foreground/90 whitespace-pre-wrap font-sans">
                    {msg.text}
                  </div>

                  {msg.flow.length > 0 && (
                    <div className="rounded-xl bg-surface-2/70 border border-border p-4">
                      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                        Architecture Flow
                      </div>
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {msg.flow.map((f, i) => (
                          <div key={f.label + i} className="flex items-center gap-2 shrink-0">
                            <div className="px-3 py-2 rounded-lg bg-surface-1 border border-border">
                              <div className="text-xs font-medium text-foreground">{f.label}</div>
                              <div className="text-[10px] text-muted-foreground">({f.meta})</div>
                            </div>
                            {i < msg.flow.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {msg.files.length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                        Source Files Referenced ({msg.files.length})
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
                            className="text-xs px-3 py-1 rounded-full bg-surface-2 border border-border hover:border-primary/40 transition text-foreground/80 hover:text-foreground"
                          >
                            {q} →
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            )}

            {pendingQuestion && (
              <>
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-xs bg-primary text-primary-foreground px-4 py-3 text-sm font-medium">
                    {pendingQuestion}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-surface-1 p-5 flex items-center gap-3 text-sm text-muted-foreground shadow-xs">
                  <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                  Analyzing vector embeddings & generating architectural response...
                </div>
              </>
            )}

            <div ref={bottomRef} />
          </div>
        </>
      )}
    </div>
  );
}