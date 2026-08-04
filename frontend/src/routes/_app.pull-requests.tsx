import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { prEvents, formatAgo, type PrEvent } from "@/lib/log-data";
import { useLiveTick } from "@/hooks/use-live-tick";
import {
  GitPullRequest,
  GitMerge,
  GitPullRequestClosed,
  ArrowLeft,
  Filter,
  Download,
  Loader2,
  Check,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_app/pull-requests")({
  head: () => ({
    meta: [
      { title: "PR activity · AutoScribe" },
      {
        name: "description",
        content:
          "Timestamped log of every documentation pull request AutoScribe opened, merged or closed on GitHub.",
      },
      { property: "og:title", content: "Pull request activity · AutoScribe" },
      {
        property: "og:description",
        content: "Every doc PR sent, reviewed, merged or closed — with timestamps.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PullRequests,
});

const statusStyle: Record<PrEvent["status"], string> = {
  open: "bg-success/10 text-success border-success/25",
  review: "bg-warning/10 text-warning border-warning/25",
  merged: "bg-chart-5/10 text-chart-5 border-chart-5/25",
  closed: "bg-error/10 text-error border-error/25",
  draft: "bg-surface-3 text-muted-foreground border-border",
};

const statusIcon: Record<PrEvent["status"], React.ComponentType<{ className?: string }>> = {
  open: GitPullRequest,
  review: GitPullRequest,
  merged: GitMerge,
  closed: GitPullRequestClosed,
  draft: GitPullRequest,
};

function PullRequests() {
  const elapsed = useLiveTick();
  const [filter, setFilter] = useState<"all" | PrEvent["status"]>("all");

  const rows = useMemo(
    () => (filter === "all" ? prEvents : prEvents.filter((p) => p.status === filter)),
    [filter],
  );

  const totals = useMemo(
    () => ({
      open: prEvents.filter((p) => p.status === "open" || p.status === "review").length,
      merged: prEvents.filter((p) => p.status === "merged").length,
      closed: prEvents.filter((p) => p.status === "closed").length,
      changes: prEvents.reduce((s, p) => s + p.additions + p.deletions, 0),
    }),
    [],
  );

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Overview
          </Link>
          <h1 className="mt-2 font-display text-3xl tracking-tight font-medium">PR activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every documentation pull request AutoScribe sent to GitHub, and what happened next.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface-1 text-[12px] text-muted-foreground">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inline-flex w-full h-full rounded-full bg-success opacity-70 animate-ping" />
              <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-success" />
            </span>
            Synced with GitHub
          </span>
          <button className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-border bg-surface-2 text-sm hover:bg-surface-3 transition">
            <Download className="w-4 h-4" /> Export log
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Awaiting review" value={totals.open} accent="warning" />
        <Stat label="Merged" value={totals.merged} />
        <Stat label="Closed" value={totals.closed} />
        <Stat label="Lines changed" value={totals.changes.toLocaleString()} />
      </section>

      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        {(["all", "open", "review", "merged", "closed", "draft"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-full border capitalize transition ${
              filter === f
                ? "border-foreground/30 bg-surface-2 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-border bg-surface-1 overflow-hidden">
        <ol className="divide-y divide-border">
          {rows.map((p) => {
            const Icon = statusIcon[p.status];
            return (
              <li
                key={p.id}
                className="flex items-start gap-3.5 px-5 py-4 hover:bg-surface-2/50 transition"
              >
                <span className="mt-0.5 w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center shrink-0">
                  <Icon
                    className={`w-3.5 h-3.5 ${
                      p.status === "merged"
                        ? "text-chart-5"
                        : p.status === "closed"
                          ? "text-error"
                          : "text-primary/80"
                    }`}
                  />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-medium truncate">{p.title}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full border text-[10px] uppercase tracking-wider ${statusStyle[p.status]}`}
                    >
                      {p.status}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
                    <Link
                      to="/repository/$id"
                      params={{ id: p.repo }}
                      className="font-mono hover:text-foreground"
                    >
                      {p.repo}
                    </Link>
                    <span>#{p.number}</span>
                    <span>·</span>
                    <span className="font-mono">{p.branch}</span>
                    <span>·</span>
                    <span>{p.author}</span>
                    <span>·</span>
                    <span className="text-success">+{p.additions}</span>
                    <span className="text-error">−{p.deletions}</span>
                    <span>in {p.files} files</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[12px] tabular-nums text-foreground/80">
                    {formatAgo(p.agoSec + elapsed)}
                  </div>
                  <div className="mt-0.5 text-[10.5px] inline-flex items-center gap-1 text-muted-foreground">
                    {p.checks === "running" ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin text-warning" /> checks running
                      </>
                    ) : p.checks === "failing" ? (
                      <>
                        <X className="w-3 h-3 text-error" /> checks failing
                      </>
                    ) : (
                      <>
                        <Check className="w-3 h-3 text-success" /> checks passed
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "warning";
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-1 p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={`mt-2 font-display text-2xl font-medium ${accent === "warning" ? "text-warning" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
