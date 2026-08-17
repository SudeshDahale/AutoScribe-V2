import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.core.security import encrypt_token
from app.db.session import get_db
from app.models import User, GithubAccount, UserSession

router = APIRouter(prefix="/api/auth", tags=["auth"])

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"

SESSION_COOKIE = "session_id"
STATE_COOKIE = "oauth_state"
SESSION_TTL_DAYS = 30


@router.get("/github/login")
def github_login():
    state = secrets.token_urlsafe(16)
    params = {
        "client_id": settings.github_client_id,
        "redirect_uri": settings.github_redirect_uri,
        "scope": "read:user user:email repo",
        "state": state,
    }
    redirect = Response(status_code=302)
    redirect.headers["Location"] = f"{GITHUB_AUTHORIZE_URL}?{urlencode(params)}"
    redirect.set_cookie(STATE_COOKIE, state, max_age=600, httponly=True, samesite="lax")
    return redirect


@router.get("/github/callback")
async def github_callback(request: Request, code: str, state: str, db: DBSession = Depends(get_db)):
    cookie_state = request.cookies.get(STATE_COOKIE)
    if not cookie_state or cookie_state != state:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            GITHUB_TOKEN_URL,
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
                "redirect_uri": settings.github_redirect_uri,
            },
        )
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="GitHub token exchange failed")

        user_resp = await client.get(
            GITHUB_USER_URL,
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"},
        )
        gh_user = user_resp.json()

    login = gh_user["login"]
    email = gh_user.get("email") or f"{login}@users.noreply.github.com"

    # All DB operations are sync — run them in a thread-pool so we don't
    # block the async event loop while waiting for Postgres round trips.
    def _upsert_user_and_session():
        user = db.query(User).filter(User.github_login == login).first()
        if not user:
            user = User(email=email, github_login=login)
            db.add(user)
            db.flush()

        account = db.query(GithubAccount).filter(GithubAccount.user_id == user.id).first()
        encrypted = encrypt_token(access_token)
        if account:
            account.access_token_encrypted = encrypted
            account.github_login = login
        else:
            db.add(GithubAccount(user_id=user.id, github_login=login, access_token_encrypted=encrypted))

        session_id = secrets.token_urlsafe(32)
        db.add(UserSession(
            id=session_id,
            user_id=user.id,
            expires_at=datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS),
        ))
        db.commit()
        return session_id

    session_id = await run_in_threadpool(_upsert_user_and_session)

    redirect = Response(status_code=302)
    redirect.headers["Location"] = f"{settings.frontend_url}/connect"
    redirect.delete_cookie(STATE_COOKIE)
    redirect.set_cookie(
        SESSION_COOKIE,
        session_id,
        max_age=SESSION_TTL_DAYS * 24 * 3600,
        httponly=True,
        samesite="lax",
    )
    return redirect


def get_current_user(request: Request, db: DBSession = Depends(get_db)) -> User:
    session_id = request.cookies.get(SESSION_COOKIE)
    if not session_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    db_session = db.query(UserSession).filter(UserSession.id == session_id).first()
    if not db_session or db_session.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = db.query(User).filter(User.id == db_session.user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "email": user.email, "github_login": user.github_login}


@router.post("/logout")
def logout(request: Request, response: Response, db: DBSession = Depends(get_db)):
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id:
        db.query(UserSession).filter(UserSession.id == session_id).delete()
        db.commit()
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}