import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, ArrowRight, FileText, AlertTriangle } from "lucide-react";

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

const docChoices = [
  { id: "readme", name: "README", desc: "Project overview, features and quick start" },
  { id: "api", name: "API Reference", desc: "Endpoints, payloads and auth requirements" },
  { id: "arch", name: "Architecture Guide", desc: "Services, data stores and request flows" },
  { id: "modules", name: "Module Docs", desc: "Per-module responsibilities and key files" },
  { id: "onboarding", name: "Developer Onboarding", desc: "Local setup, conventions and workflows" },
  { id: "env", name: "Environment Variables", desc: "Required configuration and secrets" },
];

type AnalysisStatus = {
  status: "pending" | "analyzing" | "synced" | "failed";
  filesAnalyzed: number;
  modulesDetected: number;
  techStack: string[];
};

function Analyzing() {
  const navigate = useNavigate();
  const { repo: repoId } = Route.useSearch();
  const [phase, setPhase] = useState<"analyze" | "choose" | "generate">("analyze");
  const [picked, setPicked] = useState<string[]>(["readme", "api", "arch"]);
  const [genIndex, setGenIndex] = useState(0);

  const { data } = useQuery({
    queryKey: ["analysis", repoId],
    queryFn: async () => {
      const res = await fetch(`/api/repos/${repoId}/analysis`);
      if (!res.ok) throw new Error("Failed to fetch analysis status");
      return res.json() as Promise<AnalysisStatus>;
    },
    enabled: !!repoId && phase === "analyze",
    refetchInterval: (query) => (query.state.data?.status === "synced" || query.state.data?.status === "failed" ? false : 1500),
  });

  useEffect(() => {
    if (data?.status === "synced") {
      const t = setTimeout(() => setPhase("choose"), 600);
      return () => clearTimeout(t);
    }
  }, [data?.status]);

  useEffect(() => {
    if (phase !== "generate") return;
    if (genIndex >= picked.length) {
      const t = setTimeout(() => navigate({ to: "/complete" }), 800);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setGenIndex((g) => g + 1), 1000);
    return () => clearTimeout(t);
  }, [phase, genIndex, picked.length, navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-[820px]">
        {phase === "analyze" && (
          <>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Step 1 of 3</div>
            <h1 className="mt-2 text-[28px] tracking-tight font-semibold">Analyzing your repository</h1>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              This usually takes a few seconds. You can navigate away — we'll keep working in the background.
            </p>

            {data?.status === "failed" ? (
              <div className="mt-8 flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Analysis failed. Check the backend logs for details, then try connecting the repository again.
              </div>
            ) : (
              <>
                <div className="mt-8 flex items-center gap-3 text-[13px] text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin text-foreground" />
                  {data?.status === "analyzing" || data?.status === "pending"
                    ? "Reading repository tree, detecting languages and modules…"
                    : "Starting…"}
                </div>
                {data?.status === "synced" && (
                  <div className="mt-6 rounded-lg border border-border bg-surface-1 p-4 text-[13px] space-y-1">
                    <div className="flex items-center gap-2 text-success">
                      <Check className="w-4 h-4" /> Analysis complete
                    </div>
                    <div className="text-muted-foreground">{data.filesAnalyzed} files analyzed · {data.modulesDetected} modules detected</div>
                    {data.techStack.length > 0 && (
                      <div className="text-muted-foreground">Tech stack: {data.techStack.join(", ")}</div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {phase === "choose" && (
          <>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Step 2 of 3</div>
            <h1 className="mt-2 text-[28px] tracking-tight font-semibold">Choose documents to generate</h1>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Pick what AutoScribe should draft and keep in sync. You can add more later.
            </p>

            <div className="mt-6 grid sm:grid-cols-2 gap-2.5">
              {docChoices.map((d) => {
                const on = picked.includes(d.id);
                return (
                  <button
                    key={d.id}
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== d.id) : [...p, d.id]))}
                    className={`text-left p-3.5 rounded-md border transition ${
                      on ? "border-foreground/40 bg-surface-2" : "border-border bg-surface-1 hover:bg-surface-2"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-[13px] font-medium">{d.name}</div>
                      <span className={`w-4 h-4 rounded-[4px] border flex items-center justify-center ${on ? "bg-primary border-transparent" : "border-border"}`}>
                        {on && <Check className="w-3 h-3 text-primary-foreground" />}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{d.desc}</div>
                  </button>
                );
              })}
            </div>

            <button
              disabled={picked.length === 0}
              onClick={() => setPhase("generate")}
              className="mt-6 inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-primary text-primary-foreground text-[13px] font-medium disabled:opacity-40 hover:brightness-95"
            >
              Generate {picked.length} document{picked.length === 1 ? "" : "s"} <ArrowRight className="w-4 h-4" />
            </button>
          </>
        )}

        {phase === "generate" && (
          <>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Step 3 of 3</div>
            <h1 className="mt-2 text-[28px] tracking-tight font-semibold">Writing documentation</h1>
            <p className="mt-1.5 text-[13px] text-muted-foreground">Drafting each document from the code we just read.</p>
            <ol className="mt-6 space-y-2">
              {picked.map((id, i) => {
                const doc = docChoices.find((d) => d.id === id)!;
                const complete = i < genIndex;
                const current = i === genIndex;
                return (
                  <li key={id} className={`flex items-center gap-3 px-3.5 py-2.5 rounded-md border border-border bg-surface-1 text-[13px] ${complete || current ? "opacity-100" : "opacity-40"}`}>
                    {complete ? <Check className="w-4 h-4 text-success" /> : current ? <Loader2 className="w-4 h-4 animate-spin text-foreground" /> : <FileText className="w-4 h-4 text-muted-foreground" />}
                    <span>{doc.name}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">{complete ? "Generated" : current ? "Writing…" : "Queued"}</span>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}