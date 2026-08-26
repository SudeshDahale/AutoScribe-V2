import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Github, ArrowRight, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AutoScribe — Connect your first repository" },
      { name: "description", content: "Connect a GitHub repository to get living documentation, architecture maps, and code intelligence." },
      { property: "og:title", content: "AutoScribe — Connect your first repository" },
      { property: "og:description", content: "Connect a GitHub repository to get living documentation, architecture maps, and code intelligence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="h-14 px-6 flex items-center border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
            <div className="w-2 h-2 rounded-[2px] bg-background rotate-45" />
          </div>
          <span className="text-[14px] font-semibold tracking-tight">AutoScribe</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-[420px] text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-surface-1 border border-border flex items-center justify-center">
            <Github className="w-5 h-5 text-foreground" />
          </div>
          <h1 className="mt-6 text-[28px] leading-[1.15] tracking-tight font-semibold">
            Connect your first repository
          </h1>
          <p className="mt-3 text-[14px] text-muted-foreground leading-relaxed">
            AutoScribe reads your code, builds a live architecture map,
            and keeps documentation in sync with every commit.
          </p>

          <button
            onClick={() => navigate({ to: "/auth" })}
            className="mt-8 w-full inline-flex items-center justify-center gap-2 h-11 rounded-lg bg-primary text-primary-foreground text-[14px] font-medium hover:brightness-95 transition"
          >
            <Github className="w-4 h-4" /> Continue with GitHub <ArrowRight className="w-4 h-4" />
          </button>

          <div className="mt-3 text-[12px] text-muted-foreground inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Read-only access. Revoke anytime.
          </div>

          <div className="mt-6 text-[12.5px] text-muted-foreground">
            Already have an account?{" "}
            <button
              onClick={() => navigate({ to: "/auth" })}
              className="text-foreground underline underline-offset-4 hover:opacity-80"
            >
              Sign in
            </button>
          </div>
        </div>
      </main>

      <footer className="h-12 px-6 flex items-center justify-between text-[12px] text-muted-foreground border-t border-border">
        <span>© AutoScribe</span>
        <span>Enterprise-grade code intelligence</span>
      </footer>
    </div>
  );
}
