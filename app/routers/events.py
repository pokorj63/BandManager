from __future__ import annotations

import calendar as calmod
import os
import json
from datetime import date, timedelta, datetime, time
import io
import re
import unicodedata
from pypdf import PdfReader
from googleapiclient.http import MediaIoBaseDownload
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.db import get_db
from app.token_store import TOKENS
from app.models import Event, MediaItem, EventSub, Song, SongFile
from app.schemas import (
    EventCreate,
    EventOut,
    EventUpdate,
    MediaItemOut,
    EventSubCreate,
    EventSubUpdate,
    EventSubOut,
)
from app.google_client import (
    get_credentials_from_session,
    calendar_service,
    drive_service,
    ensure_folder,
    upload_file_to_drive,
)

TZ = "Europe/Prague"
router = APIRouter(prefix="/events", tags=["events"])


def build_calendar_times(event_date: date, time_start: time | None, time_end: time | None) -> tuple[dict, dict]:
    """
    Returns (start_dict, end_dict) formatted for Google Calendar API.
    Handles:
    - All-day events (time_start is None)
    - Timed events without end time (defaults to +2 hours)
    - Timed events ending past midnight (moves end date to next day)
    """
    if time_start is None:
        return (
            {"date": event_date.isoformat()},
            {"date": (event_date + timedelta(days=1)).isoformat()},
        )

    start_dt = datetime.combine(event_date, time_start)
    if time_end is None:
        end_dt = start_dt + timedelta(hours=2)
    else:
        if time_end <= time_start:
            end_dt = datetime.combine(event_date + timedelta(days=1), time_end)
        else:
            end_dt = datetime.combine(event_date, time_end)

    start_dict = {"dateTime": start_dt.isoformat(), "timeZone": TZ}
    end_dict = {"dateTime": end_dt.isoformat(), "timeZone": TZ}
    return start_dict, end_dict


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
        raise HTTPException(
            status_code=500,
            detail="Missing BAND_CALENDAR_ID or BAND_DRIVE_ROOT_FOLDER_ID in .env",
        )

    start_info, end_info = build_calendar_times(ev.date, ev.time_start, ev.time_end)
    body = {
        "summary": ev.title,
        "start": start_info,
        "end": end_info,
        "description": ev.public_description or "",
        "location": ev.location or "",
    }

    created = cal.events().insert(calendarId=calendar_id, body=body).execute()
    ev.calendar_event_id = created["id"]
    ev.drive_folder_id = None

    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


@router.patch("/{event_id}", response_model=EventOut)
def update_event(
    event_id: int, payload: EventUpdate, request: Request, db: Session = Depends(get_db)
):
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
        start_info, end_info = build_calendar_times(ev.date, ev.time_start, ev.time_end)
        body = {
            "summary": ev.title,
            "start": start_info,
            "end": end_info,
            "description": ev.public_description or "",
            "location": ev.location or "",
        }

        cal.events().patch(
            calendarId=calendar_id, eventId=ev.calendar_event_id, body=body
        ).execute()

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
            cal.events().delete(
                calendarId=calendar_id, eventId=ev.calendar_event_id
            ).execute()
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
    playlist_songs: str | None = Form(None),
    db: Session = Depends(get_db),
):
    try:
        ev = db.query(Event).filter(Event.id == event_id).first()
        if not ev:
            raise HTTPException(
                status_code=404, detail=f"Událost s ID {event_id} nebyla nalezena."
            )

        # Načteme bytes souboru, abychom z něj mohli případně naparsovat skladby i ho nahrát na Disk
        pdf_bytes = file.file.read()
        file.file.seek(0)

        if playlist_songs:
            try:
                ev.playlist_songs = json.loads(playlist_songs)
                db.commit()
            except Exception as e:
                print(f"Playlist JSON parse error: {e}")
        else:
            # Fallback: Pokud uživatel nahrál PDF přímo z PC v detailu události,
            # automaticky naparsujeme skladby, aby fungovaly záskoky i statistiky
            try:
                parsed_structure = parse_pdf_to_playlist_structure(pdf_bytes, db)
                extracted_ids = [
                    item["id"]
                    for blk in parsed_structure.get("blocks", [])
                    for item in blk.get("items", [])
                    if item.get("type") == "song" and "id" in item
                ]
                if extracted_ids:
                    ev.playlist_songs = extracted_ids
                    db.commit()
            except Exception as parse_err:
                print(f"Auto-parsing PDF for playlist_songs error: {parse_err}")

        # Získání credentials a služeb
        token = require_token(request)
        creds = get_credentials_from_session(token)
        drv = drive_service(creds)
        cal = calendar_service(creds)
        calendar_id = os.getenv("BAND_CALENDAR_ID")
        drive_root = os.getenv("BAND_DRIVE_ROOT_FOLDER_ID")

        if not drive_root:
            raise HTTPException(
                status_code=500,
                detail="V nastavení (.env) chybí BAND_DRIVE_ROOT_FOLDER_ID.",
            )

        # 1. Získání / zajištění složky Playlisty na Google Disku
        playlists_folder_id = ensure_folder(drv, drive_root, "Playlisty")

        # Resetovat file pointer pro jistotu
        file.file.seek(0)

        # 2. Nahrání na Disk do složky Playlisty
        created = upload_file_to_drive(
            drv,
            playlists_folder_id,
            file.file,
            file.filename or f"Playlist - {ev.title}.pdf",
            "application/pdf",
        )

        if not created or "id" not in created:
            raise Exception("Nepodařilo se vytvořit soubor na Google Disku.")

        # Zápis do DB
        size_raw = created.get("size")
        size_bytes = int(size_raw) if size_raw is not None else None

        item = MediaItem(
            event_id=ev.id,
            drive_file_id=created["id"],
            name=file.filename or "Playlist.pdf",
            mime_type="application/pdf",
            size_bytes=size_bytes,
            category="playlist",
        )
        db.add(item)
        db.commit()

        # 3. Úklid starých (Disk i DB)
        old_drive_ids = set()
        try:
            old_items = (
                db.query(MediaItem)
                .filter(
                    MediaItem.event_id == ev.id,
                    (MediaItem.category == "playlist")
                    | (MediaItem.name.like("Playlist%")),
                    MediaItem.id != item.id,
                )
                .all()
            )
            for old in old_items:
                old_drive_ids.add(old.drive_file_id)
                try:
                    drv.files().delete(fileId=old.drive_file_id).execute()
                except:
                    pass
                db.delete(old)
            db.commit()
        except Exception as cleanup_err:
            print(f"Cleanup error (non-fatal): {cleanup_err}")

        # 4. Kalendář
        if calendar_id and ev.calendar_event_id:
            try:
                cal_ev = (
                    cal.events()
                    .get(calendarId=calendar_id, eventId=ev.calendar_event_id)
                    .execute()
                )
                attachments = cal_ev.get("attachments", [])

                # Smazat staré playlisty z příloh (podle starých ID i obecně PDF playlistů)
                new_attachments = []
                for a in attachments:
                    a_file_id = a.get("fileId")
                    a_title = a.get("title", "")
                    a_mime = a.get("mimeType", "").lower()

                    if a_file_id and a_file_id in old_drive_ids:
                        continue
                    if "pdf" in a_mime and (a_title.startswith("Playlist") or a_file_id == created["id"]):
                        continue
                    new_attachments.append(a)

                file_url = created.get("webViewLink") or created.get("webContentLink")
                if file_url:
                    new_attachments.append(
                        {
                            "fileId": created["id"],
                            "fileUrl": file_url,
                            "mimeType": "application/pdf",
                            "title": file.filename or "Playlist.pdf",
                        }
                    )
                    cal.events().patch(
                        calendarId=calendar_id,
                        eventId=ev.calendar_event_id,
                        body={"attachments": new_attachments},
                        supportsAttachments=True,
                    ).execute()
            except Exception as cal_err:
                print(f"Calendar error (non-fatal): {cal_err}")

        return {"status": "ok", "drive_id": created["id"]}

    except HTTPException:
        raise
    except Exception as e:
        import traceback

        traceback.print_exc()
        # Vracíme Mirek-error aby byl videt detail
        raise HTTPException(
            status_code=500, detail=f"Chyba serveru při ukládání playlistu: {str(e)}"
        )





# --- Záskoky (EventSub) ---
@router.post("/{event_id}/subs", response_model=EventSubOut)
def create_sub(event_id: int, payload: EventSubCreate, db: Session = Depends(get_db)):
    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")

    sub = EventSub(
        event_id=ev.id,
        role=payload.role,
        is_secured=payload.is_secured,
        note=payload.note,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


@router.patch("/{event_id}/subs/{sub_id}", response_model=EventSubOut)
def update_sub(
    event_id: int, sub_id: int, payload: EventSubUpdate, db: Session = Depends(get_db)
):
    sub = (
        db.query(EventSub)
        .filter(EventSub.id == sub_id, EventSub.event_id == event_id)
        .first()
    )
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
    sub = (
        db.query(EventSub)
        .filter(EventSub.id == sub_id, EventSub.event_id == event_id)
        .first()
    )
    if not sub:
        raise HTTPException(status_code=404, detail="Sub not found")

    db.delete(sub)
    db.commit()
    return {"deleted": True}


@router.post("/{event_id}/subs/{sub_id}/generate_folder")
def generate_sub_folder(
    event_id: int, sub_id: int, request: Request, db: Session = Depends(get_db)
):
    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Událost nenalezena.")

    sub = (
        db.query(EventSub)
        .filter(EventSub.id == sub_id, EventSub.event_id == event_id)
        .first()
    )
    if not sub:
        raise HTTPException(status_code=404, detail="Záskok nenalezen.")

    token = require_token(request)
    creds = get_credentials_from_session(token)
    drv = drive_service(creds)
    drive_root = os.getenv("BAND_DRIVE_ROOT_FOLDER_ID")

    # Pokud ev.playlist_songs chybí, zkusíme automaticky vytěžit skladby z připojeného playlistu
    if not ev.playlist_songs:
        playlist_item = (
            db.query(MediaItem)
            .filter(
                MediaItem.event_id == event_id,
                (MediaItem.category == "playlist") | (MediaItem.name.like("Playlist%")),
            )
            .order_by(MediaItem.created_at.desc())
            .first()
        )
        if playlist_item:
            try:
                drive_req = drv.files().get_media(fileId=playlist_item.drive_file_id)
                fh = io.BytesIO()
                downloader = MediaIoBaseDownload(fh, drive_req)
                done = False
                while not done:
                    status, done = downloader.next_chunk()
                parsed = parse_pdf_to_playlist_structure(fh.getvalue(), db)
                extracted_ids = [
                    item["id"]
                    for blk in parsed.get("blocks", [])
                    for item in blk.get("items", [])
                    if item.get("type") == "song" and "id" in item
                ]
                if extracted_ids:
                    ev.playlist_songs = extracted_ids
                    db.commit()
            except Exception as parse_e:
                print(f"Fallback parse PDF failed in generate_sub_folder: {parse_e}")

    if not ev.playlist_songs:
        raise HTTPException(
            status_code=400,
            detail="K této události není přiřazen žádný playlist se skladbami. Vytvořte playlist v PlaylistMakeru nebo nahrajte PDF playlist.",
        )

    # Najít/vytvořit root pro Záskoky
    zaskoky_root_id = ensure_folder(drv, drive_root, "Noty pro záskoky")

    # Vytvořit složku "Datum Název události - Role"
    folder_name = f"{ev.date} {ev.title} - {sub.role}"
    target_folder_id = ensure_folder(drv, zaskoky_root_id, folder_name)

    # Vyčistit staré noty uvnitř
    q_old = f"'{target_folder_id}' in parents and trashed=false"
    old_files = drv.files().list(q=q_old, fields="files(id)").execute().get("files", [])
    for old in old_files:
        try:
            drv.files().delete(fileId=old["id"]).execute()
        except:
            pass

    def normalize_role(s: str | None) -> str:
        if not s:
            return ""
        s = unicodedata.normalize("NFKD", s).encode("ASCII", "ignore").decode("ASCII")
        return s.strip().lower()

    sub_role_norm = normalize_role(sub.role)

    # Postupně v pořadí z playlistu hledat a kopírovat příslušný part
    copied = 0
    for song_id in ev.playlist_songs:
        song_info = db.query(Song).filter(Song.id == song_id).first()
        if not song_info:
            continue

        # Vyhledáme part buď přesnou shodou nebo normalizovanou
        candidate_files = (
            db.query(SongFile)
            .filter(
                SongFile.song_id == song_id,
                SongFile.file_type == "part",
            )
            .all()
        )
        part_file = None
        for sf in candidate_files:
            if sf.instrument_name and normalize_role(sf.instrument_name) == sub_role_norm:
                part_file = sf
                break

        if part_file:
            ext = os.path.splitext(part_file.name)[1]
            new_name = f"{song_info.number} - {song_info.title}{ext}"
            try:
                copy_metadata = {
                    "name": new_name,
                    "parents": [target_folder_id],
                }
                drv.files().copy(
                    fileId=part_file.drive_file_id, body=copy_metadata
                ).execute()
                copied += 1
            except Exception as e:
                print(f"Error copying sub part {new_name}: {e}")

    return {"status": "ok", "copied_count": copied}


@router.get("/stats/songs")
def get_song_stats(db: Session = Depends(get_db)):
    events = db.query(Event).filter(Event.playlist_songs.isnot(None)).all()
    stats = {}
    for ev in events:
        if ev.playlist_songs and isinstance(ev.playlist_songs, list):
            for song_id in ev.playlist_songs:
                if song_id not in stats:
                    stats[song_id] = {"count": 0, "last_played": None}
                stats[song_id]["count"] += 1
                if (
                    not stats[song_id]["last_played"]
                    or ev.date > stats[song_id]["last_played"]
                ):
                    stats[song_id]["last_played"] = ev.date

    songs = db.query(Song).all()
    result = []
    for s in songs:
        if s.id in stats:
            result.append(
                {
                    "id": s.id,
                    "title": s.title,
                    "singer": s.singer,
                    "count": stats[s.id]["count"],
                    "last_played": (
                        stats[s.id]["last_played"].isoformat()
                        if stats[s.id]["last_played"]
                        else None
                    ),
                }
            )

    return sorted(result, key=lambda x: x["count"], reverse=True)


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

        now = datetime.datetime.utcnow().isoformat() + "Z"
        events_result = (
            cal.events()
            .list(
                calendarId=calendar_id,
                timeMin=now,
                maxResults=50,
                singleEvents=True,
                orderBy="startTime",
            )
            .execute()
        )

        items = events_result.get("items", [])
        # very basic 1-way sync (Google -> DB) based on calendar_event_id
        for item in items:
            summary = item.get("summary", "")
            if "zkouška" in summary.lower():
                print(f"Sync: Skipping rehearsal: {summary}")
                continue

            event_id = item["id"]
            db_ev = db.query(Event).filter(Event.calendar_event_id == event_id).first()

            # parse start/end
            start_dt = item.get("start", {}).get("dateTime")
            start_d = item.get("start", {}).get("date")

            # Default to today if both are somehow missing
            dt = datetime.datetime.now()

            if start_dt:
                try:
                    dt = datetime.datetime.fromisoformat(
                        start_dt.replace("Z", "+00:00")
                    )
                except ValueError:
                    pass
            elif start_d:
                try:
                    # start_d for all-day events is "YYYY-MM-DD"
                    parsed_date = datetime.date.fromisoformat(start_d)
                    dt = datetime.datetime.combine(parsed_date, datetime.time.min)
                except ValueError:
                    # Fallback for python < 3.7 or string variations
                    dt = datetime.datetime.strptime(start_d, "%Y-%m-%d")

            if not db_ev:
                print(f"Sync: New event found: {item.get('summary')} (ID: {event_id})")
                new_ev = Event(
                    title=item.get("summary", "Bez Názvu"),
                    date=dt.date(),
                    location=item.get("location"),
                    public_description=item.get("description"),
                    calendar_event_id=event_id,
                )
                db.add(new_ev)
            else:
                # Upravíme i existující události, kdyby se v Google Kalendáři přesunuly nebo přejmenovaly
                db_ev.date = dt.date()
                db_ev.title = item.get("summary", "Bez Názvu")
                db_ev.location = item.get("location")
                db_ev.public_description = item.get("description")

        db.commit()
        return {"synced": len(items)}
    except Exception as e:
        print(f"Sync error: {e}")
        raise HTTPException(status_code=500, detail="Error syncing from calendar")


def find_song_in_db(num: str, title: str, db: Session):
    def normalize_str(s: str) -> str:
        if not s:
            return ""
        s = unicodedata.normalize('NFKD', s).encode('ASCII', 'ignore').decode('ASCII')
        return s.strip().upper()

    if num and num != "N":
        song = db.query(Song).filter(Song.number == num).first()
        if song:
            return song

    norm_pdf_title = normalize_str(title).replace("…", "").replace("...", "").strip()
    if not norm_pdf_title:
        return None

    all_songs = db.query(Song).all()
    for s in all_songs:
        norm_db_title = normalize_str(s.title)
        db_trunc = norm_db_title[:23]
        if norm_db_title.startswith(norm_pdf_title) or db_trunc.startswith(norm_pdf_title):
            return s

    return None


def parse_pdf_to_playlist_structure(pdf_bytes: bytes, db: Session) -> dict:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    text_lines = []
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text_lines.extend(page_text.splitlines())

    lines = [line.strip() for line in text_lines if line.strip()]

    playlist_title = "PLAYLIST"
    if lines:
        first_line = lines[0]
        if first_line.upper().startswith("PLAYLIST"):
            playlist_title = first_line
            playlist_title = re.sub(r"^PLAYLIST\s*[-:]?\s*", "", playlist_title, flags=re.IGNORECASE)
            lines = lines[1:]

    blocks = []
    current_block = {"title": "1. Blok", "items": []}

    song_regex = re.compile(r"^\s*(\d+)\.\s+(.*?)\s+\((.*?)\)(.*)$")
    block_regex = re.compile(r"^\s*(\d+)\.\s*(Blok|Block|Set|Sekce|Setlist.*)$", re.IGNORECASE)

    for line in lines:
        song_match = song_regex.match(line)
        if song_match:
            idx_str, title_str, num_str, singer_str = song_match.groups()
            song = find_song_in_db(num_str, title_str, db)
            if song:
                current_block["items"].append({
                    "type": "song",
                    "id": song.id,
                    "number": song.number,
                    "title": song.title,
                    "singer": song.singer,
                    "duration": song.duration
                })
            else:
                current_block["items"].append({
                    "type": "song_not_found",
                    "number": num_str,
                    "title": title_str,
                    "singer": singer_str.strip()
                })
            continue

        block_match = block_regex.match(line)
        if block_match:
            if current_block["items"]:
                blocks.append(current_block)
            current_block = {"title": line, "items": []}
            continue

        current_block["items"].append({
            "type": "note",
            "text": line
        })

    if current_block["items"] or not blocks:
        blocks.append(current_block)

    return {
        "title": playlist_title,
        "blocks": blocks
    }


@router.get("/{event_id}/playlist/parse")
def parse_event_playlist(
    event_id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")

    token = require_token(request)
    creds = get_credentials_from_session(token)
    drv = drive_service(creds)

    playlist_item = (
        db.query(MediaItem)
        .filter(
            MediaItem.event_id == event_id,
            MediaItem.category == "playlist"
        )
        .first()
    )

    if not playlist_item:
        playlist_item = (
            db.query(MediaItem)
            .filter(
                MediaItem.event_id == event_id,
                MediaItem.name.like("Playlist%")
            )
            .first()
        )

    if playlist_item:
        try:
            drive_req = drv.files().get_media(fileId=playlist_item.drive_file_id)
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, drive_req)
            done = False
            while not done:
                status, done = downloader.next_chunk()

            pdf_bytes = fh.getvalue()
            parsed_playlist = parse_pdf_to_playlist_structure(pdf_bytes, db)
            return parsed_playlist
        except Exception as e:
            print(f"Failed to download or parse PDF: {e}")

    if ev.playlist_songs:
        items = []
        for song_id in ev.playlist_songs:
            song = db.query(Song).filter(Song.id == song_id).first()
            if song:
                items.append({
                    "type": "song",
                    "id": song.id,
                    "number": song.number,
                    "title": song.title,
                    "singer": song.singer,
                    "duration": song.duration
                })
        return {
            "title": f"{ev.date} {ev.title}",
            "blocks": [
                {
                    "title": "1. Blok",
                    "items": items
                }
            ]
        }

    raise HTTPException(
        status_code=404,
        detail="No playlist PDF or song list found for this event."
    )
