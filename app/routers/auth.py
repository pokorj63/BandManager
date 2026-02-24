from __future__ import annotations

import secrets
import time
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse

from app.token_store import TOKENS

router = APIRouter(prefix="/auth", tags=["auth"])

LOGIN_GUARD_SECONDS = 10


@router.get("/google/login")
async def google_login(request: Request):
    # Guard proti dvojitému zavolání /auth/google/login (mismatch_state)
    now = time.time()
    last = request.session.get("login_started_at")
    if last and (now - float(last)) < LOGIN_GUARD_SECONDS:
        raise HTTPException(
            status_code=429,
            detail="Login already started. Please wait a moment and try again.",
        )
    request.session["login_started_at"] = now

    # OAuth client je uložen v app.state.oauth (nastavíme v main.py)
    oauth = request.app.state.oauth
    redirect_uri = request.app.state.google_redirect_uri
    return await oauth.google.authorize_redirect(
        request, redirect_uri, access_type="offline", prompt="consent"
    )


@router.get("/google/callback")
async def google_callback(request: Request):
    request.session.pop("login_started_at", None)

    oauth = request.app.state.oauth
    token = await oauth.google.authorize_access_token(request)
    user = token.get("userinfo")

    # server-side token store (do cookie jen sid)
    sid = secrets.token_urlsafe(24)
    TOKENS[sid] = {"token": token, "user": user}
    request.session["sid"] = sid

    return RedirectResponse(url="/")


@router.get("/me")
async def auth_me(request: Request):
    sid = request.session.get("sid")
    if not sid or sid not in TOKENS:
        return JSONResponse({"logged_in": False}, status_code=401)
    return JSONResponse({"logged_in": True, "user": TOKENS[sid]["user"]})


@router.get("/logout")
async def auth_logout(request: Request):
    sid = request.session.get("sid")
    if sid:
        TOKENS.pop(sid, None)

    request.session.clear()

    resp = RedirectResponse(url="/")
    resp.delete_cookie("session")  # pro jistotu
    return resp
