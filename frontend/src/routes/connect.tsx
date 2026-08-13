import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useRepos } from "@/lib/repo-store";
import { ArrowLeft, ArrowRight, Github, Lock, Globe, Check, Search, Loader2 } from "lucide-react";

export const Route = createFileRoute("/connect")({
  head: () => ({
    meta: [
      { title: "Connect Repository · AutoScribe" },
      { name: "description", content: "Choose a repository from your GitHub account for AutoScribe to track and document." },
      { property: "og:title", content: "Connect Repository · AutoScribe" },
      { property: "og:description", content: "Select a repository to analyze with AutoScribe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Connect,
});

function Connect() {
  const navigate = useNavigate();
  const { availableRepos, githubHandle, connect } = useRepos();
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [starting, setStarting] = useState(false);

  const filtered = useMemo(
    () => availableRepos.filter((r) => r.name.toLowerCase().includes(query.toLowerCase())),
    [availableRepos, query],
  );

  const start = async () => {
    if (!selected) return;
    const repo = availableRepos.find((r) => r.id === selected);
    if (!repo) return;
    setStarting(true);
    const created = await connect(repo);
    navigate({ to: "/analyzing", search: { repo: created.id } });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-[520px]">
        <Link to="/auth" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </Link>

        <ol className="mt-6 flex items-center gap-2 text-[11px]">
          {[
            { n: 1, label: "Account", done: true },
            { n: 2, label: "GitHub", done: true },
            { n: 3, label: "Select repo", done: false, current: true },
            { n: 4, label: "Analyze", done: false },
          ].map((s, i, arr) => (
            <li key={s.n} className="flex items-center gap-2 flex-1">
              <span
                className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-medium ${
                  s.done
                    ? "bg-success/15 text-success border border-success/30"
                    : s.current
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-2 text-muted-foreground border border-border"
                }`}
              >
                {s.done ? <Check className="w-3 h-3" /> : s.n}
              </span>
              <span className={s.current ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
              {i < arr.length - 1 && <span className="flex-1 h-px bg-border" />}
            </li>
          ))}
        </ol>

        <div className="mt-8 flex items-center gap-2 text-[12px] text-muted-foreground">
          <Check className="w-3.5 h-3.5 text-success" /> Connected as <span className="text-foreground">@{githubHandle ?? "…"}</span>
        </div>

        <h1 className="mt-2 text-[24px] tracking-tight font-semibold">Select a repository</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Choose one repository. You can connect more later.</p>

        <div className="relative mt-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search repositories…"
            className="w-full h-9 pl-8 pr-3 rounded-md bg-surface-1 border border-border text-[13px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="mt-3 rounded-md border border-border bg-surface-1 divide-y divide-border max-h-[360px] overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-[13px] text-muted-foreground">No matches.</div>
          )}
          {filtered.map((r) => {
            const active = selected === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setSelected(r.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${
                  active ? "bg-surface-2" : "hover:bg-surface-2/60"
                }`}
              >
                <Github className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] flex items-center gap-1.5">
                    <span className="text-muted-foreground">{r.org}/</span>
                    <span className="font-medium">{r.name}</span>
                    {r.private ? (
                      <Lock className="w-3 h-3 text-muted-foreground" />
                    ) : (
                      <Globe className="w-3 h-3 text-muted-foreground" />
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {r.language} · Updated {r.updated}
                  </div>
                </div>
                <span
                  className={`w-4 h-4 rounded-full border transition ${
                    active ? "border-primary bg-primary" : "border-border"
                  }`}
                >
                  {active && <Check className="w-3 h-3 text-primary-foreground m-0.5" />}
                </span>
              </button>
            );
          })}
        </div>

        <button
          disabled={!selected || starting}
          onClick={start}
          className="mt-5 w-full inline-flex items-center justify-center gap-2 h-10 rounded-lg bg-primary text-primary-foreground text-[13px] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-95 transition"
        >
          {starting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Starting analysis…
            </>
          ) : (
            <>
              Analyze repository <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        <p className="mt-3 text-[11px] text-muted-foreground text-center">
          Analysis takes ~30 seconds. You can leave this page — we'll continue in the background.
        </p>
      </div>
    </div>
  );
}