import {
  Monitor,
  Shield,
  Users,
  ShoppingCart,
  CreditCard,
  Database,
  Zap,
  Bell,
  Server,
} from "lucide-react";

export type GraphNodeType = "client" | "gateway" | "service" | "data";

export type GraphNode = {
  id: string;
  label: string;
  short: string;
  type: GraphNodeType;
  tech: string[];
  files: number;
  purpose: string;
  doing: string;
  health: "healthy" | "attention" | "analyzing";
  /** Layout coordinates in the 1000 x 560 diagram space (node centre). */
  x: number;
  y: number;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

export type GraphEdge = {
  from: string;
  to: string;
  label: string;
  /** Relative traffic 0–1, drives particle speed + density. */
  traffic: number;
  kind: "sync" | "async" | "read";
};

export const graphLayers: { id: string; title: string; x: number }[] = [
  { id: "client", title: "Client", x: 110 },
  { id: "edge", title: "Edge", x: 350 },
  { id: "services", title: "Services", x: 620 },
  { id: "data", title: "Data", x: 890 },
];

export const graphNodes: GraphNode[] = [
  {
    id: "fe",
    label: "React Frontend",
    short: "Frontend",
    type: "client",
    tech: ["React", "TanStack Router", "Tailwind"],
    files: 412,
    purpose: "Renders the customer storefront and the admin dashboard.",
    doing: "Sends authenticated requests to the gateway and streams server data.",
    health: "healthy",
    x: 110,
    y: 280,
    icon: Monitor,
  },
  {
    id: "gw",
    label: "API Gateway",
    short: "Gateway",
    type: "gateway",
    tech: ["FastAPI", "JWT"],
    files: 87,
    purpose: "Authenticates traffic and routes requests to internal services.",
    doing: "Verifies JWTs, applies rate limits, then forwards to the right service.",
    health: "healthy",
    x: 350,
    y: 280,
    icon: Shield,
  },
  {
    id: "user",
    label: "User Service",
    short: "Users",
    type: "service",
    tech: ["FastAPI", "PostgreSQL"],
    files: 143,
    purpose: "Owns identity, profiles and preferences.",
    doing: "Creates accounts, manages profiles and serves user lookups.",
    health: "healthy",
    x: 620,
    y: 110,
    icon: Users,
  },
  {
    id: "order",
    label: "Order Service",
    short: "Orders",
    type: "service",
    tech: ["FastAPI", "Kafka"],
    files: 198,
    purpose: "Manages orders, checkout state and lifecycle events.",
    doing: "Tracks checkout, emits order events and coordinates fulfilment.",
    health: "analyzing",
    x: 620,
    y: 280,
    icon: ShoppingCart,
  },
  {
    id: "payment",
    label: "Payment Service",
    short: "Payments",
    type: "service",
    tech: ["FastAPI", "Stripe"],
    files: 176,
    purpose: "Handles payments, refunds and invoices.",
    doing: "Charges cards through Stripe and reconciles refunds back to orders.",
    health: "attention",
    x: 620,
    y: 450,
    icon: CreditCard,
  },
  {
    id: "notify",
    label: "Notifications",
    short: "Notify",
    type: "service",
    tech: ["Node", "Kafka"],
    files: 64,
    purpose: "Email, push and in-app messaging fan-out.",
    doing: "Consumes order events and dispatches customer notifications.",
    health: "healthy",
    x: 890,
    y: 450,
    icon: Bell,
  },
  {
    id: "db",
    label: "PostgreSQL",
    short: "Postgres",
    type: "data",
    tech: ["Migrations", "SQLAlchemy"],
    files: 24,
    purpose: "Primary relational store shared by the domain services.",
    doing: "Persists users, orders and payment records with versioned migrations.",
    health: "healthy",
    x: 890,
    y: 190,
    icon: Database,
  },
  {
    id: "cache",
    label: "Redis Cache",
    short: "Redis",
    type: "data",
    tech: ["ioredis"],
    files: 12,
    purpose: "Session store and hot-path cache.",
    doing: "Caches sessions and hot reads to keep p95 latency low.",
    health: "healthy",
    x: 890,
    y: 320,
    icon: Zap,
  },
];

export const graphEdges: GraphEdge[] = [
  { from: "fe", to: "gw", label: "HTTPS · REST", traffic: 1, kind: "sync" },
  { from: "gw", to: "user", label: "auth + profile", traffic: 0.7, kind: "sync" },
  { from: "gw", to: "order", label: "checkout", traffic: 0.9, kind: "sync" },
  { from: "gw", to: "payment", label: "charge / refund", traffic: 0.6, kind: "sync" },
  { from: "user", to: "db", label: "SQL", traffic: 0.6, kind: "read" },
  { from: "order", to: "db", label: "SQL", traffic: 0.8, kind: "read" },
  { from: "payment", to: "db", label: "SQL", traffic: 0.5, kind: "read" },
  { from: "gw", to: "cache", label: "sessions", traffic: 0.85, kind: "read" },
  { from: "order", to: "notify", label: "events", traffic: 0.45, kind: "async" },
];

export const nodeById = (id: string) => graphNodes.find((n) => n.id === id)!;

export const typeAccent: Record<GraphNodeType, string> = {
  client: "var(--chart-5)",
  gateway: "var(--chart-3)",
  service: "var(--chart-2)",
  data: "var(--chart-1)",
};

export const typeLabel: Record<GraphNodeType, string> = {
  client: "Client",
  gateway: "Edge",
  service: "Service",
  data: "Data store",
};

/* -------------------------------------------------------------------------- */
/* Multiple diagram views                                                     */
/* -------------------------------------------------------------------------- */

export type DiagramView = {
  id: string;
  name: string;
  description: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

const pick = (ids: string[]) => graphNodes.filter((n) => ids.includes(n.id));
const edgesBetween = (ids: string[]) =>
  graphEdges.filter((e) => ids.includes(e.from) && ids.includes(e.to));

/** Default diagram catalogue reused as a fallback for repos without a custom
 *  set. Each view intentionally trims the graph to tell one specific story. */
const buildDefaultViews = (): DiagramView[] => [
  {
    id: "system",
    name: "System overview",
    description: "Every service, gateway and datastore, with live traffic.",
    nodes: graphNodes,
    edges: graphEdges,
  },
  {
    id: "request",
    name: "Request flow",
    description: "How an authenticated user request travels through the stack.",
    nodes: pick(["fe", "gw", "user", "order", "payment"]),
    edges: edgesBetween(["fe", "gw", "user", "order", "payment"]),
  },
  {
    id: "data",
    name: "Data plane",
    description: "Which services read and write which stores.",
    nodes: pick(["user", "order", "payment", "db", "cache"]),
    edges: edgesBetween(["user", "order", "payment", "db", "cache"]),
  },
  {
    id: "events",
    name: "Event pipeline",
    description: "Asynchronous events flowing to downstream consumers.",
    nodes: pick(["order", "payment", "notify"]),
    edges: [
      { from: "order", to: "notify", label: "events", traffic: 0.6, kind: "async" },
      { from: "payment", to: "notify", label: "receipts", traffic: 0.4, kind: "async" },
    ],
  },
];

/** Repo-scoped variants. Each entry is a fresh, focused catalogue so the
 *  Architecture surface tells a different story per repository. */
const REPO_VIEWS: Record<string, () => DiagramView[]> = {
  "ecommerce-platform": buildDefaultViews,
  "payment-service": () => [
    {
      id: "charge",
      name: "Charge flow",
      description: "Frontend → gateway → payment → Stripe adapter.",
      nodes: pick(["fe", "gw", "payment", "db"]),
      edges: [
        { from: "fe", to: "gw", label: "checkout", traffic: 0.9, kind: "sync" },
        { from: "gw", to: "payment", label: "charge", traffic: 0.8, kind: "sync" },
        { from: "payment", to: "db", label: "record", traffic: 0.5, kind: "read" },
      ],
    },
    {
      id: "refund",
      name: "Refund pipeline",
      description: "Refund events fan out to notifications and ledgers.",
      nodes: pick(["payment", "order", "notify", "db"]),
      edges: [
        { from: "payment", to: "order", label: "refund", traffic: 0.5, kind: "async" },
        { from: "payment", to: "db", label: "ledger", traffic: 0.4, kind: "read" },
        { from: "order", to: "notify", label: "notify", traffic: 0.35, kind: "async" },
      ],
    },
  ],
  "analytics-dashboard": () => [
    {
      id: "ingest",
      name: "Ingestion",
      description: "Frontend widgets pulling live metrics via the gateway.",
      nodes: pick(["fe", "gw", "order", "cache"]),
      edges: [
        { from: "fe", to: "gw", label: "queries", traffic: 1, kind: "sync" },
        { from: "gw", to: "cache", label: "hot reads", traffic: 0.9, kind: "read" },
        { from: "gw", to: "order", label: "reports", traffic: 0.5, kind: "sync" },
      ],
    },
    {
      id: "warehouse",
      name: "Warehouse",
      description: "Where dashboard aggregates are stored.",
      nodes: pick(["order", "db", "cache"]),
      edges: [
        { from: "order", to: "db", label: "aggregate", traffic: 0.6, kind: "read" },
        { from: "order", to: "cache", label: "materialize", traffic: 0.5, kind: "read" },
      ],
    },
  ],
  "inventory-service": () => [
    {
      id: "stock",
      name: "Stock sync",
      description: "Warehouse writes flowing into the inventory store.",
      nodes: pick(["gw", "order", "db", "cache"]),
      edges: [
        { from: "gw", to: "order", label: "reserve", traffic: 0.7, kind: "sync" },
        { from: "order", to: "db", label: "commit", traffic: 0.8, kind: "read" },
        { from: "order", to: "cache", label: "invalidate", traffic: 0.4, kind: "async" },
      ],
    },
  ],
  "user-service": () => [
    {
      id: "auth",
      name: "Auth flow",
      description: "Login, token issuance and profile lookup.",
      nodes: pick(["fe", "gw", "user", "db", "cache"]),
      edges: [
        { from: "fe", to: "gw", label: "login", traffic: 0.8, kind: "sync" },
        { from: "gw", to: "user", label: "authenticate", traffic: 0.7, kind: "sync" },
        { from: "user", to: "db", label: "profile", traffic: 0.6, kind: "read" },
        { from: "gw", to: "cache", label: "session", traffic: 0.9, kind: "read" },
      ],
    },
    {
      id: "profile",
      name: "Profile writes",
      description: "How preference updates land in the primary store.",
      nodes: pick(["fe", "gw", "user", "db"]),
      edges: [
        { from: "fe", to: "gw", label: "PATCH", traffic: 0.5, kind: "sync" },
        { from: "gw", to: "user", label: "update", traffic: 0.5, kind: "sync" },
        { from: "user", to: "db", label: "persist", traffic: 0.5, kind: "read" },
      ],
    },
  ],
};

export function getRepoDiagrams(repoId?: string | null): DiagramView[] {
  if (repoId && REPO_VIEWS[repoId]) return REPO_VIEWS[repoId]();
  return buildDefaultViews();
}

/* -------------------------------------------------------------------------- */
/* Real, backend-generated architecture (Sprint 5)                            */
/* -------------------------------------------------------------------------- */

/** Shape returned by GET /api/repos/:id/architecture — matches GraphNode /
 *  GraphEdge minus the client-only fields (x, y, icon component). */
export type ApiArchitectureNode = {
  id: string;
  label: string;
  short: string;
  type: GraphNodeType;
  tech: string[];
  files: number;
  purpose: string;
  doing: string;
  health: GraphNode["health"];
};

export type ApiArchitectureEdge = {
  from: string;
  to: string;
  label: string;
  traffic: number;
  kind: GraphEdge["kind"];
};

export type ApiArchitectureResponse = {
  nodes: ApiArchitectureNode[];
  edges: ApiArchitectureEdge[];
  modules: { name: string; description: string; icon: string }[];
  understandingScore: number;
  techStack: string[];
  architectureStyle: string[];
};

const COLUMN_X: Record<GraphNodeType, number> = {
  client: 110,
  gateway: 350,
  service: 620,
  data: 890,
};

/** Picks an icon by node type first, then by keyword match against the
 *  label/tech the LLM returned — the backend never sends a component, only
 *  data, so this is the "frontend lays it out" half of the pipeline. */
function iconForNode(n: Pick<ApiArchitectureNode, "type" | "label" | "tech">) {
  const hay = `${n.label} ${n.tech.join(" ")}`.toLowerCase();
  if (hay.includes("redis") || hay.includes("cache") || hay.includes("queue")) return Zap;
  if (hay.includes("postgres") || hay.includes("sql") || hay.includes("mongo") || n.type === "data") return Database;
  if (hay.includes("stripe") || hay.includes("payment") || hay.includes("billing")) return CreditCard;
  if (hay.includes("notif") || hay.includes("email") || hay.includes("mail") || hay.includes("sms")) return Bell;
  if (hay.includes("user") || hay.includes("account") || hay.includes("profile")) return Users;
  if (hay.includes("order") || hay.includes("cart") || hay.includes("checkout")) return ShoppingCart;
  if (hay.includes("auth") || hay.includes("jwt") || n.type === "gateway") return Shield;
  if (n.type === "client") return Monitor;
  return Server;
}

/** Lays real nodes out in columns by type, stacked and centred within each
 *  column — a plain layered layout, not anything the LLM decided. */
function layoutNodes(nodes: ApiArchitectureNode[]): GraphNode[] {
  const byType: Record<GraphNodeType, ApiArchitectureNode[]> = {
    client: [],
    gateway: [],
    service: [],
    data: [],
  };
  nodes.forEach((n) => byType[n.type]?.push(n));

  const rowHeight = 140;
  const positioned: GraphNode[] = [];
  (Object.keys(byType) as GraphNodeType[]).forEach((type) => {
    const group = byType[type];
    const startY = 280 - ((group.length - 1) * rowHeight) / 2;
    group.forEach((n, i) => {
      positioned.push({
        ...n,
        x: COLUMN_X[type],
        y: Math.max(80, startY + i * rowHeight),
        icon: iconForNode(n),
      });
    });
  });
  return positioned;
}

/** Converts a real API response into the same DiagramView[] shape the mock
 *  data produces. Returns [] when the repo hasn't been analyzed yet (or the
 *  analysis produced no nodes) so callers can fall back to getRepoDiagrams(). */
export function buildDiagramFromApi(data: ApiArchitectureResponse): DiagramView[] {
  if (!data.nodes.length) return [];
  return [
    {
      id: "system",
      name: "System overview",
      description: data.architectureStyle.length
        ? `${data.architectureStyle.join(", ")} · inferred from the real repository`
        : "Inferred from the real repository.",
      nodes: layoutNodes(data.nodes),
      edges: data.edges,
    },
  ];
}