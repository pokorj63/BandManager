import sys
import os

sys.path.append(os.getcwd())
try:
    from app.db import SessionLocal
    from app.models import Event
    
    db = SessionLocal()
    hihi_events = db.query(Event).filter(Event.title == "hihi").all()
    
    with open("check_hihi_output.txt", "w", encoding="utf-8") as f:
        f.write(f"Found {len(hihi_events)} events with title 'hihi'\n")
        for e in hihi_events:
            f.write(f"ID: {e.id}, Title: {e.title}, Date: {e.date}, CalId: {e.calendar_event_id}\n")
        f.write("Done.\n")
        
        # Also just get all events in February 2026
        import datetime
        start_date = datetime.date(2026, 2, 1)
        end_date = datetime.date(2026, 3, 1)
        feb_events = db.query(Event).filter(Event.date >= start_date, Event.date < end_date).all()
        f.write(f"\nAll events in Feb 2026 ({len(feb_events)}):\n")
        for e in feb_events:
            f.write(f"ID: {e.id}, Date: {e.date}, Title: {e.title}\n")
except Exception as e:
    with open("check_hihi_output.txt", "w", encoding="utf-8") as f:
        f.write(f"Error: {e}\n")
