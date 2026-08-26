# AutoScribe — Backend Implementation Plan (Build-Focused)

**Stack:** FastAPI (Python) · PostgreSQL (+ pgvector) · Real GitHub OAuth · Real LLM API

**Goal:** Replace every mock in `frontend/src/lib/mock-data.ts` and `repo-store.tsx` with a real backend, one working slice at a time.

Each sprint is a vertical slice — by the end of it, something that was fake in the UI becomes real. Don't skip ahead — later sprints assume earlier infrastructure exists.

---

## Sprint 0 — Backend skeleton & local dev loop

**You'll learn:** FastAPI app structure, uvicorn, dependency injection basics, environment config.

**Build:**
- `backend/` layout:
```
backend/
  app/
    main.py
    core/config.py         # pydantic-settings, reads .env
    db/session.py          # SQLAlchemy engine/session
    api/                   # routers, one file per resource
    models/                # SQLAlchemy models
    schemas/                # Pydantic request/response models
    services/               # business logic, external API clients
  alembic/
  pyproject.toml
  .env.example
```
- `GET /healthz` returning `{"status": "ok"}`
- CORS middleware allowing the Vite dev server origin
- Install PostgreSQL locally (native install, or a single `postgres` instance you already run) — no container orchestration needed for a solo project
- Wire the frontend's dev server to proxy `/api/*` to `http://localhost:8000` (Vite `server.proxy`), so the frontend never hardcodes a backend URL

**Definition of done:** Postgres is reachable locally; `uvicorn app.main:app --reload` runs; frontend at `/api/healthz` gets a 200 through the proxy.

**Go deeper:** FastAPI's own tutorial on "Bigger Applications" (routers) — it's the layout this plan uses.

---

## Sprint 1 — Data model & migrations

**You'll learn:** SQLAlchemy 2.0 ORM patterns, Alembic migrations, schema design for a multi-tenant app.

**Build:** Design and migrate these tables (start minimal, extend later):

| Table | Purpose |
|---|---|
| `users` | app account, linked GitHub identity |
| `github_accounts` | encrypted OAuth token, GitHub login/org |
| `repositories` | connected repos, status, branch, `understanding_score` |
| `repo_settings` | `auto_update`, `update_target` (main/branch/pr), `branch_name` |
| `analyses` | one row per analysis run, status, timestamps |
| `architecture_nodes` / `architecture_edges` | graph produced by analysis |
| `modules` | detected modules (name, desc, icon) |
| `documents` / `document_versions` | generated docs + version history |
| `pull_requests` | PRs AutoScribe opened |
| `chat_conversations` / `chat_messages` | Ask-page history |
| `activity_log` | the global activity feed |

Map each table back to a mock export in `mock-data.ts` (`repositories`, `architectureNodes`, `modules`, `readme`, `docsNav`, `conversation`, `globalActivity`, `tokenUsage`) — that mapping is your schema review.

**Definition of done:** `alembic upgrade head` builds the schema from empty; you can insert/query each table from a Python shell.

**Go deeper:** Alembic autogenerate + why you should still read every migration it writes.

---

## Sprint 2 — GitHub OAuth & sessions

**You'll learn:** OAuth2 Authorization Code flow end-to-end, secure cookie sessions vs JWTs, secret storage.

**Build:**
- Register a GitHub OAuth App
- `GET /api/auth/github/login` → redirect to GitHub's authorize URL with `state` (CSRF protection)
- `GET /api/auth/github/callback` → exchange code for access token, fetch the GitHub user, upsert `users` + `github_accounts`, encrypt the stored token (e.g. `cryptography.Fernet`), set an httpOnly session cookie
- `GET /api/auth/me` for the frontend to check session state
- `POST /api/auth/logout`
- Frontend wiring: `routes/auth.tsx` currently simulates this — swap its "Connect GitHub" button to hit `/api/auth/github/login`, and the connected-as `@johndoe` text in `connect.tsx` to read from `/api/auth/me`.

**Definition of done:** You can log in with your real GitHub account and land back on `/connect` with a real session cookie set.

**Go deeper:** Why you never trust a `state` parameter you didn't set yourself; httpOnly + SameSite cookie tradeoffs vs JWT-in-localStorage.

---

## Sprint 3 — List & connect real repositories

**You'll learn:** Calling a REST API from a backend service layer (httpx async client), pagination, rate-limit headers.

**Build:**
- `services/github.py`: `list_user_repos(token)` hitting `GET /user/repos` with pagination, mapped into the `GithubRepo` shape already defined in `repo-store.tsx`
- `GET /api/github/repos` — repos available to connect (replaces `availableGithubRepos`)
- `POST /api/repos` — connect a repo → insert into `repositories` + default `repo_settings`
- `GET /api/repos` — connected repos (replaces `repositories` mock and the store's `STORAGE_KEY` localStorage hack)
- `DELETE /api/repos/{id}` — disconnect
- Frontend wiring: `connect.tsx`'s repo list, and `repo-store.tsx`'s `connectedRepos` state — swap localStorage persistence for React Query hooks hitting these endpoints.

**Definition of done:** Selecting a real repo and clicking "Analyze" persists a row in Postgres, survives a server restart, and shows up on `/repositories`.

**Go deeper:** GitHub REST rate limits (5000/hr authenticated) and why you check `X-RateLimit-Remaining` rather than guessing.

---

## Sprint 4 — Background analysis pipeline (structural pass)

**You'll learn:** Background job processing, and why long-running work never belongs inside a request/response cycle.

**Build:**
- A background job runner for the analysis pipeline. For a solo/small project, skip Celery+Redis — use FastAPI's `BackgroundTasks` for a first pass, or a simple `asyncio`-based in-process worker with job status tracked directly on the `analyses` row (`pending → analyzing → synced/failed`). Only reach for a real queue (Celery/RQ + Redis) later if you actually hit its limits (need retries, multiple workers, or jobs that must survive a server restart).
- Given a `repository_id`:
  - Fetch the repo tree via GitHub's Git Trees API (no full clone needed)
  - Detect language mix by file extension, package manifests (`package.json`, `requirements.txt`, `go.mod`, …) for tech stack
  - Bucket top-level directories into naive "modules"
  - Write an `analyses` row with status transitions
- `POST /api/repos/{id}/analyze` kicks off the job
- `GET /api/repos/{id}/analysis` — poll for status/progress
- Frontend wiring: `routes/analyzing.tsx` currently fakes progress with `useLiveTick` — replace the fake timer with real polling of `/api/repos/{id}/analysis`, and the dashboard's status badge with the real value.

**Definition of done:** Clicking "Analyze" on a real repo runs the job in the background, and `analyzing.tsx`'s progress bar reflects real backend state, not a `setInterval`.

**Go deeper:** Why `BackgroundTasks` is fine to start but breaks down past toy examples (no retries, no visibility, dies with the request worker) — worth knowing before you decide whether/when to graduate to Celery/RQ + Redis.

---

## Sprint 5 — LLM-powered architecture graph & understanding score

**You'll learn:** Prompting an LLM for structured output (JSON schema / tool-calling), and designing a pipeline that's reproducible rather than a one-shot chat.

**Build:**
- `services/llm.py`: thin wrapper around your chosen LLM API client, with a `generate_structured(prompt, schema)` helper
- Pipeline step (runs after Sprint 4's structural pass): feed the LLM a compact representation of the repo (file tree + key manifest contents + a sample of entrypoint files) and ask it to return:
  - `architecture_nodes` / `architecture_edges` (matching the shape in `lib/architecture-graph.ts`)
  - `modules` with descriptions
  - `understanding_score` (0–100) and a short rationale
  - `tech_stack` and `architecture_style` tags
- Persist results; `GET /api/repos/{id}/architecture`
- Frontend wiring: `routes/_app.architecture.tsx` and `lib/architecture-graph.ts` — swap hardcoded `architectureNodes`/`graphLayers` for the API response. Keep layout/coordinate logic client-side — the backend returns graph structure, the frontend lays it out.

**Definition of done:** Analyzing two different real repos produces two visibly different architecture graphs and scores, not templated output.

**Go deeper:** Structured output via tool-calling/function-calling vs "please respond in JSON" prompting — the former is far more reliable and worth learning properly here since you'll reuse it in every later sprint.

---

## Sprint 6 — Documentation generation & version history

**You'll learn:** Content-generation pipelines, diffing, and treating LLM output as data with a lifecycle, not a one-off chat reply.

**Build:**
- Generate a README-equivalent (title, tagline, features) plus a couple of reference docs, from the same repo representation used in Sprint 5
- Every regeneration writes a new `document_versions` row instead of overwriting — this powers the Documents Log
- `GET /api/repos/{id}/documents`, `GET /api/repos/{id}/documents/{doc_id}/versions`
- Frontend wiring: `routes/_app.documentation.tsx` (`readme`, `docsNav`) and `routes/_app.documents-log.tsx` (version history) — both currently fully mocked.

**Definition of done:** Docs regenerate when you re-run analysis, and the Documents Log shows a real diff-able history, not a static list.

---

## Sprint 7 — RAG chat ("Ask")

**You'll learn:** Embeddings, similarity search, and the retrieve-then-generate pattern — the concept underneath most "chat with your code/docs" products. This version skips a vector database entirely: embeddings are just JSON arrays in Postgres, and similarity search is a numpy dot-product over a few hundred rows — no new extension to install, no local model to run, nothing your machine will notice.

**Build:**
- Chunking step: split a bounded set of key files (reuse `sample_files` from the structural pass) into reasonably sized text chunks
- Embed each chunk via your LLM provider's embeddings endpoint (same OpenAI-compatible client as `services/llm.py` already uses — the embedding computation happens on their servers, not yours) and store `(repository_id, file_path, chunk_index, chunk_text, embedding)` as a JSON column
- `POST /api/repos/{id}/ask`: embed the question → pull that repo's chunk rows → cosine similarity in Python (numpy) → take top-k → stuff those chunks into the LLM prompt → return an answer plus the source files it cited (matching the `flow`/`files`/`followups` shape in the conversation mock)
- Persist to `chat_conversations`/`chat_messages` so history survives a refresh
- Frontend wiring: `routes/_app.ask.tsx` — replace `conversation`/`suggestedQuestions` mocks with real calls; the suggested-questions list can itself be LLM-generated per repo once this works.

**Definition of done:** Asking "where is authentication implemented?" on a real connected repo returns an answer that cites files that actually exist in that repo.

**Go deeper:** Chunking strategy matters more than model choice here — read up on why naive fixed-size chunking splits functions in half and hurts retrieval quality. This brute-force approach is fine at one-repo scale; if you ever need it to scale past a few thousand chunks, that's exactly the point where pgvector (or a dedicated vector DB) starts to earn its keep — the retrieval code above stays the same shape either way.

---

## Sprint 8 — Webhooks & PR automation (write-back)

**You'll learn:** Webhook signature verification (HMAC), and using GitHub's Git Data API to create commits/branches/PRs programmatically — the "write" half of the integration, a different trust level than everything before it.

**Build:**
- `POST /api/webhooks/github` — verify `X-Hub-Signature-256`, handle push events, kick off a re-analysis job scoped to changed files (diff-aware, not full re-scan)
- `services/github.py` additions: create a blob/tree/commit, create or update a branch, open a PR — driven by `repo_settings.update_target` (`main` = direct commit, `branch` = push to a named branch, `pr` = open a PR)
- On doc regeneration with meaningful diffs, write back accordingly and log a `pull_requests` row
- Frontend wiring: `routes/_app.pull-requests.tsx` (real PRs opened by AutoScribe) and the `aiActivity`/`globalActivity` feeds (real webhook-triggered events instead of the static mock list).

**Definition of done:** Pushing a commit to a connected repo on GitHub triggers a webhook, which triggers a scoped re-analysis, which — depending on settings — opens a real PR you can see on GitHub.

**Go deeper:** Why webhook signature verification is non-negotiable (anyone can POST to a public endpoint claiming to be GitHub without it).

---

## Sprint 9 — Dashboard aggregation & live activity

**You'll learn:** Read-optimized aggregation endpoints, and Server-Sent Events (SSE) as a simpler alternative to WebSockets for one-directional live updates.

**Build:**
- `GET /api/dashboard` — aggregates active repo summary, recent `activity_log` entries, token usage, matching the shape of `activeRepo`/`aiActivity`/`tokenUsage`
- `GET /api/activity/stream` (SSE) so the dashboard's activity feed updates live instead of on refresh
- Token usage: track LLM tokens spent per user across Sprints 5–8 (sum `usage.total_tokens` into a `token_usage` table) and enforce a plan limit
- Frontend wiring: `routes/_app.dashboard.tsx` — replace every mock import with the aggregated endpoint, and hook the activity feed up to the SSE stream (`use-live-tick.ts` can retire once analysis progress is real).

**Definition of done:** The dashboard reflects real, current data on load and updates the activity feed without a manual refresh when a background job produces a new event.

---

## Sprint 10 — Settings, authorization, plan limits

**You'll learn:** Resource-level authorization (not just "is logged in" but "does this user own this repo"), and rate limiting.

**Build:**
- Ownership checks on every `/api/repos/{id}/...` route (403 if the repo isn't the requester's)
- `PATCH /api/repos/{id}/settings` — persist `auto_update`, `update_target`, `branch_name`
- Enforce the token/plan limit from Sprint 9 (block or downgrade behavior at the limit, matching the Free/Pro/Team concept in `tokenUsage`)
- Basic rate limiting on expensive endpoints (`/ask`, `/analyze`) — e.g. `slowapi`
- Frontend wiring: `routes/_app.settings.tsx` — wire the Select/toggle inputs (currently `defaultValue` with no `onChange`) to real PATCH calls.

**Definition of done:** Settings persist across sessions; hitting another user's repo ID returns 403, not someone else's data.

---

## Sprint 11 — Testing & shipping it

**You'll learn:** Testing FastAPI apps (dependency overrides, a test database), structured logging, and a minimal CI pipeline.

**Build:**
- `pytest` suite: unit tests for `services/`, integration tests for routers against a test Postgres (`pytest-asyncio` + a transactional fixture)
- Basic structured logging — at minimum log every LLM call's token usage and latency
- Pick a deployment target for the backend (Railway/Fly.io/Render) and one for the frontend (Vercel/Netlify) — no need for a full multi-service container setup unless you're deploying a queue worker too

**Definition of done:** You can demo the whole flow end to end — connect a real repo, watch it analyze, browse the architecture graph, ask it a question, see a real PR land — from a fresh deployment.

---

## Stretch ideas (once the core loop works)
- Diff-aware architecture updates (only re-diagram the parts of the graph that changed)
- Multi-repo "org view" reusing the dashboard aggregation
- Slack/email notifications on doc drift
- Billing (Stripe) tied to the Free/Pro/Team plan concept already in the UI
- Swap naive chunking (Sprint 7) for AST-aware chunking (split on function/class boundaries)
- Move background jobs to Celery/RQ + Redis if the in-process worker starts falling over (retries needed, jobs must survive restarts, multiple workers)

## Suggested order
Sprints 0–3 are non-negotiable and sequential. From Sprint 4 onward, 4→5→6→7 (the analysis/LLM pipeline) is the technical core and should stay in order since each depends on the last. Sprints 8–11 are more independent — reorder based on what you want to build next.