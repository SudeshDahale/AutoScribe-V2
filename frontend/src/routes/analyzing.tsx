import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, ArrowRight, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/analyzing")({
  validateSearch: (search: Record<string, unknown>) => ({
    repo: typeof search.repo === "string" ? search.repo : "",
  }),
  head: () => ({
    meta: [
      { title: "Analyzing Repository · AutoScribe" },
      { name: "description", content: "AutoScribe is reading your repository, mapping its architecture and preparing documentation." },
      { property: "og:title", content: "Analyzing Repository · AutoScribe" },
      { property: "og:description", content: "Watch AutoScribe understand your codebase in real time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Analyzing,
});

type AnalysisStatus = {
  status: "pending" | "analyzing" | "synced" | "failed";
  filesAnalyzed: number;
  modulesDetected: number;
  techStack: string[];
  sampleFiles: string[];
};

function Analyzing() {
  const navigate = useNavigate();
  const { repo: repoId } = Route.useSearch();
  const [stepIndex, setStepIndex] = useState(0);

  const steps = [
    "Reading repository file tree and directory layout...",
    "Detecting languages, frameworks, and dependencies...",
    "Parsing AST and building module dependency graph...",
    "Generating technical documentation and API reference...",
    "Building vector embeddings for AI Assistant chat...",
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setStepIndex((s) => (s + 1) % steps.length);
    }, 2800);
    return () => clearInterval(timer);
  }, [steps.length]);

  const { data } = useQuery({
    queryKey: ["analysis", repoId],
    queryFn: async () => {
      const res = await fetch(`/api/repos/${repoId}/analysis`);
      if (!res.ok) throw new Error("Failed to fetch analysis status");
      return res.json() as Promise<AnalysisStatus>;
    },
    enabled: !!repoId,
    refetchInterval: (query) => (query.state.data?.status === "synced" || query.state.data?.status === "failed" ? false : 1500),
  });

  const sampleFiles = data?.sampleFiles ?? [];
  const [revealCount, setRevealCount] = useState(0);

  useEffect(() => {
    if (data?.status !== "synced") {
      if (sampleFiles.length > 0 && revealCount < sampleFiles.length) {
        const t = setTimeout(() => setRevealCount((c) => c + 1), 120);
        return () => clearTimeout(t);
      }
      return;
    }

    if (sampleFiles.length === 0 || revealCount >= sampleFiles.length) {
      const t = setTimeout(() => {
        navigate({ to: "/complete", search: { repo: repoId } });
      }, 1200);
      return () => clearTimeout(t);
    }

    const t = setTimeout(() => setRevealCount((c) => c + 1), 70);
    return () => clearTimeout(t);
  }, [data?.status, sampleFiles.length, revealCount, navigate, repoId]);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-[820px]">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Automated Analysis</div>
          <button
            onClick={() => navigate({ to: "/dashboard" })}
            className="text-[12px] text-muted-foreground hover:text-foreground transition underline underline-offset-4"
          >
            Skip to Dashboard →
          </button>
        </div>
        <h1 className="mt-2 text-[28px] tracking-tight font-semibold">Analyzing your repository</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          AutoScribe is reading the codebase structure, discovering modules, and building semantic embeddings.
        </p>

        {data?.status === "failed" ? (
          <div className="mt-8 flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Analysis failed. Check the backend logs for details, then try connecting the repository again.
          </div>
        ) : (
          <>
            {/* Glowing animated scanner bar */}
            <div className="mt-6 w-full h-1.5 bg-surface-2 rounded-full overflow-hidden relative border border-border">
              <div
                className={`h-full bg-gradient-to-r from-primary via-emerald-400 to-primary transition-all duration-500 rounded-full ${
                  data?.status === "synced" ? "w-full" : "w-3/4 animate-pulse"
                }`}
              />
            </div>

            <div className="mt-4 flex items-center gap-3 text-[13px]">
              {data?.status === "synced" ? (
                <div className="flex items-center gap-2 text-success font-medium">
                  <Check className="w-4 h-4 text-success" /> Analysis finalized! Redirecting to summary…
                </div>
              ) : (
                <div className="flex items-center gap-2.5 text-foreground font-medium">
                  <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                  <span>{steps[stepIndex]}</span>
                </div>
              )}
            </div>

            <div className="mt-6 grid md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-border bg-surface-1 p-5 text-[13px] space-y-4 self-start">
                <div className="flex items-center justify-between font-medium">
                  <span className="text-muted-foreground text-xs">Scanner State</span>
                  {data?.status === "synced" ? (
                    <span className="text-success flex items-center gap-1.5 text-xs font-semibold"><Check className="w-3.5 h-3.5" /> Ready</span>
                  ) : (
                    <span className="text-primary flex items-center gap-1.5 text-xs font-semibold"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deep Scanning</span>
                  )}
                </div>

                {data?.status === "synced" ? (
                  <div className="text-muted-foreground">
                    Parsed <strong className="text-foreground font-semibold">{data.filesAnalyzed}</strong> files and mapped{" "}
                    <strong className="text-foreground font-semibold">{data.modulesDetected}</strong> modules.
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    AutoScribe AI models are synthesizing your repo's directory structure, routes, and data flows.
                  </div>
                )}

                {data?.techStack && data.techStack.length > 0 && (
                  <div className="pt-2 border-t border-border">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Detected Tech Stack</div>
                    <div className="flex flex-wrap gap-1.5">
                      {data.techStack.map((tech) => (
                        <span key={tech} className="text-xs px-2 py-0.5 rounded bg-surface-2 border border-border">
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="pt-3">
                  <button
                    onClick={() => navigate({ to: "/dashboard" })}
                    className="w-full inline-flex items-center justify-center gap-2 h-9 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border text-foreground text-xs font-medium transition"
                  >
                    Go to Dashboard <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {sampleFiles.length > 0 ? (
                <div className="rounded-xl border border-border bg-surface-1 overflow-hidden shadow-sm">
                  <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 text-[11px] text-muted-foreground bg-surface-2/50">
                    <span className="font-medium text-foreground">Live File Inspector</span>
                    <span className="ml-auto tabular-nums">
                      {Math.min(revealCount, sampleFiles.length)} / {sampleFiles.length} files scanned
                    </span>
                  </div>
                  <div className="relative h-[240px] p-3 font-mono text-[11px] text-muted-foreground overflow-hidden">
                    <div className="space-y-1.5">
                      {sampleFiles.slice(Math.max(0, revealCount - 12), revealCount).map((path) => (
                        <div key={path} className="flex items-center gap-2 truncate">
                          <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                          <span className="text-foreground/90 truncate">{path}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-surface-1/50 p-6 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                  <div className="text-xs text-muted-foreground max-w-xs">
                    Synthesizing code architecture graphs and vector search chunks...
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}