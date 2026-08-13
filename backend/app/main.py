from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.auth import router as auth_router
from app.api.repos import router as repos_router
from app.api.analyze import router as analyze_router

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


@app.get("/healthz")
def healthz():
    return {"status": "ok"}