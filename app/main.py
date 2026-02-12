import os
from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse, JSONResponse
from dotenv import load_dotenv
from authlib.integrations.starlette_client import OAuth
from starlette.middleware.sessions import SessionMiddleware

load_dotenv()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI")

if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET or not GOOGLE_REDIRECT_URI:
    raise RuntimeError("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI in .env")

app = FastAPI()

from datetime import date as date_type
from fastapi import Depends
from sqlalchemy.orm import Session

from .db import engine, get_db
from .models import Event
from .schemas import EventCreate, EventOut

# vytvoří tabulky (MVP jednoduché). Později přejdeme na Alembic migrace.
Event.metadata.create_all(bind=engine)



# Session cookie encryption key (dev only). Later we’ll put this into .env too.
app.add_middleware(SessionMiddleware, secret_key="dev-secret-change-me")

oauth = OAuth()
oauth.register(
    name="google",
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={
        "scope": "openid email profile",
    },
)

@app.get("/auth/google/login")
async def google_login(request: Request):
    return await oauth.google.authorize_redirect(request, GOOGLE_REDIRECT_URI)

@app.get("/auth/google/callback")
async def google_callback(request: Request):
    token = await oauth.google.authorize_access_token(request)
    user = token.get("userinfo")
    request.session["token"] = token
    request.session["user"] = user
    return JSONResponse({"logged_in": True, "user": user})

@app.get("/auth/me")
async def auth_me(request: Request):
    user = request.session.get("user")
    if not user:
        return JSONResponse({"logged_in": False}, status_code=401)
    return JSONResponse({"logged_in": True, "user": user})

@app.get("/auth/logout")
async def auth_logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/")

@app.get("/events", response_model=list[EventOut])
def list_events(from_date: date_type, to_date: date_type, db: Session = Depends(get_db)):
    return (
        db.query(Event)
        .filter(Event.date >= from_date, Event.date <= to_date)
        .order_by(Event.date.asc())
        .all()
    )


@app.post("/events", response_model=EventOut)
def create_event(payload: EventCreate, db: Session = Depends(get_db)):
    # jednoduchá validace: pokud je time_end bez time_start, necháme to projít (MVP),
    # ale časově to budeš typicky vyplňovat oba.
    ev = Event(
        title=payload.title,
        date=payload.date,
        time_start=payload.time_start,
        time_end=payload.time_end,
        location=payload.location,
        public_description=payload.public_description,
        internal_notes=payload.internal_notes,
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev