import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

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
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar
        collapsed={collapsed}
        onToggle={toggle}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      {/* Main content area — padding is removed when #ask-ai-container is present */}
      <div
        className={`transition-[padding] duration-200 ease-out flex flex-col min-h-screen ${
          collapsed ? "lg:pl-[68px]" : "lg:pl-[248px]"
        }`}
      >
        <Topbar
          collapsed={collapsed}
          onToggle={toggle}
          onOpenMobile={() => setMobileOpen(true)}
        />
        {/* The main tag removes its padding + max-width when Ask AI is active so
            the page can use the full remaining viewport. */}
        <main className="flex-1 flex flex-col min-h-0 [&:not(:has(#ask-ai-container))]:px-5 [&:not(:has(#ask-ai-container))]:sm:px-8 [&:not(:has(#ask-ai-container))]:py-7">
          <div className="flex-1 flex flex-col min-h-0 mx-auto w-full [&:not(:has(#ask-ai-container))]:max-w-[1240px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

