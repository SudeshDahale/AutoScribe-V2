import { useState } from "react";
import {
  Layers,
  Cpu,
  ScrollText,
  ChevronRight,
  CheckCircle2,
  Loader2,
  Clock,
  X,
  ArrowRight,
} from "lucide-react";
import { CATEGORIES, type SignalsSummary, type CategorySummary } from "./signal-graph-data";
import { CATEGORY_ICONS, CATEGORY_SHORT_LABELS, CATEGORY_SUBTITLES } from "./signal-icons";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentTask = {
  id: string;
  title: string;
  description: string;
  repoName: string;
  priority: number;
  status: string;
  createdAt: string;
  timeAgo: string;
} | null;

export type ExecutionStep = {
  label: string;
  detail: string;
  status: string;
  pct: number;
  startedAt: string | null;
  completedAt: string | null;
};

export type AgentExecution = {
  taskId: string;
  taskTitle: string;
  repoName: string;
  steps: ExecutionStep[];
  status: string;
  overallPct: number;
  startedAt: string;
  completedAt: string | null;
  elapsedSecs: number;
} | null;

export type CompletedExecution = {
  taskId: string;
  taskTitle: string;
  repoName: string;
  steps: ExecutionStep[];
  status: string;
  overallPct: number;
  startedAt: string;
  completedAt: string | null;
  elapsedSecs: number;
};

// ─── Floating panel state ─────────────────────────────────────────────────────
// number = index into CATEGORIES (source card)
type FloatingPanel = "classifier" | "executor" | number | null;

// ─── Layout dims ─────────────────────────────────────────────────────────────

type Dims = {
  w: number; h: number;
  srcX: number; srcY: (i: number) => number; srcW: number; srcH: number;
  mergeX: number; mergeY: number;
  cls_x: number; cls_w: number; cls_h: number;
  exe_x: number; exe_w: number; exe_h: number;
  out_x: number; out_w: number; out_h: number;
  midY: number;
  cardScale: "mini" | "full";
};

const NUM_SRC = CATEGORIES.length; // 6

function dimsFor(size: "mini" | "full"): Dims {
  if (size === "mini") {
    const h = 272, srcH = 32, srcGap = 5;
    const totalSrc = NUM_SRC * srcH + (NUM_SRC - 1) * srcGap;
    const midY = h / 2;
    const srcStartY = (h - totalSrc) / 2;
    return {
      w: 900, h,
      srcX: 10, srcY: (i) => srcStartY + i * (srcH + srcGap), srcW: 148, srcH,
      mergeX: 218, mergeY: midY,
      cls_x: 238, cls_w: 150, cls_h: 96,
      exe_x: 414, exe_w: 150, exe_h: 96,
      out_x: 592, out_w: 300, out_h: 96,
      midY, cardScale: "mini",
    };
  }
  const h = 640, srcH = 62, srcGap = 12;
  const totalSrc = NUM_SRC * srcH + (NUM_SRC - 1) * srcGap;
  const midY = h / 2;
  const srcStartY = (h - totalSrc) / 2;
  return {
    w: 1200, h,
    srcX: 24, srcY: (i) => srcStartY + i * (srcH + srcGap), srcW: 236, srcH,
    mergeX: 344, mergeY: midY,
    cls_x: 368, cls_w: 238, cls_h: 152,
    exe_x: 638, exe_w: 238, exe_h: 152,
    out_x: 908, out_w: 268, out_h: 152,
    midY, cardScale: "full",
  };
}

// ─── SVG paths ────────────────────────────────────────────────────────────────

function sourcePath(d: Dims, i: number) {
  const srcCY = d.srcY(i) + d.srcH / 2;
  const x0 = d.srcX + d.srcW;
  const midX = (x0 + d.mergeX) / 2;
  return `M ${x0} ${srcCY} C ${midX} ${srcCY} ${d.mergeX - 28} ${d.mergeY} ${d.mergeX} ${d.mergeY}`;
}

function hLine(x1: number, x2: number, y: number) {
  return `M ${x1} ${y} L ${x2} ${y}`;
}

// ─── SVG Edges ────────────────────────────────────────────────────────────────

function Edges({ d, categories, executionRunning }: {
  d: Dims; categories: CategorySummary[]; executionRunning: boolean;
}) {
  const mini = d.cardScale === "mini";
  const dotR = mini ? 2.2 : 2.8;
  const clsOut = hLine(d.cls_x + d.cls_w, d.exe_x, d.midY);
  const exeOut = hLine(d.exe_x + d.exe_w, d.out_x, d.midY);

  return (
    <svg className="pointer-events-none absolute inset-0" width={d.w} height={d.h}
      viewBox={`0 0 ${d.w} ${d.h}`} fill="none">
      <defs>
        <linearGradient id="sg-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0.03" />
          <stop offset="60%" stopColor="white" stopOpacity="0.18" />
          <stop offset="100%" stopColor="white" stopOpacity="0.36" />
        </linearGradient>
        <filter id="sg-glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Fan-in paths: source → merge */}
      {categories.map((c, i) => {
        const path = sourcePath(d, i);
        const active = c.count1h > 0;
        const dur = Math.max(0.9, 3.0 - Math.min(c.count1h, 8) * 0.24);
        return (
          <g key={c.category}>
            <path d={path} stroke="url(#sg-fade)" strokeWidth="1" />
            {active && (
              <circle r={dotR} fill="white" filter="url(#sg-glow)">
                <animateMotion dur={`${dur}s`} begin={`${i * 0.3}s`}
                  repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1"
                  calcMode="spline" keySplines="0.4 0 0.2 1" path={path} />
              </circle>
            )}
          </g>
        );
      })}

      {/* Merge hub dot */}
      <circle cx={d.mergeX} cy={d.mergeY} r={mini ? 3 : 4}
        fill="white" filter="url(#sg-glow)" opacity="0.55" />

      {/* Classifier → Executor */}
      <path d={clsOut} stroke="white" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="4 4" />
      {executionRunning && (
        <circle r={dotR} fill="white" filter="url(#sg-glow)">
          <animateMotion dur="1.5s" repeatCount="indefinite" path={clsOut} />
        </circle>
      )}

      {/* Executor → Logs */}
      <path d={exeOut} stroke="white" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="4 4" />
      {executionRunning && (
        <circle r={dotR} fill="white" filter="url(#sg-glow)">
          <animateMotion dur="1.5s" begin="0.55s" repeatCount="indefinite" path={exeOut} />
        </circle>
      )}
    </svg>
  );
}

// ─── Source card ──────────────────────────────────────────────────────────────

function SourceCard({ d, index, summary, active: isFloating, onClick }: {
  d: Dims; index: number; summary: CategorySummary; active: boolean; onClick: () => void;
}) {
  const Icon = CATEGORY_ICONS[summary.category];
  const label = CATEGORY_SHORT_LABELS[summary.category];
  const subtitle = CATEGORY_SUBTITLES[summary.category];
  const mini = d.cardScale === "mini";
  const hasSignals = summary.count1h > 0;

  return (
    <button
      onClick={onClick}
      className={`signal-node-card group absolute flex items-center gap-2 px-2.5 text-left animate-signal-rise cursor-pointer transition-all ${
        isFloating ? "border-white/25" : "hover:border-white/15"
      }`}
      style={{ left: d.srcX, top: d.srcY(index), width: d.srcW, height: d.srcH, animationDelay: `${index * 55}ms` }}
    >
      <span className="grid shrink-0 place-items-center rounded-md border border-border bg-surface-3"
        style={{ width: mini ? 20 : 28, height: mini ? 20 : 28 }}>
        <Icon className={mini ? "size-3 text-foreground/70" : "size-3.5 text-foreground/70"} strokeWidth={1.7} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-medium leading-tight ${mini ? "text-[11px]" : "text-[13px]"}`}>{label}</span>
        {!mini && (
          <span className="block truncate font-mono text-[10px] text-muted-foreground">{subtitle}</span>
        )}
      </span>
      <span className={`shrink-0 font-mono ${mini ? "text-[8.5px]" : "text-[10px]"} ${hasSignals ? "text-foreground/55" : "text-white/18"}`}>
        {summary.count24h > 0 ? `${summary.count24h}/h` : "—"}
      </span>
      {/* Live dot */}
      {hasSignals && (
        <span className="absolute right-[-5px] top-1/2 -translate-y-1/2 size-[7px] rounded-full bg-white/55"
          style={{ filter: "drop-shadow(0 0 4px rgba(255,255,255,0.9))" }} />
      )}
    </button>
  );
}

// ─── Classifier node ──────────────────────────────────────────────────────────

function ClassifierNode({ d, taskQueue, active, onClick }: {
  d: Dims; taskQueue: AgentTask[]; active: boolean; onClick: () => void;
}) {
  const mini = d.cardScale === "mini";
  const queueLen = taskQueue.length;
  const currentTask = taskQueue[0];

  return (
    <button onClick={onClick}
      className={`signal-node-card group absolute flex flex-col justify-between p-3 text-left cursor-pointer transition-all ${
        active ? "border-white/25" : "hover:border-white/15"
      }`}
      style={{ left: d.cls_x, top: d.midY - d.cls_h / 2, width: d.cls_w, height: d.cls_h }}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="grid shrink-0 place-items-center rounded-md border border-border bg-surface-3"
            style={{ width: mini ? 20 : 28, height: mini ? 20 : 28 }}>
            <Layers className={mini ? "size-3" : "size-3.5"} strokeWidth={1.7} />
          </span>
          <div className="min-w-0">
            <span className={`block font-medium tracking-tight ${mini ? "text-[11.5px]" : "text-[13px]"}`}>Classifier</span>
            {!mini && <span className="block font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">Processing</span>}
          </div>
        </div>
        <span className={`size-1.5 rounded-full mt-1 shrink-0 ${queueLen > 0 ? "bg-green-400 signal-shimmer-line" : "bg-white/20"}`} />
      </div>
      <div className="rounded-lg border border-border bg-black/30 px-2 py-1.5">
        <span className={`flex items-center gap-1 truncate font-mono ${mini ? "text-[9px]" : "text-[10.5px]"} text-foreground/65`}>
          <ChevronRight className={`${mini ? "size-2.5" : "size-3"} shrink-0`} strokeWidth={2} />
          {currentTask
            ? <span className="truncate">{currentTask.title}</span>
            : <span className="text-white/30">Waiting for signals…</span>}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[9px] text-muted-foreground">queue {queueLen}</span>
        <span className="flex gap-0.5 ml-auto">
          {[0, 1, 2].map(j => (
            <span key={j} className={`h-0.5 w-4 rounded-full ${j < Math.min(queueLen, 3) ? "bg-white/38" : "bg-white/10"}`} />
          ))}
        </span>
      </div>
    </button>
  );
}

// ─── Executor node ────────────────────────────────────────────────────────────

function ExecutorNode({ d, execution, active, onClick }: {
  d: Dims; execution: AgentExecution; active: boolean; onClick: () => void;
}) {
  const mini = d.cardScale === "mini";
  const running = execution?.status === "running";
  const currentStep = execution?.steps.find(s => s.status === "running") ?? null;
  const pct = execution?.overallPct ?? 0;
  const doneSteps = execution?.steps.filter(s => s.status === "done").length ?? 0;
  const totalSteps = execution?.steps.length ?? 0;

  return (
    <button onClick={onClick}
      className={`signal-node-card group absolute flex flex-col justify-between p-3 text-left cursor-pointer transition-all ${
        active ? "border-white/25" : "hover:border-white/15"
      }`}
      style={{ left: d.exe_x, top: d.midY - d.exe_h / 2, width: d.exe_w, height: d.exe_h }}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="grid shrink-0 place-items-center rounded-md border border-border bg-surface-3"
            style={{ width: mini ? 20 : 28, height: mini ? 20 : 28 }}>
            <Cpu className={mini ? "size-3" : "size-3.5"} strokeWidth={1.7} />
          </span>
          <div className="min-w-0">
            <span className={`block font-medium tracking-tight ${mini ? "text-[11.5px]" : "text-[13px]"}`}>Executor</span>
            {!mini && <span className="block font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">Executing</span>}
          </div>
        </div>
        <span className={`size-1.5 rounded-full mt-1 shrink-0 ${running ? "bg-green-400 signal-shimmer-line" : "bg-white/20"}`} />
      </div>
      <div className="rounded-lg border border-border bg-black/30 px-2 py-1.5">
        <span className={`flex items-center gap-1 truncate font-mono ${mini ? "text-[9px]" : "text-[10.5px]"} text-foreground/65`}>
          <ChevronRight className={`${mini ? "size-2.5" : "size-3"} shrink-0`} strokeWidth={2} />
          {currentStep
            ? <span className="truncate">{currentStep.label}</span>
            : execution
            ? <span className="truncate">{execution.taskTitle}</span>
            : <span className="text-white/30">Waiting…</span>}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[9px] text-muted-foreground">
          {running ? `${doneSteps}/${totalSteps} steps` : "idle"}
        </span>
        <span className="flex gap-0.5 ml-auto">
          {[0, 1, 2].map(j => (
            <span key={j} className={`h-0.5 w-4 rounded-full ${j < Math.ceil((pct / 100) * 3) ? "bg-white/38" : "bg-white/10"}`} />
          ))}
        </span>
      </div>
    </button>
  );
}

// ─── Logs node ────────────────────────────────────────────────────────────────

function LogsNode({ d, historyCount, openPrs, onClick }: {
  d: Dims; historyCount: number; openPrs: number; onClick: () => void;
}) {
  const mini = d.cardScale === "mini";
  return (
    <button onClick={onClick}
      className="signal-node-card group absolute flex flex-col justify-between p-3 text-left cursor-pointer hover:border-white/20 transition-all"
      style={{ left: d.out_x, top: d.midY - d.out_h / 2, width: d.out_w, height: d.out_h }}
    >
      <div className="flex items-center gap-1.5">
        <span className="grid shrink-0 place-items-center rounded-md border border-border bg-surface-3"
          style={{ width: mini ? 20 : 28, height: mini ? 20 : 28 }}>
          <ScrollText className={mini ? "size-3" : "size-3.5"} strokeWidth={1.7} />
        </span>
        <div>
          <span className={`block font-medium tracking-tight ${mini ? "text-[11.5px]" : "text-[13px]"}`}>Logs</span>
          {!mini && <span className="block font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">Output</span>}
        </div>
      </div>
      <div>
        <span className={`block font-light tracking-tight ${mini ? "text-xl" : "text-3xl"}`}>{historyCount}</span>
        <span className="font-mono text-[9.5px] text-muted-foreground">tasks completed</span>
      </div>
      {!mini && (
        <span className="flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-widest text-white/38 group-hover:text-foreground/70 transition-colors">
          Open panel <ArrowRight className="size-3" />
        </span>
      )}
    </button>
  );
}

// ─── Floating inline panel (Classifier / Executor / Source cards) ─────────────

function FloatingPanel({ panel, d, categories, taskQueue, execution, onClose, onOpenLogs }: {
  panel: FloatingPanel;
  d: Dims;
  categories: CategorySummary[];
  taskQueue: AgentTask[];
  execution: AgentExecution;
  onClose: () => void;
  onOpenLogs: () => void;
}) {
  if (panel === null) return null;
  const mini = d.cardScale === "mini";

  // ── Position calc ──
  let style: React.CSSProperties = {};
  let panelW = 0;

  if (typeof panel === "number") {
    // Source card: floating to the right
    const i = panel;
    const top = d.srcY(i);
    panelW = mini ? 230 : 280;
    style = {
      position: "absolute",
      left: d.srcX + d.srcW + 14,
      top,
      width: panelW,
      zIndex: 20,
    };
  } else if (panel === "classifier") {
    panelW = d.cls_w + 40;
    style = {
      position: "absolute",
      left: d.cls_x,
      top: d.midY + d.cls_h / 2 + 8,
      width: panelW,
      zIndex: 20,
    };
  } else if (panel === "executor") {
    panelW = d.exe_w + 40;
    style = {
      position: "absolute",
      left: d.exe_x,
      top: d.midY + d.exe_h / 2 + 8,
      width: panelW,
      zIndex: 20,
    };
  }

  // ── Content ──
  const panelCls = "rounded-xl border border-white/12 bg-[#111]/96 backdrop-blur-md shadow-2xl";

  // Source card panel
  if (typeof panel === "number") {
    const cat = categories[panel];
    const Icon = cat ? CATEGORY_ICONS[cat.category] : null;
    const label = cat ? CATEGORY_SHORT_LABELS[cat.category] : "";
    return (
      <div style={style} className={panelCls}>
        <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-white/8">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="size-3 text-muted-foreground" strokeWidth={1.7} />}
            <span className="text-[11px] font-medium">{label}</span>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
            <X className="size-3" />
          </button>
        </div>
        <div className="px-3 py-2.5 space-y-2">
          {cat && (
            <>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] text-muted-foreground">last hour</span>
                <span className={`font-mono text-[11px] font-medium ${cat.count1h > 0 ? "text-foreground" : "text-white/25"}`}>
                  {cat.count1h} signals
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] text-muted-foreground">last 24h</span>
                <span className="font-mono text-[10px] text-foreground/50">{cat.count24h}</span>
              </div>
              {cat.latest && (
                <div className="rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-2 mt-1">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-white/35 mb-1">Latest</p>
                  <p className="text-[11px] font-medium leading-snug">{cat.latest.title}</p>
                  {cat.latest.detail && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground leading-relaxed line-clamp-2">{cat.latest.detail}</p>
                  )}
                </div>
              )}
              {!cat.latest && (
                <p className="text-[10.5px] text-muted-foreground text-center py-2">No signals yet</p>
              )}
            </>
          )}
        </div>
        <div className="px-3 pb-3">
          <button
            onClick={() => { onClose(); onOpenLogs(); }}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[9.5px] uppercase tracking-widest text-white/45 hover:text-foreground hover:border-white/20 hover:bg-white/[0.07] transition-all"
          >
            View all logs <ArrowRight className="size-2.5" />
          </button>
        </div>
      </div>
    );
  }

  // Classifier panel
  if (panel === "classifier") {
    return (
      <div style={style} className={panelCls}>
        <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-white/8">
          <span className="text-[11px] font-medium">Processing Queue</span>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
            <X className="size-3" />
          </button>
        </div>
        <div className="px-3 py-2.5 space-y-2 max-h-[220px] overflow-y-auto">
          {taskQueue.length === 0 ? (
            <p className="py-4 text-center text-[11px] text-muted-foreground">No tasks in queue</p>
          ) : taskQueue.map((task, i) => (
            <div key={task?.id ?? i} className="rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-2">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 font-mono text-[8.5px] text-white/25 shrink-0">#{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] font-medium leading-snug">{task?.title}</p>
                  {task?.description && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground leading-relaxed line-clamp-2">{task.description}</p>
                  )}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="rounded border border-border bg-surface-3 px-1 py-0.5 font-mono text-[8.5px] text-muted-foreground">
                      {task?.repoName || "—"}
                    </span>
                    <span className="font-mono text-[8.5px] text-white/25">{task?.timeAgo}</span>
                  </div>
                </div>
                <span className={`shrink-0 mt-0.5 rounded-full border px-1.5 py-0.5 font-mono text-[7.5px] uppercase ${
                  task?.status === "running" ? "border-green-500/40 text-green-400" : "border-border text-muted-foreground"
                }`}>{task?.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Executor panel
  if (panel === "executor") {
    const running = execution?.status === "running";
    const doneSteps = execution?.steps.filter(s => s.status === "done").length ?? 0;
    const totalSteps = execution?.steps.length ?? 0;
    return (
      <div style={style} className={panelCls}>
        <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-white/8">
          <span className="text-[11px] font-medium">Execution Steps</span>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
            <X className="size-3" />
          </button>
        </div>
        <div className="px-3 py-2.5 max-h-[260px] overflow-y-auto">
          {!execution ? (
            <p className="py-4 text-center text-[11px] text-muted-foreground">No active execution</p>
          ) : (
            <>
              {/* Task header */}
              <div className="rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-2 mb-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-[11.5px] font-medium leading-snug truncate">{execution.taskTitle}</p>
                  <span className={`shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[7.5px] uppercase ${
                    running ? "border-green-500/40 text-green-400" : "border-border text-muted-foreground"
                  }`}>{execution.status}</span>
                </div>
                <div className="h-0.5 w-full rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-white/35 transition-all duration-700"
                    style={{ width: `${execution.overallPct}%` }} />
                </div>
                <p className="mt-1 font-mono text-[8.5px] text-muted-foreground">{execution.overallPct}% · {doneSteps}/{totalSteps} steps</p>
              </div>
              {/* Steps */}
              <ol className="relative space-y-1.5 border-l border-border pl-3.5">
                {execution.steps.map((step, i) => {
                  const isDone = step.status === "done";
                  const isRunning = step.status === "running";
                  return (
                    <li key={i} className="relative">
                      <span className="absolute -left-[15px] top-[5px]">
                        {isDone ? <CheckCircle2 className="size-2.5 text-green-400" />
                          : isRunning ? <Loader2 className="size-2.5 animate-spin text-white/60" />
                          : <Clock className="size-2.5 text-white/18" />}
                      </span>
                      <div className={`rounded-lg border bg-white/[0.02] px-2.5 py-1.5 ${isRunning ? "border-white/15" : "border-white/6"}`}>
                        <p className={`text-[11px] font-medium leading-snug ${step.status === "pending" ? "text-muted-foreground" : ""}`}>
                          {step.label}
                        </p>
                        {step.detail && isRunning && (
                          <p className="mt-0.5 text-[9.5px] text-muted-foreground leading-relaxed">{step.detail}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      </div>
    );
  }

  return null;
}

// ─── Logs side drawer ─────────────────────────────────────────────────────────

function LogsDrawer({ open, onClose, history, docsCount, openPrs }: {
  open: boolean; onClose: () => void;
  history: CompletedExecution[]; docsCount: number; openPrs: number;
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 h-full w-[400px] max-w-full flex flex-col border-l border-border bg-[#0e0e0e] shadow-2xl animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Output</p>
            <h2 className="mt-0.5 text-[15px] font-medium tracking-tight">Completed Tasks</h2>
          </div>
          <button onClick={onClose}
            className="grid place-items-center rounded-lg border border-border bg-surface-2 p-1.5 text-muted-foreground hover:text-foreground transition-colors">
            <X className="size-3.5" />
          </button>
        </div>
        <div className="mb-3 px-5 pt-4 flex items-center justify-between">
          <span className="font-mono text-[9.5px] text-muted-foreground uppercase tracking-widest">
            {history.length} completed · {openPrs} PRs open
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">
          {history.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No completed tasks yet.</p>
          ) : history.map((exec, i) => (
            <details key={exec.taskId ?? i} className="group signal-node-card rounded-xl overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium leading-snug truncate pr-2">{exec.taskTitle}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded border border-border bg-surface-3 px-1.5 py-0.5 font-mono text-[8.5px] text-muted-foreground">
                      {exec.repoName || "—"}
                    </span>
                    <span className="font-mono text-[8.5px] text-white/30">
                      {exec.completedAt ? new Date(exec.completedAt).toLocaleTimeString() : "—"}
                    </span>
                  </div>
                </div>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
              </summary>
              <div className="border-t border-border px-3.5 pb-3 pt-2.5 space-y-1.5">
                {exec.steps.map((step, j) => (
                  <div key={j} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 size-2.5 shrink-0 text-green-400/70" />
                    <p className="text-[10.5px] text-muted-foreground leading-relaxed">{step.label}</p>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Main SignalCanvas ─────────────────────────────────────────────────────────

export function SignalCanvas({
  size, summary, execution, history, taskQueue, docsCount, openPrs,
}: {
  size: "mini" | "full";
  summary: SignalsSummary;
  execution: AgentExecution;
  history: CompletedExecution[];
  taskQueue: AgentTask[];
  docsCount: number;
  openPrs: number;
}) {
  const [floatingPanel, setFloatingPanel] = useState<FloatingPanel>(null);
  const [logsDrawerOpen, setLogsDrawerOpen] = useState(false);

  const d = dimsFor(size);
  const byCategory = Object.fromEntries(summary.categories.map(c => [c.category, c]));
  const sourceCategories = CATEGORIES.map(cat => byCategory[cat]).filter(Boolean) as CategorySummary[];
  const executionRunning = execution?.status === "running";

  function openFloating(p: FloatingPanel) {
    setFloatingPanel(prev => (prev === p ? null : p));
  }

  return (
    <>
      <div className="relative mx-auto" style={{ width: d.w, height: d.h }}>
        {size === "full" && <div className="signal-grid-bg absolute inset-0 rounded-2xl" />}

        {/* Backdrop: closes floating panel when clicking outside */}
        {floatingPanel !== null && (
          <div
            className="absolute inset-0 z-[15]"
            onClick={() => setFloatingPanel(null)}
          />
        )}

        <Edges d={d} categories={sourceCategories} executionRunning={executionRunning} />

        {sourceCategories.map((c, i) => (
          <SourceCard
            key={c.category}
            d={d} index={i} summary={c}
            active={floatingPanel === i}
            onClick={() => openFloating(i)}
          />
        ))}

        <ClassifierNode
          d={d} taskQueue={taskQueue}
          active={floatingPanel === "classifier"}
          onClick={() => openFloating("classifier")}
        />
        <ExecutorNode
          d={d} execution={execution}
          active={floatingPanel === "executor"}
          onClick={() => openFloating("executor")}
        />
        <LogsNode
          d={d} historyCount={history.length} openPrs={openPrs}
          onClick={() => setLogsDrawerOpen(true)}
        />

        {/* Floating inline panel */}
        <FloatingPanel
          panel={floatingPanel}
          d={d}
          categories={sourceCategories}
          taskQueue={taskQueue}
          execution={execution}
          onClose={() => setFloatingPanel(null)}
          onOpenLogs={() => setLogsDrawerOpen(true)}
        />
      </div>

      {/* Logs side panel — only opens via Logs node or "View all logs" inside source dropdown */}
      <LogsDrawer
        open={logsDrawerOpen}
        onClose={() => setLogsDrawerOpen(false)}
        history={history}
        docsCount={docsCount}
        openPrs={openPrs}
      />
    </>
  );
}
