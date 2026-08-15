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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight font-medium">Ask AI</h1>
          <p className="mt-2 text-sm text-muted-foreground">Ask anything about your codebase</p>
        </div>

        {repos.length > 0 && (
          <label className="flex items-center gap-2 h-9 pl-3 pr-2 rounded-lg border border-border bg-surface-1 text-sm">
            <span className="text-muted-foreground text-xs hidden sm:inline">Repository</span>
            <div className="relative flex items-center">
              <select
                value={repoId}
                onChange={(e) => handleRepoChange(e.target.value)}
                className="appearance-none bg-transparent text-foreground text-sm pr-5 focus:outline-none cursor-pointer"
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
        <div className="text-sm text-muted-foreground text-center py-12 rounded-2xl border border-dashed border-border">
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
              placeholder={activeRepo ? `Ask anything about ${activeRepo.name}...` : "Ask anything about your codebase..."}
              className="w-full h-14 pl-11 pr-14 rounded-2xl bg-surface-1 border border-border text-[15px] placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/30 transition"
            />
            <button
              onClick={() => handleAsk(input)}
              disabled={askMutation.isPending}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:brightness-95 transition disabled:opacity-50"
            >
              {askMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {suggested.map((q) => (
              <button
                key={q}
                onClick={() => handleAsk(q)}
                className="text-xs px-3 py-1.5 rounded-full bg-surface-1 border border-border text-muted-foreground hover:text-foreground hover:bg-surface-2 transition"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Conversation */}
          <div className="space-y-6 pt-4">
            {messages.length === 0 && !pendingQuestion && (
              <div className="text-sm text-muted-foreground text-center py-12">
                Ask a question above to get started.
              </div>
            )}

            {messages.map((msg, idx) =>
              msg.role === "user" ? (
                <div key={idx} className="flex justify-end">
                  <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-surface-2 border border-border px-4 py-3 text-sm">
                    {msg.text}
                  </div>
                </div>
              ) : (
                <div key={idx} className="rounded-2xl border border-border bg-surface-1 p-6 space-y-6">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
                      <div className="w-2.5 h-2.5 rounded-sm bg-primary rotate-45" />
                    </div>
                    <div className="flex-1">
                      <div className="text-xs text-muted-foreground">AI Response</div>
                      <div
                        className="mt-2 text-[15px] leading-relaxed text-foreground/95"
                        dangerouslySetInnerHTML={{
                          __html: msg.text.replace(/\*\*(.*?)\*\*/g, '<span class="text-primary">$1</span>'),
                        }}
                      />
                    </div>
                  </div>

                  {msg.flow.length > 0 && (
                    <div className="rounded-xl bg-surface-2/60 border border-border p-4">
                      <div className="text-xs text-muted-foreground mb-3">Architecture flow</div>
                      <div className="flex items-center gap-2 overflow-x-auto">
                        {msg.flow.map((f, i) => (
                          <div key={f.label + i} className="flex items-center gap-2 shrink-0">
                            <div className="px-3 py-2 rounded-lg bg-surface-3 border border-border">
                              <div className="text-sm">{f.label}</div>
                              <div className="text-[10px] text-muted-foreground">({f.meta})</div>
                            </div>
                            {i < msg.flow.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground" />}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {msg.files.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-xs text-muted-foreground">Related Files ({msg.files.length})</div>
                        <div className="flex gap-1.5">
                          <button className="p-1.5 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-foreground"><ThumbsUp className="w-3.5 h-3.5" /></button>
                          <button className="p-1.5 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-foreground"><ThumbsDown className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-5 gap-2.5">
                        {msg.files.map((f, i) => (
                          <div key={f.name + i} className="p-3 rounded-xl bg-surface-2 border border-border hover:border-primary/30 transition cursor-pointer">
                            <FileCode className="w-4 h-4 text-primary/80 mb-2" />
                            <div className="text-xs font-medium truncate">{f.name}</div>
                            <div className="text-[10px] text-muted-foreground truncate">{f.path}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {msg.followups.length > 0 && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-2">Suggested follow-ups</div>
                      <div className="flex flex-wrap gap-2">
                        {msg.followups.map((q) => (
                          <button
                            key={q}
                            onClick={() => handleAsk(q)}
                            className="text-xs px-3 py-1.5 rounded-full bg-surface-2 border border-border hover:border-primary/40 transition"
                          >
                            {q}
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
                  <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-surface-2 border border-border px-4 py-3 text-sm">
                    {pendingQuestion}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-surface-1 p-6 flex items-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Thinking through the codebase...
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