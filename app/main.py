from __future__ import annotations

import os
from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware

from authlib.integrations.starlette_client import OAuth
from dotenv import load_dotenv
from app.routers.auth import router as auth_router
from app.routers.events import router as events_router

# pokud někde vytváříš tabulky při startu, nech to tady (jinak to přesuneme později do alembicu)
from app.db import engine
from app.models import Event

Event.metadata.create_all(bind=engine)

load_dotenv()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI")

if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET or not GOOGLE_REDIRECT_URI:
    raise RuntimeError("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI in .env")

app = FastAPI()

app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET"),
    same_site="lax",
    https_only=False,
)


app.include_router(auth_router)
app.include_router(events_router)


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




@app.get("/")
def root():
    return {"status": "ok"}

