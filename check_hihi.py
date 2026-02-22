import sys
import os

sys.path.append(os.getcwd())
from app.db import SessionLocal
from app.models import Event

db = SessionLocal()
hihi_events = db.query(Event).filter(Event.title == "hihi").all()
print(f"Found {len(hihi_events)} events with title 'hihi'")
for e in hihi_events:
    print(f"ID: {e.id}, Title: {e.title}, Date: {e.date}, CalId: {e.calendar_event_id}")

# Also just get all events in February 2026 to see if it mapped to another month accidentally
import datetime
start_date = datetime.date(2026, 2, 1)
end_date = datetime.date(2026, 3, 1)
feb_events = db.query(Event).filter(Event.date >= start_date, Event.date < end_date).all()
print(f"\nAll events in Feb 2026 ({len(feb_events)}):")
for e in feb_events:
    print(f"ID: {e.id}, Date: {e.date}, Title: {e.title}")
