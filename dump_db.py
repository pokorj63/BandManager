import os
import sys
import sqlite3

try:
    conn = sqlite3.connect('bandmanager.db')
    c = conn.cursor()
    c.execute('SELECT id, title, date, calendar_event_id FROM events')
    with open('db_out.txt', 'w', encoding='utf-8') as f:
        f.write(str(c.fetchall()))
    conn.close()
    print("DB dumped successfully.")
except Exception as e:
    print(f"Error dumping DB: {e}")
