from sqlalchemy import String, Date, Time, Text
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    title: Mapped[str] = mapped_column(String(200))
    date: Mapped[str] = mapped_column(Date)  # YYYY-MM-DD

    # volitelné – když None, je to all-day
    time_start: Mapped[str | None] = mapped_column(Time, nullable=True)
    time_end: Mapped[str | None] = mapped_column(Time, nullable=True)

    location: Mapped[str | None] = mapped_column(String(200), nullable=True)

    public_description: Mapped[str | None] = mapped_column(Text, nullable=True)   # jde do Google Calendar (později)
    internal_notes: Mapped[str | None] = mapped_column(Text, nullable=True)       # jen v appce