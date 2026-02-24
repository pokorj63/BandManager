import os
import subprocess
import time

try:
    print("Stopping python processes...")
    subprocess.run(["taskkill", "/F", "/IM", "python.exe", "/T"], capture_output=True)
    time.sleep(2)
    print("Starting server...")
    subprocess.Popen(
        [
            "python",
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8000",
        ],
        stdout=open("server_out.log", "w"),
        stderr=open("server_err.log", "w"),
        shell=True,
    )
    print("Server start triggered.")
except Exception as e:
    print(f"Error: {e}")
