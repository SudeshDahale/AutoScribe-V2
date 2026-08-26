import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Loader2 } from "lucide-react";

export const Route = createFileRoute("/complete")({
  validateSearch: (search: Record<string, unknown>) => ({
    repo: typeof search.repo === "string" ? search.repo : "",
  }),
  head: () => ({
    meta: [
      { title: "Analysis Complete · AutoScribe" },
      { name: "description", content: "AutoScribe has built comprehensive intelligence about your codebase and generated your documentation." },
      { property: "og:title", content: "Analysis Complete · AutoScribe" },
      { property: "og:description", content: "Your codebase intelligence and documentation are ready." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Complete,
});

function Complete() {
  const { repo: repoId } = Route.useSearch();

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("autoscribe.hasConnected", "1");
    }
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["analysis", repoId],
    queryFn: async () => {
      const res = await fetch(`/api/repos/${repoId}/analysis`);
      if (!res.ok) return null;
      return res.json() as Promise<{
        filesAnalyzed: number;
        modulesDetected: number;
        externalServices: number;
        understandingScore: number;
        techStack: string[];
      }>;
    },
    enabled: !!repoId,
  });

  const score = data?.understandingScore ?? 0;
  const stats = [
    { value: isLoading ? "…" : (data?.filesAnalyzed?.toLocaleString() ?? "—"), label: "Files Analyzed" },
    { value: isLoading ? "…" : (data?.modulesDetected?.toLocaleString() ?? "—"), label: "Modules Detected" },
    { value: isLoading ? "…" : (data?.externalServices?.toLocaleString() ?? "—"), label: "External Services" },
    { value: isLoading ? "…" : (data ? `${score}%` : "—"), label: "Understanding Score" },
  ];

  const r = 76;
  const c = Math.PI * r;
  const filled = isLoading ? 0 : (score / 100) * c;

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-[560px] text-center">
        <div className="mx-auto w-10 h-10 rounded-full bg-success/15 border border-success/30 flex items-center justify-center">
          <Check className="w-5 h-5 text-success" />
        </div>
        <h1 className="mt-5 text-[26px] tracking-tight font-semibold">
          Analysis complete
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your repository is fully indexed. Documentation and architecture are ready.
        </p>

        <div className="mt-8 relative w-[220px] h-[130px] mx-auto">
          <svg viewBox="0 0 200 110" className="w-full h-full">
            <path
              d={`M 24 100 A ${r} ${r} 0 0 1 176 100`}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="10"
              strokeLinecap="round"
            />
            <path
              d={`M 24 100 A ${r} ${r} 0 0 1 176 100`}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${filled} ${c}`}
              style={{ transition: "stroke-dasharray 1s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mb-1" />
            ) : (
              <div className="font-display text-4xl font-medium">{score}%</div>
            )}
            <div className="text-[11px] text-muted-foreground">AI Understanding Score</div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-surface-1 p-4">
              <div className="font-display text-xl">{s.value}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        <Link
          to="/dashboard"
          className="mt-8 inline-flex items-center justify-center gap-2 px-5 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:brightness-95 transition"
        >
          Go to Dashboard <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
