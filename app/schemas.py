from __future__ import annotations

from datetime import date, time, datetime
from typing import Optional
from pydantic import BaseModel, Field


class EventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    date: date

    time_start: Optional[time] = None
    time_end: Optional[time] = None

    location: Optional[str] = Field(default=None, max_length=200)
    public_description: Optional[str] = None
    internal_notes: Optional[str] = None


class EventUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    date: Optional[date] = None

    time_start: Optional[time] = None
    time_end: Optional[time] = None

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

class EventOut(BaseModel):
    id: int
    title: str
    date: date

    time_start: Optional[time]
    time_end: Optional[time]

    location: Optional[str]
    public_description: Optional[str]
    internal_notes: Optional[str]

    calendar_event_id: Optional[str] = None
    drive_folder_id: Optional[str] = None
    
    subs: list[EventSubOut] = []

    class Config:
        from_attributes = True
        
class MediaItemOut(BaseModel):
    id: int
    event_id: int
    drive_file_id: str
    name: str
    mime_type: str
    size_bytes: int | None
    category: str
    created_at: datetime

    class Config:
        from_attributes = True