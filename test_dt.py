import datetime

items = [
    {
      "kind": "calendar#event",
      "id": "5toi34p91lsiqu6g0ntpk99lrt",
      "status": "confirmed",
      "summary": "hihi",
      "start": {
        "date": "2026-02-28"
      },
      "end": {
        "date": "2026-03-01"
      }
    }
]

for item in items:
    print("Testing item processing...")
    start_dt = item.get('start', {}).get('dateTime')
    start_d = item.get('start', {}).get('date')
    
    dt = datetime.datetime.now()
    if start_dt:
        try:
            dt = datetime.datetime.fromisoformat(start_dt.replace("Z", "+00:00"))
        except ValueError as e:
            print("ValueError start_dt:", e)
            pass
    elif start_d:
        try:
            dt = datetime.datetime.fromisoformat(start_d)
        except ValueError as e:
            print("ValueError start_d:", e)
            pass
            
    print("Processed dt:", dt)
    print("Result date:", dt.date())

