import sqlite3
with open("db_output123.txt", "w", encoding="utf-8") as f:
    try:
        c = sqlite3.connect('bandmanager.db').cursor()
        c.execute('SELECT id, title, date, calendar_event_id FROM events')
        f.write(str(c.fetchall()))
    except Exception as e:
        f.write(str(e))
