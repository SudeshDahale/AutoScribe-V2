import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export const CATEGORIES = [
  "code",
  "api",
  "architecture",
  "dependency",
  "documentation",
  "workflow",
  "agent",
] as const;

export type SignalCategory = (typeof CATEGORIES)[number];

export type Signal = {
  id: number;
  repositoryId: number;
  repoName: string | null;
  category: SignalCategory;
  subtype: string;
  title: string;
  detail: string | null;
  payload: Record<string, unknown> | null;
  severity: "info" | "notable" | "high";
  docImpact: string[] | null;
  sourceCommitSha: string | null;
  relevant: boolean;
  createdAt: string;
};

export type CategorySummary = {
  category: SignalCategory;
  count1h: number;
  count24h: number;
  latest: Signal | null;
};

export type SignalsSummary = {
  categories: CategorySummary[];
  generatedAt: string;
};

const EMPTY_SUMMARY: SignalsSummary = {
  categories: CATEGORIES.map((category) => ({
    category: category as SignalCategory,
    count1h: 0,
    count24h: 0,
    latest: null,
  })),
  generatedAt: new Date().toISOString(),
};

export function useSignalsSummary() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["signals-summary"],
    queryFn: async (): Promise<SignalsSummary> => {
      const res = await fetch("/api/signals/summary");
      if (!res.ok) return EMPTY_SUMMARY;
      return res.json();
    },
    refetchInterval: 8000,
    placeholderData: EMPTY_SUMMARY,
  });

  // Live updates via SSE — bumps the relevant category's counters immediately
  // instead of waiting up to 8s for the next poll.
  useEffect(() => {
    const source = new EventSource("/api/signals/stream", { withCredentials: true });
    source.onmessage = (event) => {
      if (!event.data) return;
      const signal = JSON.parse(event.data) as Signal;
      queryClient.setQueryData<SignalsSummary | undefined>(["signals-summary"], (old) => {
        if (!old) return old;
        return {
          ...old,
          categories: old.categories.map((c) =>
            c.category === signal.category
              ? { ...c, count1h: c.count1h + 1, count24h: c.count24h + 1, latest: signal }
              : c
          ),
        };
      });
      queryClient.setQueryData<Signal[] | undefined>(["signals-feed", null], (old) =>
        old ? [signal, ...old].slice(0, 100) : old
      );
    };
    return () => source.close();
  }, [queryClient]);

  return query;
}

export function useSignalsFeed(category: SignalCategory | null) {
  return useQuery({
    queryKey: ["signals-feed", category],
    queryFn: async (): Promise<Signal[]> => {
      const params = new URLSearchParams({ limit: "50" });
      if (category) params.set("category", category);
      const res = await fetch(`/api/signals?${params.toString()}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.signals ?? [];
    },
    refetchInterval: 10000,
  });
}
