import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { activeRepo, aiActivity, modules } from "@/lib/mock-data";
import { useRepos, type UpdateTarget } from "@/lib/repo-store";
import { LiveDiagram, DiagramLegend } from "@/components/architecture/live-diagram";
import { getRepoDiagrams } from "@/lib/architecture-graph";
import {
  ArrowUpRight,
  GitCommit,
  Sparkles,
  Shield,
  CreditCard,
  Package,
  Users,
  Bell,
  Boxes,
  Check,
  GitBranch,
  Unplug,
  RefreshCw,
  BookText,
  Activity,
  FileText,
  GitPullRequest,
  ChevronRight,
  AlertTriangle,
  Zap,
  History,
} from "lucide-react";

export const Route = createFileRoute("/_app/repository/$id")({
  head: () => ({
    meta: [
      { title: "Repository · AutoScribe" },
      { name: "description", content: "Repository intelligence — understanding score, live architecture, modules, auto-update settings and recent AI activity." },
      { property: "og:title", content: "Repository · AutoScribe" },
      { property: "og:description", content: "An AI engineer that reads, documents and explains your codebase in real time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RepositoryPage,
});

const modIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  shield: Shield,
  "credit-card": CreditCard,
  package: Package,
  users: Users,
  bell: Bell,
  boxes: Boxes,
};

const tabs = ["Overview", "Architecture", "Modules", "Activity", "Settings"] as const;


function RepositoryPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { repos, disconnect, getSettings, updateSettings, docHistoryFor } = useRepos();
  const repo = repos.find((r) => r.id === id);
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [confirm, setConfirm] = useState(false);
  const diagrams = useMemo(() => getRepoDiagrams(id), [id]);
  const [archViewId, setArchViewId] = useState<string>(diagrams[0].id);
  const archView = diagrams.find((d) => d.id === archViewId) ?? diagrams[0];
  const history = docHistoryFor(id);
  const settings = getSettings(id);

  if (!repo) {
    return (
      <div className="rounded-xl border border-border bg-surface-1 p-10 text-center">
        <div className="text-[15px] font-medium">This repository isn’t connected</div>
        <p className="mt-1 text-[13px] text-muted-foreground">
          It may have been disconnected. Reconnect it to resume documentation.
        </p>
        <Link
          to="/repositories"
          search={{ add: true }}
          className="mt-4 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-primary-foreground text-[13px] font-medium"
        >
          Manage repositories
        </Link>
      </div>
    );
  }

  const attention = repo.status !== "synced";

  return (
    <div className="space-y-5">
      {/* Level 1 — identity + status + primary actions */}
      <header className="rounded-xl border border-border bg-surface-1 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Link to="/repositories" search={{ add: undefined }} className="hover:text-foreground">
                Repositories
              </Link>
              <ChevronRight className="w-3 h-3" />
              <span>{repo.org}</span>
            </div>
            <h1 className="mt-1 text-[24px] tracking-tight font-semibold truncate">{repo.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
              <span
                className={`inline-flex items-center gap-1.5 ${
                  repo.status === "synced"
                    ? "text-success"
                    : repo.status === "pending"
                      ? "text-warning"
                      : "text-chart-5"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    repo.status === "synced"
                      ? "bg-success"
                      : repo.status === "pending"
                        ? "bg-warning"
                        : "bg-chart-5 pulse-dot"
                  }`}
                />
                {repo.status === "synced"
                  ? "Docs in sync"
                  : repo.status === "pending"
                    ? "Docs need review"
                    : "Analyzing"}
              </span>
              <span className="inline-flex items-center gap-1">
                <GitBranch className="w-3 h-3" /> {repo.branch}
              </span>
              <span>{repo.language}</span>
              <span>Updated {repo.updated}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/documentation"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:brightness-95"
            >
              <BookText className="w-3.5 h-3.5" /> Open documentation
            </Link>
            <Link
              to="/ask"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-surface-2 text-[13px] hover:bg-surface-3"
            >
              <Sparkles className="w-3.5 h-3.5" /> Ask AI
            </Link>
            <button
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-surface-2 text-[13px] text-muted-foreground hover:text-foreground hover:bg-surface-3"
              title="Re-analyze repository"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setConfirm(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-surface-2 text-[13px] text-muted-foreground hover:text-destructive hover:border-destructive/40"
              title="Disconnect repository"
            >
              <Unplug className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Key metrics strip */}
        <div className="mt-5 grid grid-cols-2 lg:grid-cols-5 gap-3">
          <ScoreCell score={repo.understandingScore} />
          <Cell icon={FileText} label="Documents" value={repo.docsCount} />
          <Cell
            icon={GitPullRequest}
            label="Open doc PRs"
            value={repo.openPRs}
            tone={repo.openPRs > 0 ? "warning" : undefined}
          />
          <Cell icon={Boxes} label="Modules" value={activeRepo.modulesDetected} />
          <Cell icon={Activity} label="Files analyzed" value={activeRepo.filesAnalyzed} />
        </div>
      </header>

      {/* Level 2 — the one thing to act on */}
      {attention && (
        <section className="rounded-xl border border-warning/25 bg-warning/[0.06] p-4 flex flex-wrap items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium">
              {activeRepo.lastCommit.message} — documentation update required
            </div>
            <div className="text-[12px] text-muted-foreground mt-0.5">
              {activeRepo.lastCommit.files} files changed · commit {activeRepo.lastCommit.sha} ·{" "}
              {activeRepo.lastCommit.time}
            </div>
          </div>
          <button className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-[12.5px] font-medium hover:brightness-95">
            <Sparkles className="w-3.5 h-3.5" /> Generate update
          </button>
        </section>
      )}

      {/* Level 3 — tabbed detail */}
      <div className="flex items-center gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`h-9 px-3 text-[13px] -mb-px border-b-2 transition ${
              tab === t
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="grid grid-cols-12 gap-4">
          <ArchitectureCard
            onExpand={() => setTab("Architecture")}
            className="col-span-12 xl:col-span-8"
            view={archView}
          />
          <div className="col-span-12 xl:col-span-4 space-y-4">
            <Panel title="Tech stack">
              <div className="flex flex-wrap gap-1.5">
                {activeRepo.techStack.map((t) => (
                  <span
                    key={t}
                    className="text-[12px] px-2 h-6 inline-flex items-center rounded-md bg-surface-2 border border-border"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <div className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                Architecture style
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {activeRepo.architectureStyle.map((t) => (
                  <span
                    key={t}
                    className="text-[12px] px-2 h-6 inline-flex items-center rounded-md bg-surface-2 border border-border text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Panel>

            <Panel
              title="Important modules"
              action={
                <button
                  onClick={() => setTab("Modules")}
                  className="text-[11.5px] text-muted-foreground hover:text-foreground"
                >
                  View all →
                </button>
              }
            >
              <div className="space-y-1">
                {modules.slice(0, 4).map((m) => {
                  const Icon = modIcons[m.icon] ?? Package;
                  return (
                    <div
                      key={m.name}
                      className="flex items-start gap-2.5 p-2 rounded-md hover:bg-surface-2 transition cursor-pointer"
                    >
                      <div className="w-7 h-7 rounded-md bg-surface-2 border border-border flex items-center justify-center shrink-0">
                        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px]">{m.name}</div>
                        <div className="text-[11.5px] text-muted-foreground truncate">{m.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {tab === "Architecture" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-1 p-1.5">
            <div className="flex items-center gap-1 overflow-x-auto">
              {diagrams.map((d) => {
                const active = d.id === archView.id;
                return (
                  <button
                    key={d.id}
                    onClick={() => setArchViewId(d.id)}
                    className={`px-3 h-8 text-[12.5px] rounded-md whitespace-nowrap transition ${
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
            <div className="px-2 pt-1.5 pb-0.5 text-[11.5px] text-muted-foreground">
              {archView.description}
            </div>
          </div>
          <ArchitectureCard full view={archView} />
        </div>
      )}

      {tab === "Settings" && (
        <SettingsPanel
          settings={settings}
          onChange={(patch) => updateSettings(id, patch)}
          history={history}
        />
      )}


      {tab === "Modules" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {modules.map((m) => {
            const Icon = modIcons[m.icon] ?? Package;
            return (
              <div
                key={m.name}
                className="rounded-xl border border-border bg-surface-1 p-4 hover:border-foreground/20 transition"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-md bg-surface-2 border border-border flex items-center justify-center">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="text-[13.5px] font-medium">{m.name}</div>
                </div>
                <p className="mt-2.5 text-[12.5px] text-muted-foreground leading-relaxed">
                  {m.desc}
                </p>
                <button className="mt-3 inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
                  Open docs <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tab === "Activity" && (
        <Panel title="Recent intelligence">
          <ol className="relative border-l border-border ml-2 space-y-4">
            {aiActivity.map((a, i) => (
              <li key={i} className="pl-5 relative">
                <span className="absolute -left-[9px] top-0.5 w-4 h-4 rounded-full bg-surface-2 border border-border flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-success" />
                </span>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-[13px]">{a.text}</div>
                  <div className="text-[11.5px] text-muted-foreground shrink-0 inline-flex items-center gap-1.5">
                    <GitCommit className="w-3 h-3" /> {a.commit} · {a.time}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {confirm && (
        <div
          className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-border bg-surface-1 p-5 shadow-2xl"
          >
            <div className="text-[15px] font-semibold">Disconnect {repo.name}?</div>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              AutoScribe stops analysing this repository. You can reconnect it any time.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirm(false)}
                className="h-9 px-3.5 rounded-md border border-border bg-surface-2 text-[13px] hover:bg-surface-3"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  disconnect(repo.id);
                  navigate({ to: "/repositories", search: { add: undefined } });
                }}
                className="h-9 px-3.5 rounded-md bg-destructive text-destructive-foreground text-[13px] font-medium hover:brightness-95"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ArchitectureCard({
  className = "",
  full = false,
  onExpand,
  view,
}: {
  className?: string;
  full?: boolean;
  onExpand?: () => void;
  view?: ReturnType<typeof getRepoDiagrams>[number];
}) {
  return (
    <div className={`rounded-xl border border-border bg-surface-1 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 h-11 border-b border-border">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-success" />
          <span className="text-[13px] font-medium">
            {view ? view.name : "Architecture overview"}
          </span>
          <span className="text-[11.5px] text-muted-foreground hidden sm:inline">
            · live traffic
          </span>
        </div>
        {full ? (
          <Link
            to="/architecture"
            className="text-[11.5px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            Full architecture <ArrowUpRight className="w-3 h-3" />
          </Link>
        ) : (
          <button
            onClick={onExpand}
            className="text-[11.5px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            Expand <ArrowUpRight className="w-3 h-3" />
          </button>
        )}
      </div>
      <LiveDiagram compact={!full} nodes={view?.nodes} edges={view?.edges} />
      <div className="px-4 py-3 border-t border-border">
        <DiagramLegend />
      </div>
    </div>
  );
}

function SettingsPanel({
  settings,
  onChange,
  history,
}: {
  settings: import("@/lib/repo-store").RepoSettings;
  onChange: (patch: Partial<import("@/lib/repo-store").RepoSettings>) => void;
  history: import("@/lib/repo-store").DocHistoryEntry[];
}) {
  const targets: { id: UpdateTarget; label: string; hint: string }[] = [
    { id: "main",   label: "Commit to main",       hint: "Auto-commit docs directly to the default branch." },
    { id: "branch", label: "Push to a docs branch", hint: "Write to a dedicated branch you can merge later." },
    { id: "pr",     label: "Open a pull request",   hint: "Open a PR for each documentation update (recommended)." },
  ];

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 xl:col-span-6">
      <Panel title="Automatic documentation updates">
        <div className="flex items-start gap-3">
          <button
            onClick={() => onChange({ autoUpdate: !settings.autoUpdate })}
            role="switch"
            aria-checked={settings.autoUpdate}
            className={`relative shrink-0 mt-0.5 w-10 h-6 rounded-full transition ${
              settings.autoUpdate ? "bg-primary" : "bg-surface-3"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background shadow transition ${
                settings.autoUpdate ? "translate-x-4" : ""
              }`}
            />
          </button>
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium inline-flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-primary" /> Auto-update on every commit
            </div>
            <p className="mt-1 text-[12.5px] text-muted-foreground leading-relaxed">
              AutoScribe watches this repository, regenerates affected pages after each commit and
              pushes them back to GitHub using the strategy below.
            </p>
          </div>
        </div>

        <div
          className={`mt-4 space-y-2 transition ${settings.autoUpdate ? "" : "opacity-50 pointer-events-none"}`}
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Where should updates land?
          </div>
          {targets.map((t) => {
            const active = settings.updateTarget === t.id;
            return (
              <label
                key={t.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                  active
                    ? "border-primary/50 bg-primary/[0.06]"
                    : "border-border bg-surface-2 hover:border-foreground/20"
                }`}
              >
                <input
                  type="radio"
                  name="update-target"
                  checked={active}
                  onChange={() => onChange({ updateTarget: t.id })}
                  className="mt-1 accent-primary"
                />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">{t.label}</div>
                  <div className="text-[11.5px] text-muted-foreground">{t.hint}</div>
                </div>
              </label>
            );
          })}

          {settings.updateTarget === "branch" && (
            <div className="pt-1">
              <div className="text-[11px] text-muted-foreground mb-1">Branch name</div>
              <input
                value={settings.branchName ?? ""}
                onChange={(e) => onChange({ branchName: e.target.value })}
                placeholder="docs/autoscribe"
                className="w-full h-9 px-3 rounded-md bg-surface-2 border border-border text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}
        </div>
      </Panel>
      </div>

      <div className="col-span-12 xl:col-span-6 space-y-4">
        <Panel
          title="Version history"
          action={
            <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
              <History className="w-3 h-3" /> {history.length} entries
            </span>
          }
        >
          {history.length === 0 ? (
            <div className="text-[12.5px] text-muted-foreground">
              No documentation updates recorded for this repository yet.
            </div>
          ) : (
            <ol className="divide-y divide-border">
              {history.map((h) => (
                <li key={h.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-2">
                      <span
                        className={`text-[10px] px-1.5 h-5 leading-5 rounded border ${
                          h.kind === "created"
                            ? "text-success border-success/40 bg-success/10"
                            : "text-primary border-primary/40 bg-primary/10"
                        }`}
                      >
                        {h.kind === "created" ? "New" : "Updated"}
                      </span>
                      <span className="text-[13px] font-medium truncate">{h.doc}</span>
                      <span className="text-[11px] text-muted-foreground shrink-0">{h.version}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground shrink-0">{h.time}</span>
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted-foreground truncate">{h.summary}</div>
                  {h.commit && (
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] text-muted-foreground font-mono">
                      <GitCommit className="w-2.5 h-2.5" /> {h.commit}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}


function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-medium">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Cell({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  tone?: "warning";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div
        className={`mt-1 text-[18px] font-medium tabular-nums ${tone === "warning" ? "text-warning" : ""}`}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function ScoreCell({ score }: { score: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
        Understanding
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-[18px] font-medium tabular-nums">{score}%</span>
        <div className="flex-1 h-1 rounded-full bg-surface-3 overflow-hidden">
          <div className="h-full bg-success" style={{ width: `${score}%` }} />
        </div>
      </div>
    </div>
  );
}
