import os
import sys
import datetime
from dotenv import load_dotenv

sys.path.append(os.getcwd())
load_dotenv()

from app.db import SessionLocal
from app.models import Event
from app.google_client import calendar_service

# Load raw events from DB
db = SessionLocal()
print("--- DB events ---")
for e in db.query(Event).all():
    print(f"ID: {e.id}, Title: {e.title}, Date: {e.date}, CalId: {e.calendar_event_id}")

print("\n--- Google Calendar API FETCH ---")
import google.oauth2.credentials
# I don't have user tokens easily accessible from a script. But wait, I can just check the db contents for now.
