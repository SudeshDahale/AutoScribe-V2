import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useRepos } from "@/lib/repo-store";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  GitPullRequest,
  Sparkles,
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
  History,
  Copy,
  Terminal,
  BookOpen,
  Clock,
  Layers,
  FileText,
  ExternalLink,
  Download,
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

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-xl border border-border bg-surface-2 overflow-hidden shadow-xs font-mono text-[12.5px]">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-surface-3/80 border-b border-border text-muted-foreground text-[11px]">
        <span className="flex items-center gap-1.5 text-foreground/80 font-medium">
          <Terminal className="w-3.5 h-3.5 text-primary" /> {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 hover:text-foreground transition text-[11px]"
        >
          {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-foreground/90 leading-relaxed whitespace-pre font-mono">
        {code}
      </pre>
    </div>
  );
}

function MarkdownDocRenderer({ markdown }: { markdown: string }) {
  if (!markdown) return null;

  const lines = markdown.split("\n");
  const elements = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push({ type: "code", lang: codeLang, content: codeBuffer.join("\n") });
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLang = line.replace("```", "").trim() || "bash";
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    if (line.startsWith("# ")) {
      elements.push({ type: "h1", content: line.slice(2) });
    } else if (line.startsWith("## ")) {
      elements.push({ type: "h2", content: line.slice(3) });
    } else if (line.startsWith("### ")) {
      elements.push({ type: "h3", content: line.slice(4) });
    } else if (line.startsWith("> ")) {
      elements.push({ type: "quote", content: line.slice(2) });
    } else if (line.startsWith("- ")) {
      elements.push({ type: "li", content: line.slice(2) });
    } else if (line.startsWith("1. ") || line.startsWith("2. ") || line.startsWith("3. ")) {
      elements.push({ type: "li_num", content: line.replace(/^\d+\.\s*/, "") });
    } else if (line.trim() !== "") {
      elements.push({ type: "p", content: line });
    }
  }

  return (
    <div className="space-y-4 text-foreground/90 font-sans">
      {elements.map((el, idx) => {
        if (el.type === "h1") {
          return (
            <h1 key={idx} className="font-display text-3xl font-semibold tracking-tight text-foreground pb-2 border-b border-border mt-2">
              {el.content}
            </h1>
          );
        }
        if (el.type === "h2") {
          const id = el.content.replace(/[^a-zA-Z0-9]/g, "-");
          return (
            <h2 key={idx} id={id} className="text-xl font-semibold tracking-tight text-foreground mt-8 mb-3 pl-3 border-l-2 border-primary">
              {el.content}
            </h2>
          );
        }
        if (el.type === "h3") {
          return (
            <h3 key={idx} className="text-base font-semibold text-foreground mt-5 mb-2">
              {el.content}
            </h3>
          );
        }
        if (el.type === "quote") {
          return (
            <blockquote key={idx} className="p-3.5 my-3 rounded-lg border-l-4 border-primary bg-surface-2 text-sm italic text-foreground/80">
              {el.content}
            </blockquote>
          );
        }
        if (el.type === "code") {
          return <CodeBlock key={idx} code={el.content} language={el.lang || "bash"} />;
        }
        if (el.type === "li" || el.type === "li_num") {
          return (
            <div key={idx} className="flex items-start gap-2.5 text-sm pl-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
              <span>{el.content}</span>
            </div>
          );
        }
        return (
          <p key={idx} className="text-sm leading-relaxed text-foreground/90">
            {el.content}
          </p>
        );
      })}
    </div>
  );
}

function Documentation() {
  const { repos, docHistory } = useRepos();
  const [repoId, setRepoId] = useState<string>(repos[0]?.id ?? "");
  const [activeDocId, setActiveDocId] = useState("README");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);

  // Fetch real documents for this repo and build the nav from them.
  // This query must come before activeSlug/currentDoc because activeSlug
  // needs docsListData to map a doc title back to its real slug.
  const { data: docsListData } = useQuery({
    queryKey: ["documents", repoId],
    queryFn: async () => {
      if (!repoId) return [];
      const res = await fetch(`/api/repos/${repoId}/documents`);
      if (!res.ok) return [];
      return res.json() as Promise<{ id: number; title: string; section: string; slug: string; status: string }[]>;
    },
    enabled: !!repoId,
  });

  // Map doc title back to its slug using real data, falling back to the heuristic
  const activeSlug = useMemo(() => {
    if (docsListData) {
      const match = docsListData.find((d) => d.title === activeDocId);
      if (match) return match.slug;
    }
    return docIdToSlug(activeDocId);
  }, [activeDocId, docsListData]);

  // Group real documents by section — only items that actually exist in the DB appear in the nav
  const realDocsNav = useMemo(() => {
    if (!docsListData || docsListData.length === 0) return [];
    const sections: Record<string, string[]> = {};
    for (const doc of docsListData) {
      const sec = doc.section || "Getting Started";
      if (!sections[sec]) sections[sec] = [];
      sections[sec].push(doc.title);
    }
    return Object.entries(sections).map(([section, items]) => ({ section, items }));
  }, [docsListData]);

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

  const handleCopyMarkdown = () => {
    const md = currentDoc?.markdown || "";
    if (md) {
      navigator.clipboard.writeText(md);
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2000);
    }
  };

  const readme = currentDoc?.content && activeSlug === "readme" ? currentDoc.content : fallbackReadme;
  const docMarkdown = currentDoc?.markdown || "";
  const [query, setQuery] = useState("");
  const [openSection, setOpenSection] = useState<string | null>("Getting Started");
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg">("md");
  const [fullscreen, setFullscreen] = useState(false);
  const [mode, setMode] = useState<"read" | "source">("read");

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const filteredNav = useMemo(() => {
    const nav = realDocsNav.length > 0 ? realDocsNav : [];
    if (!query) return nav;
    const q = query.toLowerCase();
    return nav
      .map((s) => ({ ...s, items: s.items.filter((i) => i.toLowerCase().includes(q)) }))
      .filter((s) => s.items.length > 0);
  }, [query, realDocsNav]);

  const proseSize =
    fontSize === "sm"
      ? "text-[13.5px] leading-[1.65]"
      : fontSize === "lg"
        ? "text-[16.5px] leading-[1.85]"
        : "text-[15px] leading-[1.75]";

  const headingsList = useMemo(() => {
    if (!docMarkdown) return ["Overview", "Features", "Quick Start", "Architecture"];
    const matches = docMarkdown.match(/^##\s+(.+)$/gm);
    if (!matches) return ["Overview", "Features", "Quick Start", "Architecture"];
    return matches.map((m: string) => m.replace(/^##\s+/, "").trim());
  }, [docMarkdown]);

  return (
    <div className="flex h-[calc(100vh-6.5rem)] rounded-2xl border border-border bg-surface-1 overflow-hidden shadow-sm">
      {/* 1. Left Section Navigation Sidebar */}
      <div className="w-64 border-r border-border bg-surface-1/70 flex flex-col h-full shrink-0">
        <div className="p-3 border-b border-border space-y-2.5">
          <label className="flex items-center gap-2 h-8 px-2.5 rounded-lg border border-border bg-surface-2 text-xs">
            <span className="text-muted-foreground text-xs shrink-0 font-medium">Repo</span>
            <select
              value={repoId}
              onChange={(e) => setRepoId(e.target.value)}
              className="bg-transparent text-foreground font-medium text-xs flex-1 focus:outline-none cursor-pointer truncate"
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
              placeholder="Filter docs..."
              className="w-full h-8 pl-8 pr-2.5 rounded-lg bg-surface-2 border border-border text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
          {filteredNav.map((s) => {
            const open = openSection === s.section || !!query;
            return (
              <div key={s.section} className="space-y-0.5">
                <button
                  onClick={() => setOpenSection(open ? null : s.section)}
                  className="w-full flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-1 px-1.5 hover:text-foreground"
                >
                  <span className="flex items-center gap-1.5">
                    {open ? <ChevronDown className="w-3 h-3 text-primary" /> : <ChevronRight className="w-3 h-3" />}
                    {s.section}
                  </span>
                </button>

                {open && (
                  <div className="space-y-0.5 pl-2">
                    {s.items.map((it) => {
                      const isActive = activeDocId === it;
                      return (
                        <button
                          key={it}
                          onClick={() => setActiveDocId(it)}
                          className={`w-full flex items-center justify-between text-left text-xs px-2.5 h-7 rounded-lg transition ${
                            isActive
                              ? "bg-primary text-primary-foreground font-medium shadow-xs"
                              : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
                          }`}
                        >
                          <span className="flex items-center gap-2 truncate">
                            <FileText className="w-3.5 h-3.5 shrink-0 opacity-70" />
                            <span className="truncate">{it}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border bg-surface-2/40 text-[11px] text-muted-foreground flex items-center justify-between">
          <span className="flex items-center gap-1">
            <BookOpen className="w-3 h-3 text-primary" /> AutoScribe Docs
          </span>
          <span className="px-1.5 py-0.5 rounded bg-surface-3 border border-border text-[10px]">Living Docs</span>
        </div>
      </div>

      {/* 2. Central Documentation Canvas */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-background">
        {/* Toolbar Bar */}
        <div className="h-11 px-4 border-b border-border bg-surface-1/80 flex items-center justify-between shrink-0 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-muted-foreground truncate">docs</span>
            <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="font-semibold text-foreground truncate">{activeDocId}.md</span>
            {currentDoc?.status && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 border border-success/30 text-success text-[10px] font-medium ml-1">
                <Check className="w-2.5 h-2.5" /> {currentDoc.status}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <div className="inline-flex p-0.5 rounded-lg border border-border bg-surface-2">
              <button
                onClick={() => setMode("read")}
                className={`inline-flex items-center gap-1 px-2 h-6 text-[11px] rounded-md transition ${
                  mode === "read" ? "bg-surface-1 text-foreground font-medium shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Eye className="w-3 h-3" /> Reader
              </button>
              <button
                onClick={() => setMode("source")}
                className={`inline-flex items-center gap-1 px-2 h-6 text-[11px] rounded-md transition ${
                  mode === "source" ? "bg-surface-1 text-foreground font-medium shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Pencil className="w-3 h-3" /> Source
              </button>
            </div>

            <button
              onClick={handleCopyMarkdown}
              className="inline-flex items-center gap-1 px-2 h-7 rounded-lg border border-border bg-surface-1 hover:bg-surface-2 text-muted-foreground hover:text-foreground transition text-[11.5px]"
              title="Copy Markdown content"
            >
              {copiedMd ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
              <span className="hidden sm:inline">{copiedMd ? "Copied" : "Copy MD"}</span>
            </button>

            <button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-primary text-primary-foreground text-[11.5px] font-medium hover:brightness-95 disabled:opacity-50 transition shadow-xs"
              title="Re-run LLM generator for this document"
            >
              <Sparkles className={`w-3 h-3 ${isRegenerating ? "animate-spin" : ""}`} />
              <span>{isRegenerating ? "Regenerating..." : "Regenerate"}</span>
            </button>
          </div>
        </div>

        {/* Reading Canvas Viewport */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-[760px] mx-auto px-6 py-8">
            {/* Header Hero metadata */}
            <div className="pb-6 border-b border-border/70 mb-6 space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="px-2 py-0.5 rounded bg-surface-2 border border-border font-medium text-foreground">
                  {currentDoc?.section || "Documentation"}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {Math.max(1, Math.ceil((currentDoc?.wordCount || 300) / 200))} min read
                </span>
                <span>•</span>
                <span>{currentDoc?.wordCount || 300} words</span>
              </div>
              <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
                {currentDoc?.title || activeDocId}
              </h1>
            </div>

            {/* Document Body */}
            {isDocLoading ? (
              <div className="py-20 text-center space-y-3">
                <Sparkles className="w-8 h-8 mx-auto text-primary animate-pulse" />
                <p className="text-sm text-muted-foreground">Loading living document...</p>
              </div>
            ) : mode === "source" ? (
              <pre className="text-[13px] font-mono leading-[1.7] text-foreground/90 bg-surface-2 border border-border rounded-xl p-5 overflow-x-auto whitespace-pre-wrap">
                {docMarkdown || `# ${readme.title}\n\n${readme.overview}`}
              </pre>
            ) : currentDoc?.markdown ? (
              <MarkdownDocRenderer markdown={currentDoc.markdown} />
            ) : activeSlug === "readme" ? (
              <div className={`${proseSize} text-foreground/90 space-y-6`}>
                <p className="text-muted-foreground text-base leading-relaxed">{readme.tagline}</p>

                <section id="Overview">
                  <h2 className="text-xl font-semibold text-foreground mt-8 mb-3 pl-3 border-l-2 border-primary">Overview</h2>
                  {readme.overview.split("\n\n").map((para: string, i: number) => (
                    <p key={i} className={i > 0 ? "mt-4" : ""}>{para}</p>
                  ))}
                </section>

                <section id="Features">
                  <h2 className="text-xl font-semibold text-foreground mt-8 mb-3 pl-3 border-l-2 border-primary">Features</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {readme.features.map((f: string) => (
                      <div key={f} className="p-3 rounded-xl border border-border bg-surface-1 flex items-start gap-2.5 text-xs text-foreground/90">
                        <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section id="Quick Start">
                  <h2 className="text-xl font-semibold text-foreground mt-8 mb-3 pl-3 border-l-2 border-primary">Quick Start</h2>
                  <CodeBlock code={readme.quickStart} language="bash" />
                </section>

                <section id="Architecture">
                  <h2 className="text-xl font-semibold text-foreground mt-8 mb-3 pl-3 border-l-2 border-primary">Architecture</h2>
                  <p className="text-sm leading-relaxed">{readme.architecture}</p>
                </section>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center space-y-4 bg-surface-1/50 my-8">
                <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary">
                  <FileCode className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{activeDocId} Document</h2>
                  <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                    Click <strong>Regenerate</strong> above to generate real LLM-backed documentation for {activeDocId}.
                  </p>
                </div>
                <button
                  onClick={handleRegenerate}
                  disabled={isRegenerating}
                  className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:brightness-95 disabled:opacity-50 transition shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5" /> {isRegenerating ? "Generating..." : "Generate Now"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer Bar */}
        <div className="px-5 h-8 border-t border-border bg-surface-1 text-[11px] text-muted-foreground flex items-center justify-between shrink-0">
          <span className="inline-flex items-center gap-1.5 text-success font-medium">
            <Check className="w-3 h-3" /> {currentDoc?.status || readme.status} · {currentDoc?.updated || readme.updated}
          </span>
          <span>AutoScribe Enterprise Reader</span>
        </div>
      </div>

      {/* 3. Right Outline Sidebar ("On This Page") */}
      <div className="w-56 border-l border-border bg-surface-1/50 p-4 space-y-5 hidden lg:block shrink-0">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
            On this page
          </div>
          <div className="space-y-1">
            {headingsList.map((h: string) => (
              <a
                key={h}
                href={`#${h.replace(/[^a-zA-Z0-9]/g, "-")}`}
                className="block text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-surface-2 truncate transition"
              >
                # {h}
              </a>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-border space-y-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Actions
          </div>
          <button
            onClick={handleCopyMarkdown}
            className="w-full inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-surface-1 hover:bg-surface-2 text-foreground transition"
          >
            <Copy className="w-3.5 h-3.5 text-primary" /> Copy Markdown
          </button>
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="w-full inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-surface-1 hover:bg-surface-2 text-foreground transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-primary" /> Regenerate AI Doc
          </button>
        </div>
      </div>
    </div>
  );
}
