import os
import secrets
import time
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse
from dotenv import load_dotenv
from authlib.integrations.starlette_client import OAuth
from starlette.middleware.sessions import SessionMiddleware
from .google_client import get_credentials_from_session, calendar_service, drive_service
from datetime import date as date_type
from fastapi import Depends
from sqlalchemy.orm import Session
from .db import engine, get_db
from .models import Event
from .schemas import EventCreate, EventOut
from .token_store import TOKENS

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

# vytvoří tabulky (MVP jednoduché). Později přejdeme na Alembic migrace.
Event.metadata.create_all(bind=engine)


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
@app.get("/")
def root():
    return {"status": "ok"}

LOGIN_GUARD_SECONDS = 10  # ochrana proti dvojkliku/dvojímu requestu

@app.get("/auth/google/login")
async def google_login(request: Request):
    # Guard proti dvojitému zavolání /auth/google/login (to ti přepisovalo state)
    now = time.time()
    last = request.session.get("login_started_at")
    if last and (now - float(last)) < LOGIN_GUARD_SECONDS:
        raise HTTPException(status_code=429, detail="Login already started. Please wait a moment and try again.")

    request.session["login_started_at"] = now

    # Nepřidávej prompt=select_account teď – často vede k vícenásobným flowům a mismatch_state.
    return await oauth.google.authorize_redirect(request, GOOGLE_REDIRECT_URI)


@app.get("/auth/google/callback")
async def google_callback(request: Request):
    # Login už “doběhl”, guard smažeme
    request.session.pop("login_started_at", None)

    token = await oauth.google.authorize_access_token(request)
    user = token.get("userinfo")

    # ulož token server-side (do cookie jen krátké sid)
    sid = secrets.token_urlsafe(24)
    TOKENS[sid] = {"token": token, "user": user}
    request.session["sid"] = sid

    # můžeš vracet JSON (pro dev), nebo rovnou přesměrovat na UI route
    return JSONResponse({"logged_in": True, "user": user})


@app.get("/auth/me")
async def auth_me(request: Request):
    sid = request.session.get("sid")
    if not sid or sid not in TOKENS:
        return JSONResponse({"logged_in": False}, status_code=401)
    return JSONResponse({"logged_in": True, "user": TOKENS[sid]["user"]})

@app.get("/auth/logout")
async def auth_logout(request: Request):
    sid = request.session.get("sid")
    if sid:
        TOKENS.pop(sid, None)

    # vyčisti server-side session
    request.session.clear()

    # a teď explicitně smaž cookie
    resp = RedirectResponse(url="/")
    resp.delete_cookie("session")  # default cookie name u SessionMiddleware je "session"
    return resp

@app.get("/events", response_model=list[EventOut])
def list_events(from_date: date_type, to_date: date_type, db: Session = Depends(get_db)):
    return (
        db.query(Event)
        .filter(Event.date >= from_date, Event.date <= to_date)
        .order_by(Event.date.asc())
        .all()
    )


@app.post("/events", response_model=EventOut)
def create_event(payload: EventCreate, request: Request, db: Session = Depends(get_db)):
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
    
    
    sid = request.session.get("sid")
    if not sid or sid not in TOKENS:
        raise HTTPException(status_code=401, detail="Not logged in")
    token = TOKENS[sid]["token"]
    
    creds = get_credentials_from_session(token)
    cal = calendar_service(creds)
    drv = drive_service(creds)

    calendar_id = os.getenv("BAND_CALENDAR_ID")
    drive_root = os.getenv("BAND_DRIVE_ROOT_FOLDER_ID")
    if not calendar_id or not drive_root:
        raise HTTPException(status_code=500, detail="Missing BAND_CALENDAR_ID or BAND_DRIVE_ROOT_FOLDER_ID in .env")

    # 1) Create Calendar event (all-day if no time_start)
    if ev.time_start is None:
        body = {
             "summary": ev.title,
            "start": {"date": ev.date.isoformat()},
            "end": {"date": ev.date.isoformat()},
            "description": ev.public_description or "",
            "location": ev.location or "",
        }
    else:
        # MVP: no timezone handling yet, uses local time semantics later
        body = {
            "summary": ev.title,
            "start": {"dateTime": f"{ev.date.isoformat()}T{ev.time_start.isoformat()}"},
            "end": {"dateTime": f"{ev.date.isoformat()}T{(ev.time_end or ev.time_start).isoformat()}"},
            "description": ev.public_description or "",
            "location": ev.location or "",
        }

    created = cal.events().insert(calendarId=calendar_id, body=body).execute()
    ev.calendar_event_id = created["id"]

    # 2) Create Drive folder for event + Media subfolders
    event_folder_name = f"{ev.date.isoformat()} {ev.title}"
    event_folder = drv.files().create(
        body={
            "name": event_folder_name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [drive_root],
        },
        fields="id",
    ).execute()
    ev.drive_folder_id = event_folder["id"]

    # Media/Photos + Media/Videos
    media = drv.files().create(
        body={
            "name": "Media",
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [ev.drive_folder_id],
        },
        fields="id",
    ).execute()
    media_id = media["id"]

    drv.files().create(
        body={"name": "Photos", "mimeType": "application/vnd.google-apps.folder", "parents": [media_id]},
        fields="id",
    ).execute()
    drv.files().create(
        body={"name": "Videos", "mimeType": "application/vnd.google-apps.folder", "parents": [media_id]},
        fields="id",
    ).execute()

    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev
@app.get("/debug/session")
def debug_session(request: Request):
    return {"session": dict(request.session)}