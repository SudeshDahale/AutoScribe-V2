// Mock activity logs used by the Documents log and PR activity pages.
// `agoSec` is seconds-before-page-load so timestamps can tick live in the UI.

export type DocEvent = {
  id: string;
  title: string;
  repo: string;
  kind: "README" | "API Reference" | "Architecture" | "Onboarding" | "Changelog" | "Module Guide";
  trigger: string;
  status: "generated" | "updated" | "generating" | "failed";
  words: number;
  model: string;
  agoSec: number;
};

export type PrEvent = {
  id: string;
  number: number;
  title: string;
  repo: string;
  branch: string;
  author: string;
  status: "open" | "merged" | "closed" | "review" | "draft";
  additions: number;
  deletions: number;
  files: number;
  checks: "passing" | "running" | "failing";
  agoSec: number;
};

export const docEvents: DocEvent[] = [
  { id: "d1", title: "Refund API reference", repo: "ecommerce-platform", kind: "API Reference", trigger: "commit 3f2a1b9", status: "generating", words: 0, model: "autoscribe-v2", agoSec: 12 },
  { id: "d2", title: "Payment module guide", repo: "ecommerce-platform", kind: "Module Guide", trigger: "commit 3f2a1b9", status: "updated", words: 1840, model: "autoscribe-v2", agoSec: 190 },
  { id: "d3", title: "Auth flow (JWT → OAuth2)", repo: "payment-service", kind: "Architecture", trigger: "change detection", status: "generated", words: 2210, model: "autoscribe-v2", agoSec: 1500 },
  { id: "d4", title: "README sync — checkout", repo: "user-service", kind: "README", trigger: "manual run", status: "generated", words: 620, model: "autoscribe-v2", agoSec: 3600 },
  { id: "d5", title: "Service onboarding guide", repo: "inventory-service", kind: "Onboarding", trigger: "scheduled", status: "generated", words: 1490, model: "autoscribe-v2", agoSec: 9400 },
  { id: "d6", title: "Analytics changelog", repo: "analytics-dashboard", kind: "Changelog", trigger: "commit b71d0aa", status: "failed", words: 0, model: "autoscribe-v2", agoSec: 21600 },
  { id: "d7", title: "Event bus architecture", repo: "order-service", kind: "Architecture", trigger: "commit f04ab12", status: "generated", words: 3050, model: "autoscribe-v2", agoSec: 90000 },
  { id: "d8", title: "Environment variables", repo: "ecommerce-platform", kind: "README", trigger: "manual run", status: "generated", words: 410, model: "autoscribe-v2", agoSec: 176400 },
];

export const prEvents: PrEvent[] = [
  { id: "p1", number: 412, title: "docs: sync refund API reference", repo: "ecommerce-platform", branch: "autoscribe/refund-docs", author: "autoscribe[bot]", status: "review", additions: 214, deletions: 12, files: 4, checks: "running", agoSec: 45 },
  { id: "p2", number: 411, title: "docs: payment module guide refresh", repo: "ecommerce-platform", branch: "autoscribe/payment-guide", author: "autoscribe[bot]", status: "open", additions: 96, deletions: 30, files: 2, checks: "passing", agoSec: 900 },
  { id: "p3", number: 88, title: "docs: OAuth2 migration notes", repo: "payment-service", branch: "autoscribe/oauth2", author: "autoscribe[bot]", status: "merged", additions: 340, deletions: 118, files: 7, checks: "passing", agoSec: 4200 },
  { id: "p4", number: 87, title: "chore: regenerate architecture map", repo: "payment-service", branch: "autoscribe/arch-map", author: "john-doe", status: "merged", additions: 58, deletions: 58, files: 1, checks: "passing", agoSec: 12000 },
  { id: "p5", number: 231, title: "docs: README sync with checkout", repo: "user-service", branch: "autoscribe/readme-sync", author: "autoscribe[bot]", status: "open", additions: 74, deletions: 9, files: 3, checks: "failing", agoSec: 26000 },
  { id: "p6", number: 230, title: "docs: drop stale session docs", repo: "user-service", branch: "autoscribe/cleanup", author: "maya-k", status: "closed", additions: 0, deletions: 220, files: 5, checks: "passing", agoSec: 88000 },
  { id: "p7", number: 19, title: "docs: inventory onboarding guide", repo: "inventory-service", branch: "autoscribe/onboarding", author: "autoscribe[bot]", status: "draft", additions: 180, deletions: 0, files: 2, checks: "running", agoSec: 150000 },
];

export function formatAgo(sec: number) {
  if (sec < 5) return "just now";
  if (sec < 60) return `${Math.floor(sec)}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}
