import sys
import os
import datetime

sys.path.append(os.getcwd())
from app.db import SessionLocal
from app.models import Event

db = SessionLocal()
print("Cleaning out events created today by sync with wrong dates...")

# We are looking for an event with calendar_event_id == "5toi34p91lsiqu6g0ntpk99lrt"
e = db.query(Event).filter(Event.calendar_event_id == "5toi34p91lsiqu6g0ntpk99lrt").first()
if e:
    print(f"Found event {e.title} with date {e.date}, deleting...")
    db.delete(e)
    db.commit()
    print("Deleted successfully.")
else:
    print("No such event found.")
