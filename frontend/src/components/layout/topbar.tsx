import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, PanelLeftClose, PanelLeftOpen, Search, ChevronRight } from "lucide-react";
import { useRepos } from "@/lib/repo-store";

const labels: Record<string, string> = {
  dashboard: "Overview",
  repositories: "Repositories",
  repository: "Repositories",
  ask: "Ask AI",
  documentation: "Documentation",
  architecture: "Architecture",
  settings: "Settings",
};

export function Topbar({
  collapsed,
  onToggle,
  onOpenMobile,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onOpenMobile: () => void;
}) {
  const { location } = useRouterState();
  const { repos } = useRepos();
  const segments = location.pathname.split("/").filter(Boolean);

  const crumbs = segments.map((seg, i) => {
    if (i === 1 && segments[0] === "repository") {
      const repo = repos.find((r) => r.id === seg);
      return { label: repo ? `${repo.org}/${repo.name}` : seg, key: seg };
    }
    return { label: labels[seg] ?? seg, key: seg };
  });

  return (
    <header className="h-14 border-b border-border bg-background/80 backdrop-blur-md flex items-center px-4 sm:px-6 gap-3 sticky top-0 z-30">
      <button
        onClick={onOpenMobile}
        className="lg:hidden w-8 h-8 rounded-md border border-border bg-surface-1 flex items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label="Open navigation"
      >
        <Menu className="w-4 h-4" />
      </button>
      <button
        onClick={onToggle}
        title={collapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="hidden lg:flex w-8 h-8 rounded-md border border-border bg-surface-1 items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-2 transition"
      >
        {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
      </button>

      {/* Breadcrumbs — orientation before anything else */}
      <nav className="hidden sm:flex items-center gap-1.5 text-[12.5px] min-w-0">
        <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
          AutoScribe
        </Link>
        {crumbs.map((c, i) => (
          <span key={c.key + i} className="flex items-center gap-1.5 min-w-0">
            <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />
            <span
              className={`truncate ${i === crumbs.length - 1 ? "text-foreground" : "text-muted-foreground"}`}
            >
              {c.label}
            </span>
          </span>
        ))}
      </nav>

      <div className="flex-1" />

      <div className="w-[180px] sm:w-[260px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            placeholder="Search…"
            className="w-full h-8 pl-8 pr-14 rounded-md bg-surface-1 border border-border text-[13px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring transition"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] rounded border border-border text-muted-foreground">
            ⌘K
          </kbd>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 pulse-dot" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
        </span>
        Synced
      </div>

      <div className="w-7 h-7 rounded-full bg-surface-2 border border-border flex items-center justify-center text-foreground text-[11px] font-medium shrink-0">
        JD
      </div>
    </header>
  );
}
