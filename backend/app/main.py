import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.auth import router as auth_router
from app.api.repos import router as repos_router
from app.api.analyze import router as analyze_router
from app.api.docs import router as docs_router
from app.api.ask import router as ask_router
from app.api.webhooks import router as webhooks_router
from app.api.pull_requests import router as pull_requests_router
from app.api.dashboard import router as dashboard_router
<<<<<<< HEAD
from app.api.signals import router as signals_router
=======
>>>>>>> 71b13c417fd9639cd3e7197ada4f44e95fcbff7e
from app.services.poller import start_autonomous_poller
from app.services.agent_engine import agent_engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start autonomous commit poller & agent worker background tasks
    poller_task = asyncio.create_task(start_autonomous_poller())
    agent_task = asyncio.create_task(agent_engine.start_background_worker())
    yield
    # Cleanup on shutdown
    poller_task.cancel()
    agent_task.cancel()
    try:
        await asyncio.gather(poller_task, agent_task, return_exceptions=True)
    except asyncio.CancelledError:
        pass


app = FastAPI(title="AutoScribe API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(repos_router)
app.include_router(analyze_router)
app.include_router(docs_router)
app.include_router(ask_router)
app.include_router(webhooks_router)
app.include_router(pull_requests_router)
app.include_router(dashboard_router)
<<<<<<< HEAD
app.include_router(signals_router)
=======
>>>>>>> 71b13c417fd9639cd3e7197ada4f44e95fcbff7e


@app.get("/healthz")
def healthz():
    return {"status": "ok"}