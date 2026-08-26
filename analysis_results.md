# AutoScribe-V2 Codebase Analysis Report

This document presents a comprehensive review of the backend and frontend codebases of the **AutoScribe-V2** project. The audit identifies critical bugs, performance bottlenecks, security improvements, and truth gaps between the user interface and the backend implementation.

---

## 🛠️ Critical Backend Issues & Technical Debt

### 1. Cascading Deletes Bug (Causes HTTP 500)
> [!CAUTION]
> **Priority:** High (Breaks core feature)  
> **Location:** [backend/app/models/repository.py](file:///d:/Projects/AutoScribe-V2/backend/app/models/repository.py) & other model files.
>
> Deleting a connected repository via `DELETE /api/repos/{id}` executes `db.delete(repo)` inside [repos.py:disconnect_repo](file:///d:/Projects/AutoScribe-V2/backend/app/api/repos.py#L89-L96). However, because none of the database models or migrations define `ondelete="CASCADE"` on their foreign key columns (e.g. `analyses`, `documents`, `chunk_embeddings`, `chat_conversations`, `pull_requests`), this operation immediately raises a database `IntegrityError` in Postgres. As analysis runs automatically upon connecting a repository, this bug breaks the "Disconnect" feature for every repository in practice.

**Recommendation:**
- Add `ondelete="CASCADE"` to all foreign key columns referencing `repositories.id` or related tables (e.g. `analyses`, `documents`, `document_versions`, `chunk_embeddings`, `chat_conversations`, `chat_messages`, and `pull_requests`).
- Write an Alembic migration to apply these constraints to the database schema.
- Add error-handling try/except blocks inside `disconnect_repo` to gracefully capture unexpected database errors instead of throwing raw traces.

---

### 2. Event-Loop Blocking via Synchronous Database Queries
> [!WARNING]
> **Priority:** High (Performance / Scalability bottleneck)  
> **Location:** [backend/app/api/auth.py](file:///d:/Projects/AutoScribe-V2/backend/app/api/auth.py#L40) (`github_callback`), [backend/app/api/repos.py](file:///d:/Projects/AutoScribe-V2/backend/app/api/repos.py#L21) (`github_repos`), & [backend/app/api/dashboard.py](file:///d:/Projects/AutoScribe-V2/backend/app/api/dashboard.py#L115) (`activity_stream`).
>
> Several route handlers and endpoints defined using `async def` call synchronous SQLAlchemy queries directly (e.g. `db.query(...)`). Since Python's `asyncio` event loop is single-threaded, executing synchronous I/O operations inside `async def` functions blocks the entire server's event loop, preventing all other incoming requests from being processed while the queries run.

**Recommendation:**
- Standardize route handler declarations: either define endpoints as synchronous `def` functions (which allows FastAPI to run them in its internal thread pool automatically), or execute synchronous DB queries using `fastapi.concurrency.run_in_threadpool` or change SQLAlchemy to its async adapter (e.g. `async_sessionmaker`).

---

### 3. SSE Database Polling Loop
> [!WARNING]
> **Priority:** Medium (Scalability / DB Resource Exhaustion)  
> **Location:** [backend/app/api/dashboard.py:activity_stream](file:///d:/Projects/AutoScribe-V2/backend/app/api/dashboard.py#L115-L173)
>
> The Server-Sent Events (SSE) stream for live updates runs a continuous `while True` loop with an `await asyncio.sleep(2)`. In each iteration, it runs several synchronous DB queries: querying repository IDs for the user, fetching repository details, and querying the latest `ActivityLog` entries. If multiple users have the dashboard open, the database will be hit with multiple queries every two seconds *per user*, which quickly exhausts connection pools and CPU cycles.

**Recommendation:**
- Replace the database polling loop with a light pub-sub mechanism (e.g. a Redis-backed channel or a simple in-memory `Broadcaster` class in Python) where background workers publish new logs and active connections listen to the channel.

---

### 4. N+1 Query Bottlenecks in Documentation Routes
> [!WARNING]
> **Priority:** Medium (Performance lag)  
> **Location:** [backend/app/api/docs.py](file:///d:/Projects/AutoScribe-V2/backend/app/api/docs.py)
>
> - **In `list_documents` (L51-L71):** The endpoint fetches all `Document` rows for a repository, and then sequentially queries the latest `DocumentVersion` inside a loop for each document.
> - **In `documents_log` (L116-L147):** For every version row returned (up to 100), the endpoint queries the database again to count preceding versions (`DocumentVersion.id <= version.id`).

**Recommendation:**
- Use SQLAlchemy joined options or subqueries (such as Window Functions like `row_number()`) to retrieve documents alongside their latest version in a single SQL query.

---

### 5. All-or-Nothing Background Analysis Pipeline
> [!NOTE]
> **Priority:** Medium (Resiliency / Cost-reduction)  
> **Location:** [backend/app/api/analyze.py:run_analysis](file:///d:/Projects/AutoScribe-V2/backend/app/api/analyze.py#L43-L263)
>
> Currently, the entire analysis pipeline (structural pass, LLM architecture generation, README generation, write-back, and chunk embeddings) is grouped under a single, global transaction. If a failure occurs near the end of the run (e.g. a timeout during chunk embedding generation or a network issue in the write-back phase), the entire transaction rolls back, discarding the successful structural pass and architecture nodes/edges. Any retry starts the paid LLM calls from scratch.

**Recommendation:**
- Commit progress progressively after each phase (structural pass → architecture graph → README docs → embeddings) instead of wrapping them in a single, large transaction.

---

### 6. Missing Configuration in `.env.example`
> [!NOTE]
> **Priority:** Low (Developer Experience)  
> **Location:** [backend/.env.example](file:///d:/Projects/AutoScribe-V2/backend/.env.example)
>
> The example file only specifies `DATABASE_URL` and `CORS_ORIGINS`. It is missing key variables required by [core/config.py](file:///d:/Projects/AutoScribe-V2/backend/app/core/config.py) on startup, such as `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `FERNET_KEY`, and `LLM_API_KEY`. As a result, copying the example to `.env` results in an immediate Pydantic validation error on launch.

**Recommendation:**
- Update `.env.example` to list all variables with default place-holders or commented guidelines.

---

### 7. Decrypted GitHub OAuth Token Exposure Window
> [!NOTE]
> **Priority:** Low (Security Hardening)  
> **Location:** [backend/app/api/analyze.py:run_analysis](file:///d:/Projects/AutoScribe-V2/backend/app/api/analyze.py#L43-L263)
>
> The decrypted GitHub OAuth token is held in the background analysis thread's memory during the entire pipeline's duration. The LLM API calls and chunk embedding tasks can take up to a minute, leaving the decrypted token exposed in memory longer than necessary.

**Recommendation:**
- Scope the token usage strictly to the GitHub fetch phase (retrieving the repository tree structure) and discard/clear the variable before starting the expensive LLM analysis steps.

---

### 8. Sequential Embedding Fetches and Row-by-Row Inserts
> [!NOTE]
> **Priority:** Low (Performance)  
> **Location:** [backend/app/services/rag.py](file:///d:/Projects/AutoScribe-V2/backend/app/services/rag.py)
>
> In `embed_repository()`, file contents are fetched sequentially, and chunks/edges/nodes are inserted into the database row-by-row in a loop using `db.add(...)`.
>
> **Recommendation:**
> - Fetch files concurrently (using `asyncio.gather` with a semaphore to limit concurrency).
> - Use SQLAlchemy's `add_all()` or `bulk_insert_mappings()` to minimize DB round trips.

---

## 🎨 UI/UX Truth Gaps & Frontend Issues

### 1. Mock Data Leakage on Repository Detail Page
> [!CAUTION]
> **Priority:** High (Truth Gap)  
> **Location:** [frontend/src/routes/_app.repository.$id.tsx](file:///d:/Projects/AutoScribe-V2/frontend/src/routes/_app.repository.%24id.tsx#L3)
>
> The repository detail page imports static values `activeRepo`, `modules`, and `aiActivity` from `@/lib/mock-data`. Every repository connected to the application displays the exact same hardcoded tech stack (React, FastAPI, PostgreSQL, Redis), the exact same modules list (Authentication, Payment, Orders, Users, etc.), and identical activity feeds, completely ignoring the database records returned by the API.

**Recommendation:**
- Rewrite the Overview, Modules, and Activity tabs to fetch and display the real data returned by `/api/repos/{id}/architecture` and `/api/repos/{id}/analysis`.

---

### 2. Sidebar Navigation Rendering Dummy Documents
> [!CAUTION]
> **Priority:** High (UI/UX Bug)  
> **Location:** [frontend/src/routes/_app.documentation.tsx](file:///d:/Projects/AutoScribe-V2/frontend/src/routes/_app.documentation.tsx)
>
> The sidebar explorer navigation displays templates like "API Reference", "Architecture Guide", and "Runbook". However:
> 1. The backend currently only implements generation and retrieval for the `README` file (`/api/repos/{id}/documents/readme`).
> 2. Clicking any document tab in the sidebar updates `activeDocId` in state, but the Markdown and Source code renderers always display the README data under the hood.
>
> **Recommendation:**
> - Disable or mark not-yet-supported documentation sections as "Coming Soon" in the UI.
> - Default the document picker selection to README only.
> - Build generic endpoints on the backend to retrieve other document types as they are implemented.

---

### 3. Static Onboarding Payoff Screen (`/complete`)
> [!WARNING]
> **Priority:** Medium (Truth Gap)  
> **Location:** [frontend/src/routes/complete.tsx](file:///d:/Projects/AutoScribe-V2/frontend/src/routes/complete.tsx#L19-L24)
>
> Once repository analysis finishes, the UI redirects to `/complete`, which displays hardcoded numbers (2487 Files Analyzed, 156 Modules, 32 External Services, 92% AI Understanding Score) that are identical for every connected repository. The repository ID is lost when transitioning from `/analyzing` to `/complete`.
>
> **Recommendation:**
> - Pass the repository ID from `/analyzing` to `/complete` as a query search parameter.
> - Query the database metrics for that repository on load and display the real values.

---

### 4. Settings Persistence and Duplicate Configurations
> [!WARNING]
> **Priority:** Medium (Data Loss)  
> **Location:** [frontend/src/lib/repo-store.tsx](file:///d:/Projects/AutoScribe-V2/frontend/src/lib/repo-store.tsx#L159-L163) & [frontend/src/routes/_app.settings.tsx](file:///d:/Projects/AutoScribe-V2/frontend/src/routes/_app.settings.tsx)
>
> - **Local State Settings:** In the repository detail settings tab, changing options (auto-update toggle, PR targets) only updates local React state (`settingsById`). The changes are lost upon page refresh.
> - **Duplicate Settings Views:** There is a global `/settings` view that is entirely mock and unrelated to the settings tab inside the repository detail page.
>
> **Recommendation:**
> - Implement `GET` and `PATCH` endpoints for `/api/repos/{id}/settings` backed by the existing `repo_settings` table, and wire `repo-store.tsx` mutations to hit them.
> - Clarify settings scope: Keep the global page for account/plan settings only, and repository-specific settings in the repository tab.

---

### 5. Magic Link Email Dead-End
> [!WARNING]
> **Priority:** Medium (Auth Flow failure)  
> **Location:** [frontend/src/routes/auth.tsx](file:///d:/Projects/AutoScribe-V2/frontend/src/routes/auth.tsx#L206-L219)
>
> The "Email me a sign-in link" form has a faked delay using `setTimeout` and redirects the user directly to `/connect`. Because no session cookie is set, the user lands on `/connect` in an unauthenticated state, which results in silent network failures.
>
> **Recommendation:**
> - Hide or disable the email sign-in option until the backend implements magic link auth. Keep GitHub OAuth as the sole login method.

---

### 6. Uncaught Mutation Exceptions
> [!NOTE]
> **Priority:** Medium (UI/UX Resiliency)  
> **Location:** [frontend/src/routes/connect.tsx](file:///d:/Projects/AutoScribe-V2/frontend/src/routes/connect.tsx) & [frontend/src/routes/_app.repository.$id.tsx](file:///d:/Projects/AutoScribe-V2/frontend/src/routes/_app.repository.%24id.tsx)
>
> - In `connect.tsx`, the `start()` function calls `connect(repo)` without wrapping it in a try/catch. If the API fails, the loader spins forever.
> - In `repository/$id.tsx`, the `disconnectMutation` has no `onError` handler, causing failures (such as the cascading delete bug) to fail silently without notification.
>
> **Recommendation:**
> - Implement try/catch blocks and add `onError` callbacks to mutations to reset button state and display visible error messages (e.g. toasts or alert banners).

---

### 7. Lack of Response Streaming for Code Chat
> [!NOTE]
> **Priority:** Low (UX Optimization)  
> **Location:** [frontend/src/routes/_app.ask.tsx](file:///d:/Projects/AutoScribe-V2/frontend/src/routes/_app.ask.tsx) & [backend/app/api/ask.py](file:///d:/Projects/AutoScribe-V2/backend/app/api/ask.py)
>
> Asking a question currently blocks and waits for the entire LLM call to finish before returning any text. This results in a long, blank "Thinking..." loader state.
>
> **Recommendation:**
> - Implement SSE token streaming on the backend `/repos/{id}/ask` route and update the frontend component to render tokens as they arrive.
