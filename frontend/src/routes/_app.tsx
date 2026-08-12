import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { RepoProvider } from "@/lib/repo-store";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const STORAGE_KEY = "autoscribe.sidebar-collapsed";

function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });

  // Keyboard shortcut: ⌘/Ctrl + B toggles the sidebar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className="min-h-screen bg-background text-foreground">
        <Sidebar
          collapsed={collapsed}
          onToggle={toggle}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
        {/* Main content padding always tracks the *pinned* collapsed state.
            When collapsed and the user hovers the sidebar, it floats OVER
            the content rather than pushing it — no layout shift. */}
        <div
          className={`transition-[padding] duration-200 ease-out ${
            collapsed ? "lg:pl-[68px]" : "lg:pl-[248px]"
          }`}
        >
          <Topbar
            collapsed={collapsed}
            onToggle={toggle}
            onOpenMobile={() => setMobileOpen(true)}
          />
          <main className="px-5 sm:px-8 py-7">
            <div className="mx-auto max-w-[1240px]">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
