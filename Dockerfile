# ---- Base image ----
FROM python:3.12-slim

# Pracovní adresář uvnitř containeru
WORKDIR /app

# Systémové závislosti (SQLite je součástí slim image)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Nainstaluj Python závislosti
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Zkopíruj zbytek projektu
COPY . .

# Vytvořit složku pro frontend pokud neexistuje (main.py to kontroluje)
RUN mkdir -p frontend

# Port, na kterém bude app naslouchat (Railway posílá $PORT)
ENV PORT=8000

# Spuštění aplikace
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
