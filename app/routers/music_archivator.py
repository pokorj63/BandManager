from __future__ import annotations

import os
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Instrument, Song
from app.schemas import (
    InstrumentOut,
    InstrumentSetup,
    InstrumentCreate,
    SongOut,
    SongCreate,
)
from app.token_store import TOKENS
from app.google_client import drive_service, get_credentials_from_session, ensure_folder

router = APIRouter(prefix="/ma", tags=["MusicArchivator"])


def get_user_email(request: Request) -> str:
    sid = request.session.get("sid")
    if not sid or sid not in TOKENS:
        raise HTTPException(status_code=401, detail="Not logged in")
    user = TOKENS[sid].get("user")
    if not user or "email" not in user:
        raise HTTPException(status_code=401, detail="User email not found in session")
    return user["email"]


@router.get("/instruments", response_model=list[InstrumentOut])
def list_instruments(request: Request, db: Session = Depends(get_db)):
    email = get_user_email(request)
    return db.query(Instrument).filter(Instrument.owner_email == email).all()


@router.post("/instruments/setup")
def save_instrument_setup(
    payload: InstrumentSetup, request: Request, db: Session = Depends(get_db)
):
    email = get_user_email(request)

    # Simple strategy: delete old and insert new
    db.query(Instrument).filter(Instrument.owner_email == email).delete()

    for inst in payload.instruments:
        new_inst = Instrument(
            owner_email=email,
            name=inst.name,
            category=inst.category,
            is_tracked=inst.is_tracked,
        )
        db.add(new_inst)

    db.commit()
    return {"status": "ok"}


@router.get("/songs", response_model=list[SongOut])
def list_songs(request: Request, db: Session = Depends(get_db)):
    email = get_user_email(request)
    return db.query(Song).filter(Song.owner_email == email).all()


@router.post("/songs", response_model=SongOut)
def create_song(payload: SongCreate, request: Request, db: Session = Depends(get_db)):
    email = get_user_email(request)

    # Validace čísla
    num = payload.number.strip()
    if num.upper() == "N":
        num = "N"
    elif not num.isdigit():
        raise HTTPException(
            status_code=400, detail="Číslo písně musí být celé číslo nebo 'N'"
        )

    if num != "N":
        existing = (
            db.query(Song).filter(Song.owner_email == email, Song.number == num).first()
        )
        if existing:
            raise HTTPException(
                status_code=400, detail=f"Skladba s číslem {num} již existuje"
            )

    # Google Drive Logika
    sid = request.session.get("sid")
    token = TOKENS[sid]
    creds = get_credentials_from_session(token)
    drv = drive_service(creds)

    root_id = os.getenv("BAND_DRIVE_ROOT_FOLDER_ID")
    noty_folder_id = ensure_folder(drv, root_id, "Noty - podle skladby")

    song_folder_name = f"{num} {payload.title}"
    song_folder_id = ensure_folder(drv, noty_folder_id, song_folder_name)

    new_song = Song(
        owner_email=email,
        number=num,
        title=payload.title,
        singer=payload.singer,
        duration=payload.duration,
        drive_folder_id=song_folder_id,
    )
    db.add(new_song)
    db.commit()
    db.refresh(new_song)
    return new_song
