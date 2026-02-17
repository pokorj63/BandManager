from __future__ import annotations

import calendar as calmod
import os
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Event
from app.schemas import EventCreate, EventOut, EventUpdate
from app.token_store import TOKENS
from app.google_client import get_credentials_from_session, calendar_service, drive_service

router = APIRouter(prefix="/events", tags=["events"])


def require_token(request: Request) -> dict:
    sid = request.session.get("sid")
    if not sid or sid not in TOKENS:
        raise HTTPException(status_code=401, detail="Not logged in")
    return TOKENS[sid]["token"]


@router.get("", response_model=list[EventOut])
def list_events(from_date: date, to_date: date, db: Session = Depends(get_db)):
    return (
        db.query(Event)
        .filter(Event.date >= from_date, Event.date <= to_date)
        .order_by(Event.date.asc())
        .all()
    )


@router.get("/month", response_model=list[EventOut])
def list_events_month(year: int, month: int, db: Session = Depends(get_db)):
    last_day = calmod.monthrange(year, month)[1]
    from_date = date(year, month, 1)
    to_date = date(year, month, last_day)
    return (
        db.query(Event)
        .filter(Event.date >= from_date, Event.date <= to_date)
        .order_by(Event.date.asc())
        .all()
    )


@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: int, db: Session = Depends(get_db)):
    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    return ev


@router.post("", response_model=EventOut)
def create_event(payload: EventCreate, request: Request, db: Session = Depends(get_db)):
    # 1) create in DB
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

    # 2) sync to Google
    token = require_token(request)
    creds = get_credentials_from_session(token)
    cal = calendar_service(creds)
    drv = drive_service(creds)

    calendar_id = os.getenv("BAND_CALENDAR_ID")
    drive_root = os.getenv("BAND_DRIVE_ROOT_FOLDER_ID")
    if not calendar_id or not drive_root:
        raise HTTPException(status_code=500, detail="Missing BAND_CALENDAR_ID or BAND_DRIVE_ROOT_FOLDER_ID in .env")

    # Calendar: all-day end is exclusive => next day
    if ev.time_start is None:
        body = {
            "summary": ev.title,
            "start": {"date": ev.date.isoformat()},
            "end": {"date": (ev.date + timedelta(days=1)).isoformat()},
            "description": ev.public_description or "",
            "location": ev.location or "",
        }
    else:
        body = {
            "summary": ev.title,
            "start": {"dateTime": f"{ev.date.isoformat()}T{ev.time_start.isoformat()}"},
            "end": {"dateTime": f"{ev.date.isoformat()}T{(ev.time_end or ev.time_start).isoformat()}"},
            "description": ev.public_description or "",
            "location": ev.location or "",
        }

    created = cal.events().insert(calendarId=calendar_id, body=body).execute()
    ev.calendar_event_id = created["id"]

    # Drive folder + media subfolders
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


@router.patch("/{event_id}", response_model=EventOut)
def update_event(event_id: int, payload: EventUpdate, request: Request, db: Session = Depends(get_db)):
    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(ev, field, value)

    db.add(ev)
    db.commit()
    db.refresh(ev)

    # best-effort calendar update
    token = require_token(request)
    creds = get_credentials_from_session(token)
    cal = calendar_service(creds)
    calendar_id = os.getenv("BAND_CALENDAR_ID")

    if calendar_id and ev.calendar_event_id:
        if ev.time_start is None:
            body = {
                "summary": ev.title,
                "start": {"date": ev.date.isoformat()},
                "end": {"date": (ev.date + timedelta(days=1)).isoformat()},
                "description": ev.public_description or "",
                "location": ev.location or "",
            }
        else:
            body = {
                "summary": ev.title,
                "start": {"dateTime": f"{ev.date.isoformat()}T{ev.time_start.isoformat()}"},
                "end": {"dateTime": f"{ev.date.isoformat()}T{(ev.time_end or ev.time_start).isoformat()}"},
                "description": ev.public_description or "",
                "location": ev.location or "",
            }

        cal.events().patch(calendarId=calendar_id, eventId=ev.calendar_event_id, body=body).execute()

    return ev


@router.delete("/{event_id}")
def delete_event(event_id: int, request: Request, db: Session = Depends(get_db)):
    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")

    # best-effort calendar delete
    token = require_token(request)
    creds = get_credentials_from_session(token)
    cal = calendar_service(creds)
    calendar_id = os.getenv("BAND_CALENDAR_ID")

    if calendar_id and ev.calendar_event_id:
        try:
            cal.events().delete(calendarId=calendar_id, eventId=ev.calendar_event_id).execute()
        except Exception:
            pass

    db.delete(ev)
    db.commit()
    return {"deleted": True, "id": event_id}
