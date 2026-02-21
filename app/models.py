from __future__ import annotations
from sqlalchemy import String, Date, Time, Text, Column, Integer, ForeignKey, UniqueConstraint, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base

from datetime import datetime


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    title: Mapped[str] = mapped_column(String(200))
    date: Mapped[str] = mapped_column(Date)  # YYYY-MM-DD

    # volitelné – když None, je to all-day
    time_start: Mapped[str | None] = mapped_column(Time, nullable=True)
    time_end: Mapped[str | None] = mapped_column(Time, nullable=True)

    location: Mapped[str | None] = mapped_column(String(200), nullable=True)

    public_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    internal_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    calendar_event_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    drive_folder_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    
    media_items = relationship("MediaItem", back_populates="event", cascade="all, delete-orphan")
    subs = relationship("EventSub", back_populates="event", cascade="all, delete-orphan")
    
class EventSub(Base):
    __tablename__ = "event_subs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(100))  # např. 'Baskytara'
    is_secured: Mapped[bool] = mapped_column(Boolean, default=False)  # False = shání se, True = zajištěn
    note: Mapped[str | None] = mapped_column(String(200), nullable=True) # např. jméno záskoku

    event: Mapped["Event"] = relationship("Event", back_populates="subs")
    
class MediaItem(Base):  # Base použij stejný jako pro Event
    __tablename__ = "media_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)

    drive_file_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str] = mapped_column(String)
    mime_type: Mapped[str] = mapped_column(String)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # "photos" | "videos" | "other"
    category: Mapped[str] = mapped_column(String, default="other", index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    event: Mapped["Event"] = relationship("Event", back_populates="media_items")


