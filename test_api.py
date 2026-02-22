import urllib.request
try:
    req = urllib.request.Request('http://127.0.0.1:8000/events/month?year=2026&month=2', method='GET')
    res = urllib.request.urlopen(req)
    print("API RESPONSE:")
    print(res.read().decode('utf-8'))
except Exception as e:
    print("API DEAD or ERR:", e)
