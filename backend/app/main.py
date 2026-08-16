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

app = FastAPI(title="AutoScribe API")

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


@app.get("/healthz")
def healthz():
    return {"status": "ok"}