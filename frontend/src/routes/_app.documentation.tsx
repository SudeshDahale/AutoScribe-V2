import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { docsNav, commitStream } from "@/lib/mock-data";
import { useRepos } from "@/lib/repo-store";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  GitPullRequest,
  Sparkles,
  Paperclip,
  Plus,
  LayoutTemplate,
  X,
  Link2,
  Settings2,
  Search,
  ChevronDown,
  ChevronRight,
  Type,
  ArrowLeft,
  ArrowRight,
  Maximize2,
  Minimize2,
  Eye,
  Pencil,
  FileCode,
  PanelLeft,
  History,
  GitCommit,
} from "lucide-react";

export const Route = createFileRoute("/_app/documentation")({
  head: () => ({
    meta: [
      { title: "Documentation · AutoScribe" },
      { name: "description", content: "Living documentation for your repository — templates, reference material and docs always in sync with the latest commit." },
      { property: "og:title", content: "Documentation · AutoScribe" },
      { property: "og:description", content: "Docs that stay in sync with your code." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Documentation,
});

type Template = {
  id: string;
  name: string;
  desc: string;
  sections: string[];
  refs: string[];
  custom?: boolean;
};

const defaultTemplates: Template[] = [
  {
    id: "readme",
    name: "README",
    desc: "Overview, features, quick start",
    sections: ["Overview", "Features", "Quick Start", "Architecture"],
    refs: ["docs/product-brief.pdf", "notion.so/brand-voice"],
  },
  {
    id: "api",
    name: "API Reference",
    desc: "Endpoints, payloads, auth",
    sections: ["Auth", "Endpoints", "Errors", "Examples"],
    refs: ["openapi.yaml"],
  },
  {
    id: "adr",
    name: "Decision Record",
    desc: "Context, decision, consequences",
    sections: ["Context", "Decision", "Alternatives", "Consequences"],
    refs: [],
  },
  {
    id: "runbook",
    name: "Runbook",
    desc: "Operational playbook for on-call",
    sections: ["Alerts", "Diagnostics", "Mitigations", "Escalation"],
    refs: ["confluence.io/on-call"],
  },
];

const docStyles = ["Technical, concise", "Friendly, detailed", "Reference-only"] as const;

// Shown before a repo has been analyzed yet, or if the fetch is still loading.
const fallbackReadme = {
  title: "E-Commerce Platform",
  tagline: "A modern e-commerce platform built with React, FastAPI, and PostgreSQL.",
  overview:
    "This service powers the storefront, checkout, and post-purchase experience. It is built for high-throughput traffic patterns and integrates payments, inventory, and analytics through a clean set of internal APIs.\n\nAutoScribe keeps this documentation in lockstep with the code. Every commit triggers an incremental analysis, and only the affected sections are rewritten so the rest of the document keeps its human-authored voice.",
  features: [
    "User authentication with OAuth2",
    "Product browsing and search",
    "Shopping cart and checkout",
    "Payment processing with refunds",
    "Order management and tracking",
    "Realtime inventory sync",
  ],
  quickStart: "git clone https://github.com/acme/ecommerce-platform\ncd ecommerce-platform\npnpm install\npnpm dev",
  architecture:
    "The application is split into a React front-end, a FastAPI gateway, and domain services that own their own PostgreSQL schema. Cross-cutting concerns such as authentication and rate limiting live at the gateway.",
  status: "Synced with code",
  updated: "2 minutes ago",
};

function docIdToSlug(id: string): string {
  const lower = id.toLowerCase();
  if (lower.includes("api")) return "api-reference";
  if (lower.includes("arch")) return "architecture-guide";
  if (lower.includes("runbook") || lower.includes("op")) return "developer-runbook";
  return "readme";
}

function Documentation() {
  const { repos, docHistory } = useRepos();
  const [repoId, setRepoId] = useState<string>(repos[0]?.id ?? "");
  const [activeDocId, setActiveDocId] = useState("README");
  const [isRegenerating, setIsRegenerating] = useState(false);

  const activeSlug = docIdToSlug(activeDocId);

  const { data: currentDoc, refetch: refetchDoc, isLoading: isDocLoading } = useQuery({
    queryKey: ["document", repoId, activeSlug],
    queryFn: async () => {
      const res = await fetch(`/api/repos/${repoId}/documents/by-slug/${activeSlug}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!repoId && !!activeSlug,
  });

  const handleRegenerate = async () => {
    if (!repoId || !activeSlug) return;
    setIsRegenerating(true);
    try {
      const res = await fetch(`/api/repos/${repoId}/documents/${activeSlug}/regenerate`, { method: "POST" });
      if (res.ok) {
        await refetchDoc();
      }
    } catch (e) {
      console.error("Regeneration failed", e);
    } finally {
      setIsRegenerating(false);
    }
  };

  const readme = currentDoc?.content && activeSlug === "readme" ? currentDoc.content : fallbackReadme;
  const docMarkdown = currentDoc?.markdown || "";
  const [templates, setTemplates] = useState<Template[]>(defaultTemplates);
  const [showTemplates, setShowTemplates] = useState(false);
  const [query, setQuery] = useState("");
  const [openSection, setOpenSection] = useState<string | null>("Getting Started");
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg">("md");
  const [docStyle, setDocStyle] = useState<(typeof docStyles)[number]>("Technical, concise");
  const [fullscreen, setFullscreen] = useState(false);
  const [mode, setMode] = useState<"read" | "source">("read");
  const [openTabs, setOpenTabs] = useState<string[]>(["README"]);
  const [showExplorer, setShowExplorer] = useState(true);

  // Esc exits full screen
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const filteredNav = useMemo(() => {
    if (!query) return docsNav;
    const q = query.toLowerCase();
    return docsNav
      .map((s) => ({ ...s, items: s.items.filter((i) => i.toLowerCase().includes(q)) }))
      .filter((s) => s.items.length > 0);
  }, [query]);

  const proseSize =
    fontSize === "sm"
      ? "text-[14px] leading-[1.7]"
      : fontSize === "lg"
        ? "text-[17px] leading-[1.85]"
        : "text-[15.5px] leading-[1.8]";

  const outline = ["Overview", "Features", "Quick Start", "Architecture"];

  const explorer = (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2.5 border-b border-border space-y-2">
        <label className="flex items-center gap-2 h-8 px-2 rounded-md border border-border bg-surface-2 text-[12px] text-muted-foreground">
          <span className="hidden sm:inline">Repository</span>
          <select
            value={repoId}
            onChange={(e) => setRepoId(e.target.value)}
            className="bg-transparent text-foreground text-[12px] flex-1 focus:outline-none"
          >
            {repos.map((r) => (
              <option key={r.id} value={r.id} className="bg-background">
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents…"
            className="w-full h-8 pl-7.5 pr-2.5 rounded-md bg-surface-2 border border-border text-[12.5px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
      <nav className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
        {filteredNav.map((s) => {
          const open = openSection === s.section || !!query;
          return (
            <div key={s.section}>
              <button
                onClick={() => setOpenSection(open ? null : s.section)}
                className="w-full flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground py-1.5 px-1 hover:text-foreground"
              >
                {open ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                {s.section}
              </button>
              {open && (
                <div className="space-y-0.5">
                  {s.items.map((it) => (
                    <button
                      key={it}
                      onClick={() => {
                        setActiveDocId(it);
                        setOpenTabs((t) => (t.includes(it) ? t : [...t, it]));
                      }}
                      className={`w-full flex items-center gap-2 text-left text-[13px] pl-5 pr-2 h-7 rounded-md transition ${
                        activeDocId === it
                          ? "bg-surface-3 text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
                      }`}
                    >
                      <FileCode className="w-3.5 h-3.5 shrink-0 opacity-60" />
                      <span className="truncate">{it}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-border p-2">
        <button
          onClick={() => setShowTemplates(true)}
          className="w-full inline-flex items-center gap-2 h-8 px-2.5 rounded-md text-[12.5px] text-muted-foreground hover:text-foreground hover:bg-surface-2 transition"
        >
          <Settings2 className="w-3.5 h-3.5" /> Templates & style
        </button>
      </div>
    </div>
  );

  const editor = (
    <div className="flex flex-col h-full min-h-0">
      {/* Tab strip */}
      <div className="flex items-stretch border-b border-border bg-surface-1 overflow-x-auto">
        {openTabs.map((t) => (
          <div
            key={t}
            className={`group flex items-center gap-2 pl-3 pr-2 h-9 text-[12.5px] border-r border-border shrink-0 cursor-pointer transition ${
              activeDocId === t
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveDocId(t)}
          >
            <FileCode className="w-3.5 h-3.5 opacity-60" />
            {t}
            {openTabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenTabs((prev) => {
                    const next = prev.filter((x) => x !== t);
                    if (activeDocId === t) setActiveDocId(next[next.length - 1]);
                    return next;
                  });
                }}
                className="w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-surface-3"
                aria-label={`Close ${t}`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        <div className="flex-1" />
      </div>

      {/* Breadcrumb + view controls */}
      <div className="flex items-center justify-between gap-3 px-4 h-9 border-b border-border text-[11.5px] text-muted-foreground">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate">docs</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground truncate">{activeDocId}.md</span>
          <span className="hidden sm:inline px-1.5 h-4 leading-4 rounded border border-border bg-surface-2 text-[10px] ml-1">
            {docStyle}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="inline-flex p-0.5 rounded-md border border-border bg-surface-1">
            <button
              onClick={() => setMode("read")}
              className={`inline-flex items-center gap-1 px-2 h-6 text-[11px] rounded transition ${
                mode === "read" ? "bg-surface-3 text-foreground" : "hover:text-foreground"
              }`}
            >
              <Eye className="w-3 h-3" /> Preview
            </button>
            <button
              onClick={() => setMode("source")}
              className={`inline-flex items-center gap-1 px-2 h-6 text-[11px] rounded transition ${
                mode === "source" ? "bg-surface-3 text-foreground" : "hover:text-foreground"
              }`}
            >
              <Pencil className="w-3 h-3" /> Source
            </button>
          </div>
          <div className="hidden sm:inline-flex items-center p-0.5 rounded-md border border-border bg-surface-1">
            <Type className="w-3 h-3 mx-1" />
            {(["sm", "md", "lg"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFontSize(s)}
                className={`px-1.5 h-6 rounded transition ${
                  fontSize === s ? "bg-surface-3 text-foreground" : "hover:text-foreground"
                } ${s === "sm" ? "text-[10px]" : s === "md" ? "text-[12px]" : "text-[14px]"}`}
              >
                A
              </button>
            ))}
          </div>
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md bg-primary text-primary-foreground text-[11.5px] font-medium hover:brightness-95 disabled:opacity-50 transition"
            title="Re-run LLM generator for this document"
          >
            <Sparkles className={`w-3 h-3 ${isRegenerating ? "animate-spin" : ""}`} />
            <span>{isRegenerating ? "Regenerating..." : "Regenerate"}</span>
          </button>
          <button
            onClick={() => setFullscreen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-2 h-7 rounded-md border border-border bg-surface-1 hover:text-foreground hover:bg-surface-2 transition"
            title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
          >
            {fullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            <span className="hidden sm:inline">{fullscreen ? "Exit full screen" : "Full screen"}</span>
          </button>
        </div>
      </div>

      {/* Document body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto max-w-[800px] px-6 py-8">
          {isDocLoading ? (
            <div className="py-20 text-center space-y-3">
              <Sparkles className="w-8 h-8 mx-auto text-primary animate-pulse" />
              <p className="text-sm text-muted-foreground">Loading document content...</p>
            </div>
          ) : mode === "source" ? (
            <pre className="text-[13px] font-mono leading-[1.7] text-foreground/85 bg-surface-1 border border-border rounded-md p-5 overflow-x-auto whitespace-pre-wrap">
              {docMarkdown || `# ${readme.title}\n\n${readme.overview}`}
            </pre>
          ) : currentDoc?.markdown ? (
            <div className={`${proseSize} text-foreground/90 space-y-4 font-sans whitespace-pre-wrap`}>
              <pre className="text-[14px] font-sans leading-[1.8] text-foreground/90 bg-transparent border-0 overflow-x-auto whitespace-pre-wrap">
                {currentDoc.markdown}
              </pre>
            </div>
          ) : activeSlug === "readme" ? (
            <div className={`${proseSize} text-foreground/90 space-y-6`}>
              <h1 className="font-display text-[34px] leading-tight font-medium tracking-tight text-foreground">
                {readme.title}
              </h1>
              <p className="text-muted-foreground">{readme.tagline}</p>

              <section id="Overview">
                <h2 className="text-xl font-medium text-foreground mt-8 mb-3">Overview</h2>
                {readme.overview.split("\n\n").map((para: string, i: number) => (
                  <p key={i} className={i > 0 ? "mt-4" : ""}>{para}</p>
                ))}
              </section>

              <section id="Features">
                <h2 className="text-xl font-medium text-foreground mt-8 mb-3">Features</h2>
                <ul className="space-y-2.5">
                  {readme.features.map((f: string) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-1" /> {f}
                    </li>
                  ))}
                </ul>
              </section>

              <section id="Quick Start">
                <h2 className="text-xl font-medium text-foreground mt-8 mb-3">Quick Start</h2>
                <pre className="bg-surface-2 border border-border rounded-xl p-4 text-[13px] font-mono text-foreground/90 overflow-x-auto leading-relaxed">
{readme.quickStart}
                </pre>
              </section>

              <section id="Architecture">
                <h2 className="text-xl font-medium text-foreground mt-8 mb-3">Architecture</h2>
                <p>{readme.architecture}</p>
              </section>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center space-y-4 bg-surface-1/50 my-10">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary">
                <FileCode className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-medium text-foreground">{activeDocId} Documentation</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  Click <strong>Regenerate</strong> above to build models and generate real documentation for {activeDocId}.
                </p>
              </div>
              <div className="pt-2 flex justify-center gap-3">
                <button
                  onClick={handleRegenerate}
                  disabled={isRegenerating}
                  className="inline-flex items-center gap-1.5 px-4 h-9 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:brightness-95 disabled:opacity-50 transition"
                >
                  <Sparkles className="w-3.5 h-3.5" /> {isRegenerating ? "Generating..." : "Generate Now"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 h-7 border-t border-border bg-surface-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 text-success">
          <Check className="w-3 h-3" /> {currentDoc?.status || readme.status} · {currentDoc?.updated || readme.updated}
        </span>
        <span className="hidden sm:inline">Markdown · {currentDoc?.wordCount ?? 0} words · {activeDocId}</span>
      </div>
    </div>
  );

  const contextPanel = (
    <div className="h-full min-h-0 overflow-y-auto p-3 space-y-3">
      <div className="rounded-lg border border-border bg-surface-1 p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">On this page</div>
        <div className="mt-2 space-y-0.5">
          {outline.map((h) => (
            <a
              key={h}
              href={`#${h}`}
              className="block text-[12.5px] text-muted-foreground hover:text-foreground px-2 h-7 leading-7 rounded-md hover:bg-surface-2 truncate"
            >
              {h}
            </a>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-warning/25 bg-warning/[0.06] p-3">
        <div className="text-[10px] uppercase tracking-wider text-warning">Change detected</div>
        <div className="mt-1.5 text-[13px]">{commitStream.message}</div>
        <div className="mt-0.5 text-[11.5px] text-muted-foreground">
          {commitStream.author} · {commitStream.time}
        </div>
        <div className="mt-3 space-y-1.5">
          {commitStream.analysis.map((a) => (
            <div key={a} className="flex items-center gap-2 text-[11.5px]">
              <Check className="w-3 h-3 text-success shrink-0" />
              <span className="text-foreground/85">{a}</span>
            </div>
          ))}
        </div>
        <button className="mt-3 w-full inline-flex items-center justify-center gap-2 h-8 rounded-md bg-primary text-primary-foreground text-[12.5px] font-medium hover:brightness-95">
          <Sparkles className="w-3.5 h-3.5" /> Generate update
        </button>
      </div>

      <button className="w-full inline-flex items-center justify-center gap-2 h-9 rounded-md border border-border bg-surface-1 text-[12.5px] hover:bg-surface-2 transition">
        <GitPullRequest className="w-3.5 h-3.5" /> Create PR
      </button>

      <div className="rounded-lg border border-border bg-surface-1 p-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
            <History className="w-3 h-3" /> Version history
          </div>
          <span className="text-[10px] text-muted-foreground">{docHistory.length}</span>
        </div>
        <ol className="mt-2 divide-y divide-border">
          {docHistory.slice(0, 6).map((h) => (
            <li key={h.id} className="py-2 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0 flex items-center gap-1.5">
                  <span
                    className={`text-[9px] px-1 h-4 leading-4 rounded border ${
                      h.kind === "created"
                        ? "text-success border-success/40 bg-success/10"
                        : "text-primary border-primary/40 bg-primary/10"
                    }`}
                  >
                    {h.kind === "created" ? "NEW" : "UPD"}
                  </span>
                  <span className="text-[12px] font-medium truncate">{h.doc}</span>
                  <span className="text-[10.5px] text-muted-foreground shrink-0">{h.version}</span>
                </div>
                <span className="text-[10.5px] text-muted-foreground shrink-0">{h.time}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{h.summary}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground truncate">
                {h.repoId}
                {h.commit && (
                  <>
                    {" · "}
                    <span className="font-mono inline-flex items-center gap-0.5">
                      <GitCommit className="w-2.5 h-2.5" />
                      {h.commit}
                    </span>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );

  const workspace = (
    <div className="flex h-full min-h-0">
      {showExplorer && (
        <div className="hidden md:flex flex-col w-[240px] shrink-0 border-r border-border bg-surface-1 min-h-0">
          {explorer}
        </div>
      )}
      <div className="flex-1 min-w-0 min-h-0 bg-background">{editor}</div>
      <div className="hidden xl:block w-[280px] shrink-0 border-l border-border bg-surface-1 min-h-0">
        {contextPanel}
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background animate-fade-in">
        <div className="flex items-center justify-between gap-3 px-3 h-11 border-b border-border bg-surface-1">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setShowExplorer((v) => !v)}
              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-2"
              title="Toggle documents"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            <span className="text-[13px] font-medium truncate">Documentation</span>
            <span className="text-[12px] text-muted-foreground truncate">— {activeDocId}.md</span>
          </div>
          <button
            onClick={() => setFullscreen(false)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-surface-2 text-[12.5px] hover:bg-surface-3"
          >
            <Minimize2 className="w-3.5 h-3.5" /> Exit full screen
            <kbd className="ml-1 text-[10px] text-muted-foreground">Esc</kbd>
          </button>
        </div>
        <div className="flex-1 min-h-0">{workspace}</div>
        {showTemplates && (
          <TemplateModal
            templates={templates}
            setTemplates={setTemplates}
            docStyle={docStyle}
            setDocStyle={setDocStyle}
            onClose={() => setShowTemplates(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] tracking-tight font-semibold">Documentation</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Generated and continuously maintained by AutoScribe
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowExplorer((v) => !v)}
            className="hidden md:inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-surface-1 text-[13px] text-muted-foreground hover:text-foreground hover:bg-surface-2"
          >
            <PanelLeft className="w-3.5 h-3.5" /> Documents
          </button>
          <button
            onClick={() => setShowTemplates(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-surface-1 text-[13px] hover:bg-surface-2"
          >
            <Settings2 className="w-3.5 h-3.5" /> Customize
          </button>
          <button className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:brightness-95">
            <GitPullRequest className="w-3.5 h-3.5" /> Create PR
          </button>
        </div>
      </header>

      <div className="rounded-xl border border-border overflow-hidden h-[calc(100vh-190px)] min-h-[520px]">
        {workspace}
      </div>

      {showTemplates && (
        <TemplateModal
          templates={templates}
          setTemplates={setTemplates}
          docStyle={docStyle}
          setDocStyle={setDocStyle}
          onClose={() => setShowTemplates(false)}
        />
      )}
    </div>
  );
}


function TemplateModal({
  templates,
  setTemplates,
  docStyle,
  setDocStyle,
  onClose,
}: {
  templates: Template[];
  setTemplates: React.Dispatch<React.SetStateAction<Template[]>>;
  docStyle: (typeof docStyles)[number];
  setDocStyle: (s: (typeof docStyles)[number]) => void;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "");
  const [refInput, setRefInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSections, setNewSections] = useState("");

  const selected = templates.find((t) => t.id === selectedId) ?? templates[0];

  const addRef = () => {
    if (!refInput.trim() || !selected) return;
    setTemplates((prev) =>
      prev.map((t) => (t.id === selected.id ? { ...t, refs: [...t.refs, refInput.trim()] } : t)),
    );
    setRefInput("");
  };

  const removeRef = (r: string) => {
    setTemplates((prev) =>
      prev.map((t) => (t.id === selected.id ? { ...t, refs: t.refs.filter((x) => x !== r) } : t)),
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-border bg-surface-1 shadow-2xl flex flex-col"
      >
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              <h2 className="font-display text-lg font-medium">Templates & documentation style</h2>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pick a template, attach references it should treat as ground truth, and set the voice.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-border bg-surface-2 hover:bg-surface-3 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* body */}
        <div className="grid grid-cols-12 gap-0 flex-1 overflow-hidden">
          {/* template list */}
          <div className="col-span-4 border-r border-border overflow-y-auto p-3 space-y-1">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition ${
                  selected?.id === t.id
                    ? "bg-surface-3 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
                }`}
              >
                <div className="flex items-center gap-2">
                  <LayoutTemplate className="w-3.5 h-3.5 text-primary/80" />
                  <span className="font-medium text-foreground/90">{t.name}</span>
                  {t.custom && (
                    <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-md bg-primary/12 text-primary border border-primary/25">
                      Custom
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground truncate">{t.desc}</div>
              </button>
            ))}
            <button
              onClick={() => setCreating((v) => !v)}
              className="w-full mt-2 flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition"
            >
              <Plus className="w-3.5 h-3.5" /> New template
            </button>
            {creating && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newName.trim()) return;
                  const id = `${Date.now()}`;
                  setTemplates((p) => [
                    ...p,
                    {
                      id,
                      name: newName.trim(),
                      desc: "Custom template",
                      sections: newSections.split(",").map((s) => s.trim()).filter(Boolean),
                      refs: [],
                      custom: true,
                    },
                  ]);
                  setSelectedId(id);
                  setNewName("");
                  setNewSections("");
                  setCreating(false);
                }}
                className="mt-1 p-3 rounded-lg border border-border bg-surface-2 space-y-2"
              >
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Template name"
                  className="w-full h-8 px-2.5 rounded-md bg-surface-1 border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
                <input
                  value={newSections}
                  onChange={(e) => setNewSections(e.target.value)}
                  placeholder="Sections, comma separated"
                  className="w-full h-8 px-2.5 rounded-md bg-surface-1 border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
                <button
                  type="submit"
                  className="w-full h-8 rounded-md bg-primary text-primary-foreground text-xs font-medium"
                >
                  Save
                </button>
              </form>
            )}
          </div>

          {/* selected template details */}
          <div className="col-span-8 overflow-y-auto p-6 space-y-6">
            {selected && (
              <>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Template
                  </div>
                  <div className="mt-1 font-display text-xl font-medium">{selected.name}</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">{selected.desc}</div>
                </div>

                <div>
                  <div className="text-xs font-medium mb-2">Sections</div>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.sections.map((s) => (
                      <span
                        key={s}
                        className="text-[11px] px-2 py-1 rounded-md bg-surface-2 border border-border"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Reference documents scoped to this template */}
                <div>
                  <div className="flex items-center gap-2 text-xs font-medium mb-2">
                    <Paperclip className="w-3.5 h-3.5 text-primary" />
                    Reference documents for this template
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    AutoScribe treats these as ground truth whenever it generates docs from{" "}
                    <span className="text-foreground/80">{selected.name}</span>.
                  </p>
                  <div className="space-y-1.5">
                    {selected.refs.length === 0 && (
                      <div className="text-[11px] text-muted-foreground italic">
                        No references yet.
                      </div>
                    )}
                    {selected.refs.map((r) => (
                      <div
                        key={r}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-border text-xs"
                      >
                        <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="flex-1 truncate">{r}</span>
                        <button
                          onClick={() => removeRef(r)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      addRef();
                    }}
                  >
                    <input
                      value={refInput}
                      onChange={(e) => setRefInput(e.target.value)}
                      placeholder="Paste a link or file name…"
                      className="flex-1 h-9 px-3 rounded-lg bg-surface-2 border border-border text-xs placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:brightness-95"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
                  </form>
                </div>

                {/* Documentation style — moved here from Settings */}
                <div className="pt-4 border-t border-border">
                  <div className="text-xs font-medium mb-2">Documentation style</div>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Voice used when AutoScribe generates or rewrites this document.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {docStyles.map((s) => (
                      <button
                        key={s}
                        onClick={() => setDocStyle(s)}
                        className={`px-3 py-2 rounded-lg text-xs text-center border transition ${
                          docStyle === s
                            ? "bg-primary/10 border-primary/40 text-primary"
                            : "bg-surface-2 border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="px-6 py-3 border-t border-border flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border bg-surface-2 text-sm hover:bg-surface-3"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
