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
  const { data: summary } = useSignalsSummary();
  const { data: execData } = useAgentExecution();
  const { data: taskQueue = [] } = useAgentTaskQueue();

  const execution = execData?.execution ?? null;
  const history = execData?.history ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[98vw] w-[1400px] max-h-[94vh] flex flex-col p-0 gap-0 bg-surface-1 border-border overflow-hidden">
        {/* Sticky header */}
        <div className="flex-shrink-0 flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Live signal graph
            </p>
            <DialogTitle className="mt-1 text-lg font-medium tracking-tight">
              Every signal driving the agent
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-xs">
              Signals classified, queued, executed step-by-step, and logged — in real time.
            </DialogDescription>
          </div>
        </div>

        {/* Scrollable canvas area */}
        <div className="flex-1 overflow-auto p-6">
          <div className="flex items-start justify-center min-w-max">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
