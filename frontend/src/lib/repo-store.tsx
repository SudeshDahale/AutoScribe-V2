import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Repo } from "@/lib/mock-data";

export type GithubRepo = {
  id: string;
  name: string;
  org: string;
  private: boolean;
  language: string;
  branch: string;
  updated: string;
  stars: number;
  description: string;
};

export type UpdateTarget = "main" | "branch" | "pr";

export type RepoSettings = {
  autoUpdate: boolean;
  updateTarget: UpdateTarget;
  branchName?: string;
};

export type DocHistoryEntry = {
  id: string;
  repoId: string;
  doc: string;
  version: string;
  kind: "created" | "updated";
  summary: string;
  commit?: string;
  author: string;
  time: string;
};

const defaultSettings: RepoSettings = {
  autoUpdate: false,
  updateTarget: "pr",
  branchName: "docs/autoscribe",
};

// Doc history is still mock data — wired to the real activity log in a later sprint.
const seedHistory: DocHistoryEntry[] = [
  { id: "h1", repoId: "ecommerce-platform", doc: "README.md", version: "v14", kind: "updated", summary: "Rewrote Quick Start after Postgres 16 upgrade", commit: "a1b2c3d", author: "AutoScribe", time: "2 min ago" },
  { id: "h2", repoId: "ecommerce-platform", doc: "docs/architecture.md", version: "v9", kind: "updated", summary: "Added checkout → payment async edge", commit: "9f2ee11", author: "AutoScribe", time: "1 hr ago" },
  { id: "h3", repoId: "payment-service", doc: "docs/refunds.md", version: "v1", kind: "created", summary: "New page: refund pipeline and ledger writes", commit: "77aa41c", author: "AutoScribe", time: "3 hr ago" },
  { id: "h4", repoId: "analytics-dashboard", doc: "docs/warehouse.md", version: "v3", kind: "updated", summary: "Documented materialized view invalidations", commit: "b30c9a2", author: "AutoScribe", time: "yesterday" },
  { id: "h5", repoId: "user-service", doc: "docs/auth.md", version: "v6", kind: "updated", summary: "Session store moved from cache-first to WAL", commit: "d81ff02", author: "AutoScribe", time: "yesterday" },
  { id: "h6", repoId: "ecommerce-platform", doc: "docs/env-vars.md", version: "v2", kind: "updated", summary: "Added STRIPE_WEBHOOK_SECRET and ANALYTICS_DSN", commit: "5541c8e", author: "AutoScribe", time: "2 days ago" },
];

type RepoStore = {
  repos: Repo[];
  connectedIds: string[];
  isConnected: (githubRepoId: string) => boolean;
  connect: (repo: GithubRepo) => void;
  disconnect: (id: string) => void;
  connecting: string | null;
  availableRepos: GithubRepo[];
  loadingAvailable: boolean;
  githubHandle: string | null;
  getSettings: (id: string) => RepoSettings;
  updateSettings: (id: string, patch: Partial<RepoSettings>) => void;
  docHistory: DocHistoryEntry[];
  docHistoryFor: (repoId: string) => DocHistoryEntry[];
};

const RepoContext = createContext<RepoStore | null>(null);

export function RepoProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [settingsById, setSettingsById] = useState<Record<string, RepoSettings>>({});
  const [docHistory] = useState<DocHistoryEntry[]>(seedHistory);

  const meQuery = useQuery({
    queryKey: ["auth-me"],
    enabled: typeof window !== "undefined",
    queryFn: async () => {
      const res = await fetch("/api/auth/me");
      if (!res.ok) return null;
      return res.json() as Promise<{ github_login: string }>;
    },
  });

  const reposQuery = useQuery({
    queryKey: ["repos"],
    enabled: typeof window !== "undefined",
    queryFn: async () => {
      const res = await fetch("/api/repos");
      if (!res.ok) return [];
      return res.json() as Promise<Repo[]>;
    },
  });

  const availableQuery = useQuery({
    queryKey: ["github-repos"],
    enabled: typeof window !== "undefined",
    queryFn: async () => {
      const res = await fetch("/api/github/repos");
      if (!res.ok) return [];
      return res.json() as Promise<GithubRepo[]>;
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (repo: GithubRepo) => {
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          github_repo_id: repo.id,
          name: repo.name,
          org: repo.org,
          private: repo.private,
          language: repo.language,
          branch: repo.branch,
        }),
      });
      if (!res.ok) throw new Error("Failed to connect repository");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["repos"] }),
  });

  const disconnectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/repos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disconnect repository");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["repos"] }),
  });

  const repos = reposQuery.data ?? [];
  const connectedIds = repos.map((r) => r.id);

  const connect = useCallback(
    (repo: GithubRepo) => {
      setConnecting(repo.id);
      connectMutation.mutate(repo, { onSettled: () => setConnecting(null) });
    },
    [connectMutation],
  );

  const disconnect = useCallback((id: string) => disconnectMutation.mutate(id), [disconnectMutation]);

  const isConnected = useCallback(
    (githubRepoId: string) => repos.some((r) => r.githubRepoId === githubRepoId),
    [repos],
  );

  const getSettings = useCallback((id: string) => settingsById[id] ?? defaultSettings, [settingsById]);

  const updateSettings = useCallback((id: string, patch: Partial<RepoSettings>) => {
    setSettingsById((prev) => ({ ...prev, [id]: { ...(prev[id] ?? defaultSettings), ...patch } }));
  }, []);

  const docHistoryFor = useCallback(
    (repoId: string) => docHistory.filter((h) => h.repoId === repoId),
    [docHistory],
  );

  const value: RepoStore = {
    repos,
    connectedIds,
    isConnected,
    connect,
    disconnect,
    connecting,
    availableRepos: availableQuery.data ?? [],
    loadingAvailable: availableQuery.isLoading,
    githubHandle: meQuery.data?.github_login ?? null,
    getSettings,
    updateSettings,
    docHistory,
    docHistoryFor,
  };

  return <RepoContext.Provider value={value}>{children}</RepoContext.Provider>;
}

export function useRepos() {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error("useRepos must be used inside <RepoProvider>");
  return ctx;
}