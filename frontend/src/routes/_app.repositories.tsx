import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Plus,
  Search,
  GitBranch,
  FileText,
  GitPullRequest,
  Lock,
  Globe,
  MoreHorizontal,
  Unplug,
  RefreshCw,
  Check,
  Loader2,
  X,
  Star,
  Github,
  AlertTriangle,
  BookText,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TechIcon } from "@/lib/tech-logos";
import { useRepos, type GithubRepo } from "@/lib/repo-store";

export const Route = createFileRoute("/_app/repositories")({
  validateSearch: (search: Record<string, unknown>) => ({
    add: search.add === true || search.add === "true" ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Repositories · AutoScribe" },
      { name: "description", content: "Connect, monitor and disconnect repositories — with documentation health at a glance." },
      { property: "og:title", content: "Repositories · AutoScribe" },
      { property: "og:description", content: "All connected repositories and their documentation health." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RepositoriesPage,
});

const statusMeta: Record<string, { dot: string; label: string; text: string }> = {
  synced: { dot: "bg-success", label: "Synced", text: "text-success" },
  pending: { dot: "bg-warning", label: "Needs review", text: "text-warning" },
  analyzing: { dot: "bg-chart-5 pulse-dot", label: "Analyzing", text: "text-chart-5" },
  failed: { dot: "bg-destructive", label: "Failed", text: "text-destructive" },
};

const getStatusMeta = (status?: string | null) => (status && statusMeta[status]) || statusMeta.pending;

function RepositoriesPage() {
  const { add } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { repos, disconnect } = useRepos();
  const [query, setQuery] = useState("");

  const reanalyzeMutation = useMutation({
    mutationFn: async (repoId: string) => {
      const res = await fetch(`/api/repos/${repoId}/analyze`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to start analysis");
      return res.json();
    },
    onSuccess: (_, repoId) => {
      queryClient.invalidateQueries({ queryKey: ["repos"] });
      queryClient.invalidateQueries({ queryKey: ["analysis", repoId] });
      queryClient.invalidateQueries({ queryKey: ["architecture", repoId] });
    },
  });
  const [filter, setFilter] = useState<"all" | "synced" | "pending" | "analyzing">("all");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
  const showAdd = Boolean(add);

  const openAdd = () => navigate({ to: "/repositories", search: { add: true } });
  const closeAdd = () => navigate({ to: "/repositories", search: { add: undefined } });

  const filtered = useMemo(
    () =>
      repos.filter((r) => {
        if (filter !== "all" && r.status !== filter) return false;
        if (query && !`${r.org}/${r.name}`.toLowerCase().includes(query.toLowerCase()))
          return false;
        return true;
      }),
    [repos, query, filter],
  );

  const needsAttention = repos.filter((r) => r.status !== "synced");
  const totalDocs = repos.reduce((s, r) => s + r.docsCount, 0);
  const openPRs = repos.reduce((s, r) => s + r.openPRs, 0);

  return (
    <div className="space-y-5" onClick={() => setMenuFor(null)}>
      {/* Level 1 — identity + primary action */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] tracking-tight font-semibold">Repositories</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {repos.length} connected · {needsAttention.length} need attention
          </p>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:brightness-95 transition"
        >
          <Plus className="w-3.5 h-3.5" /> Connect repository
        </button>
      </header>

      {/* Level 2 — what needs me now */}
      {needsAttention.length > 0 && (
        <section className="rounded-xl border border-warning/25 bg-warning/[0.06] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">
                {needsAttention.length} repositor{needsAttention.length === 1 ? "y" : "ies"} need
                your attention
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {needsAttention.map((r) => (
                  <Link
                    key={r.id}
                    to="/repository/$id"
                    params={{ id: r.id }}
                    className="inline-flex items-center gap-2 h-8 px-2.5 rounded-md bg-surface-1 border border-border text-[12px] hover:border-foreground/25 transition"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${statusMeta[r.status].dot}`} />
                    {r.name}
                    <span className="text-muted-foreground">· {statusMeta[r.status].label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Level 3 — portfolio numbers */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Github} label="Connected" value={repos.length} />
        <Kpi icon={BookText} label="Documents" value={totalDocs} />
        <Kpi icon={GitPullRequest} label="Open doc PRs" value={openPRs} tone={openPRs > 0 ? "warning" : undefined} />
        <Kpi
          icon={Sparkles}
          label="Avg understanding"
          value={
            repos.length
              ? `${Math.round(repos.reduce((s, r) => s + r.understandingScore, 0) / repos.length)}%`
              : "—"
          }
        />
      </section>

      {/* Level 4 — the list */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search connected repositories…"
            className="w-full h-9 pl-8 pr-3 rounded-md bg-surface-1 border border-border text-[13px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="inline-flex p-0.5 rounded-md border border-border bg-surface-1">
          {(["all", "synced", "pending", "analyzing"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 h-7 text-[12px] rounded capitalize transition ${
                filter === f
                  ? "bg-surface-3 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
        <div className="hidden md:grid grid-cols-[minmax(0,1fr)_120px_90px_90px_120px_36px] gap-4 px-5 h-9 items-center text-[10.5px] uppercase tracking-wider text-muted-foreground border-b border-border">
          <span>Repository</span>
          <span>Status</span>
          <span className="text-right">Docs</span>
          <span className="text-right">PRs</span>
          <span className="text-right">Understanding</span>
          <span />
        </div>

        <div className="divide-y divide-border">
          {filtered.length === 0 ? (
            <EmptyState connected={repos.length} onAdd={openAdd} />
          ) : (
            filtered.map((r) => (
              <div
                key={r.id}
                className="group relative grid md:grid-cols-[minmax(0,1fr)_120px_90px_90px_120px_36px] gap-2 md:gap-4 px-5 py-3 items-center hover:bg-surface-2/40 transition"
              >
                <Link
                  to="/repository/$id"
                  params={{ id: r.id }}
                  className="flex items-center gap-3 min-w-0"
                >
                  <div className="w-8 h-8 rounded-md bg-surface-2 border border-border flex items-center justify-center shrink-0">
                    <TechIcon name={r.language} className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[13px] truncate">
                        <span className="text-muted-foreground">{r.org}/</span>
                        <span className="font-medium text-foreground">{r.name}</span>
                      </span>
                      {r.private ? (
                        <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
                      ) : (
                        <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                      <span className="inline-flex items-center gap-1">
                        <GitBranch className="w-3 h-3" /> {r.branch}
                      </span>
                      <span className="mx-1.5">·</span>
                      {r.lastActivity}
                    </div>
                  </div>
                </Link>

                <span className={`inline-flex items-center gap-1.5 text-[12px] ${getStatusMeta(r.status).text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${getStatusMeta(r.status).dot}`} />
                  {getStatusMeta(r.status).label}
                </span>

                <span className="hidden md:inline-flex items-center justify-end gap-1.5 text-[12px] text-muted-foreground">
                  <FileText className="w-3 h-3" /> {r.docsCount}
                </span>
                <span
                  className={`hidden md:inline-flex items-center justify-end gap-1.5 text-[12px] ${
                    r.openPRs > 0 ? "text-warning" : "text-muted-foreground"
                  }`}
                >
                  <GitPullRequest className="w-3 h-3" /> {r.openPRs}
                </span>

                <div className="hidden md:flex items-center justify-end gap-2">
                  <div className="w-14 h-1 rounded-full bg-surface-3 overflow-hidden">
                    <div
                      className="h-full bg-foreground/70"
                      style={{ width: `${r.understandingScore}%` }}
                    />
                  </div>
                  <span className="text-[12px] tabular-nums w-8 text-right">
                    {r.understandingScore}%
                  </span>
                </div>

                <div className="absolute right-3 top-3 md:static md:justify-self-end">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuFor((m) => (m === r.id ? null : r.id));
                    }}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-3 transition"
                    aria-label={`Actions for ${r.name}`}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {menuFor === r.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-9 z-20 w-52 rounded-lg border border-border bg-popover shadow-xl p-1 animate-fade-in"
                    >
                      <Link
                        to="/repository/$id"
                        params={{ id: r.id }}
                        className="flex items-center gap-2 px-2.5 h-8 rounded-md text-[12.5px] hover:bg-surface-2"
                      >
                        <BookText className="w-3.5 h-3.5 text-muted-foreground" /> Open repository
                      </Link>
                      <button
                        onClick={() => {
                          setMenuFor(null);
                          reanalyzeMutation.mutate(r.id);
                        }}
                        disabled={reanalyzeMutation.isPending || r.status === "analyzing"}
                        className="w-full flex items-center gap-2 px-2.5 h-8 rounded-md text-[12.5px] hover:bg-surface-2 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${reanalyzeMutation.isPending && reanalyzeMutation.variables === r.id ? "animate-spin" : ""}`} /> Re-analyze now
                      </button>
                      <div className="my-1 h-px bg-border" />
                      <button
                        onClick={() => {
                          setMenuFor(null);
                          setConfirmDisconnect(r.id);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 h-8 rounded-md text-[12.5px] text-destructive hover:bg-destructive/10"
                      >
                        <Unplug className="w-3.5 h-3.5" /> Disconnect
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showAdd && <ConnectDialog onClose={closeAdd} />}

      {confirmDisconnect && (
        <ConfirmDialog
          name={confirmDisconnect}
          onCancel={() => setConfirmDisconnect(null)}
          onConfirm={() => {
            disconnect(confirmDisconnect);
            setConfirmDisconnect(null);
          }}
        />
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone?: "warning";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wider">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div
        className={`mt-1.5 text-[20px] font-medium tabular-nums ${
          tone === "warning" ? "text-warning" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyState({ connected, onAdd }: { connected: number; onAdd: () => void }) {
  return (
    <div className="p-12 text-center">
      <div className="w-10 h-10 mx-auto rounded-lg bg-surface-2 border border-border flex items-center justify-center">
        <Github className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="mt-3 text-[14px] font-medium">
        {connected === 0 ? "No repositories connected yet" : "No repositories match this filter"}
      </div>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        {connected === 0
          ? "Connect a GitHub repository and AutoScribe starts documenting it immediately."
          : "Try a different status filter or search term."}
      </p>
      {connected === 0 && (
        <button
          onClick={onAdd}
          className="mt-4 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:brightness-95"
        >
          <Plus className="w-3.5 h-3.5" /> Connect repository
        </button>
      )}
    </div>
  );
}

function ConnectDialog({ onClose }: { onClose: () => void }) {
  const { repos, isConnected, connect, disconnect, connecting, availableRepos, githubHandle } = useRepos();
  const [query, setQuery] = useState("");
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleConnect = async (repo: GithubRepo) => {
    setConnectError(null);
    try {
      await connect(repo);
    } catch (err: any) {
      setConnectError(err?.message || "Failed to connect repository. Please try again.");
    }
  };

  const list = availableRepos.filter((r) =>
    `${r.org}/${r.name}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-start justify-center p-4 sm:p-10 animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl border border-border bg-surface-1 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4">
          <div>
            <div className="text-[15px] font-semibold">Connect a repository</div>
            <div className="mt-0.5 text-[12px] text-muted-foreground inline-flex items-center gap-1.5">
              <Check className="w-3 h-3 text-success" /> GitHub connected as{" "}
              <span className="text-foreground">@{githubHandle ?? "…"}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-2"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {connectError && (
          <div className="mx-5 mt-4 p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-[12px] text-destructive flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{connectError}</span>
          </div>
        )}

        <div className="px-5 py-3 border-b border-border">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your GitHub repositories…"
              className="w-full h-9 pl-8 pr-3 rounded-md bg-surface-2 border border-border text-[13px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <div className="overflow-y-auto divide-y divide-border">
          {list.length === 0 && (
            <div className="p-8 text-center text-[13px] text-muted-foreground">
              No repositories match “{query}”.
            </div>
          )}
          {list.map((r) => {
            const on = isConnected(r.id);
            const busy = connecting === r.id;
            return (
              <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-8 h-8 rounded-md bg-surface-2 border border-border flex items-center justify-center shrink-0">
                  <TechIcon name={r.language} className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[13px] min-w-0">
                    <span className="text-muted-foreground">{r.org}/</span>
                    <span className="font-medium truncate">{r.name}</span>
                    {r.private ? (
                      <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
                    ) : (
                      <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                    )}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-muted-foreground truncate">
                    {r.description}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Star className="w-3 h-3" /> {r.stars}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <GitBranch className="w-3 h-3" /> {r.branch}
                    </span>
                    <span>Updated {r.updated}</span>
                  </div>
                </div>
                {on ? (
                  <button
                    onClick={() => {
                      const connected = repos.find((cr) => cr.githubRepoId === r.id);
                      if (connected) disconnect(connected.id);
                    }}
                    className="group shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-surface-2 text-[12px] text-success hover:text-destructive hover:border-destructive/40 transition w-[112px] justify-center"
                  >
                    <Check className="w-3.5 h-3.5 group-hover:hidden" />
                    <Unplug className="w-3.5 h-3.5 hidden group-hover:block" />
                    <span className="group-hover:hidden">Connected</span>
                    <span className="hidden group-hover:inline">Disconnect</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(r)}
                    disabled={busy}
                    className="shrink-0 inline-flex items-center justify-center gap-1.5 h-8 px-3 w-[112px] rounded-md bg-primary text-primary-foreground text-[12px] font-medium hover:brightness-95 disabled:opacity-60"
                  >
                    {busy ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" /> Connect
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <span className="text-[11.5px] text-muted-foreground">
            Analysis starts automatically and takes about 30 seconds.
          </span>
          <button
            onClick={onClose}
            className="h-8 px-3 rounded-md border border-border bg-surface-2 text-[12.5px] hover:bg-surface-3"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({
  name,
  onCancel,
  onConfirm,
}: {
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-border bg-surface-1 p-5 shadow-2xl"
      >
        <div className="text-[15px] font-semibold">Disconnect {name}?</div>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          AutoScribe stops analysing this repository. You can reconnect it any time.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="h-9 px-3.5 rounded-md border border-border bg-surface-2 text-[13px] hover:bg-surface-3"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="h-9 px-3.5 rounded-md bg-destructive text-destructive-foreground text-[13px] font-medium hover:brightness-95"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
