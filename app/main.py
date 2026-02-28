from __future__ import annotations

import os
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.middleware.sessions import SessionMiddleware

from authlib.integrations.starlette_client import OAuth
from dotenv import load_dotenv
from app.routers.auth import router as auth_router
from app.routers.events import router as events_router
from app.routers.music_archivator import router as ma_router

from app.db import engine, DATABASE_URL
from app.models import Base

Base.metadata.create_all(bind=engine)

load_dotenv()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI")

if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET or not GOOGLE_REDIRECT_URI:
    raise RuntimeError(
        "Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI in .env"
    )

app = FastAPI()

app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET"),
    same_site="lax",
    https_only=False,
)


app.include_router(auth_router)
app.include_router(events_router)
app.include_router(ma_router)


oauth = OAuth()
oauth.register(
    name="google",
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={
        "scope": "openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive",
    },
)

app.state.oauth = oauth
app.state.google_redirect_uri = GOOGLE_REDIRECT_URI


if not os.path.exists("frontend"):
    os.makedirs("frontend")

app.mount("/static", StaticFiles(directory="frontend"), name="static")


@app.get("/")
def root():
    return FileResponse("frontend/index.html")


@app.get("/admin/backup-db")
def backup_db(secret: str = ""):
    """
    Stáhne aktuální SQLite databázi jako soubor.
    Chráněno BACKUP_SECRET env proměnnou.
    Použití: /admin/backup-db?secret=TVUJ_SECRET
    """
    backup_secret = os.getenv("BACKUP_SECRET", "")
    if not backup_secret or secret != backup_secret:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Získáme cestu k DB souboru z DATABASE_URL
    # sqlite:////data/bandmanager.db  →  /data/bandmanager.db
    # sqlite:///./bandmanager.db      →  ./bandmanager.db
    db_path = DATABASE_URL.replace("sqlite:///", "")
    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="DB soubor nenalezen")

    return FileResponse(
        path=db_path,
        filename="bandmanager_backup.db",
        media_type="application/octet-stream",
    )
