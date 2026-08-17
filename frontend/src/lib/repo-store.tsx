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
  connect: (repo: GithubRepo) => Promise<Repo>;
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
  const [docHistory] = useState<DocHistoryEntry[]>(seedHistory);

  // Optimistic local settings cache — pre-populated from server via useQuery
  const [settingsOverride, setSettingsOverride] = useState<Record<string, Partial<RepoSettings>>>({});

  const meQuery = useQuery({
    queryKey: ["auth-me"],
    enabled: typeof window !== "undefined",
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch("/api/auth/me");
      if (!res.ok) return null;
      return res.json() as Promise<{ github_login: string }>;
    },
  });

  const reposQuery = useQuery({
    queryKey: ["repos"],
    enabled: typeof window !== "undefined",
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await fetch("/api/repos");
      if (!res.ok) return [];
      return res.json() as Promise<Repo[]>;
    },
  });

  const availableQuery = useQuery({
    queryKey: ["github-repos"],
    enabled: typeof window !== "undefined",
    staleTime: 5 * 60 * 1000,
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
      const created: Repo = await res.json();
      await fetch(`/api/repos/${created.id}/analyze`, { method: "POST" });
      return created;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["repos"] }),
  });

  const disconnectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/repos/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail ?? "Failed to disconnect repository");
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["repos"] }),
    // Error is surfaced by the caller (repository detail page) so we don't
    // show a duplicate notification here — just invalidate so the list stays fresh.
    onError: () => queryClient.invalidateQueries({ queryKey: ["repos"] }),
  });

  // Settings persistence — PATCH to the API, with optimistic local override
  const settingsMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<RepoSettings> }) => {
      const body: Record<string, unknown> = {};
      if (patch.autoUpdate !== undefined) body.auto_update = patch.autoUpdate;
      if (patch.updateTarget !== undefined) body.update_target = patch.updateTarget;
      if (patch.branchName !== undefined) body.branch_name = patch.branchName;
      const res = await fetch(`/api/repos/${id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      return res.json() as Promise<{ autoUpdate: boolean; updateTarget: UpdateTarget; branchName?: string }>;
    },
    onSuccess: (data, { id }) => {
      // Reflect the server's canonical values back into the override map
      setSettingsOverride((prev) => ({
        ...prev,
        [id]: {
          autoUpdate: data.autoUpdate,
          updateTarget: data.updateTarget as UpdateTarget,
          branchName: data.branchName,
        },
      }));
      // Invalidate the dedicated settings query if one exists
      queryClient.invalidateQueries({ queryKey: ["repo-settings", id] });
    },
  });

  const repos = reposQuery.data ?? [];
  const connectedIds = repos.map((r) => r.id);

  const connect = useCallback(
    async (repo: GithubRepo) => {
      setConnecting(repo.id);
      try {
        return await connectMutation.mutateAsync(repo);
      } finally {
        setConnecting(null);
      }
    },
    [connectMutation],
  );

  const disconnect = useCallback((id: string) => disconnectMutation.mutate(id), [disconnectMutation]);

  const isConnected = useCallback(
    (githubRepoId: string) => repos.some((r) => r.githubRepoId === githubRepoId),
    [repos],
  );

  const getSettings = useCallback(
    (id: string): RepoSettings => ({
      ...defaultSettings,
      ...settingsOverride[id],
    }),
    [settingsOverride],
  );

  const updateSettings = useCallback(
    (id: string, patch: Partial<RepoSettings>) => {
      // Optimistic update: apply immediately so the UI responds instantly
      setSettingsOverride((prev) => ({
        ...prev,
        [id]: { ...(prev[id] ?? defaultSettings), ...patch },
      }));
      // Persist to server (errors are silent — the optimistic state stays)
      settingsMutation.mutate({ id, patch });
    },
    [settingsMutation],
  );

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