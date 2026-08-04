import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { repositories as seedRepositories, type Repo } from "@/lib/mock-data";

/**
 * Client-side store for connected repositories.
 * Also tracks per-repo settings (auto-update) and a versioned
 * documentation-history log surfaced in the Documentation view.
 */

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

/** Repos available on the (mock) GitHub account, i.e. what you could connect. */
export const githubAccount = {
  handle: "johndoe",
  org: "acme",
};

export const availableGithubRepos: GithubRepo[] = [
  { id: "ecommerce-platform", name: "ecommerce-platform", org: "acme", private: true, language: "TypeScript", branch: "main", updated: "2 days ago", stars: 214, description: "Storefront, checkout and post-purchase experience." },
  { id: "payment-service", name: "payment-service", org: "acme", private: true, language: "Python", branch: "main", updated: "5 days ago", stars: 98, description: "Payments, refunds and invoicing." },
  { id: "analytics-dashboard", name: "analytics-dashboard", org: "acme", private: false, language: "TypeScript", branch: "develop", updated: "1 day ago", stars: 512, description: "Realtime product analytics dashboards." },
  { id: "inventory-service", name: "inventory-service", org: "acme", private: true, language: "Go", branch: "main", updated: "3 days ago", stars: 63, description: "Stock tracking and warehouse sync." },
  { id: "user-service", name: "user-service", org: "acme", private: true, language: "Python", branch: "main", updated: "1 day ago", stars: 41, description: "Identity, profiles and preferences." },
  { id: "notification-hub", name: "notification-hub", org: "acme", private: true, language: "TypeScript", branch: "main", updated: "6 hours ago", stars: 27, description: "Email, push and in-app messaging fan-out." },
  { id: "search-indexer", name: "search-indexer", org: "acme", private: false, language: "Rust", branch: "main", updated: "4 days ago", stars: 331, description: "Incremental search indexing pipeline." },
  { id: "design-system", name: "design-system", org: "acme", private: false, language: "TypeScript", branch: "main", updated: "9 days ago", stars: 1204, description: "Shared React component library and tokens." },
  { id: "infra-terraform", name: "infra-terraform", org: "acme", private: true, language: "Go", branch: "main", updated: "12 days ago", stars: 12, description: "Cloud infrastructure as code." },
];

const STORAGE_KEY = "autoscribe.connected-repos.v1";
const SETTINGS_KEY = "autoscribe.repo-settings.v1";

/** Where auto-generated documentation updates should land on GitHub. */
export type UpdateTarget = "main" | "branch" | "pr";

export type RepoSettings = {
  autoUpdate: boolean;
  updateTarget: UpdateTarget;
  /** Optional branch name when updateTarget is "branch". */
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

/** Seed history so the docs surface has content out of the box. */
const seedHistory: DocHistoryEntry[] = [
  { id: "h1", repoId: "ecommerce-platform", doc: "README.md",         version: "v14", kind: "updated", summary: "Rewrote Quick Start after Postgres 16 upgrade",   commit: "a1b2c3d", author: "AutoScribe", time: "2 min ago" },
  { id: "h2", repoId: "ecommerce-platform", doc: "docs/architecture.md", version: "v9",  kind: "updated", summary: "Added checkout → payment async edge",           commit: "9f2ee11", author: "AutoScribe", time: "1 hr ago" },
  { id: "h3", repoId: "payment-service",    doc: "docs/refunds.md",   version: "v1",  kind: "created", summary: "New page: refund pipeline and ledger writes",   commit: "77aa41c", author: "AutoScribe", time: "3 hr ago" },
  { id: "h4", repoId: "analytics-dashboard",doc: "docs/warehouse.md", version: "v3",  kind: "updated", summary: "Documented materialized view invalidations",    commit: "b30c9a2", author: "AutoScribe", time: "yesterday" },
  { id: "h5", repoId: "user-service",       doc: "docs/auth.md",      version: "v6",  kind: "updated", summary: "Session store moved from cache-first to WAL",   commit: "d81ff02", author: "AutoScribe", time: "yesterday" },
  { id: "h6", repoId: "ecommerce-platform", doc: "docs/env-vars.md",  version: "v2",  kind: "updated", summary: "Added STRIPE_WEBHOOK_SECRET and ANALYTICS_DSN", commit: "5541c8e", author: "AutoScribe", time: "2 days ago" },
];

type RepoStore = {
  repos: Repo[];
  connectedIds: string[];
  isConnected: (id: string) => boolean;
  connect: (id: string) => void;
  disconnect: (id: string) => void;
  connecting: string | null;
  getSettings: (id: string) => RepoSettings;
  updateSettings: (id: string, patch: Partial<RepoSettings>) => void;
  docHistory: DocHistoryEntry[];
  docHistoryFor: (repoId: string) => DocHistoryEntry[];
};

const RepoContext = createContext<RepoStore | null>(null);

function toRepo(g: GithubRepo): Repo {
  const seeded = seedRepositories.find((r) => r.id === g.id);
  if (seeded) return seeded;
  return {
    id: g.id,
    name: g.name,
    org: g.org,
    private: g.private,
    updated: g.updated,
    language: g.language,
    branch: g.branch,
    understandingScore: 0,
    docsCount: 0,
    openPRs: 0,
    status: "analyzing",
    lastActivity: "Queued for first analysis · now",
  };
}

export function RepoProvider({ children }: { children: ReactNode }) {
  const [connectedIds, setConnectedIds] = useState<string[]>(() =>
    seedRepositories.map((r) => r.id),
  );
  const [connecting, setConnecting] = useState<string | null>(null);
  const [settingsById, setSettingsById] = useState<Record<string, RepoSettings>>({});
  const [docHistory] = useState<DocHistoryEntry[]>(seedHistory);

  // Read persisted state after hydration to avoid SSR mismatches.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setConnectedIds(JSON.parse(raw) as string[]);
      const rawS = window.localStorage.getItem(SETTINGS_KEY);
      if (rawS) setSettingsById(JSON.parse(rawS) as Record<string, RepoSettings>);
    } catch {
      /* ignore */
    }
  }, []);

  const persist = useCallback((ids: string[]) => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch {}
  }, []);
  const persistSettings = useCallback((s: Record<string, RepoSettings>) => {
    try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
  }, []);

  const connect = useCallback(
    (id: string) => {
      setConnecting(id);
      window.setTimeout(() => {
        setConnectedIds((prev) => {
          if (prev.includes(id)) return prev;
          const next = [...prev, id];
          persist(next);
          return next;
        });
        setConnecting(null);
      }, 650);
    },
    [persist],
  );

  const disconnect = useCallback(
    (id: string) => {
      setConnectedIds((prev) => {
        const next = prev.filter((x) => x !== id);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const getSettings = useCallback(
    (id: string) => settingsById[id] ?? defaultSettings,
    [settingsById],
  );

  const updateSettings = useCallback(
    (id: string, patch: Partial<RepoSettings>) => {
      setSettingsById((prev) => {
        const next = { ...prev, [id]: { ...(prev[id] ?? defaultSettings), ...patch } };
        persistSettings(next);
        return next;
      });
    },
    [persistSettings],
  );

  const docHistoryFor = useCallback(
    (repoId: string) => docHistory.filter((h) => h.repoId === repoId),
    [docHistory],
  );

  const value = useMemo<RepoStore>(() => {
    const repos = connectedIds
      .map((id) => availableGithubRepos.find((g) => g.id === id))
      .filter((g): g is GithubRepo => Boolean(g))
      .map(toRepo);

    return {
      repos,
      connectedIds,
      isConnected: (id: string) => connectedIds.includes(id),
      connect,
      disconnect,
      connecting,
      getSettings,
      updateSettings,
      docHistory,
      docHistoryFor,
    };
  }, [connectedIds, connect, disconnect, connecting, getSettings, updateSettings, docHistory, docHistoryFor]);

  return <RepoContext.Provider value={value}>{children}</RepoContext.Provider>;
}

export function useRepos() {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error("useRepos must be used inside <RepoProvider>");
  return ctx;
}
