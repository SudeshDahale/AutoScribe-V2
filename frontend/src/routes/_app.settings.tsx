import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Github,
  Check,
  Zap,
  PauseCircle,
  PlayCircle,
  Shield,
  Bot,
  GitPullRequest,
  RefreshCw,
  Clock,
  Sparkles,
  AlertTriangle,
  Server,
  Layers,
  Save,
} from "lucide-react";
import { useRepos } from "@/lib/repo-store";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({
    meta: [
      { title: "Settings · AutoScribe" },
      { name: "description", content: "Configure autonomous documentation generation, free LLM providers, and GitHub synchronization." },
      { property: "og:title", content: "Settings · AutoScribe" },
      { property: "og:description", content: "Configure AutoScribe autonomous engine and models." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

type EngineStatus = {
  mode: "active" | "paused" | "manual";
  isAvailable: boolean;
  isPaused: boolean;
  pauseReason?: string;
  cooldownUntil?: string;
  resetsIn?: string;
  dailyLimit: number;
};

type ProfileData = {
  user: {
    id: number;
    email: string;
    githubLogin: string | null;
    avatarUrl: string | null;
  };
  stats: {
    connectedRepos: number;
    tokensTotal: number;
    tokensToday: number;
    dailyLimit: number;
  };
  engine: EngineStatus;
  provider: {
    name: string;
    model: string;
    isFree: boolean;
  };
};

function SettingsPage() {
  const queryClient = useQueryClient();
  const { repos } = useRepos();
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Fetch engine and profile status
  const { data: profile, isLoading } = useQuery<ProfileData>({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const res = await fetch("/api/auth/profile");
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json();
    },
  });

  const engine = profile?.engine ?? { mode: "active", isPaused: false, dailyLimit: 250_000 };
  const stats = profile?.stats ?? { tokensToday: 0, dailyLimit: 250_000, connectedRepos: 0 };
  const provider = profile?.provider ?? { name: "groq", isFree: true, model: "llama-3.3-70b-versatile" };

  const [selectedProvider, setSelectedProvider] = useState("groq");
  const [engineMode, setEngineMode] = useState<"active" | "paused" | "manual">("active");

  useEffect(() => {
    if (profile?.engine?.mode) setEngineMode(profile.engine.mode);
    if (profile?.provider?.name) setSelectedProvider(profile.provider.name);
  }, [profile]);

  const toggleEngineMutation = useMutation({
    mutationFn: async (mode: "active" | "paused" | "manual") => {
      const res = await fetch("/api/engine/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error("Failed to toggle engine");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    },
  });

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/repos/sync-all", { method: "POST" });
      if (!res.ok) throw new Error("Failed to sync repos");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    },
  });

  const handleModeChange = (mode: "active" | "paused" | "manual") => {
    setEngineMode(mode);
    toggleEngineMutation.mutate(mode);
  };

  const tokenPercent = Math.min(Math.round((stats.tokensToday / (stats.dailyLimit || 250_000)) * 100), 100);

  return (
    <div className="max-w-4xl space-y-8 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight font-medium">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage autonomous generation, free LLM quota rate-limits, and repository preferences
          </p>
        </div>
        {savedSuccess && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/10 border border-success/30 text-success text-xs font-medium animate-in fade-in duration-200">
            <Check className="w-3.5 h-3.5" /> Settings saved successfully
          </div>
        )}
      </div>

      {/* Autonomous Engine Master Controls */}
      <section className="rounded-2xl border border-border bg-surface-1 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h2 className="text-base font-semibold">Autonomous Documentation Engine</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Controls whether AutoScribe automatically watches your repositories for new commits and generates living docs.
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
              engine.isPaused
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : engineMode === "active"
                ? "bg-success/20 text-success border border-success/30"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {engine.isPaused ? "Rate-Limit Paused" : engineMode}
          </span>
        </div>

        {engine.isPaused && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Free Tier Rate Limit Reached</div>
              <div className="mt-0.5 opacity-90">
                The engine safely paused to preserve quota. It will <strong>automatically resume</strong> when quota arrives in {engine.resetsIn || "a few moments"}.
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            onClick={() => handleModeChange("active")}
            className={`p-4 rounded-xl border text-left transition ${
              engineMode === "active"
                ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                : "border-border bg-surface-2 hover:bg-surface-3"
            }`}
          >
            <div className="flex items-center gap-2 font-medium text-sm text-foreground">
              <PlayCircle className="w-4 h-4 text-success" />
              <span>Autonomous Active</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Continuously tracks commits, auto-generates docs, and creates PRs.
            </p>
          </button>

          <button
            onClick={() => handleModeChange("paused")}
            className={`p-4 rounded-xl border text-left transition ${
              engineMode === "paused"
                ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30"
                : "border-border bg-surface-2 hover:bg-surface-3"
            }`}
          >
            <div className="flex items-center gap-2 font-medium text-sm text-foreground">
              <PauseCircle className="w-4 h-4 text-amber-400" />
              <span>Paused</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Temporarily hold all background tasks without losing repository connections.
            </p>
          </button>

          <button
            onClick={() => handleModeChange("manual")}
            className={`p-4 rounded-xl border text-left transition ${
              engineMode === "manual"
                ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                : "border-border bg-surface-2 hover:bg-surface-3"
            }`}
          >
            <div className="flex items-center gap-2 font-medium text-sm text-foreground">
              <RefreshCw className="w-4 h-4 text-primary" />
              <span>Manual Only</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Only runs when you explicitly click "Sync" or "Analyze" in the UI.
            </p>
          </button>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground">Trigger manual check across all repos</span>
          <button
            onClick={() => syncAllMutation.mutate()}
            disabled={syncAllMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface-2 text-xs font-medium hover:bg-surface-3 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncAllMutation.isPending ? "animate-spin" : ""}`} />
            <span>Check Commits &amp; Sync All</span>
          </button>
        </div>
      </section>

      {/* Free LLM Provider & Quota Tracking */}
      <section className="rounded-2xl border border-border bg-surface-1 p-6 space-y-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            <h2 className="text-base font-semibold">AI Model &amp; Free Tier Providers</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            AutoScribe supports 100% free providers (Groq, Gemini, Ollama) with smart daily rate-limit management.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            onClick={() => setSelectedProvider("groq")}
            className={`p-4 rounded-xl border cursor-pointer transition ${
              selectedProvider === "groq"
                ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                : "border-border bg-surface-2 hover:bg-surface-3"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">Groq (Llama 3.3 70B)</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-success/15 text-success font-medium">100% Free &amp; Fast</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Ultra-fast inference powered by Groq LPU. Handles architecture diagrams and living docs in seconds.
            </p>
          </div>

          <div
            onClick={() => setSelectedProvider("gemini")}
            className={`p-4 rounded-xl border cursor-pointer transition ${
              selectedProvider === "gemini"
                ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                : "border-border bg-surface-2 hover:bg-surface-3"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">Google Gemini 2.0 Flash</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-success/15 text-success font-medium">Free Tier</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Generous free tier with large context window for comprehensive codebase analysis.
            </p>
          </div>

          <div
            onClick={() => setSelectedProvider("ollama")}
            className={`p-4 rounded-xl border cursor-pointer transition ${
              selectedProvider === "ollama"
                ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                : "border-border bg-surface-2 hover:bg-surface-3"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">Ollama (Local Offline)</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-primary/15 text-primary font-medium">Zero Cost / Private</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Runs directly on your machine via localhost:11434. Unlimited tokens, no cloud transmission.
            </p>
          </div>

          <div
            onClick={() => setSelectedProvider("openai")}
            className={`p-4 rounded-xl border cursor-pointer transition ${
              selectedProvider === "openai"
                ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                : "border-border bg-surface-2 hover:bg-surface-3"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">OpenAI (GPT-4o-mini)</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground font-medium">Standard</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              High precision analysis with standard OpenAI API key.
            </p>
          </div>
        </div>

        {/* Real Token Consumption Gauge */}
        <div className="p-4 rounded-xl bg-surface-2 border border-border space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">Real-Time Daily Token Meter</span>
            <span className="text-muted-foreground tabular-nums">
              <strong>{stats.tokensToday.toLocaleString()}</strong> / {stats.dailyLimit.toLocaleString()} tokens
            </span>
          </div>
          <div className="w-full bg-surface-3 h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                tokenPercent > 90 ? "bg-destructive" : tokenPercent > 70 ? "bg-amber-400" : "bg-primary"
              }`}
              style={{ width: `${tokenPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{tokenPercent}% daily capacity used · All-time: {stats.tokensTotal.toLocaleString()} tokens</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Resets daily at 00:00 UTC</span>
          </div>
        </div>
      </section>

      {/* Connected Repositories Quick Settings */}
      <section className="rounded-2xl border border-border bg-surface-1 p-6 space-y-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Github className="w-4 h-4" />
            <h2 className="text-base font-semibold">Connected Repositories ({repos.length})</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Per-repository autonomous generation switches and pull request behavior.
          </p>
        </div>

        {repos.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
            No repositories connected yet. Connect a repository from the top navigation to begin.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {repos.map((r) => (
              <div key={r.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{r.org}/{r.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                    <span>Branch: {r.branch}</span>
                    <span>·</span>
                    <span>Status: {r.status}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="inline-flex items-center gap-1 text-xs text-success bg-success/10 border border-success/20 px-2 py-0.5 rounded-full">
                    <Check className="w-3 h-3" /> Autonomous Sync Active
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
