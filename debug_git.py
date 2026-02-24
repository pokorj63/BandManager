import subprocess
import os

try:
    result = subprocess.run(
        ["git", "status", "-s"], capture_output=True, text=True, check=True
    )
    with open("git_status_current.txt", "w", encoding="utf-8") as f:
        f.write(result.stdout)
        f.write("\nSTDERR:\n")
        f.write(result.stderr)
    print("Done")
except subprocess.CalledProcessError as e:
    with open("git_status_current.txt", "w", encoding="utf-8") as f:
        f.write(f"Error: {e}\n")
        f.write(f"STDOUT: {e.stdout}\n")
        f.write(f"STDERR: {e.stderr}\n")
    print(f"Error: {e}")
except Exception as e:
    with open("git_status_current.txt", "w", encoding="utf-8") as f:
        f.write(f"General Error: {e}\n")
    print(f"General Error: {e}")
