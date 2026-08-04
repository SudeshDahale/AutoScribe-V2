import { createFileRoute } from "@tanstack/react-router";
import { conversation, suggestedQuestions } from "@/lib/mock-data";
import { Search, Send, FileCode, ThumbsUp, ThumbsDown, ArrowRight } from "lucide-react";

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

function Ask() {
  const msg = conversation[0];
  const answer = conversation[1] as typeof conversation[1] & { flow: Array<{label:string; meta:string}>; files: Array<{name:string; path:string}>; followups: string[] };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl tracking-tight font-medium">Ask AI</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ask anything about your codebase</p>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          placeholder="Ask anything about your codebase..."
          className="w-full h-14 pl-11 pr-14 rounded-2xl bg-surface-1 border border-border text-[15px] placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/30 transition"
        />
        <button className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:brightness-95 transition">
          <Send className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {suggestedQuestions.map((q) => (
          <button key={q} className="text-xs px-3 py-1.5 rounded-full bg-surface-1 border border-border text-muted-foreground hover:text-foreground hover:bg-surface-2 transition">
            {q}
          </button>
        ))}
      </div>

      {/* Conversation */}
      <div className="space-y-6 pt-4">
        <div className="flex justify-end">
          <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-surface-2 border border-border px-4 py-3 text-sm">
            {msg.text}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface-1 p-6 space-y-6">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
              <div className="w-2.5 h-2.5 rounded-sm bg-primary rotate-45" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">AI Response</div>
              <div
                className="mt-2 text-[15px] leading-relaxed text-foreground/95"
                dangerouslySetInnerHTML={{
                  __html: answer.text.replace(/\*\*(.*?)\*\*/g, '<span class="text-primary">$1</span>'),
                }}
              />
            </div>
          </div>

          {/* Flow */}
          <div className="rounded-xl bg-surface-2/60 border border-border p-4">
            <div className="text-xs text-muted-foreground mb-3">Architecture flow</div>
            <div className="flex items-center gap-2 overflow-x-auto">
              {answer.flow.map((f, i) => (
                <div key={f.label} className="flex items-center gap-2 shrink-0">
                  <div className="px-3 py-2 rounded-lg bg-surface-3 border border-border">
                    <div className="text-sm">{f.label}</div>
                    <div className="text-[10px] text-muted-foreground">({f.meta})</div>
                  </div>
                  {i < answer.flow.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground" />}
                </div>
              ))}
            </div>
          </div>

          {/* Files */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-muted-foreground">Related Files ({answer.files.length})</div>
              <div className="flex gap-1.5">
                <button className="p-1.5 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-foreground"><ThumbsUp className="w-3.5 h-3.5" /></button>
                <button className="p-1.5 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-foreground"><ThumbsDown className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2.5">
              {answer.files.map((f) => (
                <div key={f.name} className="p-3 rounded-xl bg-surface-2 border border-border hover:border-primary/30 transition cursor-pointer">
                  <FileCode className="w-4 h-4 text-primary/80 mb-2" />
                  <div className="text-xs font-medium truncate">{f.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{f.path}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Followups */}
          <div>
            <div className="text-xs text-muted-foreground mb-2">Suggested follow-ups</div>
            <div className="flex flex-wrap gap-2">
              {answer.followups.map((q) => (
                <button key={q} className="text-xs px-3 py-1.5 rounded-full bg-surface-2 border border-border hover:border-primary/40 transition">
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
