@echo off
echo Killing python processes...
taskkill /F /IM python.exe /T
timeout /t 2
echo Starting uvicorn...
start /B python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
echo Restart script finished.
