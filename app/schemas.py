from __future__ import annotations

from datetime import date as dt_date, time as dt_time, datetime as dt_datetime
from typing import Optional
from pydantic import BaseModel, Field


class EventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    date: dt_date

    time_start: Optional[dt_time] = None
    time_end: Optional[dt_time] = None

    location: Optional[str] = Field(default=None, max_length=200)
    public_description: Optional[str] = None
    internal_notes: Optional[str] = None


class EventUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    date: Optional[dt_date] = None

    time_start: Optional[dt_time] = None
    time_end: Optional[dt_time] = None

    location: Optional[str] = Field(default=None, max_length=200)
    public_description: Optional[str] = None
    internal_notes: Optional[str] = None


class EventSubOut(BaseModel):
    id: int
    role: str
    is_secured: bool
    note: Optional[str]

    class Config:
        from_attributes = True


class EventSubCreate(BaseModel):
    role: str
    is_secured: bool = False
    note: Optional[str] = None


class EventSubUpdate(BaseModel):
    is_secured: Optional[bool] = None
    note: Optional[str] = None


class MediaItemOut(BaseModel):
    id: int
    event_id: int
    drive_file_id: str
    name: str
    mime_type: str
    size_bytes: int | None
    category: str
    created_at: dt_datetime

    class Config:
        from_attributes = True


class EventOut(BaseModel):
    id: int
    title: str
    date: dt_date

    time_start: Optional[dt_time]
    time_end: Optional[dt_time]

    location: Optional[str]
    public_description: Optional[str]
    internal_notes: Optional[str]

    calendar_event_id: Optional[str] = None
    drive_folder_id: Optional[str] = None

    subs: list[EventSubOut] = []
    media_items: list[MediaItemOut] = []

    class Config:
        from_attributes = True


class InstrumentOut(BaseModel):
    id: int
    name: str
    category: str
    is_tracked: bool

    class Config:
        from_attributes = True


class InstrumentCreate(BaseModel):
    name: str
    category: str
    is_tracked: bool = True


class InstrumentSetup(BaseModel):
    instruments: list[InstrumentCreate]


class SongOut(BaseModel):
    id: int
    number: str
    title: str
    singer: str
    duration: int
    drive_folder_id: Optional[str]

    class Config:
        from_attributes = True


class SongCreate(BaseModel):
    number: str
    title: str
    singer: str
    duration: int
