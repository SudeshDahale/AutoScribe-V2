import { createFileRoute } from "@tanstack/react-router";
import { Github, Check } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({
    meta: [
      { title: "Settings · AutoScribe" },
      { name: "description", content: "Configure how AutoScribe monitors your repository, generates documentation and opens pull requests." },
      { property: "og:title", content: "Settings · AutoScribe" },
      { property: "og:description", content: "Configure AutoScribe for your team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Settings,
});

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-12 gap-6 py-6 border-b border-border last:border-0">
      <div className="col-span-4">
        <div className="text-sm font-medium">{label}</div>
        {desc && <div className="text-xs text-muted-foreground mt-1">{desc}</div>}
      </div>
      <div className="col-span-8">{children}</div>
    </div>
  );
}

function Select({ options, value }: { options: string[]; value: string }) {
  return (
    <select
      defaultValue={value}
      className="px-3.5 py-2.5 rounded-lg bg-surface-2 border border-border text-sm min-w-[240px] focus:outline-none focus:ring-1 focus:ring-primary/40"
    >
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
}

function Settings() {
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-3xl tracking-tight font-medium">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">Configure how AutoScribe works with your repository</p>
      </div>

      <div className="rounded-2xl border border-border bg-surface-1 px-6">
        <Row label="Repository" desc="Source AutoScribe reads from">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-surface-2 border border-border text-sm">
              <Github className="w-4 h-4" /> acme/ecommerce-platform
            </div>
            <span className="inline-flex items-center gap-1 text-xs text-success"><Check className="w-3 h-3" /> Connected</span>
          </div>
        </Row>
        <Row label="Auto Update" desc="Update docs automatically on every push">
          <Toggle defaultOn />
        </Row>
        {/* Documentation style moved to Documentation → Customize */}
        <Row label="AI Model" desc="Model powering understanding and answers">
          <Select value="AutoScribe Pro" options={["AutoScribe Pro", "AutoScribe Lite", "Custom"]} />
        </Row>
        <Row label="Pull Request Behavior" desc="How updates land in your repo">
          <Select value="Open PR for review" options={["Open PR for review", "Commit to main", "Draft only"]} />
        </Row>
      </div>
    </div>
  );
}

function Toggle({ defaultOn = false }: { defaultOn?: boolean }) {
  return (
    <label className="inline-flex items-center gap-3 cursor-pointer">
      <span className="relative inline-flex h-6 w-11 rounded-full bg-surface-3 border border-border">
        <input type="checkbox" defaultChecked={defaultOn} className="peer sr-only" />
        <span className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-muted-foreground/70 transition peer-checked:translate-x-5 peer-checked:bg-primary" />
      </span>
      <span className="text-xs text-muted-foreground">Enabled</span>
    </label>
  );
}
