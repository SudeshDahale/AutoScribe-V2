# AutoScribe‑V2 – User Workflow, Authentication & Documentation Redesign Recommendations

## 1. Current User Workflow (Pain Points)
- **Landing → Auth → Connect Repo → Payoff screen → Dashboard**
- Auth uses a **magic‑link** that redirects to `/connect` **without persisting a session cookie** – users are silently unauthenticated.
- The **Payoff screen** shows static placeholder metrics, eroding trust.
- Documentation tabs render the same mock content for every repository; navigation feels broken.
- No guided path: after connecting a repo the user is dropped onto an empty dashboard with no clear next step, leading to confusion and drop‑off.

## 2. Benchmarking Against Successful Platforms
| Platform | Auth Flow | Onboarding Experience | Documentation UI |
|----------|-----------|----------------------|-------------------|
| **Notion** | OAuth (Google, Apple) + Email magic‑link with instant session, clear error feedback. | Interactive tour on first login, “Add a page” CTA, progress bar. | Left‑hand vertical navigation, searchable, collapsible sections, live code examples. |
| **GitHub Copilot** | OAuth (GitHub) + SSO, immediate token storage. | Quick “Connect IDE” wizard, sample snippet shown instantly. | Context‑aware docs, in‑app tooltips, interactive playgrounds. |
| **Vercel** | OAuth (GitHub, GitLab, Bitbucket) + email fallback, persistent session cookie. | “Create Project” wizard with preview of logs & deployments. | Docs as a **single‑page app** with searchable index, dark‑mode, copy‑button on code blocks. |

### What AutoScribe can adopt:
1. **Multiple auth providers** (Google, GitHub) alongside the existing magic‑link.
2. **Immediate session persistence** – set a secure HTTP‑only cookie before any redirect.
3. **Clear error handling** – toast notifications for expired links, invalid token, network failures.
4. **Progressive onboarding wizard** – a 3‑step flow that shows the value after each step.
5. **Live preview** – after connecting a repo, show a real‑time snapshot of the generated diagram/pages.

## 3. Redesigning the Documentation Tabs
### Goals
- Reduce cognitive load.
- Make information **discoverable** and **actionable**.
- Keep styling consistent with the dark‑theme aesthetic.

### Suggested Layout (Wireframe description)
```
+--------------------------------------------------------------+
|  AutoScribe – Docs   |   Search bar  [🔍]                 |
+-----------------------+-----------------------------------+
| ▸ Getting Started                                          |
|   ▸ Overview (intro video)                                 |
|   ▸ Connect a Repo (wizard screenshot)                     |
| ▸ Features                                                 |
|   ▸ Live Documentation                                    |
|   ▸ AI‑Ask Assistant                                      |
| ▸ API Reference                                           |
|   ▸ Endpoints (collapsible)                               |
|   ▸ Types (hover tooltip)                                 |
| ▸ FAQ                                                       |
+--------------------------------------------------------------+
|   Main Content Area – Responsive card layout, code blocks   |
|   with copy‑to‑clipboard, dark‑mode syntax highlighting    |
|   and interactive “Try it” sandbox for API calls.           |
+--------------------------------------------------------------+
```
- **Vertical navigation** on the left, sticky, collapsible.
- **Search bar** with instant filter (Debounce 300 ms).
- Each section **has a CTA button** (e.g., “Connect a repo now”) that opens the onboarding wizard in a modal.
- **Interactive snippets**: use `iframe` sandbox or embedded Playground to let users test the API directly.
- **Tooltips** on technical terms linking to Glossary.
- **Micro‑animations** for expanding/collapsing sections (slide‑down, fade‑in) to convey motion and guide attention.
- **Consistent dark‑theme** with `surface-card` utility from `styles.css`.

## 4. Defining a Clear Main User Workflow (Value‑First Path)
```
1️⃣ Landing page – Hero with strong value proposition + "Start for free" CTA.
2️⃣ Auth – Choose provider → immediate session set.
3️⃣ **Onboarding Wizard** (3 steps):
   • Step 1 – Connect repository (GitHub/GitLab).
   • Step 2 – Choose documentation style (auto‑map, markdown, custom).
   • Step 3 – Preview generated docs & AI‑assistant demo.
4️⃣ **Dashboard** – Shows key metrics (files processed, coverage %, top modules) **right after Step 3**.
5️⃣ **AI‑Ask** – Persistent chat button on the dashboard for instant Q&A.
6️⃣ **Export / Share** – One‑click download of docs, architecture map, or a shareable link.
```
- The **first 30 seconds** should give a live preview of the generated documentation, reinforcing value.
- Use **progress indicators** (spinner → card flipping) to convey background work.
- Add a **“Take a Tour”** button that walks the user through each dashboard widget.

## 5. Prioritized Action List
| Priority | Item | Description | Owner | ETA |
|----------|------|-------------|-------|-----|
| **P0** | Auth refactor | Add OAuth providers, set session cookie before redirect, toast error handling. | Frontend/Backend | 2 weeks |
| **P0** | Onboarding wizard UI | Modal stepper with live preview of docs after repo connection. | Frontend | 3 weeks |
| **P1** | Documentation redesign | Implement vertical navigation, search, interactive snippets, CTA buttons. | Frontend + Design | 4 weeks |
| **P1** | Dashboard instant‑value card | Show real metrics after repo connect; use skeleton loaders. | Frontend | 2 weeks |
| **P2** | AI‑Ask latency fix | Stream response, show progressive loading, cancelable request. | Backend | 1 week |
| **P2** | Micro‑animations & theming consistency | Apply `glow‑accent`, `animate‑fade‑in` utilities to new components. | Design/Frontend | Ongoing |

## 6. Success Metrics
- **Onboarding completion rate** increase from ~45 % → **≥80 %**.
- **Time‑to‑first‑value** reduced from 2 min → **≤30 s**.
- **Auth error reports** drop to <1 % of sessions.
- **Documentation page bounce rate** below 30 %.
- **User satisfaction (NPS)** target +20 after release.

---
*Prepared by Antigravity – UX and product strategy*
