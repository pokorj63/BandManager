from datetime import date, time
from pydantic import BaseModel, Field


class EventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    date: date

    time_start: time | None = None
    time_end: time | None = None

    location: str | None = Field(default=None, max_length=200)
    public_description: str | None = None
    internal_notes: str | None = None


class EventOut(BaseModel):
    id: int
    title: str
    date: date

    time_start: time | None
    time_end: time | None

    location: str | None
    public_description: str | None
    internal_notes: str | None

    class Config:
        from_attributes = True