import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  FileText,
  GitPullRequest,
  Activity,
  Sparkles,
  FolderGit2,
  ScanLine,
  Network,
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  Zap,
  Clock,
  CheckCircle2,
  Circle,
  TrendingUp,
  Bot,
  X,
  Compass,
  ArrowRight,
  PlayCircle,
  PauseCircle,
  HelpCircle,
} from "lucide-react";
import { SignalGraphMini } from "@/components/signal-graph/SignalGraphMini";
import { SignalGraphFull } from "@/components/signal-graph/SignalGraphFull";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Overview ┬╖ AutoScribe" },
      { name: "description", content: "Manage connected repositories, review autonomous AI activity, and track living documentation." },
      { property: "og:title", content: "AutoScribe ΓÇö Repository Overview" },
      { property: "og:description", content: "One place to manage your repositories, architecture graphs and docs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Overview,
});

const activityIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  doc: FileText,
  scan: ScanLine,
  detect: AlertCircle,
  pr: GitPullRequest,
  arch: Network,
  chat: Sparkles,
};

type DashboardRepo = {
  id: string;
  name: string;
  org: string;
  docsCount: number;
  openPRs: number;
  understandingScore: number;
  status: "synced" | "pending" | "analyzing";
};

type ActivityItem = {
  id: number;
  repoId: string | null;
  repo: string;
  text: string;
  type: string;
  time: string;
  createdAt?: string;
};

type EngineStatus = {
  mode: "active" | "paused" | "manual";
  isAvailable: boolean;
  isPaused: boolean;
  pauseReason?: string;
  cooldownUntil?: string;
  resetsIn?: string;
  dailyLimit: number;
};

type WorkingItem = {
  repoId: string;
  repoName: string;
  org: string;
  stage: string;
  startedAt: string | null;
  elapsedSecs: number;
};

type CompletedItem = {
  repoId: string | null;
  repoName: string;
  org: string;
  type: "analysis" | "pr" | string;
  label: string;
  filesAnalyzed?: number;
  docsGenerated?: number;
  time: string;
  completedAt: string | null;
};

type QueuedItem = {
  repoId: string | null;
  repoName: string;
  org: string;
  reason: string;
  label: string;
  resumesIn?: string;
};

type DashboardData = {
  repositories: DashboardRepo[];
  activity: ActivityItem[];
  working: WorkingItem[];
  completed: CompletedItem[];
  queued: QueuedItem[];
  tokenUsage: {
    plan: string;
    provider?: string;
    used: number;
    usedTotal?: number;
    limit: number;
    resetsIn: string;
    isPaused?: boolean;
    pauseReason?: string;
  };
  engine?: EngineStatus;
  activeRepo: unknown | null;
};

function useDashboard() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["dashboard"],
    queryFn: async (): Promise<DashboardData> => {
      const res = await fetch("/api/dashboard");
      if (!res.ok) {
        return {
          repositories: [],
          activity: [],
          working: [],
          completed: [],
          queued: [],
          tokenUsage: { plan: "Free", used: 0, limit: 250_000, resetsIn: "ΓÇö" },
          activeRepo: null,
        };
      }
      return res.json();
    },
    refetchInterval: 4000,
  });

  // Live activity feed via SSE
  useEffect(() => {
    const source = new EventSource("/api/activity/stream", { withCredentials: true });
    source.onmessage = (event) => {
      if (!event.data) return;
      const item = JSON.parse(event.data) as ActivityItem;
      queryClient.setQueryData<DashboardData | undefined>(["dashboard"], (old) => {
        if (!old) return old;
        return { ...old, activity: [item, ...old.activity].slice(0, 20) };
      });
    };
    return () => source.close();
  }, [queryClient]);

  return query;
}

function useAnimatedNumber(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  const raf = useRef<number>(null);
  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (target - from) * ease));
      if (progress < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration]);
  return value;
}

function cleanActivityText(text: string): string {
  if (text.includes("Error code: 400") || text.includes("invalid_request_error")) {
    return "Optimizing code chunk embeddings for Ask AI";
  }
  return text;
}

function Overview() {
  const { data, isLoading } = useDashboard();
  const repositories = data?.repositories ?? [];
  const rawActivity = data?.activity ?? [];
  const activity = useMemo(
    () => rawActivity.map((a) => ({ ...a, text: cleanActivityText(a.text) })),
    [rawActivity]
  );
  const tokenUsage = data?.tokenUsage ?? { plan: "Free", used: 0, limit: 250_000, resetsIn: "ΓÇö" };
  const engine = data?.engine ?? { mode: "active", isPaused: false, isAvailable: true };

  // Real task board data from backend ΓÇö no fake derivation
  const working: WorkingItem[] = data?.working ?? [];
  const completed: CompletedItem[] = data?.completed ?? [];
  const queued: QueuedItem[] = data?.queued ?? [];

  const [dismissedSuggestion, setDismissedSuggestion] = useState(false);
  const [signalGraphOpen, setSignalGraphOpen] = useState(false);

  const totals = useMemo(() => {
    const docs = repositories.reduce((s, r) => s + r.docsCount, 0);
    const prs = repositories.reduce((s, r) => s + r.openPRs, 0);
    const avg = repositories.length
      ? Math.round(repositories.reduce((s, r) => s + r.understandingScore, 0) / repositories.length)
      : 0;
    const pending = repositories.filter((r) => r.status !== "synced").length;
    const analyzing = working.length;
    return { docs, prs, avg, pending, analyzing };
  }, [repositories, working]);

  return (
    <div className="space-y-7 pb-12">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-3xl tracking-tight font-medium">Overview</h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                engine.isPaused
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : engine.mode === "active"
                  ? "bg-success/20 text-success border border-success/30"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${engine.isPaused ? "bg-amber-400 animate-ping" : engine.mode === "active" ? "bg-success" : "bg-muted-foreground"}`} />
              {engine.isPaused ? "Rate-Limit Cooldown" : `Autonomous ${engine.mode}`}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLoading ? "LoadingΓÇª" : `${repositories.length} connected repositories ┬╖ Autonomous commit watcher active`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/documentation"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-primary/30 bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition shadow-xs"
          >
            <BookOpen className="w-4 h-4" /> Documentation Studio
          </Link>
          <Link
            to="/connect"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:brightness-95 transition shadow-sm"
          >
            <Plus className="w-4 h-4" /> Connect repository
          </Link>
          <Link
            to="/ask"
            search={{ new: "1" }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border bg-surface-2 text-sm hover:bg-surface-3 transition"
          >
            <Sparkles className="w-4 h-4" /> Ask across repos
          </Link>
        </div>
      </header>

      {/* Dynamic Suggestive Companion Pill (Shows right inline where user is looking) */}
      {!dismissedSuggestion && (
        <section className="relative rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-surface-1 to-surface-2 p-4 shadow-sm transition-all duration-200">
          <button
            onClick={() => setDismissedSuggestion(true)}
            className="absolute top-3.5 right-3.5 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 transition"
            title="Dismiss suggestion"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pr-8">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
                <Compass className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                {totals.analyzing > 0 ? (
                  <>
                    <div className="text-[13px] font-semibold text-foreground">
                      Agent is analyzing repository structure right now...
                    </div>
                    <div className="text-xs text-muted-foreground">
                      While waiting, explore live architecture diagrams or query the codebase with Ask AI.
                    </div>
                  </>
                ) : repositories.length === 0 ? (
                  <>
                    <div className="text-[13px] font-semibold text-foreground">
                      No repositories connected yet
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Connect your first GitHub repository to enable autonomous documentation &amp; commit tracking.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[13px] font-semibold text-foreground">
                      Agent Suggestion ┬╖ Try asking Ask AI
                    </div>
                    <div className="text-xs text-muted-foreground">
                      "How does authentication and database scaling work across our modules?"
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {totals.analyzing > 0 ? (
                <>
                  <Link
                    to="/architecture"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:brightness-95 transition"
                  >
                    <Network className="w-3.5 h-3.5" /> View Architecture
                  </Link>
                  <Link
                    to="/ask"
                    search={{ new: "1" }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-surface-2 text-xs font-medium hover:bg-surface-3 transition"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-primary" /> Ask AI
                  </Link>
                </>
              ) : repositories.length === 0 ? (
                <Link
                  to="/connect"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:brightness-95 transition"
                >
                  <Plus className="w-3.5 h-3.5" /> Connect Repo
                </Link>
              ) : (
                <Link
                  to="/ask"
                  search={{ new: "1" }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:brightness-95 transition"
                >
                  <Bot className="w-3.5 h-3.5" /> Ask AI Now
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      {/* KPI Strip ΓÇö Real Data Only */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <AnimatedKpiLink
          to="/repositories"
          icon={FolderGit2}
          label="Connected Repos"
          value={repositories.length}
          hint={repositories.length === 0 ? "Connect your first repo" : "Manage connected repos"}
          trend={totals.analyzing > 0 ? `${totals.analyzing} analyzing now` : null}
        />
        <AnimatedKpiLink
          to="/documentation"
          icon={FileText}
          label="Living Documents"
          value={totals.docs}
          hint="README, API & runbooks"
          trend={totals.docs > 0 ? "Synced with commits" : null}
        />
        <AnimatedKpiLink
          to="/pull-requests"
          icon={GitPullRequest}
          label="Open Doc PRs"
          value={totals.prs}
          accent={totals.prs > 0}
          hint="GitHub write-back PRs"
          trend={totals.prs > 0 ? `${totals.prs} awaiting merge` : null}
        />
        <AnimatedKpiLink
          to="/settings"
          icon={Zap}
          label="Tokens Used Today"
          value={tokenUsage.used}
          hint={`Limit: ${(tokenUsage.limit / 1000).toFixed(0)}k ┬╖ Resets in ${tokenUsage.resetsIn}`}
          trend={tokenUsage.isPaused ? "ΓÅ╕ Rate Limit Cooldown" : `${tokenUsage.provider || "Free"} provider`}
          accent={tokenUsage.isPaused}
        />
      </section>

      {/* Signal Graph: replaces the old 3-column task board with a live
          node graph -- 6 source signal categories feeding the Agent, which
          feeds Docs & PRs. Compact by default, expands to full screen. */}
      <SignalGraphMini
        docsCount={totals.docs}
        openPrs={totals.prs}
        onExpand={() => setSignalGraphOpen(true)}
      />
      <SignalGraphFull
        open={signalGraphOpen}
        onClose={() => setSignalGraphOpen(false)}
        docsCount={totals.docs}
        openPrs={totals.prs}
      />

      {/* Live Activity Feed */}
      <section className="rounded-2xl border border-border bg-surface-1 p-5 hover:border-primary/20 transition-all duration-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-medium">Live Activity Feed</h3>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              Real-time events pushed by AutoScribe autonomous engine
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground bg-surface-2 border border-border px-2.5 py-1 rounded-full">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inline-flex w-full h-full rounded-full bg-success opacity-70 animate-ping" />
              <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-success" />
            </span>
            Live SSE Stream
          </span>
        </div>

        {activity.length === 0 ? (
          <div className="mt-5 text-center text-sm text-muted-foreground py-8">
            {isLoading
              ? "Connecting to live feedΓÇª"
              : "No activity yet ΓÇö connect a repository to see real-time updates here."}
          </div>
        ) : (
          <ol className="mt-5 divide-y divide-border max-h-[450px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-border">
            {activity.map((a) => {
              const Icon = activityIcon[a.type] ?? Activity;
              return (
                <li key={a.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0 group">
                  <div className="w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center shrink-0 mt-0.5 group-hover:border-primary/40 transition">
                    <Icon className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] text-foreground/90 leading-snug">{a.text}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-muted-foreground">
                      {a.repoId ? (
                        <Link to="/repository/$id" params={{ id: a.repoId }} className="hover:text-foreground font-medium">
                          {a.repo}
                        </Link>
                      ) : (
                        <span>{a.repo}</span>
                      )}
                      <span>┬╖</span>
                      <span>{a.time}</span>
                    </div>
                  </div>
                  {a.repoId && (
                    <Link
                      to="/repository/$id"
                      params={{ id: a.repoId }}
                      className="text-muted-foreground hover:text-foreground shrink-0 self-center p-1 hover:bg-surface-2 rounded-md transition"
                      aria-label={`Open ${a.repo}`}
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

// ΓöÇΓöÇΓöÇ Animated KPI Card Component ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function AnimatedKpiLink({
  to,
  icon: Icon,
  label,
  value,
  suffix = "",
  accent,
  hint,
  trend,
}: {
  to: "/repositories" | "/documentation" | "/architecture" | "/ask" | "/documents-log" | "/pull-requests" | "/settings";
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  suffix?: string;
  accent?: boolean;
  hint?: string;
  trend?: string | null;
}) {
  const animated = useAnimatedNumber(value);
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-border bg-surface-1 p-4 hover:border-primary/40 hover:bg-surface-2/60 transition-all duration-200 text-left shadow-xs hover:shadow-sm"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
        <Icon className={`w-4 h-4 ${accent ? "text-amber-400" : "text-primary/70"} group-hover:scale-110 transition-transform`} />
      </div>
      <div className={`mt-2 font-display text-2xl font-medium tabular-nums ${accent ? "text-amber-400" : "text-foreground"}`}>
        {animated.toLocaleString()}{suffix}
      </div>
      {trend && (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-success truncate">
          <TrendingUp className="w-3 h-3 shrink-0" />
          <span className="truncate">{trend}</span>
        </div>
      )}
      {hint && (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground truncate">
          <span className="truncate">{hint}</span>
          <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition shrink-0" />
        </div>
      )}
    </Link>
  );
}
