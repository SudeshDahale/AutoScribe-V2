import { useState } from "react";
import {
  Layers,
  Cpu,
  ScrollText,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Loader2,
  Clock,
  X,
  ArrowRight,
} from "lucide-react";
import { CATEGORIES, useSignalsFeed, type SignalsSummary, type CategorySummary, type SignalCategory } from "./signal-graph-data";
import { CATEGORY_ICONS, CATEGORY_SHORT_LABELS, CATEGORY_SUBTITLES, CATEGORY_LABELS } from "./signal-icons";

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

// Expanded state: "classifier", "executor", source category index (0-5), or null
type ActiveExpandedNode = "classifier" | "executor" | number | null;

// ─── Layout dimensions ────────────────────────────────────────────────────────

type Dims = {
  w: number;
  h: number;
  srcX: number;
  srcY: (i: number) => number;
  srcW: number;
  srcH: number;
  mergeX: number;
  mergeY: number;
  cls_x: number;
  cls_w: number;
  cls_h: number;
  exe_x: number;
  exe_w: number;
  exe_h: number;
  out_x: number;
  out_w: number;
  out_h: number;
  midY: number;
  cardScale: "mini" | "full";
};

const NUM_SRC = CATEGORIES.length; // 7 sources

function dimsFor(size: "mini" | "full", expandedNode: ActiveExpandedNode): Dims {
  const isClsExpanded = expandedNode === "classifier";
  const isExeExpanded = expandedNode === "executor";

  if (size === "mini") {
    // Increased overall height & width for plenty of movement room for dots!
    const baseH = 290;
    const h = isClsExpanded || isExeExpanded ? 360 : baseH;
    const midY = baseH / 2;
    const srcH = 34;
    const srcGap = 6;
    const totalSrc = NUM_SRC * srcH + (NUM_SRC - 1) * srcGap;
    const srcStartY = (baseH - totalSrc) / 2;

    // Width expanded to 1050px so dots have wide, spacious paths!
    return {
      w: 1050,
      h,
      srcX: 12,
      srcY: (i) => srcStartY + i * (srcH + srcGap),
      srcW: 160,
      srcH,
      mergeX: 280, // 108px gap for dots to move!
      mergeY: midY,
      cls_x: 320,
      cls_w: isClsExpanded ? 240 : 170,
      cls_h: isClsExpanded ? 240 : 100,
      exe_x: isClsExpanded ? 580 : 540,
      exe_w: isExeExpanded ? 240 : 170,
      exe_h: isExeExpanded ? 240 : 100,
      out_x: isExeExpanded ? 840 : (isClsExpanded ? 780 : 750),
      out_w: 180,
      out_h: 100,
      midY,
      cardScale: "mini",
    };
  }

  // Full screen size dimensions
  const baseH = 800;
  const h = isClsExpanded || isExeExpanded ? 900 : baseH;
  const midY = baseH / 2;
  const srcH = 72;
  const srcGap = 12;
  const totalSrc = NUM_SRC * srcH + (NUM_SRC - 1) * srcGap;
  const srcStartY = (baseH - totalSrc) / 2;

  return {
    w: 1340,
    h,
    srcX: 28,
    srcY: (i) => srcStartY + i * (srcH + srcGap),
    srcW: 240,
    srcH,
    mergeX: 380, // ~112px gap for dots
    mergeY: midY,
    cls_x: 420,
    cls_w: isClsExpanded ? 320 : 230,
    cls_h: isClsExpanded ? 340 : 150,
    exe_x: isClsExpanded ? 760 : 700,
    exe_w: isExeExpanded ? 320 : 230,
    exe_h: isExeExpanded ? 340 : 150,
    out_x: isExeExpanded ? 1040 : (isClsExpanded ? 980 : 980),
    out_w: 240,
    out_h: 150,
    midY,
    cardScale: "full",
  };
}

// ─── SVG helper functions ─────────────────────────────────────────────────────

function sourcePath(d: Dims, i: number) {
  const srcCY = d.srcY(i) + d.srcH / 2;
  const x0 = d.srcX + d.srcW;
  const midX = (x0 + d.mergeX) / 2;
  return `M ${x0} ${srcCY} C ${midX} ${srcCY} ${d.mergeX - 35} ${d.mergeY} ${d.mergeX} ${d.mergeY}`;
}

function hLine(x1: number, x2: number, y: number) {
  return `M ${x1} ${y} L ${x2} ${y}`;
}

// ─── SVG Edges ────────────────────────────────────────────────────────────────

function Edges({
  d,
  categories,
  executionRunning,
}: {
  d: Dims;
  categories: CategorySummary[];
  executionRunning: boolean;
}) {
  const mini = d.cardScale === "mini";
  const dotR = mini ? 2.5 : 3.2;
  const clsOut = hLine(d.cls_x + d.cls_w, d.exe_x, d.midY);
  const exeOut = hLine(d.exe_x + d.exe_w, d.out_x, d.midY);

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={d.w}
      height={d.h}
      viewBox={`0 0 ${d.w} ${d.h}`}
      fill="none"
    >
      <defs>
        <linearGradient id="sg-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0.04" />
          <stop offset="60%" stopColor="white" stopOpacity="0.22" />
          <stop offset="100%" stopColor="white" stopOpacity="0.45" />
        </linearGradient>
        <filter id="sg-glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Fan-in paths: source → merge */}
      {categories.map((c, i) => {
        const path = sourcePath(d, i);
        const active = c.count1h > 0;
        const dur = Math.max(1.0, 3.4 - Math.min(c.count1h, 8) * 0.25);
        return (
          <g key={c.category}>
            <path d={path} stroke="url(#sg-fade)" strokeWidth="1.2" />
            {active && (
              <circle r={dotR} fill="#ffffff" filter="url(#sg-glow)">
                <animateMotion
                  dur={`${dur}s`}
                  begin={`${i * 0.28}s`}
                  repeatCount="indefinite"
                  keyPoints="0;1"
                  keyTimes="0;1"
                  calcMode="spline"
                  keySplines="0.4 0 0.2 1"
                  path={path}
                />
              </circle>
            )}
          </g>
        );
      })}

      {/* Merge hub dot */}
      <circle
        cx={d.mergeX}
        cy={d.mergeY}
        r={mini ? 3.5 : 4.5}
        fill="#ffffff"
        filter="url(#sg-glow)"
        opacity="0.75"
      />

      {/* Connector line: Merge hub to Classifier */}
      <path
        d={hLine(d.mergeX, d.cls_x, d.midY)}
        stroke="white"
        strokeOpacity="0.25"
        strokeWidth="1.2"
        strokeDasharray="4 4"
      />

      {/* Classifier → Executor */}
      <path
        d={clsOut}
        stroke="white"
        strokeOpacity="0.25"
        strokeWidth="1.2"
        strokeDasharray="4 4"
      />
      {executionRunning && (
        <circle r={dotR} fill="#ffffff" filter="url(#sg-glow)">
          <animateMotion dur="1.6s" repeatCount="indefinite" path={clsOut} />
        </circle>
      )}

      {/* Executor → Logs */}
      <path
        d={exeOut}
        stroke="white"
        strokeOpacity="0.25"
        strokeWidth="1.2"
        strokeDasharray="4 4"
      />
      {executionRunning && (
        <circle r={dotR} fill="#ffffff" filter="url(#sg-glow)">
          <animateMotion dur="1.6s" begin="0.6s" repeatCount="indefinite" path={exeOut} />
        </circle>
      )}
    </svg>
  );
}

// ─── Source Card Component ────────────────────────────────────────────────────

function SourceCard({
  d,
  index,
  summary,
  isExpanded,
  onToggle,
  onOpenSidePanel,
}: {
  d: Dims;
  index: number;
  summary: CategorySummary;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenSidePanel: (cat: SignalCategory) => void;
}) {
  const Icon = CATEGORY_ICONS[summary.category];
  const label = CATEGORY_SHORT_LABELS[summary.category];
  const subtitle = CATEGORY_SUBTITLES[summary.category];
  const mini = d.cardScale === "mini";
  const hasSignals = summary.count1h > 0;

  return (
    <div
      className="absolute animate-signal-rise"
      style={{
        left: d.srcX,
        top: d.srcY(index),
        width: d.srcW,
        zIndex: isExpanded ? 35 : 10,
        animationDelay: `${index * 55}ms`,
      }}
    >
      <button
        onClick={onToggle}
        className={`signal-node-card group flex w-full items-center gap-2 px-2.5 text-left cursor-pointer transition-all ${
          isExpanded ? "border-white/30 bg-surface-2 shadow-lg" : "hover:border-white/20"
        }`}
        style={{ height: d.srcH }}
      >
        <span
          className="grid shrink-0 place-items-center rounded-md border border-border bg-surface-3"
          style={{ width: mini ? 20 : 28, height: mini ? 20 : 28 }}
        >
          <Icon className={mini ? "size-3 text-foreground/70" : "size-3.5 text-foreground/70"} strokeWidth={1.7} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate font-medium leading-tight ${mini ? "text-[11px]" : "text-[13px]"}`}>
            {label}
          </span>
          {!mini && (
            <span className="block truncate font-mono text-[10px] text-muted-foreground">{subtitle}</span>
          )}
        </span>
        <span
          className={`shrink-0 font-mono ${mini ? "text-[8.5px]" : "text-[10px]"} ${
            hasSignals ? "text-foreground/70" : "text-white/20"
          }`}
        >
          {summary.count24h > 0 ? `${summary.count24h}/h` : "—"}
        </span>
        <ChevronDown
          className={`size-3 shrink-0 text-muted-foreground transition-transform duration-200 ${
            isExpanded ? "rotate-180 text-foreground" : ""
          }`}
        />
        {/* Live dot */}
        {hasSignals && (
          <span
            className="absolute right-[-5px] top-1/2 -translate-y-1/2 size-[7px] rounded-full bg-white/70"
            style={{ filter: "drop-shadow(0 0 4px rgba(255,255,255,0.9))" }}
          />
        )}
      </button>

      {/* Expanded dropdown inline */}
      {isExpanded && (
        <div className="absolute left-0 top-full mt-2 w-[260px] max-w-[90vw] rounded-xl border border-white/15 bg-[#121212]/95 p-3 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 z-50">
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
            <span className="font-mono text-[10px] font-medium text-foreground/80">
              {label} Signals
            </span>
            <span className="font-mono text-[9px] text-muted-foreground">
              {summary.count24h} total (24h)
            </span>
          </div>

          {summary.latest ? (
            <div className="rounded-lg border border-white/8 bg-white/[0.03] p-2.5">
              <div className="flex items-start justify-between gap-1 mb-1">
                <span className="text-[11px] font-medium leading-snug text-foreground">
                  {summary.latest.title}
                </span>
                <span className="font-mono text-[8.5px] text-white/30 shrink-0">
                  {new Date(summary.latest.createdAt).toLocaleTimeString()}
                </span>
              </div>
              {summary.latest.detail && (
                <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
                  {summary.latest.detail}
                </p>
              )}
            </div>
          ) : (
            <p className="py-2 text-center text-[10.5px] text-muted-foreground">
              No recent signals recorded.
            </p>
          )}

          <button
            onClick={() => onOpenSidePanel(summary.category)}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] py-1.5 font-mono text-[9.5px] uppercase tracking-wider text-white/60 hover:text-foreground hover:bg-white/[0.08] transition-all"
          >
            View all logs <ArrowRight className="size-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Node 2: Classifier Node ──────────────────────────────────────────────────
// Redesigned to match the reference screenshot exactly when expanded!

function ClassifierNode({
  d,
  taskQueue,
  isExpanded,
  onToggle,
}: {
  d: Dims;
  taskQueue: AgentTask[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const mini = d.cardScale === "mini";
  const queueLen = taskQueue.length;
  const currentTask = taskQueue[0];

  // Default step mock checklist for classifier node if task is processing
  const defaultSteps = [
    { label: "Parse incoming signal payload", status: "done" },
    { label: "Classify intent & priority", status: "done" },
    { label: "Determine target repository", status: "done" },
    { label: "Create execution tasks & queue", status: queueLen > 0 ? "running" : "done" },
  ];

  return (
    <div
      className={`signal-node-card group absolute cursor-pointer transition-all duration-300 ${
        isExpanded ? "border-white/30 bg-[#141414] shadow-2xl z-30" : "hover:border-white/20"
      }`}
      style={{
        left: d.cls_x,
        top: d.midY - (isExpanded ? d.cls_h / 2 : d.cls_h / 2),
        width: d.cls_w,
        minHeight: d.cls_h,
      }}
      onClick={onToggle}
    >
      <div className="p-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="grid shrink-0 place-items-center rounded-md border border-border bg-surface-3"
              style={{ width: mini ? 20 : 28, height: mini ? 20 : 28 }}
            >
              <Layers className={mini ? "size-3" : "size-3.5"} strokeWidth={1.7} />
            </span>
            <div className="min-w-0">
              <span className={`block font-medium tracking-tight ${mini ? "text-[11.5px]" : "text-[13px]"}`}>
                Classifier
              </span>
              {!mini && (
                <span className="block font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
                  Processing
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`size-1.5 rounded-full ${queueLen > 0 ? "bg-green-400 signal-shimmer-line" : "bg-white/20"}`} />
            <ChevronDown className={`size-3.5 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180 text-foreground" : ""}`} />
          </div>
        </div>

        {/* Collapsed state overview */}
        {!isExpanded && (
          <>
            <div className="mt-2 rounded-lg border border-border bg-black/30 px-2 py-1.5">
              <span className={`flex items-center gap-1 truncate font-mono ${mini ? "text-[9px]" : "text-[10.5px]"} text-foreground/65`}>
                <ChevronRight className={`${mini ? "size-2.5" : "size-3"} shrink-0`} strokeWidth={2} />
                {currentTask ? (
                  <span className="truncate">{currentTask.title}</span>
                ) : (
                  <span className="text-white/30">Waiting for signals…</span>
                )}
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between">
              <span className="font-mono text-[9px] text-muted-foreground">queue {queueLen}</span>
              <span className="flex gap-0.5">
                {[0, 1, 2].map((j) => (
                  <span
                    key={j}
                    className={`h-0.5 w-3.5 rounded-full ${j < Math.min(queueLen, 3) ? "bg-white/40" : "bg-white/10"}`}
                  />
                ))}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Expanded state: Formatted exactly like the reference image screenshot */}
      {isExpanded && (
        <div className="border-t border-white/10 px-3.5 py-3 space-y-3 animate-in fade-in duration-200">
          {/* Active task title & repo pill header */}
          <div>
            <h4 className="text-[13px] font-semibold tracking-tight text-foreground leading-snug">
              {currentTask ? currentTask.title : "Classifying Incoming Signals"}
            </h4>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="rounded-md border border-white/12 bg-white/[0.05] px-2 py-0.5 font-mono text-[9px] text-foreground/70">
                {currentTask?.repoName || "AutoScribe/Core"}
              </span>
              <span className="font-mono text-[9px] text-white/35">
                {currentTask?.timeAgo || new Date().toLocaleTimeString()}
              </span>
            </div>
          </div>

          <div className="h-[1px] w-full bg-white/10" />

          {/* Checklist of steps matching reference screenshot layout */}
          <div className="space-y-2">
            {defaultSteps.map((step, idx) => {
              const isDone = step.status === "done";
              const isRunning = step.status === "running";

              return (
                <div key={idx} className="flex items-center gap-2.5">
                  {isDone ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                  ) : isRunning ? (
                    <Loader2 className="size-4 shrink-0 text-sky-400 animate-spin" />
                  ) : (
                    <Clock className="size-4 shrink-0 text-white/20" />
                  )}
                  <span className={`text-[11.5px] font-medium ${isDone ? "text-foreground/90" : isRunning ? "text-foreground" : "text-muted-foreground"}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {queueLen > 1 && (
            <div className="pt-1 text-[10px] font-mono text-muted-foreground border-t border-white/8">
              +{queueLen - 1} more tasks in queue
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Node 3: Executor Node ────────────────────────────────────────────────────
// Redesigned to match the reference screenshot layout exactly!

function ExecutorNode({
  d,
  execution,
  isExpanded,
  onToggle,
}: {
  d: Dims;
  execution: AgentExecution;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const mini = d.cardScale === "mini";
  const running = execution?.status === "running";
  const currentStep = execution?.steps.find((s) => s.status === "running") ?? null;
  const pct = execution?.overallPct ?? 0;
  const doneSteps = execution?.steps.filter((s) => s.status === "done").length ?? 0;
  const totalSteps = execution?.steps.length ?? 0;

  // Fallback demo steps matching the user's reference screenshot structure
  const displaySteps = execution?.steps && execution.steps.length > 0
    ? execution.steps
    : [
        { label: "Clone repository structure", status: "done" },
        { label: "Detect tech stack", status: "done" },
        { label: "Bucket modules", status: "done" },
        { label: "Run LLM architecture pass", status: running ? "running" : "done" },
        { label: "Generate documentation suite", status: "pending" },
        { label: "Index codebase for Ask AI", status: "pending" },
      ];

  return (
    <div
      className={`signal-node-card group absolute cursor-pointer transition-all duration-300 ${
        isExpanded ? "border-white/30 bg-[#141414] shadow-2xl z-30" : "hover:border-white/20"
      }`}
      style={{
        left: d.exe_x,
        top: d.midY - (isExpanded ? d.exe_h / 2 : d.exe_h / 2),
        width: d.exe_w,
        minHeight: d.exe_h,
      }}
      onClick={onToggle}
    >
      <div className="p-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="grid shrink-0 place-items-center rounded-md border border-border bg-surface-3"
              style={{ width: mini ? 20 : 28, height: mini ? 20 : 28 }}
            >
              <Cpu className={mini ? "size-3" : "size-3.5"} strokeWidth={1.7} />
            </span>
            <div className="min-w-0">
              <span className={`block font-medium tracking-tight ${mini ? "text-[11.5px]" : "text-[13px]"}`}>
                Executor
              </span>
              {!mini && (
                <span className="block font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
                  Executing
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`size-1.5 rounded-full ${running ? "bg-green-400 signal-shimmer-line" : "bg-white/20"}`} />
            <ChevronDown className={`size-3.5 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180 text-foreground" : ""}`} />
          </div>
        </div>

        {/* Collapsed state overview */}
        {!isExpanded && (
          <>
            <div className="mt-2 rounded-lg border border-border bg-black/30 px-2 py-1.5">
              <span className={`flex items-center gap-1 truncate font-mono ${mini ? "text-[9px]" : "text-[10.5px]"} text-foreground/65`}>
                <ChevronRight className={`${mini ? "size-2.5" : "size-3"} shrink-0`} strokeWidth={2} />
                {currentStep ? (
                  <span className="truncate">{currentStep.label}</span>
                ) : execution ? (
                  <span className="truncate">{execution.taskTitle}</span>
                ) : (
                  <span className="text-white/30">Waiting…</span>
                )}
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between">
              <span className="font-mono text-[9px] text-muted-foreground">
                {running ? `${doneSteps}/${totalSteps} steps` : "idle"}
              </span>
              <span className="flex gap-0.5">
                {[0, 1, 2].map((j) => (
                  <span
                    key={j}
                    className={`h-0.5 w-3.5 rounded-full ${j < Math.ceil((pct / 100) * 3) ? "bg-white/40" : "bg-white/10"}`}
                  />
                ))}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Expanded state: Formatted exactly like the reference image screenshot */}
      {isExpanded && (
        <div className="border-t border-white/10 px-3.5 py-3 space-y-3 animate-in fade-in duration-200">
          {/* Active Task title & Repo badge */}
          <div>
            <h4 className="text-[13px] font-semibold tracking-tight text-foreground leading-snug">
              {execution ? execution.taskTitle : "Execute deep repo analysis"}
            </h4>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="rounded-md border border-white/12 bg-white/[0.05] px-2 py-0.5 font-mono text-[9px] text-foreground/70">
                {execution?.repoName || "SudeshDahale/Salary-Predictor"}
              </span>
              <span className="font-mono text-[9px] text-white/35">
                {execution?.startedAt ? new Date(execution.startedAt).toLocaleTimeString() : "10:36:26 AM"}
              </span>
            </div>
          </div>

          <div className="h-[1px] w-full bg-white/10" />

          {/* Steps checklist */}
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {displaySteps.map((step, idx) => {
              const isDone = step.status === "done";
              const isRunning = step.status === "running";

              return (
                <div key={idx} className="flex items-center gap-2.5">
                  {isDone ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                  ) : isRunning ? (
                    <Loader2 className="size-4 shrink-0 text-sky-400 animate-spin" />
                  ) : (
                    <Clock className="size-4 shrink-0 text-white/20" />
                  )}
                  <span className={`text-[11.5px] font-medium ${isDone ? "text-foreground/90" : isRunning ? "text-foreground" : "text-muted-foreground"}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Node 4: Logs Node Component ──────────────────────────────────────────────

function LogsNode({
  d,
  historyCount,
  openPrs,
  onClick,
}: {
  d: Dims;
  historyCount: number;
  openPrs: number;
  onClick: () => void;
}) {
  const mini = d.cardScale === "mini";
  return (
    <button
      onClick={onClick}
      className="signal-node-card group absolute flex flex-col justify-between p-3 text-left cursor-pointer hover:border-white/20 transition-all"
      style={{ left: d.out_x, top: d.midY - d.out_h / 2, width: d.out_w, height: d.out_h }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="grid shrink-0 place-items-center rounded-md border border-border bg-surface-3"
          style={{ width: mini ? 20 : 28, height: mini ? 20 : 28 }}
        >
          <ScrollText className={mini ? "size-3" : "size-3.5"} strokeWidth={1.7} />
        </span>
        <div>
          <span className={`block font-medium tracking-tight ${mini ? "text-[11.5px]" : "text-[13px]"}`}>
            Logs
          </span>
          {!mini && (
            <span className="block font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
              Output
            </span>
          )}
        </div>
      </div>
      <div>
        <span className={`block font-light tracking-tight ${mini ? "text-xl" : "text-3xl"}`}>
          {historyCount}
        </span>
        <span className="font-mono text-[9.5px] text-muted-foreground">tasks completed</span>
      </div>
      {!mini && (
        <span className="flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-widest text-white/40 group-hover:text-foreground/70 transition-colors">
          Open panel <ArrowRight className="size-3" />
        </span>
      )}
    </button>
  );
}

// ─── Side Panel (Drawer) Component ─────────────────────────────────────────────
// Opens ONLY when triggered explicitly (e.g. Logs Node click or "View all logs" click)

function SidePanelDrawer({
  open,
  categoryFilter,
  onClose,
  history,
  openPrs,
}: {
  open: boolean;
  categoryFilter: SignalCategory | null;
  onClose: () => void;
  history: CompletedExecution[];
  openPrs: number;
}) {
  const { data: feed = [], isLoading } = useSignalsFeed(categoryFilter);

  if (!open) return null;

  const categoryLabel = categoryFilter ? CATEGORY_LABELS[categoryFilter] : "All Logs";

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 h-full w-[420px] max-w-full flex flex-col border-l border-border bg-[#0e0e0e] shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {categoryFilter ? "Signal Feed" : "Execution Logs"}
            </p>
            <h2 className="mt-0.5 text-[15px] font-medium tracking-tight">{categoryLabel}</h2>
          </div>
          <button
            onClick={onClose}
            className="grid place-items-center rounded-lg border border-border bg-surface-2 p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {categoryFilter ? (
            /* Category specific signals feed */
            isLoading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Loading signals…</p>
            ) : feed.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No recent signals for {categoryLabel}.</p>
            ) : (
              feed.map((s) => (
                <div key={s.id} className="signal-node-card rounded-xl px-3.5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[12.5px] font-medium leading-snug tracking-tight">{s.title}</p>
                    <span className="font-mono text-[9px] text-white/30 shrink-0">
                      {new Date(s.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  {s.detail && (
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{s.detail}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="rounded-md border border-border bg-surface-3 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                      {s.repoName ?? "unknown"}
                    </span>
                  </div>
                </div>
              ))
            )
          ) : (
            /* Completed Execution Logs */
            <>
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[9.5px] text-muted-foreground uppercase tracking-widest">
                  {history.length} completed tasks · {openPrs} PRs
                </span>
              </div>
              {history.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No completed execution logs yet.</p>
              ) : (
                history.map((exec, i) => (
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
                ))
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main SignalCanvas Component ───────────────────────────────────────────────

export function SignalCanvas({
  size,
  summary,
  execution,
  history,
  taskQueue,
  docsCount,
  openPrs,
}: {
  size: "mini" | "full";
  summary: SignalsSummary;
  execution: AgentExecution;
  history: CompletedExecution[];
  taskQueue: AgentTask[];
  docsCount: number;
  openPrs: number;
}) {
  const [expandedNode, setExpandedNode] = useState<ActiveExpandedNode>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<SignalCategory | null>(null);

  const d = dimsFor(size, expandedNode);
  const byCategory = Object.fromEntries(summary.categories.map((c) => [c.category, c]));
  const sourceCategories = CATEGORIES.map((cat) => byCategory[cat]).filter(Boolean) as CategorySummary[];
  const executionRunning = execution?.status === "running";

  function handleToggleNode(node: ActiveExpandedNode) {
    setExpandedNode((prev) => (prev === node ? null : node));
  }

  function handleOpenSidePanel(cat?: SignalCategory) {
    setActiveCategoryFilter(cat ?? null);
    setSidePanelOpen(true);
  }

  return (
    <>
      <div className="relative mx-auto transition-all duration-300" style={{ width: d.w, height: d.h }}>
        {size === "full" && <div className="signal-grid-bg absolute inset-0 rounded-2xl" />}

        {/* Backdrop for closing expanded node dropdowns when clicking outside */}
        {expandedNode !== null && (
          <div className="fixed inset-0 z-20" onClick={() => setExpandedNode(null)} />
        )}

        <Edges d={d} categories={sourceCategories} executionRunning={executionRunning} />

        {sourceCategories.map((c, i) => (
          <SourceCard
            key={c.category}
            d={d}
            index={i}
            summary={c}
            isExpanded={expandedNode === i}
            onToggle={() => handleToggleNode(i)}
            onOpenSidePanel={(category) => handleOpenSidePanel(category)}
          />
        ))}

        <ClassifierNode
          d={d}
          taskQueue={taskQueue}
          isExpanded={expandedNode === "classifier"}
          onToggle={() => handleToggleNode("classifier")}
        />

        <ExecutorNode
          d={d}
          execution={execution}
          isExpanded={expandedNode === "executor"}
          onToggle={() => handleToggleNode("executor")}
        />

        <LogsNode
          d={d}
          historyCount={history.length}
          openPrs={openPrs}
          onClick={() => handleOpenSidePanel(undefined)}
        />
      </div>

      {/* Side Panel Drawer — opens ONLY when requested */}
      <SidePanelDrawer
        open={sidePanelOpen}
        categoryFilter={activeCategoryFilter}
        onClose={() => setSidePanelOpen(false)}
        history={history}
        openPrs={openPrs}
      />
    </>
  );
}
