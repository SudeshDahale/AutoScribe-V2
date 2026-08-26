export type Repo = {
  id: string;
  githubRepoId?: string;
  name: string;
  org: string;
  private: boolean;
  updated: string;
  language: string;
  branch: string;
  understandingScore: number;
  docsCount: number;
  openPRs: number;
  status: "synced" | "pending" | "analyzing";
  lastActivity: string;
};

export const repositories: Repo[] = [
  { id: "ecommerce-platform", name: "ecommerce-platform", org: "acme", private: true, updated: "2 days ago", language: "TypeScript", branch: "main", understandingScore: 92, docsCount: 47, openPRs: 2, status: "synced", lastActivity: "Updated payment docs · 3 min ago" },
  { id: "payment-service", name: "payment-service", org: "acme", private: true, updated: "5 days ago", language: "Python", branch: "main", understandingScore: 88, docsCount: 32, openPRs: 1, status: "pending", lastActivity: "Refund module changed · 12 min ago" },
  { id: "analytics-dashboard", name: "analytics-dashboard", org: "acme", private: false, updated: "1 day ago", language: "TypeScript", branch: "develop", understandingScore: 76, docsCount: 21, openPRs: 0, status: "analyzing", lastActivity: "Re-indexing after refactor · now" },
  { id: "inventory-service", name: "inventory-service", org: "acme", private: true, updated: "3 days ago", language: "Go", branch: "main", understandingScore: 95, docsCount: 28, openPRs: 0, status: "synced", lastActivity: "All docs up to date · 1 h ago" },
  { id: "user-service", name: "user-service", org: "acme", private: true, updated: "1 day ago", language: "Python", branch: "main", understandingScore: 84, docsCount: 19, openPRs: 3, status: "pending", lastActivity: "3 open PRs for docs review" },
];

export const globalActivity = [
  { repo: "ecommerce-platform", text: "Updated payment documentation", time: "3 min ago", type: "doc" as const },
  { repo: "analytics-dashboard", text: "Started re-indexing after refactor", time: "12 min ago", type: "scan" as const },
  { repo: "payment-service", text: "Detected auth change (JWT → OAuth2)", time: "25 min ago", type: "detect" as const },
  { repo: "user-service", text: "Opened PR: sync README with checkout", time: "1 h ago", type: "pr" as const },
  { repo: "inventory-service", text: "Rebuilt architecture graph", time: "yesterday", type: "arch" as const },
  { repo: "ecommerce-platform", text: "Generated API reference for refund system", time: "yesterday", type: "doc" as const },
];

export const tokenUsage = {
  plan: "Free" as "Free" | "Pro" | "Team",
  used: 128_400,
  limit: 250_000,
  resetsIn: "18h 42m",
};

export const activeRepo = {
  name: "E-Commerce Platform",
  slug: "ecommerce-platform",
  branch: "main",
  understandingScore: 92,
  filesAnalyzed: 2487,
  modulesDetected: 156,
  externalServices: 32,
  docsSync: 98,
  techStack: ["React", "FastAPI", "PostgreSQL", "Redis"],
  architectureStyle: ["Microservices", "API-First", "Event Driven"],
  lastCommit: {
    message: "Added refund system",
    impact: "Medium",
    files: 3,
    author: "John Doe",
    sha: "3f2a1b9",
    time: "2 minutes ago",
  },
};

export const aiActivity = [
  { icon: "check", text: "Updated payment documentation", commit: "3f2a1b9", time: "3 min ago", status: "done" },
  { icon: "check", text: "Detected authentication change (JWT → OAuth2)", commit: "a91c4e2", time: "25 min ago", status: "done" },
  { icon: "check", text: "Generated API reference for refund system", commit: "3f2a1b9", time: "1 hour ago", status: "done" },
  { icon: "check", text: "Synchronized README with checkout module", commit: "b71d0aa", time: "3 hours ago", status: "done" },
  { icon: "check", text: "Rebuilt architecture graph after service split", commit: "f04ab12", time: "yesterday", status: "done" },
];

export const modules = [
  { name: "Authentication", desc: "Handles user login, JWT, sessions", icon: "shield" },
  { name: "Payment", desc: "Handles payments, refunds, invoices", icon: "credit-card" },
  { name: "Orders", desc: "Manages orders and lifecycle", icon: "package" },
  { name: "Users", desc: "User profile and preferences", icon: "users" },
  { name: "Notifications", desc: "Email, push, in-app messaging", icon: "bell" },
  { name: "Inventory", desc: "Stock tracking and warehouse sync", icon: "boxes" },
];

export const architectureNodes = [
  { id: "frontend", label: "React Frontend", type: "client", files: 412, deps: ["React", "TanStack", "Tailwind"] },
  { id: "gateway", label: "API Gateway", type: "gateway", files: 87, deps: ["FastAPI", "JWT"] },
  { id: "user", label: "User Service", type: "service", files: 143, deps: ["FastAPI", "PostgreSQL"] },
  { id: "order", label: "Order Service", type: "service", files: 198, deps: ["FastAPI", "PostgreSQL", "Kafka"] },
  { id: "payment", label: "Payment Service", type: "service", files: 176, deps: ["FastAPI", "Stripe API"] },
  { id: "db", label: "PostgreSQL", type: "data", files: 24, deps: ["Migrations", "Prisma"] },
  { id: "cache", label: "Redis Cache", type: "data", files: 12, deps: ["ioredis"] },
];

export const suggestedQuestions = [
  "Where is authentication implemented?",
  "Explain the checkout flow",
  "Show payment architecture",
  "Where is JWT verified?",
  "How do refunds work?",
  "Which services depend on Redis?",
];

export const conversation = [
  {
    role: "user" as const,
    text: "How does authentication work in this project?",
  },
  {
    role: "assistant" as const,
    text: "Authentication in this project uses JWT tokens with refresh token rotation. Requests begin on the client at **LoginPage.tsx**, which posts credentials to **AuthController.py** in the API gateway. Tokens are minted by **JWTService.py** and users are looked up in **UserDatabase**. Refresh happens silently via httpOnly cookies.",
    flow: [
      { label: "LoginPage.tsx", meta: "React" },
      { label: "AuthController.py", meta: "FastAPI" },
      { label: "JWTService.py", meta: "Generate Token" },
      { label: "UserDatabase", meta: "PostgreSQL" },
    ],
    files: [
      { name: "login.tsx", path: "src/pages" },
      { name: "auth_controller.py", path: "app/controllers" },
      { name: "jwt_service.py", path: "app/services" },
      { name: "user_model.py", path: "app/models" },
      { name: "auth_routes.py", path: "app/api" },
    ],
    followups: [
      "How are refresh tokens rotated?",
      "Where is role-based access enforced?",
      "How is 2FA integrated?",
    ],
  },
];

export const docsNav = [
  { section: "Getting Started", items: ["README", "Quick Start", "Environment Variables", "Deployment"] },
  { section: "Reference", items: ["API Docs", "Modules", "Architecture", "Developer Guide"] },
];

export const readme = {
  title: "E-Commerce Platform",
  tagline: "A modern e-commerce platform built with React, FastAPI, and PostgreSQL.",
  features: [
    "User authentication with OAuth2",
    "Product browsing and search",
    "Shopping cart and checkout",
    "Payment processing with refunds",
    "Order management and tracking",
    "Realtime inventory sync",
  ],
  status: "Synced with code",
  updated: "2 minutes ago",
};

export const commitStream = {
  message: "Added refund feature",
  author: "John Doe",
  branch: "main",
  time: "2 minutes ago",
  changedFiles: [
    { name: "refund_service.py", path: "app/services", added: 120, removed: 10 },
    { name: "payment_controller.py", path: "app/controllers", added: 45, removed: 5 },
  ],
  analysis: [
    "New functionality detected",
    "Impact analysis completed",
    "Documentation updates prepared",
  ],
  impact: "Payment Module — Documentation update required",
};
