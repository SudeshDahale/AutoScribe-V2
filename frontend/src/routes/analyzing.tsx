import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Loader2, ArrowRight, FileText, FileCode2 } from "lucide-react";

export const Route = createFileRoute("/analyzing")({
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

const steps = [
  { label: "Repository connected", detail: "Cloned in 1.2s" },
  { label: "Files discovered", detail: "2,487 files across 42 folders" },
  { label: "Language detection", detail: "TypeScript · Python · Go" },
  { label: "Parsing syntax trees", detail: "Building AST for 2,487 files" },
  { label: "Detecting architecture", detail: "6 services · 2 data stores" },
  { label: "Mapping dependencies", detail: "Cross-service graph resolved" },
  { label: "Building code intelligence", detail: "Semantic index ready" },
];

const fileTypes = ["*.tsx", "*.py", "*.go", "*.sql", "*.yml", "*.md"];

const docChoices = [
  { id: "readme", name: "README", desc: "Project overview, features and quick start" },
  { id: "api", name: "API Reference", desc: "Endpoints, payloads and auth requirements" },
  { id: "arch", name: "Architecture Guide", desc: "Services, data stores and request flows" },
  { id: "modules", name: "Module Docs", desc: "Per-module responsibilities and key files" },
  { id: "onboarding", name: "Developer Onboarding", desc: "Local setup, conventions and workflows" },
  { id: "env", name: "Environment Variables", desc: "Required configuration and secrets" },
];

function Analyzing() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"analyze" | "choose" | "generate">("analyze");
  const [done, setDone] = useState(0);
  const [picked, setPicked] = useState<string[]>(["readme", "api", "arch"]);
  const [genIndex, setGenIndex] = useState(0);

  useEffect(() => {
    if (phase !== "analyze") return;
    if (done >= steps.length) {
      const t = setTimeout(() => setPhase("choose"), 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setDone((d) => d + 1), 900);
    return () => clearTimeout(t);
  }, [phase, done]);

  useEffect(() => {
    if (phase !== "generate") return;
    if (genIndex >= picked.length) {
      const t = setTimeout(() => navigate({ to: "/complete" }), 800);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setGenIndex((g) => g + 1), 1000);
    return () => clearTimeout(t);
  }, [phase, genIndex, picked.length, navigate]);

  const pct = Math.round((done / steps.length) * 100);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-[820px]">
        {phase === "analyze" && (
          <>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Step 1 of 3
            </div>
            <h1 className="mt-2 text-[28px] tracking-tight font-semibold">
              Analyzing <span className="text-muted-foreground">ecommerce-platform</span>
            </h1>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              This usually takes 20–40 seconds. You can navigate away — we'll notify you.
            </p>

            {/* Progress bar */}
            <div className="mt-8 flex items-center gap-4">
              <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-[13px] tabular-nums font-medium w-10 text-right">{pct}%</div>
            </div>

            <div className="mt-8 grid md:grid-cols-2 gap-6">
              {/* Step list */}
              <ol className="space-y-2.5">
                {steps.map((s, i) => {
                  const complete = i < done;
                  const current = i === done;
                  return (
                    <li
                      key={s.label}
                      className={`flex items-start gap-3 rounded-md px-3 py-2 border transition ${
                        current
                          ? "border-border bg-surface-1"
                          : "border-transparent"
                      } ${complete || current ? "opacity-100" : "opacity-40"}`}
                    >
                      <span className="mt-0.5 shrink-0">
                        {complete ? (
                          <span className="w-4 h-4 rounded-full bg-success/15 border border-success/40 flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-success" />
                          </span>
                        ) : current ? (
                          <Loader2 className="w-4 h-4 text-foreground animate-spin" />
                        ) : (
                          <span className="w-4 h-4 rounded-full border border-border" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] text-foreground">{s.label}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {s.detail}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {/* Scanner visualization */}
              <div className="rounded-lg border border-border bg-surface-1 overflow-hidden">
                <div className="px-3 py-2 border-b border-border flex items-center gap-2 text-[11px] text-muted-foreground">
                  <FileCode2 className="w-3 h-3" />
                  <span>Scanner</span>
                  <span className="ml-auto tabular-nums">
                    {Math.min(done * 400 + 120, 2487)} / 2,487 files
                  </span>
                </div>
                <div className="relative h-[240px] p-3 font-mono text-[11px] text-muted-foreground overflow-hidden">
                  {/* Scan line */}
                  <div className="absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-primary/10 to-transparent pointer-events-none scan-line" />
                  <div className="space-y-1">
                    {Array.from({ length: 14 }).map((_, i) => {
                      const active = i < Math.min(done * 2 + 4, 14);
                      const ft = fileTypes[i % fileTypes.length];
                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-2 transition-opacity ${active ? "opacity-100" : "opacity-25"}`}
                        >
                          <span className={`w-1 h-1 rounded-full ${active ? "bg-success" : "bg-muted-foreground/40"}`} />
                          <span className="text-foreground/85">src/</span>
                          <span className="text-muted-foreground">module-{(i + done * 3) % 42}</span>
                          <span className="text-muted-foreground">/</span>
                          <span className="text-foreground/70">{ft.replace("*", `file-${i}`)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {phase === "choose" && (
          <>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Step 2 of 3
            </div>
            <h1 className="mt-2 text-[28px] tracking-tight font-semibold">
              Choose documents to generate
            </h1>
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
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Step 3 of 3
            </div>
            <h1 className="mt-2 text-[28px] tracking-tight font-semibold">
              Writing documentation
            </h1>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Drafting each document from the code we just read.
            </p>
            <ol className="mt-6 space-y-2">
              {picked.map((id, i) => {
                const doc = docChoices.find((d) => d.id === id)!;
                const complete = i < genIndex;
                const current = i === genIndex;
                return (
                  <li key={id} className={`flex items-center gap-3 px-3.5 py-2.5 rounded-md border border-border bg-surface-1 text-[13px] ${complete || current ? "opacity-100" : "opacity-40"}`}>
                    {complete ? <Check className="w-4 h-4 text-success" /> : current ? <Loader2 className="w-4 h-4 animate-spin text-foreground" /> : <FileText className="w-4 h-4 text-muted-foreground" />}
                    <span>{doc.name}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {complete ? "Generated" : current ? "Writing…" : "Queued"}
                    </span>
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

