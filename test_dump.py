import sys
import os

db_path = "C:/Users/kunap/Documents/Projects/BandManager/bandmanager.db"
out_path = "C:/Users/kunap/Documents/Projects/BandManager/hihi_dump.txt"

try:
    import sqlite3
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT id, title, date, calendar_event_id FROM events")
    rows = cur.fetchall()
    
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(f"ROWS: {len(rows)}\n")
        f.write(str(rows) + "\n")
        
except Exception as e:
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(f"ERROR: {str(e)}\n")
