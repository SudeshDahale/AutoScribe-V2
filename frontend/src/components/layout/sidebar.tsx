import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutGrid,
  FolderGit2,
  Sparkles,
  BookText,
  Network,
  History,
  GitPullRequest,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  X,
} from "lucide-react";
import { useRepos } from "@/lib/repo-store";
import { useState } from "react";

const items = [
  { to: "/dashboard", label: "Overview", icon: LayoutGrid, hint: "All repositories at a glance" },
  { to: "/repositories", label: "Repositories", icon: FolderGit2, hint: "Connect and manage repos" },
  { to: "/ask", label: "Ask AI", icon: Sparkles, hint: "Ask anything about your code" },
  { to: "/documentation", label: "Documentation", icon: BookText, hint: "Living docs" },
  { to: "/documents-log", label: "Document log", icon: History, hint: "Generation history" },
  { to: "/pull-requests", label: "PR activity", icon: GitPullRequest, hint: "Doc PRs on GitHub" },
  { to: "/architecture", label: "Architecture", icon: Network, hint: "Live system map" },
] as const;

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const { location } = useRouterState();
  const { repos } = useRepos();
  const [hovering, setHovering] = useState(false);

  const isActive = (to: string) =>
    location.pathname === to ||
    (to === "/repositories" && location.pathname.startsWith("/repository"));

  // The sidebar is *visually* expanded when the user hovers it even while
  // pinned-collapsed. Layout padding (in _app.tsx) still tracks the pinned
  // state so the sidebar floats over the content instead of shifting it.
  const expanded = !collapsed || hovering;
  const width = expanded ? "w-[248px]" : "w-[68px]";
  const floatingShadow = collapsed && hovering ? "shadow-xl shadow-background/40" : "";

  return (
    <>
      {/* Mobile scrim */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={`fixed inset-y-0 left-0 z-50 ${width} ${floatingShadow} border-r border-border bg-sidebar flex flex-col transition-[width,transform] duration-200 ease-out
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      >

        {/* Brand */}
        <div className="h-14 flex items-center gap-2 px-4 shrink-0 border-b border-border">
          <Link to="/dashboard" className="flex items-center gap-2 min-w-0" onClick={onCloseMobile}>
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center shrink-0">
              <div className="w-2 h-2 rounded-[2px] bg-background rotate-45" />
            </div>
            {expanded && (
              <span className="text-[14px] font-semibold tracking-tight truncate">AutoScribe</span>
            )}
          </Link>
          <div className="flex-1" />
          <button
            onClick={onCloseMobile}
            className="lg:hidden w-7 h-7 rounded-md hover:bg-surface-2 flex items-center justify-center text-muted-foreground"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Primary nav */}
        <nav className="px-2 py-3 space-y-0.5">
          {items.map((it) => {
            const active = isActive(it.to);
            const Icon = it.icon;
            return (
              <Link
                key={it.to}
                to={it.to}
                onClick={onCloseMobile}
                title={!expanded ? it.label : it.hint}
                className={`flex items-center gap-2.5 rounded-md text-[13px] transition-colors ${
                  !expanded ? "justify-center h-9" : "px-2.5 h-9"
                } ${
                  active
                    ? "bg-surface-2 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-1"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                {expanded && <span className="truncate">{it.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Connected repositories */}
        <div className="flex-1 min-h-0 flex flex-col border-t border-border pt-3">
          {expanded && (
            <div className="px-4 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.09em] text-muted-foreground">
                Repositories
              </span>
              <span className="text-[10px] text-muted-foreground tabular-nums">{repos.length}</span>
            </div>
          )}
          <div className="mt-2 flex-1 overflow-y-auto px-2 space-y-0.5">
            {repos.map((r) => {
              const active = location.pathname === `/repository/${r.id}`;
              return (
                <Link
                  key={r.id}
                  to="/repository/$id"
                  params={{ id: r.id }}
                  onClick={onCloseMobile}
                  title={`${r.org}/${r.name}`}
                  className={`flex items-center gap-2.5 rounded-md text-[12.5px] transition-colors ${
                    !expanded ? "justify-center h-8" : "px-2.5 h-8"
                  } ${
                    active
                      ? "bg-surface-2 text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-surface-1"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      r.status === "synced"
                        ? "bg-success"
                        : r.status === "pending"
                          ? "bg-warning"
                          : "bg-foreground/70 pulse-dot"
                    }`}
                  />
                  {expanded && <span className="truncate">{r.name}</span>}
                </Link>
              );
            })}
          </div>

          <div className="p-2">
            <Link
              to="/repositories"
              search={{ add: true }}
              onClick={onCloseMobile}
              title="Connect a repository"
              className={`flex items-center gap-2 rounded-md border border-dashed border-border text-[12.5px] text-muted-foreground hover:text-foreground hover:bg-surface-1 transition ${
                !expanded ? "justify-center h-8" : "px-2.5 h-8"
              }`}
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              {expanded && <span>Connect repo</span>}
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="p-2 border-t border-border space-y-0.5">
          <Link
            to="/settings"
            onClick={onCloseMobile}
            title="Settings"
            className={`flex items-center gap-2.5 rounded-md text-[13px] transition-colors ${
              !expanded ? "justify-center h-9" : "px-2.5 h-9"
            } ${
              isActive("/settings")
                ? "bg-surface-2 text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-1"
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            {expanded && <span>Settings</span>}
          </Link>
          <button
            onClick={onToggle}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`hidden lg:flex w-full items-center gap-2.5 rounded-md h-9 text-[13px] text-muted-foreground hover:text-foreground hover:bg-surface-1 transition-colors ${
              !expanded ? "justify-center" : "px-2.5"
            }`}
          >
            {collapsed ? (
              <PanelLeftOpen className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            ) : (
              <PanelLeftClose className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            )}
            {expanded && <span>{collapsed ? "Pin open" : "Collapse"}</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
