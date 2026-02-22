from __future__ import annotations

import calendar as calmod
import os
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.db import get_db
from app.token_store import TOKENS
from app.models import Event, MediaItem, EventSub
from app.schemas import EventCreate, EventOut, EventUpdate, MediaItemOut, EventSubCreate, EventSubUpdate, EventSubOut
from app.google_client import (
    get_credentials_from_session,
    calendar_service,
    drive_service,
    ensure_media_subfolders,
    upload_file_to_drive,
)
TZ = "Europe/Prague"
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


@router.get("/upcoming", response_model=list[EventOut])
def list_upcoming_events(db: Session = Depends(get_db)):
    from_date = date.today() - timedelta(days=365)
    return (
        db.query(Event)
        .filter(Event.date >= from_date)
        .order_by(Event.date.asc())
        .limit(200)
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

    if ev.time_start is None:
        body = {
            "summary": ev.title,
            "start": {"date": ev.date.isoformat()},
            "end": {"date": (ev.date + timedelta(days=1)).isoformat()},
            "description": ev.public_description or "",
            "location": ev.location or "",
        }
    else:
        start_dt = f"{ev.date.isoformat()}T{ev.time_start.isoformat(timespec='seconds')}"
        end_time = (ev.time_end or ev.time_start)
        end_dt = f"{ev.date.isoformat()}T{end_time.isoformat(timespec='seconds')}"

        body = {
            "summary": ev.title,
            "start": {"dateTime": start_dt, "timeZone": TZ},
            "end": {"dateTime": end_dt, "timeZone": TZ},
            "description": ev.public_description or "",
            "location": ev.location or "",
        }

    created = cal.events().insert(calendarId=calendar_id, body=body).execute()
    ev.calendar_event_id = created["id"]

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


@router.post("/{event_id}/playlist_attach")
def attach_playlist_to_calendar(
    event_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    
    token = require_token(request)
    creds = get_credentials_from_session(token)
    drv = drive_service(creds)
    cal = calendar_service(creds)
    calendar_id = os.getenv("BAND_CALENDAR_ID")
    
    # 1. Upload to Drive (to the event's Media folder)
    if not ev.drive_folder_id:
        raise HTTPException(status_code=400, detail="Event missing drive folder.")
        
    folders = ensure_media_subfolders(drv, ev.drive_folder_id)
    created = upload_file_to_drive(
        drv, folders["media"], file.file, file.filename or "Playlist.pdf", "application/pdf"
    )
    
    # store in DB MediaItem
    size_raw = created.get("size")
    size_bytes = int(size_raw) if size_raw is not None else None
    
    item = MediaItem(
        event_id=ev.id,
        drive_file_id=created["id"],
        name=file.filename or "Playlist.pdf",
        mime_type="application/pdf",
        size_bytes=size_bytes,
        category="other",
    )
    db.add(item)
    db.commit()

    # 2. Attach to Google Calendar Event
    if calendar_id and ev.calendar_event_id:
        try:
            cal_ev = cal.events().get(calendarId=calendar_id, eventId=ev.calendar_event_id).execute()
            attachments = cal_ev.get("attachments", [])
            attachments.append({
                "fileUrl": created.get("webViewLink") or created.get("webContentLink"),
                "mimeType": "application/pdf",
                "title": file.filename or "Playlist.pdf"
            })
            cal.events().patch(
                calendarId=calendar_id, 
                eventId=ev.calendar_event_id, 
                body={"attachments": attachments}, 
                supportsAttachments=True
            ).execute()
        except Exception:
            # Silently fallback if calendar sync fails (e.g. event deleted on cloud)
            pass

    return {"status": "ok", "drive_id": created["id"]}


@router.post("/{event_id}/media", response_model=MediaItemOut)
def upload_media(
    event_id: int,
    request: Request,
    file: UploadFile = File(...),
    category: str | None = Form(None),  # "photos" | "videos" | "other"
    db: Session = Depends(get_db),
):
    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    if not ev.drive_folder_id:
        raise HTTPException(status_code=400, detail="Event has no Drive folder")

    token = require_token(request)
    creds = get_credentials_from_session(token)
    drv = drive_service(creds)

    folders = ensure_media_subfolders(drv, ev.drive_folder_id)

    mime = file.content_type or "application/octet-stream"
    filename = file.filename or "upload.bin"

    # auto routing (MVP): video/* -> videos, image/* -> photos
    target = category
    if not target:
        if mime.startswith("image/"):
            target = "photos"
        elif mime.startswith("video/"):
            target = "videos"
        else:
            target = "other"

    folder_id = folders["photos"] if target == "photos" else folders["videos"] if target == "videos" else folders["media"]

    created = upload_file_to_drive(drv, folder_id, file.file, filename, mime)

    # size v Google response bývá string, tak to ošetříme
    size_raw = created.get("size")
    size_bytes = int(size_raw) if size_raw is not None else None

    item = MediaItem(
        event_id=ev.id,
        drive_file_id=created["id"],
        name=created.get("name") or filename,
        mime_type=created.get("mimeType") or mime,
        size_bytes=size_bytes,
        category=target,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/{event_id}/media", response_model=list[MediaItemOut])
def list_media(event_id: int, db: Session = Depends(get_db)):
    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    return (
        db.query(MediaItem)
        .filter(MediaItem.event_id == event_id)
        .order_by(MediaItem.created_at.asc())
        .all()
    )


@router.delete("/{event_id}/media/{media_id}")
def delete_media(event_id: int, media_id: int, request: Request, db: Session = Depends(get_db)):
    item = db.query(MediaItem).filter(MediaItem.id == media_id, MediaItem.event_id == event_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Media not found")

    # best-effort delete in Drive
    token = require_token(request)
    creds = get_credentials_from_session(token)
    drv = drive_service(creds)
    try:
        drv.files().delete(fileId=item.drive_file_id).execute()
    except Exception:
        pass

    db.delete(item)
    db.commit()
    return {"deleted": True, "id": media_id}

# --- Záskoky (EventSub) ---
@router.post("/{event_id}/subs", response_model=EventSubOut)
def create_sub(event_id: int, payload: EventSubCreate, db: Session = Depends(get_db)):
    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")

    sub = EventSub(event_id=ev.id, role=payload.role, is_secured=payload.is_secured, note=payload.note)
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub

@router.patch("/{event_id}/subs/{sub_id}", response_model=EventSubOut)
def update_sub(event_id: int, sub_id: int, payload: EventSubUpdate, db: Session = Depends(get_db)):
    sub = db.query(EventSub).filter(EventSub.id == sub_id, EventSub.event_id == event_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Sub not found")
    
    if payload.is_secured != None:
        sub.is_secured = payload.is_secured
    if payload.note != None:
        sub.note = payload.note
    
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub

@router.delete("/{event_id}/subs/{sub_id}")
def delete_sub(event_id: int, sub_id: int, db: Session = Depends(get_db)):
    sub = db.query(EventSub).filter(EventSub.id == sub_id, EventSub.event_id == event_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Sub not found")
    
    db.delete(sub)
    db.commit()
    return {"deleted": True}

# --- Sync from Google Calendar ---
@router.post("/sync")
def sync_calendar(request: Request, db: Session = Depends(get_db)):
    token = require_token(request)
    creds = get_credentials_from_session(token)
    cal = calendar_service(creds)
    calendar_id = os.getenv("BAND_CALENDAR_ID")
    if not calendar_id:
        raise HTTPException(status_code=500, detail="Missing BAND_CALENDAR_ID")
        
    try:
        # Tady bysme meli fetch-nout treba 50 future events a synchronizovat ty.
        import datetime
        now = datetime.datetime.utcnow().isoformat() + 'Z'  
        events_result = cal.events().list(calendarId=calendar_id, 
            timeMin=now, maxResults=50, singleEvents=True,
            orderBy='startTime').execute()
        
        items = events_result.get('items', [])
        
        # very basic 1-way sync (Google -> DB) based on calendar_event_id
        for item in items:
            event_id = item["id"]
            db_ev = db.query(Event).filter(Event.calendar_event_id == event_id).first()
            if not db_ev:
                # new event from calendar
                start = item['start'].get('dateTime', item['start'].get('date'))
                # Just a rough parse for MVP
                dt = datetime.datetime.fromisoformat(start) 
                
                new_ev = Event(
                    title=item.get("summary", "Bez Názvu"),
                    date=dt.date(),
                    location=item.get("location"),
                    public_description=item.get("description"),
                    calendar_event_id=event_id,
                )
                db.add(new_ev)
        db.commit()
        return {"synced": len(items)}
    except Exception as e:
        print(f"Sync error: {e}")
        raise HTTPException(status_code=500, detail="Error syncing from calendar")
