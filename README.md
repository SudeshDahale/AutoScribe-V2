# AutoScribe

**Documentation that keeps up with your codebase.**

AutoScribe connects to a GitHub repository, indexes the codebase with AI, and continuously generates and maintains documentation — README, API reference, architecture diagrams, module docs — as your code changes. It opens pull requests to keep docs in sync, and lets you ask questions about a codebase instead of reading it yourself.

---

## Features

- **One-click repo connect** — sign in with GitHub, pick a repository, and AutoScribe indexes it in the background.
- **AI-generated documentation** — README, API reference, architecture guides, and module docs drafted directly from your code.
- **Live architecture diagrams** — an interactive system map (services, data stores, request flow, event pipeline) built from the actual dependency graph of the repo.
- **Auto-sync on every commit** — AutoScribe detects meaningful code changes and opens a pull request to update the affected docs.
- **Ask AI** — a chat interface for asking natural-language questions about a connected codebase, backed by retrieval over the indexed source.
- **Dashboard & activity feed** — connected repositories, generated documents, open doc PRs, and a live activity log across your account.
- **Document log & PR activity** — a full audit trail of every document AutoScribe has generated, updated, or opened for review.

---

## Tech Stack

**Frontend**
- [TanStack Start](https://tanstack.com/start) + [TanStack Router](https://tanstack.com/router) + [TanStack Query](https://tanstack.com/query)
- React 19, TypeScript
- Tailwind CSS v4
- Radix UI / shadcn-style component primitives
- Vite

**Backend**
- [FastAPI](https://fastapi.tiangolo.com/) (Python)
- SQLAlchemy 2.0 + Alembic (migrations)
- PostgreSQL
- GitHub OAuth for authentication + repository access
- OpenAI-compatible LLM API for analysis, documentation generation, and RAG-based chat

---

## Project Structure

```
AutoScribe-V2/
├── backend/
│   ├── app/
│   │   ├── api/            # FastAPI routers (auth, repos, analyze, docs, ask, webhooks, pull_requests, dashboard)
│   │   ├── core/            # config, security
│   │   ├── db/               # database session
│   │   ├── models/          # SQLAlchemy models (repository, document, module, chat, activity, ...)
│   │   ├── services/         # analysis, architecture mapping, chunking, docs generation, GitHub, LLM, RAG, PR write-back
│   │   └── main.py           # FastAPI app entrypoint
│   ├── alembic/               # database migrations
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── routes/            # TanStack Router file-based routes (auth, connect, dashboard, ask, documentation, ...)
│   │   ├── components/
│   │   ├── hooks/
│   │   └── lib/
│   └── package.json
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm (or bun)
- Python 3.11+
- PostgreSQL 14+
- A [GitHub OAuth App](https://github.com/settings/developers)
- An OpenAI-compatible API key (or a compatible endpoint — Azure OpenAI, Ollama, etc.)

### 1. Clone the repository

```sh
git clone <this-repository-url>
cd AutoScribe-V2
```

### 2. Backend setup

```sh
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env and fill in DATABASE_URL, GitHub OAuth credentials, FERNET_KEY, and LLM_API_KEY (see below)

alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend setup

```sh
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:3000` and the API on `http://localhost:8000` by default.

### 4. Environment variables

Copy `backend/.env.example` to `backend/.env` and configure:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `CORS_ORIGINS` / `FRONTEND_URL` | Allowed origin for the frontend app |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | From your GitHub OAuth App |
| `GITHUB_REDIRECT_URI` | OAuth callback URL, e.g. `http://localhost:8000/api/auth/github/callback` |
| `GITHUB_WEBHOOK_SECRET` | Secret used to verify incoming GitHub webhook payloads |
| `FERNET_KEY` | Encryption key for stored tokens — generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `LLM_API_KEY` | API key for your LLM provider |
| `LLM_BASE_URL` | OpenAI-compatible base URL (defaults to OpenAI) |
| `LLM_MODEL` | Chat/completion model, e.g. `gpt-4o-mini` |
| `LLM_EMBEDDING_MODEL` | Embedding model used for RAG, e.g. `text-embedding-3-small` |

---

## Usage

1. Sign in with GitHub.
2. Connect a repository from your GitHub account.
3. AutoScribe analyzes the repository (indexes files, detects modules and architecture).
4. Review the generated documentation and architecture map.
5. AutoScribe keeps docs in sync automatically — enable auto-update in repository settings to have it open a pull request whenever it detects a meaningful code change.
6. Use **Ask AI** to query the codebase directly, or browse the **Documentation** explorer for the generated docs.

---

## Available Scripts

**Frontend** (from `frontend/`)
```sh
npm run dev        # start the dev server
npm run build       # production build
npm run preview     # preview the production build
npm run lint        # run ESLint
npm run format      # run Prettier
```

**Backend** (from `backend/`)
```sh
uvicorn app.main:app --reload   # start the API in dev mode
alembic revision --autogenerate -m "message"   # create a migration
alembic upgrade head             # apply migrations
```

---

## Contributing

Issues and pull requests are welcome. Please open an issue to discuss significant changes before submitting a PR.

## License

TBD.
