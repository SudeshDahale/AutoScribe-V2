import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { docEvents, formatAgo, type DocEvent } from "@/lib/log-data";
import { useLiveTick } from "@/hooks/use-live-tick";
import { FileText, Download, Loader2, Check, AlertCircle, ArrowLeft, Filter } from "lucide-react";

export const Route = createFileRoute("/_app/documents-log")({
  head: () => ({
    meta: [
      { title: "Document log · AutoScribe" },
      {
        name: "description",
        content:
          "A timestamped log of every document AutoScribe generated, updated or failed to build across your repositories.",
      },
      { property: "og:title", content: "Document generation log · AutoScribe" },
      {
        property: "og:description",
        content: "Every generated document, with timestamps, triggers and status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DocumentsLog,
});

const statusStyle: Record<DocEvent["status"], string> = {
  generated: "bg-success/10 text-success border-success/25",
  updated: "bg-chart-5/10 text-chart-5 border-chart-5/25",
  generating: "bg-warning/10 text-warning border-warning/25",
  failed: "bg-error/10 text-error border-error/25",
};

function DocumentsLog() {
  const elapsed = useLiveTick();
  const [filter, setFilter] = useState<"all" | DocEvent["status"]>("all");

  const rows = useMemo(
    () => (filter === "all" ? docEvents : docEvents.filter((d) => d.status === filter)),
    [filter],
  );

  const totals = useMemo(
    () => ({
      total: docEvents.length,
      running: docEvents.filter((d) => d.status === "generating").length,
      failed: docEvents.filter((d) => d.status === "failed").length,
      words: docEvents.reduce((s, d) => s + d.words, 0),
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
          <h1 className="mt-2 font-display text-3xl tracking-tight font-medium">Document log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every document AutoScribe has generated, with timestamps and triggers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface-1 text-[12px] text-muted-foreground">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inline-flex w-full h-full rounded-full bg-success opacity-70 animate-ping" />
              <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-success" />
            </span>
            Live
          </span>
          <button className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-border bg-surface-2 text-sm hover:bg-surface-3 transition">
            <Download className="w-4 h-4" /> Export log
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Documents" value={totals.total} />
        <Stat label="In progress" value={totals.running} accent="warning" />
        <Stat label="Failed" value={totals.failed} accent={totals.failed ? "error" : undefined} />
        <Stat label="Words written" value={totals.words.toLocaleString()} />
      </section>

      <div className="flex items-center gap-2 text-[12px]">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        {(["all", "generated", "updated", "generating", "failed"] as const).map((f) => (
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
          {rows.map((d) => {
            const running = d.status === "generating";
            return (
              <li
                key={d.id}
                className="flex items-start gap-3.5 px-5 py-4 hover:bg-surface-2/50 transition"
              >
                <span className="mt-0.5 w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center shrink-0">
                  {running ? (
                    <Loader2 className="w-3.5 h-3.5 text-warning animate-spin" />
                  ) : d.status === "failed" ? (
                    <AlertCircle className="w-3.5 h-3.5 text-error" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-primary/80" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-medium truncate">{d.title}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full border text-[10px] uppercase tracking-wider ${statusStyle[d.status]}`}
                    >
                      {d.status}
                    </span>
                    <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                      {d.kind}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
                    <Link
                      to="/repository/$id"
                      params={{ id: d.repo }}
                      className="font-mono hover:text-foreground"
                    >
                      {d.repo}
                    </Link>
                    <span>·</span>
                    <span>{d.trigger}</span>
                    <span>·</span>
                    <span>{d.words ? `${d.words.toLocaleString()} words` : "—"}</span>
                    <span>·</span>
                    <span className="font-mono">{d.model}</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[12px] tabular-nums text-foreground/80">
                    {formatAgo(d.agoSec + elapsed)}
                  </div>
                  <div className="mt-0.5 text-[10.5px] text-muted-foreground inline-flex items-center gap-1">
                    {d.status === "failed" ? (
                      <span className="text-error">retry available</span>
                    ) : running ? (
                      <span className="text-warning">writing…</span>
                    ) : (
                      <>
                        <Check className="w-3 h-3 text-success" /> committed
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
  accent?: "warning" | "error";
}) {
  const tone = accent === "warning" ? "text-warning" : accent === "error" ? "text-error" : "";
  return (
    <div className="rounded-2xl border border-border bg-surface-1 p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-2 font-display text-2xl font-medium ${tone}`}>{value}</div>
    </div>
  );
}
