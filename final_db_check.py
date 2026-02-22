import sys
import os

sys.path.append(os.getcwd())
from app.db import SessionLocal
from app.models import Event

db = SessionLocal()
events = db.query(Event).all()
with open("final_db_dump.txt", "w", encoding="utf-8") as f:
    for e in events:
        f.write(f"ID: {e.id}, Title: {e.title}, Date: {e.date}, CalID: {e.calendar_event_id}\n")
