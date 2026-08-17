import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
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
} from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Overview · AutoScribe" },
      { name: "description", content: "Manage every connected repository, review recent AI activity and track documentation health." },
      { property: "og:title", content: "AutoScribe — Repository Overview" },
      { property: "og:description", content: "One place to manage all your repositories and docs." },
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
};

type DashboardData = {
  repositories: DashboardRepo[];
  activity: ActivityItem[];
  tokenUsage: { plan: string; used: number; limit: number; resetsIn: string };
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
          tokenUsage: { plan: "Free", used: 0, limit: 250_000, resetsIn: "—" },
          activeRepo: null,
        };
      }
      return res.json();
    },
  });

  // Live activity feed (Sprint 9): the backend pushes new activity_log rows
  // over SSE as they're written by a background analysis run, so the list
  // below updates on its own -- no polling, no manual refresh.
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

function Overview() {
  const { data, isLoading } = useDashboard();
  const repositories = data?.repositories ?? [];
  const activity = data?.activity ?? [];
  const tokenUsage = data?.tokenUsage ?? { plan: "Free", used: 0, limit: 250_000, resetsIn: "—" };

  const totals = useMemo(() => {
    const docs = repositories.reduce((s, r) => s + r.docsCount, 0);
    const prs = repositories.reduce((s, r) => s + r.openPRs, 0);
    const avg = repositories.length
      ? Math.round(repositories.reduce((s, r) => s + r.understandingScore, 0) / repositories.length)
      : 0;
    const pending = repositories.filter((r) => r.status !== "synced").length;
    return { docs, prs, avg, pending };
  }, [repositories]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight font-medium">Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${repositories.length} connected · ${totals.pending} need attention`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/connect"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:brightness-95 transition"
          >
            <Plus className="w-4 h-4" /> Connect repository
          </Link>
          <Link
            to="/ask"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-border bg-surface-2 text-sm hover:bg-surface-3 transition"
          >
            <Sparkles className="w-4 h-4" /> Ask across repos
          </Link>
        </div>
      </header>

      {/* KPI strip — every card is a shortcut into the matching section */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiLink
          to="/repositories"
          icon={FolderGit2}
          label="Repositories"
          value={repositories.length}
          hint="Manage connected repos"
        />
        <KpiLink
          to="/documents-log"
          icon={FileText}
          label="Documents generated"
          value={totals.docs}
          hint="View generation log"
        />
        <KpiLink
          to="/pull-requests"
          icon={GitPullRequest}
          label="Open doc PRs"
          value={totals.prs}
          accent={totals.prs > 0}
          hint="View PR activity log"
        />
        <KpiLink
          to="/architecture"
          icon={Activity}
          label="Avg understanding"
          value={`${totals.avg}%`}
          hint={`${tokenUsage.plan} plan · ${(tokenUsage.used / 1000).toFixed(0)}k / ${(tokenUsage.limit / 1000).toFixed(0)}k tokens · resets in ${tokenUsage.resetsIn}`}
        />
      </section>

      {/* Recent activity — the only feed on the overview */}
      <section className="rounded-2xl border border-border bg-surface-1 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-medium">Recent activity</h3>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              What AutoScribe has been doing across your repositories.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inline-flex w-full h-full rounded-full bg-success opacity-70 animate-ping" />
              <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-success" />
            </span>
            Live
          </span>
        </div>

        {activity.length === 0 && (
          <div className="mt-5 text-center text-sm text-muted-foreground py-8">
            {isLoading
              ? "Loading activity…"
              : "No activity yet — connect a repository and run an analysis to see it here."}
          </div>
        )}

        <ol className="mt-5 divide-y divide-border">
          {activity.map((a) => {
            const Icon = activityIcon[a.type] ?? Activity;
            return (
              <li key={a.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <div className="w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-3.5 h-3.5 text-primary/80" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] text-foreground/90 leading-snug">{a.text}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-muted-foreground">
                    {a.repoId ? (
                      <Link to="/repository/$id" params={{ id: a.repoId }} className="hover:text-foreground">
                        {a.repo}
                      </Link>
                    ) : (
                      <span>{a.repo}</span>
                    )}
                    <span>·</span>
                    <span>{a.time}</span>
                  </div>
                </div>
                {a.repoId && (
                  <Link
                    to="/repository/$id"
                    params={{ id: a.repoId }}
                    className="text-muted-foreground hover:text-foreground shrink-0 self-center"
                    aria-label={`Open ${a.repo}`}
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function KpiLink({
  to,
  icon: Icon,
  label,
  value,
  accent,
  hint,
}: {
  to:
    | "/repositories"
    | "/documentation"
    | "/architecture"
    | "/ask"
    | "/documents-log"
    | "/pull-requests";
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  accent?: boolean;
  hint?: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-border bg-surface-1 p-4 hover:border-foreground/20 hover:bg-surface-2/60 transition text-left"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className={`w-4 h-4 ${accent ? "text-warning" : "text-primary/70"}`} />
      </div>
      <div className={`mt-2 font-display text-2xl font-medium ${accent ? "text-warning" : ""}`}>
        {value}
      </div>
      {hint && (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground truncate">
          <span className="truncate">{hint}</span>
          <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition shrink-0" />
        </div>
      )}
    </Link>
  );
}