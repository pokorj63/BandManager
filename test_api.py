import requests
try:
    r = requests.get("http://127.0.0.1:8000/events/month?year=2026&month=2")
    print(r.status_code)
    print(r.text[:200])
except Exception as e:
    print(e)
