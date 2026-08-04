import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  FileCode,
  ArrowUpRight,
  Play,
  Pause,
  Activity,
  Maximize2,
  Minimize2,
  Network,
} from "lucide-react";
import { TechChip } from "@/lib/tech-logos";
import { LiveDiagram, DiagramLegend } from "@/components/architecture/live-diagram";
import {
  typeLabel,
  getRepoDiagrams,
  type GraphNode,
} from "@/lib/architecture-graph";
import { useRepos } from "@/lib/repo-store";

export const Route = createFileRoute("/_app/architecture")({
  head: () => ({
    meta: [
      { title: "Architecture · AutoScribe" },
      { name: "description", content: "Live, animated architecture views — pick a repository and switch between system, request-flow, data-plane and event views." },
      { property: "og:title", content: "Architecture · AutoScribe" },
      { property: "og:description", content: "Multiple live diagrams per repository, kept up to date automatically." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Architecture,
});

function Architecture() {
  const { repos } = useRepos();
  const [repoId, setRepoId] = useState<string>(repos[0]?.id ?? "ecommerce-platform");
  const diagrams = useMemo(() => getRepoDiagrams(repoId), [repoId]);
  const [viewId, setViewId] = useState<string>(diagrams[0].id);
  const view = diagrams.find((v) => v.id === viewId) ?? diagrams[0];

  // Reset the active view when the repository changes so the tabs stay valid.
  const currentRepo = repos.find((r) => r.id === repoId);
  const activeView =
    diagrams.find((v) => v.id === viewId) ? view : (setViewId(diagrams[0].id), diagrams[0]);

  const [selectedId, setSelectedId] = useState<string>(activeView.nodes[0]?.id ?? "");
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const selected: GraphNode =
    activeView.nodes.find((n) => n.id === selectedId) ?? activeView.nodes[0];
  const SelectedIcon = selected.icon;
  const related = activeView.edges.filter((e) => e.from === selected.id || e.to === selected.id);

  return (
    <div className="space-y-5">
      {/* Level 1 — page identity + primary control */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] tracking-tight font-semibold">Architecture</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {currentRepo?.name ?? "All repositories"} · {activeView.nodes.length} components ·{" "}
            {activeView.edges.length} connections
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 h-8 pl-2.5 pr-1.5 rounded-md border border-border bg-surface-1 text-[12px] text-muted-foreground">
            <Network className="w-3 h-3" />
            <span className="hidden sm:inline">Repository</span>
            <select
              value={repoId}
              onChange={(e) => {
                const next = e.target.value;
                setRepoId(next);
                const first = getRepoDiagrams(next)[0];
                setViewId(first.id);
                setSelectedId(first.nodes[0]?.id ?? "");
              }}
              className="bg-transparent text-foreground text-[12px] pr-1 focus:outline-none"
            >
              {repos.map((r) => (
                <option key={r.id} value={r.id} className="bg-background">
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => setPaused((p) => !p)}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-surface-1 text-[12px] text-muted-foreground hover:text-foreground hover:bg-surface-2 transition"
          >
            {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            {paused ? "Resume flow" : "Pause flow"}
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-surface-1 text-[12px] text-muted-foreground hover:text-foreground hover:bg-surface-2 transition"
          >
            {expanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            {expanded ? "Exit full screen" : "Full screen"}
          </button>
        </div>
      </header>

      {/* View switcher — one row of diagram types available for this repo */}
      <DiagramTabs
        diagrams={diagrams}
        activeId={activeView.id}
        onSelect={(id) => {
          setViewId(id);
          const first = diagrams.find((d) => d.id === id)?.nodes[0]?.id ?? "";
          setSelectedId(first);
        }}
        description={activeView.description}
      />

      <div
        className={
          expanded
            ? "fixed inset-0 z-50 bg-background p-4 sm:p-6 flex flex-col gap-4 overflow-auto"
            : "grid grid-cols-12 gap-4"
        }
      >
        {expanded && (
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-medium">
              {currentRepo?.name} · {activeView.name}
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-surface-1 text-[12px] hover:bg-surface-2"
            >
              <Minimize2 className="w-3 h-3" /> Exit full screen
            </button>
          </div>
        )}

        {/* Diagram */}
        <div
          className={`relative rounded-xl border border-border bg-surface-1 overflow-hidden ${
            expanded ? "flex-1" : "col-span-12 xl:col-span-8"
          }`}
        >
          <div className="flex items-center justify-between px-4 h-11 border-b border-border">
            <span className="inline-flex items-center gap-2 text-[12px] text-muted-foreground">
              <Activity className="w-3.5 h-3.5 text-success" />
              {activeView.name}
            </span>
            <span className="text-[11px] text-muted-foreground">Click a component for detail</span>
          </div>
          <LiveDiagram
            key={`${repoId}-${activeView.id}`}
            nodes={activeView.nodes}
            edges={activeView.edges}
            selectedId={selectedId}
            onSelect={(n) => setSelectedId(n.id)}
            paused={paused}
            className={expanded ? "h-[calc(100vh-190px)]" : ""}
          />
          <div className="px-4 py-3 border-t border-border">
            <DiagramLegend />
          </div>
        </div>

        {/* Level 2 — inspector */}
        <aside
          className={`rounded-xl border border-border bg-surface-1 divide-y divide-border h-fit ${
            expanded ? "hidden" : "col-span-12 xl:col-span-4 xl:sticky xl:top-20"
          }`}
        >
          <div className="p-4 flex items-center gap-3">
            <span className="w-9 h-9 rounded-md bg-surface-2 border border-border flex items-center justify-center shrink-0">
              <SelectedIcon className="w-4 h-4 text-foreground" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {typeLabel[selected.type]}
              </div>
              <h2 className="text-[15px] font-semibold truncate">{selected.label}</h2>
            </div>
          </div>

          <div className="p-4 grid grid-cols-3 gap-3 text-center">
            <Stat label="Files" value={String(selected.files)} />
            <Stat label="Links" value={String(related.length)} />
            <Stat
              label="Health"
              value={selected.health === "healthy" ? "OK" : selected.health === "attention" ? "Watch" : "Scan"}
              tone={selected.health}
            />
          </div>

          <div className="p-4">
            <SectionLabel>What it does</SectionLabel>
            <p className="text-[13px] text-foreground/90 leading-relaxed">{selected.purpose}</p>
            <p className="mt-2 text-[12px] text-muted-foreground leading-relaxed">
              {selected.doing}
            </p>
          </div>

          <div className="p-4">
            <SectionLabel>Connections</SectionLabel>
            <div className="space-y-1.5">
              {related.map((e) => {
                const otherId = e.from === selected.id ? e.to : e.from;
                const other = activeView.nodes.find((n) => n.id === otherId);
                if (!other) return null;
                const outgoing = e.from === selected.id;
                return (
                  <button
                    key={`${e.from}-${e.to}`}
                    onClick={() => setSelectedId(other.id)}
                    className="w-full flex items-center gap-2 text-[12px] px-2.5 py-1.5 rounded-md bg-surface-2 border border-border hover:border-foreground/25 transition text-left"
                  >
                    <span className="text-muted-foreground">{outgoing ? "→" : "←"}</span>
                    <span className="flex-1 truncate">{other.label}</span>
                    <span className="text-[10.5px] text-muted-foreground shrink-0">{e.label}</span>
                  </button>
                );
              })}
              {related.length === 0 && (
                <div className="text-[12px] text-muted-foreground">No connections in this view.</div>
              )}
            </div>
          </div>

          <div className="p-4">
            <SectionLabel>Tech stack</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {selected.tech.map((d) => (
                <TechChip key={d} name={d} />
              ))}
            </div>
          </div>

          <div className="p-4">
            <SectionLabel>Key files</SectionLabel>
            <div className="space-y-1">
              {["service.py", "routes.py", "models.py", "schemas.py"].map((f) => (
                <div
                  key={f}
                  className="flex items-center gap-2 text-[12px] px-2.5 py-1.5 rounded-md bg-surface-2 border border-border font-mono"
                >
                  <FileCode className="w-3 h-3 text-muted-foreground" /> {f}
                </div>
              ))}
            </div>
          </div>

          <div className="p-4">
            <button className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:brightness-95">
              Open documentation <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function DiagramTabs({
  diagrams,
  activeId,
  onSelect,
  description,
}: {
  diagrams: ReturnType<typeof getRepoDiagrams>;
  activeId: string;
  onSelect: (id: string) => void;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-1.5">
      <div className="flex items-center gap-1 overflow-x-auto">
        {diagrams.map((d) => {
          const active = d.id === activeId;
          return (
            <button
              key={d.id}
              onClick={() => onSelect(d.id)}
              className={`px-3 h-8 text-[12.5px] rounded-md transition whitespace-nowrap ${
                active
                  ? "bg-surface-3 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
              }`}
            >
              {d.name}
            </button>
          );
        })}
      </div>
      <div className="px-2 pt-1.5 pb-0.5 text-[11.5px] text-muted-foreground">{description}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "healthy" | "attention" | "analyzing";
}) {
  const color =
    tone === "attention" ? "text-warning" : tone === "analyzing" ? "text-chart-5" : "text-foreground";
  return (
    <div className="rounded-md bg-surface-2 border border-border py-2">
      <div className={`text-[14px] font-medium tabular-nums ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
        {label}
      </div>
    </div>
  );
}
