import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SignalCanvas, type AgentExecution, type CompletedExecution, type AgentTask } from "./SignalCanvas";
import { useSignalsSummary, useSignalsFeed, CATEGORIES, type SignalCategory } from "./signal-graph-data";
import { CATEGORY_ICONS, CATEGORY_LABELS } from "./signal-icons";

// ─── Data hooks ───────────────────────────────────────────────────────────────

function useAgentExecution() {
  return useQuery({
    queryKey: ["agent-execution"],
    queryFn: async (): Promise<{ execution: AgentExecution; history: CompletedExecution[] }> => {
      const res = await fetch("/api/agent/execution");
      if (!res.ok) return { execution: null, history: [] };
      const data = await res.json();
      return {
        execution: data.execution ?? null,
        history: (data.history ?? []) as CompletedExecution[],
      };
    },
    refetchInterval: 3000,
    placeholderData: { execution: null, history: [] },
  });
}

function useAgentTaskQueue() {
  return useQuery({
    queryKey: ["agent-tasks"],
    queryFn: async (): Promise<AgentTask[]> => {
      const res = await fetch("/api/agent/tasks");
      if (!res.ok) return [];
      const data = await res.json();
      return (data.tasks ?? []) as AgentTask[];
    },
    refetchInterval: 3000,
    placeholderData: [],
  });
}

// ─── Severity dot ─────────────────────────────────────────────────────────────

function SeverityDot({ severity }: { severity: string }) {
  if (severity === "high") {
    return (
      <span className="relative mt-[7px] block size-2 shrink-0">
        <span className="absolute inset-0 rounded-full bg-destructive" />
        <span className="absolute inset-0 rounded-full bg-destructive signal-pulse-ring" />
      </span>
    );
  }
  if (severity === "notable") {
    return <span className="mt-[7px] block size-2 shrink-0 rounded-full bg-warning" />;
  }
  return <span className="mt-[7px] block size-2 shrink-0 rounded-full border border-border bg-surface-2" />;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SignalGraphFull({
  open,
  onClose,
  docsCount,
  openPrs,
}: {
  open: boolean;
  onClose: () => void;
  docsCount: number;
  openPrs: number;
}) {
  const [filter, setFilter] = useState<SignalCategory | null>(null);
  const { data: summary } = useSignalsSummary();
  const { data: execData } = useAgentExecution();
  const { data: taskQueue = [] } = useAgentTaskQueue();
  const { data: feed = [], isLoading } = useSignalsFeed(filter);

  const execution = execData?.execution ?? null;
  const history = execData?.history ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[96vw] w-[1280px] max-h-[92vh] overflow-hidden p-0 gap-0 bg-surface-1 border-border">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Live signal graph
            </p>
            <DialogTitle className="mt-1 text-lg font-medium tracking-tight">
              Every signal driving the agent
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs">
              Signals classified, queued, executed step-by-step, and logged — in real time.
            </DialogDescription>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] max-h-[calc(92vh-88px)]">
          {/* Graph panel */}
          <div className="overflow-x-auto p-6 flex items-center justify-center">
            <SignalCanvas
              size="full"
              summary={summary ?? { categories: [], generatedAt: "" }}
              execution={execution}
              history={history}
              taskQueue={taskQueue}
              docsCount={docsCount}
              openPrs={openPrs}
            />
          </div>

          {/* Signal feed sidebar */}
          <aside className="border-l border-border flex flex-col min-h-0">
            {/* Category filters */}
            <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-3">
              <button
                onClick={() => setFilter(null)}
                className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition ${
                  filter === null
                    ? "border-primary/40 text-foreground bg-surface-2"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                All
              </button>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition ${
                    filter === cat
                      ? "border-primary/40 text-foreground bg-surface-2"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>

            {/* Signal feed */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {isLoading && feed.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading signals…</div>
              ) : feed.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No signals yet — they'll appear here as commits land.
                </div>
              ) : (
                <ol className="relative space-y-0 border-l border-border pl-5">
                  {feed.map((s) => {
                    const Icon = CATEGORY_ICONS[s.category];
                    return (
                      <li key={s.id} className="animate-signal-rise relative pb-4 last:pb-0">
                        <span className="absolute -left-[25px] top-0 flex">
                          <SeverityDot severity={s.severity} />
                        </span>
                        <div className="signal-node-card rounded-xl px-3.5 py-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[12.5px] font-medium leading-snug tracking-tight">{s.title}</p>
                            <Icon className="size-3.5 shrink-0 text-muted-foreground mt-0.5" />
                          </div>
                          {s.detail && (
                            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{s.detail}</p>
                          )}
                          <div className="mt-2 flex items-center gap-2">
                            <span className="rounded-md border border-border bg-surface-3 px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground">
                              {s.repoName ?? "unknown"}
                            </span>
                            <span className="font-mono text-[9.5px] text-white/30">
                              {new Date(s.createdAt).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
