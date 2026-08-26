import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  User as UserIcon,
  Zap,
  PauseCircle,
  PlayCircle,
  Shield,
  Clock,
  Sparkles,
  LogOut,
  Settings as SettingsIcon,
  ChevronDown,
  FolderGit2,
  CheckCircle2,
  AlertCircle,
  Bot,
} from "lucide-react";

type ProfileData = {
  user: {
    id: number;
    email: string;
    githubLogin: string | null;
    avatarUrl: string | null;
    createdAt: string | null;
  };
  stats: {
    connectedRepos: number;
    tokensTotal: number;
    tokensToday: number;
    dailyLimit: number;
    breakdown: Record<string, number>;
  };
  engine: {
    mode: "active" | "paused" | "manual";
    isAvailable: boolean;
    isPaused: boolean;
    pauseReason?: string;
    cooldownUntil?: string;
    resetsIn?: string;
    dailyLimit: number;
  };
  provider: {
    name: string;
    model: string;
    isFree: boolean;
  };
};

export function UserProfileDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: profile } = useQuery<ProfileData>({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const res = await fetch("/api/auth/profile");
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json();
    },
    refetchInterval: 10000,
  });

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
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/auth/logout", { method: "POST" });
    },
    onSuccess: () => {
      window.location.href = "/auth";
    },
  });

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const user = profile?.user;
  const stats = profile?.stats ?? { tokensToday: 0, dailyLimit: 250_000, connectedRepos: 0 };
  const engine = profile?.engine ?? { mode: "active", isPaused: false };
  const provider = profile?.provider ?? { name: "groq", isFree: true, model: "llama-3.3-70b-versatile" };

  const tokenPercent = Math.min(Math.round((stats.tokensToday / (stats.dailyLimit || 250_000)) * 100), 100);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 pl-1.5 pr-2 rounded-full border border-border bg-surface-1 hover:bg-surface-2 transition group"
        aria-label="User Profile Menu"
      >
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.githubLogin || "User Avatar"}
            className="w-6 h-6 rounded-full object-cover border border-border"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-semibold">
            {user?.githubLogin ? user.githubLogin.slice(0, 2).toUpperCase() : "JD"}
          </div>
        )}
        <span className="text-[12px] font-medium text-foreground max-w-[90px] truncate hidden sm:inline">
          {user?.githubLogin || "Account"}
        </span>
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            engine.isPaused
              ? "bg-amber-400 animate-pulse"
              : engine.mode === "active"
              ? "bg-success"
              : "bg-muted-foreground"
          }`}
          title={`Autonomous Engine: ${engine.mode}`}
        />
        <ChevronDown className="w-3 h-3 text-muted-foreground group-hover:text-foreground transition shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-border bg-surface-1/95 backdrop-blur-xl shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150 text-left">
          {/* Header */}
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="w-10 h-10 rounded-full border border-border"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold">
                {user?.githubLogin ? user.githubLogin.slice(0, 2).toUpperCase() : "JD"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-foreground truncate">
                {user?.githubLogin ? `@${user.githubLogin}` : "Connected Developer"}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">{user?.email || "GitHub Authorized"}</div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
              {provider.isFree ? "Free Quota" : "Pro"}
            </span>
          </div>

          {/* Autonomous Engine Control */}
          <div className="my-3 p-3 rounded-xl bg-surface-2/60 border border-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Autonomous Engine</span>
              </div>
              <span
                className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  engine.isPaused
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : engine.mode === "active"
                    ? "bg-success/20 text-success border border-success/30"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {engine.isPaused ? "Paused" : engine.mode}
              </span>
            </div>

            {engine.isPaused ? (
              <div className="text-[11px] text-amber-400/90 mb-2 flex items-center gap-1">
                <Clock className="w-3 h-3 shrink-0" />
                <span>Rate limit cooldown · Auto-resumes in {engine.resetsIn || "a bit"}</span>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground mb-2">
                {engine.mode === "active"
                  ? "Watching connected repositories for commits & generating docs."
                  : "Manual sync only · Automatic commit tracking paused."}
              </p>
            )}

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => toggleEngineMutation.mutate("active")}
                disabled={engine.mode === "active" && !engine.isPaused}
                className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-medium transition flex items-center justify-center gap-1 ${
                  engine.mode === "active" && !engine.isPaused
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "bg-surface-3 hover:bg-surface-3/80 text-foreground"
                }`}
              >
                <PlayCircle className="w-3 h-3" /> Active
              </button>
              <button
                onClick={() => toggleEngineMutation.mutate("paused")}
                disabled={engine.mode === "paused"}
                className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-medium transition flex items-center justify-center gap-1 ${
                  engine.mode === "paused"
                    ? "bg-amber-500 text-black font-semibold shadow-xs"
                    : "bg-surface-3 hover:bg-surface-3/80 text-foreground"
                }`}
              >
                <PauseCircle className="w-3 h-3" /> Pause
              </button>
            </div>
          </div>

          {/* Real Token Usage KPI */}
          <div className="mb-3 p-3 rounded-xl bg-surface-2/40 border border-border">
            <div className="flex items-center justify-between text-[11.5px] mb-1.5">
              <span className="text-muted-foreground">Daily Free Quota</span>
              <span className="font-semibold text-foreground tabular-nums">
                {stats.tokensToday.toLocaleString()} / {stats.dailyLimit.toLocaleString()} tokens
              </span>
            </div>
            <div className="w-full bg-surface-3 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  tokenPercent > 90 ? "bg-destructive" : tokenPercent > 70 ? "bg-amber-400" : "bg-primary"
                }`}
                style={{ width: `${tokenPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1.5">
              <span>{tokenPercent}% consumed</span>
              <span>Resets at UTC midnight</span>
            </div>
          </div>

          {/* Provider and Quick Links */}
          <div className="space-y-1 pt-1 border-t border-border">
            <Link
              to="/settings"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12.5px] text-foreground hover:bg-surface-2 transition"
            >
              <SettingsIcon className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Engine &amp; Model Settings</span>
            </Link>
            <Link
              to="/repositories"
              search={{ add: undefined }}
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12.5px] text-foreground hover:bg-surface-2 transition"
            >
              <FolderGit2 className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Manage Connected Repos ({stats.connectedRepos})</span>
            </Link>
            <button
              onClick={() => logoutMutation.mutate()}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12.5px] text-destructive hover:bg-destructive/10 transition text-left"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
