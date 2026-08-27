import { useQuery } from "@tanstack/react-query";
import { Maximize2 } from "lucide-react";
import { SignalCanvas, type AgentExecution, type CompletedExecution, type AgentTask } from "./SignalCanvas";
import { useSignalsSummary } from "./signal-graph-data";

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

// ─── Component ────────────────────────────────────────────────────────────────

export function SignalGraphMini({
  docsCount,
  openPrs,
  onExpand,
}: {
  docsCount: number;
  openPrs: number;
  onExpand: () => void;
}) {
  const { data: summary } = useSignalsSummary();
  const { data: execData } = useAgentExecution();
  const { data: taskQueue = [] } = useAgentTaskQueue();

  const execution = execData?.execution ?? null;
  const history = execData?.history ?? [];

  return (
    <div className="rounded-2xl border border-border bg-surface-1 p-4 hover:border-primary/20 transition-all duration-200">
      <div className="flex items-center justify-between px-1 mb-2">
        <div>
          <h3 className="text-[15px] font-medium">Signal Graph</h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Live signals flowing into the autonomous agent
          </p>
        </div>
        <button
          onClick={onExpand}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        >
          <Maximize2 className="size-3" />
          Full screen
        </button>
      </div>
      <div className="overflow-x-auto">
        <SignalCanvas
          size="mini"
          summary={summary ?? { categories: [], generatedAt: "" }}
          execution={execution}
          history={history}
          taskQueue={taskQueue}
          docsCount={docsCount}
          openPrs={openPrs}
        />
      </div>
    </div>
  );
}
