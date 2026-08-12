import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Github,
  ArrowRight,
  ShieldCheck,
  Loader2,
  Mail,
  Check,
  FileText,
  GitPullRequest,
  Network,
  ScanLine,
} from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · AutoScribe" },
      {
        name: "description",
        content:
          "Sign in or create your AutoScribe account to connect GitHub and get living documentation for every repository.",
      },
      { property: "og:title", content: "Sign in · AutoScribe" },
      {
        property: "og:description",
        content: "One account. Connect GitHub and your docs stay in sync with every commit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Auth,
});

const liveEvents = [
  { icon: FileText, text: "Generated API reference for refund system", repo: "ecommerce-platform" },
  { icon: ScanLine, text: "Indexed 2,487 files across 156 modules", repo: "payment-service" },
  { icon: GitPullRequest, text: "Opened PR #412 · sync refund docs", repo: "ecommerce-platform" },
  { icon: Network, text: "Rebuilt architecture graph after service split", repo: "inventory-service" },
  { icon: FileText, text: "Detected auth change (JWT → OAuth2)", repo: "payment-service" },
];

function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<null | "github" | "email">(null);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setCursor((c) => c + 1), 2600);
    return () => window.clearInterval(id);
  }, []);

const go = (kind: "github" | "email") => {
    if (pending) return;
    if (kind === "github") {
      setPending("github");
      window.location.href = "/api/auth/github/login";
      return;
    }
    setPending(kind);
    window.setTimeout(() => navigate({ to: "/connect" }), 900);
};

  return (
    <div className="min-h-screen bg-background text-foreground grid lg:grid-cols-[1fr_minmax(0,520px)]">
      {/* Live side */}
      <aside className="relative hidden lg:flex flex-col justify-between border-r border-border bg-surface-1 p-10 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />

        <div className="relative flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
            <div className="w-2 h-2 rounded-[2px] bg-background rotate-45" />
          </div>
          <span className="text-sm font-semibold tracking-tight">AutoScribe</span>
        </div>

        <div className="relative max-w-[460px]">
          <h2 className="font-display text-[34px] leading-[1.12] tracking-tight font-medium">
            Documentation that keeps
            <br /> up with your codebase.
          </h2>
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
            Connect a repository once. AutoScribe indexes the code, maps the architecture and
            rewrites the docs on every commit.
          </p>

          <div className="mt-9 rounded-2xl border border-border bg-background/60 backdrop-blur p-4">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inline-flex w-full h-full rounded-full bg-success opacity-70 animate-ping" />
                <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-success" />
              </span>
              Live across 5 repositories
            </div>
            <ol className="mt-4 space-y-2.5">
              {[0, 1, 2].map((offset) => {
                const e = liveEvents[(cursor + offset) % liveEvents.length];
                const Icon = e.icon;
                return (
                  <li
                    key={`${cursor}-${offset}`}
                    className="flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500"
                    style={{ opacity: 1 - offset * 0.3 }}
                  >
                    <span className="w-7 h-7 rounded-lg bg-surface-2 border border-border flex items-center justify-center shrink-0">
                      <Icon className="w-3.5 h-3.5 text-primary/80" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px] leading-snug text-foreground/90 truncate">
                        {e.text}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">{e.repo}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <div className="relative flex items-center gap-5 text-[11px] text-muted-foreground">
          <span>SOC 2 ready</span>
          <span>Read-only GitHub scope</span>
          <span>Revoke anytime</span>
        </div>
      </aside>

      {/* Form side */}
      <main className="flex items-center justify-center px-6 py-14">
        <div className="w-full max-w-[360px]">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <div className="w-2 h-2 rounded-[2px] bg-background rotate-45" />
            </div>
            <span className="text-sm font-semibold tracking-tight">AutoScribe</span>
          </div>

          <h1 className="font-display text-[26px] tracking-tight font-medium">
            {mode === "signin" ? "Sign in to AutoScribe" : "Create your account"}
          </h1>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {mode === "signin"
              ? "One step to your repositories."
              : "Takes about ten seconds. No credit card."}
          </p>

          <button
            onClick={() => go("github")}
            disabled={pending !== null}
            className="mt-7 w-full inline-flex items-center justify-center gap-2 h-11 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:brightness-95 transition disabled:opacity-70"
          >
            {pending === "github" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Redirecting to GitHub…
              </>
            ) : (
              <>
                <Github className="w-4 h-4" />
                {mode === "signin" ? "Continue with GitHub" : "Sign up with GitHub"}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
          <p className="mt-2.5 text-[11.5px] text-muted-foreground inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Signs you in and connects GitHub in one step.
          </p>

          <div className="my-6 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or use email
            <span className="h-px flex-1 bg-border" />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              go("email");
            }}
            className="space-y-2.5"
          >
            <label className="block">
              <span className="sr-only">Work email</span>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full h-10 pl-9 pr-3 rounded-lg bg-surface-1 border border-border text-[13px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </label>
            <button
              type="submit"
              disabled={pending !== null}
              className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-lg border border-border bg-surface-2 text-[13px] hover:bg-surface-3 transition disabled:opacity-70"
            >
              {pending === "email" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Sending magic link…
                </>
              ) : (
                <>Email me a sign-in link</>
              )}
            </button>
          </form>

          <ul className="mt-7 space-y-1.5 text-[12px] text-muted-foreground">
            {["No password to remember", "Read-only repository access", "Free while you evaluate"].map(
              (t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-success" /> {t}
                </li>
              ),
            )}
          </ul>

          <div className="mt-8 text-[12.5px] text-muted-foreground">
            {mode === "signin" ? "New to AutoScribe?" : "Already have an account?"}{" "}
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-foreground underline underline-offset-4 hover:opacity-80"
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </div>

          <p className="mt-6 text-[11px] text-muted-foreground leading-relaxed">
            By continuing you agree to the Terms and Privacy Policy.{" "}
            <Link to="/" className="underline underline-offset-4 hover:text-foreground">
              Back home
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
