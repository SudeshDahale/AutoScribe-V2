# AutoScribe — Improvements & Error-Fixing Implementation Plan

**Status:** Core build (Sprints 0–7) complete. This plan does not add features — it makes what's
already built correct, fast, and consistent before Sprint 8 (webhooks & PR automation) starts
writing back to real repositories on top of it.

**Scope of the audit this plan is based on:** a full read of every backend route/service/model
and every frontend route, tracing each screen from first entry (`/`) to last (`/settings`), plus
the exact request path taken during analysis and disconnect.

**Sequencing principle:** each sprint below is ordered so nothing in it depends on something
later. Sprint 1 fixes the things that crash or silently corrupt trust (data integrity,
performance root causes). Sprint 2 makes every screen show what's actually true. Sprint 3
hardens what's left so Sprint 8 isn't built on a shaky floor. Three sprints, not eleven —
each is still a full vertical slice, just grouped by *why* the fix matters rather than by
which file it happens to live in, so nothing gets missed by being "too small to have its own
sprint."

---

## Sprint 1 — Backend integrity & performance

**Why first:** two of these are live bugs (one crashes a real user action today), and the
performance fix is the single biggest lever on the "analysis is very slow" complaint — fixing
it first means every later sprint gets tested against a fast pipeline instead of a slow one.

### 1.1 Fix cascading deletes (data-integrity bug, causes a 500 today)
No migration sets `ondelete=CASCADE` on any foreign key. `DELETE /api/repos/{id}` calls
`db.delete(repo)` directly, which will raise an unhandled `IntegrityError` the moment a repo has
any related row — `analyses`, `modules`, `documents`, `chunk_embeddings`,
`chat_conversations`, `architecture_nodes/edges`. Since analysis auto-starts on connect, this
means **disconnect is broken for every analyzed repo in practice**, not an edge case.
- New Alembic migration: add `ondelete="CASCADE"` to every FK that references `repositories.id`
  or a table that transitively belongs to a repository (`analyses.repository_id`,
  `architecture_nodes/edges.analysis_id`, `modules.repository_id`, `documents.repository_id`,
  `document_versions.document_id`, `chunk_embeddings.repository_id`,
  `chat_conversations.repository_id`, `chat_messages.conversation_id`,
  `pull_requests.repository_id`).
- Wrap the delete route in a try/except that returns a clean `409`/`500` JSON error instead of
  an unhandled trace, as a safety net even after cascades are in place.
- **Definition of done:** disconnecting any analyzed repository succeeds and removes all of its
  child rows in one call, verified against a repo that has run through analysis, doc generation,
  and at least one Ask conversation.

### 1.2 Parallelize the analysis pipeline (performance)
`embed_repository()` fetches up to 40 files **sequentially**, and `get_file_content_sync()` opens
a **new `httpx.Client()` per file** (fresh TCP+TLS handshake every time). Architecture generation
and README generation are also two independent LLM calls run back-to-back even though neither
depends on the other's output. Together this is the primary cause of slow analysis.
- Replace per-call `httpx.Client()` in `github.py` with one shared, connection-pooled client
  reused across a run.
- Fetch files concurrently (`asyncio.gather` behind a semaphore, ~8–10 at a time) instead of a
  serial loop.
- Run architecture-graph generation and README generation concurrently — both only need the
  structural pass, not each other's output.
- **Definition of done:** a repo that previously took 60–120s to analyze completes in a
  measurably lower, logged time (see 1.4) — target: file-fetch phase under ~10s, total pipeline
  under 30–40s for a typical repo.

### 1.3 Stop blocking the event loop on sync DB calls
`github_repos()` and `github_callback()` are declared `async def` but call SQLAlchemy's sync
`db.query(...)` directly inside them — this blocks the shared event loop for every other
in-flight request for the duration of that query, not just the current one.
- Standardize: either make these route functions plain `def` (FastAPI runs sync handlers in
  its threadpool automatically) or move their DB calls behind `run_in_threadpool`. Pick one
  pattern and apply it consistently across `auth.py`/`repos.py`, not just these two.
- **Definition of done:** no `async def` route handler in the codebase calls a sync DB method
  directly.

### 1.4 Make the pipeline resilient and observable
Right now the whole analysis run is one transaction — a late failure (e.g. README generation
after a successful, expensive architecture call) rolls back and discards everything, so a retry
redoes paid LLM calls from scratch. There's also no timing data, so it's currently impossible to
verify 1.2 actually helped.
- Commit progressively after each phase (structural pass → architecture → docs →
  embeddings) instead of one all-or-nothing transaction, so a late failure doesn't waste earlier
  work.
- Add basic phase timers (structural pass / architecture LLM call / README LLM call / embedding
  pass) logged on every run — cheap now, and the only way to confirm 1.2's impact or catch a
  regression later.
- **Definition of done:** killing the pipeline mid-run after the architecture phase leaves that
  phase's data intact on retry; logs show per-phase duration for every analysis run.

### 1.5 Cheap correctness fixes (bundle into this sprint, low effort)
- Add indexes on every FK column currently missing one (`repository_id`, `analysis_id`,
  `document_id`, `conversation_id`, etc.) — one migration, prevents sequential scans as data
  grows.
- Fix `.env.example` — it's currently missing `GITHUB_CLIENT_ID/SECRET`, `FERNET_KEY`,
  `LLM_API_KEY`, and other fields `Settings` requires with no default, so a fresh clone
  following the example crashes on startup.
- Fix N+1 queries in `docs.py` (`list_documents`, `documents_log`) — replace the per-row
  follow-up query with a single joined/windowed query.

---

## Sprint 2 — Frontend truth: every screen shows what actually happened

**Why second:** this is the highest end-user-experience impact of the whole plan. Right now
several screens — including the very last screen of onboarding — show identical fake numbers
to every user regardless of what they connected. Sprint 1's speed and reliability fixes are
wasted on the user if the UI still lies to them immediately afterward.

### 2.1 Repository detail page — replace mock data with real data
`/repository/$id` is the biggest gap in the app: its Overview, Modules, and Activity tabs pull
from static `mock-data.ts` (`activeRepo`, `aiActivity`, `modules`) with **no scoping to the
actual `id`** — every repo shows the same fake tech stack and modules. Its Architecture tab
also uses a second, separate mock source (`architecture-graph.ts`), which will visibly
contradict the real diagram already correctly served by the standalone `/architecture` page.
- Replace `activeRepo`/`modules`/`aiActivity` usage with `GET /api/repos/{id}/architecture` and
  `GET /api/repos/{id}/analysis` (the same endpoints `/architecture` already uses correctly —
  use that page as the reference implementation).
- Delete the per-page mock architecture source for this route; both places that show a repo's
  architecture must render from the same real data.
- **Definition of done:** opening two different connected repos shows two different tech
  stacks/modules/scores, and the Overview tab's architecture diagram matches the standalone
  Architecture page exactly for the same repo.

### 2.2 Fix the onboarding payoff screen (`/complete`)
Currently 100% hardcoded ("2487 files," "156 modules," "92% understanding," "32 external
services" — the last of which doesn't correspond to anything the backend even computes yet).
- Pass the repo id from `/analyzing` through to `/complete` via a search param (currently
  dropped entirely).
- Fetch and render the real `filesAnalyzed`, `modulesDetected`, and `understandingScore` from
  the same endpoints as 2.1.
- Drop the "External Services" stat until `analyze.py` actually populates it, rather than
  showing a fixed fake number.
- **Definition of done:** the completion screen's numbers match what `/repository/$id` shows
  for that same repo immediately after.

### 2.3 Make the document picker (`/analyzing`, step 2) match reality
Users currently choose from 6 document types; only README is ever generated, and the choice
isn't sent to the backend at all — so picking "API Reference" silently produces nothing while
the UI marks it "Generated."
- Mark the 5 not-yet-built document types as disabled/"Coming soon" in the picker so the app
  never claims to generate something it can't, and default the selection to README only.
- Apply the same fix to the Documentation page's nav (`docsNav`, currently mock) so it only
  lists document types that exist.
- **Definition of done:** nothing in the UI claims a document was generated unless
  `GET /api/repos/{id}/documents/{type}` actually returns it.

### 2.4 Remove the broken auth dead-end
The "Email me a sign-in link" option on `/auth` has no backend support — it fakes a delay and
drops the user into `/connect`, which requires a real session and fails silently (empty repo
list, "Connected as @…" with no handle).
- Remove the email path until real email auth exists, leaving GitHub OAuth — the only path that
  actually works — as the sole, clearly-presented option.
- **Definition of done:** every visible sign-in affordance on `/auth` results in a working
  session.

### 2.5 Fix error handling and dead buttons across the connect/repo flows
- `connect.tsx`: wrap `start()` in try/catch; on failure, reset the button and show an inline
  error instead of spinning forever.
- `repositories.tsx`: wire "Re-analyze now" (currently a dead button).
- `repository/$id.tsx`: wire the header "Re-analyze" button and the attention banner's
  "Generate update" button (both currently dead); add an `onError` handler to
  `disconnectMutation` so a failed disconnect (should be rare after 1.1, but not impossible)
  shows an error instead of silently doing nothing.
- Fix the disconnect confirmation copy — "Generated documentation is kept and restored if you
  reconnect" isn't true today (reconnecting creates a new repo id with no link back); either
  make it true or stop promising it.
- **Definition of done:** every button in the connect/repositories/repository-detail flows
  either does something or is visibly disabled; every mutation that can fail has a visible
  failure state.

### 2.6 Persist per-repo settings
The per-repo Settings tab (auto-update toggle, PR-vs-branch-vs-main target) currently only
updates local React state — it's lost on refresh with no warning to the user. The
`repo_settings` table already exists from Sprint 1 of the original plan; it's just never
written to.
- Add `GET/PATCH /api/repos/{id}/settings` backed by the existing table.
- Point `updateSettings()` in `repo-store.tsx` at it instead of local-only state.
- **Definition of done:** toggling auto-update or changing the update target survives a page
  refresh.

### 2.7 Fix timing copy in three places
"This usually takes a few seconds" (`/analyzing`), "Analysis takes ~30 seconds" (`/connect`),
and "Analysis starts automatically and takes about 30 seconds" (`/repositories` connect dialog)
are all currently wrong and inconsistent with each other. Once 1.2 lands, replace all three with
one accurate, shared piece of copy (a constant, not three separately-typed strings) so they
can't drift again.

---

## Sprint 3 — Reliability & consistency hardening

**Why last:** these don't block correctness or trust the way Sprints 1–2 do, but they're what
keeps Sprint 8 (webhooks + PR write-back) from inheriting the same class of problems this audit
just found.

### 3.1 Stream Ask responses
`/ask` currently waits for the full embed → retrieve → generate round trip before rendering
anything, so a slow LLM call means a long blank "Thinking…" state. Stream the generation call
and render tokens as they arrive.

### 3.2 Bulk-insert instead of row-by-row `db.add()`
Architecture nodes/edges and chunk embeddings are inserted one `db.add()` call at a time inside
a loop. Switch to `bulk_insert_mappings`/`add_all` — small change, meaningful at the row counts
a real repo's chunk table will reach.

### 3.3 Reduce the token exposure window
The decrypted GitHub token is passed into and held by the background analysis thread for the
full pipeline duration (60s+ before Sprint 1, much less after). Scope it to only the phase that
needs it (the GitHub-fetch phase) rather than holding it for the LLM phases too.

### 3.4 Resolve the duplicate Settings surface
There are now two unrelated Settings UIs — the global `/settings` page (still fully mock,
correctly deferred to a later feature sprint) and the per-repo Settings tab (now real after
2.6). Before building out the global page, decide whether it becomes account-level settings
only, or is merged/removed in favor of the per-repo tab — otherwise Sprint 8+ will build real
functionality into a page whose IA is already contradictory.

### 3.5 Consistent async/sync pattern check
Do a final pass confirming 1.3's fix was applied everywhere, not just the two handlers found in
this audit — grep for `async def` route functions that still call `db.query`/`db.commit`
directly anywhere in `api/`.

---

## Suggested order

Sprint 1 → Sprint 2 → Sprint 3, without skipping ahead — Sprint 2's "definition of done" checks
(comparing numbers across screens) are only meaningful once Sprint 1 makes the underlying data
fast and reliable to fetch, and Sprint 3 is explicitly about not repeating this audit's findings
in Sprint 8.
