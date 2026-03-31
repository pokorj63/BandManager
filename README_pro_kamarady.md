# BandManager - Návod k nasazení (Self-hosted)

Ahoj! Tento projekt je BandManager – aplikace pro správu kapely, not (MusicArchivator), setlistů (PlaylistMaker) a koncertů (EventPlaner).

Aplikace běží na **Pythonu (FastAPI)** na backendu a čistém **HTML/JS/CSS** na frontendu. Využívá **SQLite** databázi a propojení s **Google Drive API** a **Google Calendar API**.

---

## 1. Co budete potřebovat

1. **Nainstalovaný Python 3.10+**
2. **Google Cloud účet** (stačí běžný Google účet, pod kterým zakládáte projekt v [Google Cloud Console](https://console.cloud.google.com/)).
3. **Složku na Google Disku** kam aplikace bude ukládat noty a setlisty.
4. **Google Kalendář** (ideálně separátní kalendář pro kapelu) pro události.

---

## 2. Příprava Google API (Nejsložitější krok)

Aplikace potřebuje ke svému běhu tzn. OAuth 2.0 Client credentials vytvořené v Google Cloud.

1. Běžte do [Google Cloud Console](https://console.cloud.google.com/).
2. Vytvořte nový projekt (např. _NaseKapela-Manager_).
3. V bočním menu jděte do **APIs & Services > Library** a povolte dvě API:
   - **Google Drive API**
   - **Google Calendar API**
4. Jděte do **APIs & Services > OAuth consent screen**:
   - Zvolte **External** (nebo Internal pokud máte placený Google Workspace).
   - Vyplňte název aplikace, e-mail podpory (libovolný váš).
   - _Poznámka:_ Pokud je aplikace v testovacím režimu (Testing), nezapomeňte v sekci "Test users" přidat e-maily všech členů kapely, kteří se budou přihlašovat! (Nebo můžete aplikaci publikovat - tlačítko Publish).
5. Jděte do **APIs & Services > Credentials**:
   - Klikněte na **Create Credentials > OAuth client ID**.
   - Typ aplikace zvolte **Web application**.
   - **Authorized redirect URIs** (Kritické!):
     - `http://localhost:8000/auth/google/callback` (pro testování na lokálu)
     - `https://vasedomena.cz/auth/google/callback` (pokud to poběží na serveru)
   - Po vytvoření se vám ukáže **Client ID** a **Client Secret**. Ty si uložte, budete je potřebovat.

---

## 3. Nastavení .env souboru

Zkopírujte soubor `.env.example` a přejmenujte ho na `.env`.
Vyplňte v něm tyto hodnoty:

```env
# URL, na které aplikace poběží (např. http://localhost:8000 nebo https://mojekapela.cz)
FRONTEND_URL=http://localhost:8000

# Údaje z Google Cloud Console - Krok 2
GOOGLE_CLIENT_ID=vasi_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=vasi_secret_klic

# ID vaší root složky na Google Disku.
# Zjistíte ho z URL, když otevřete složku v prohlížeči: drive.google.com/drive/folders/<TOTO_JE_ID>
BAND_DRIVE_ROOT_FOLDER_ID=1A2B3C4D5E6F7G8H9I

# ID kalendáře kapely. Zjistíte ho v nastavení kalendáře u Googlu (dole v sekci Integrovat kalendář).
BAND_CALENDAR_ID=c_nejakeid@group.calendar.google.com

# Níže uvedené hodnoty neměňte
DATABASE_URL=sqlite:///./bandmanager.db
```

---

## 4. Instalace závislostí a spuštění

Tato část se předpokládá spouštět z terminálu ve vaší složce s aplikací.

**Vytvoření virtuálního prostředí (doporučeno):**

```bash
python -m venv .venv
```

_(Na Windows pak: `.venv\Scripts\activate` , na Mac/Linux: `source .venv/bin/activate`)_

**Instalace balíčků:**

```bash
pip install -r requirements.txt
```

**Spuštění lokálního serveru:**

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

_(Aplikace se spustí primárně na portu 8000. Pokud nemáte `--reload`, použijte bash skripty nebo python `main.py`)._

## 5. První spuštění

- Navštivte `http://localhost:8000` (nebo vaši doménu).
- Klikněte na "Přihlásit se". Proběhne Google OAuth kolečko. Aplikace vás požádá o přístup k disku a kalendáři (které jste vytvořili v kroku 2).
- Jakmile je povolí, aplikace si uloží Token a získá přístup k vybranému Band Disku.
- _Upozornění:_ Přihlášení ukládá tokeny pro přístup. První uživatel, který propojí aplikaci, by ideálně měl mít jako vlastníka daný disk a kalendář.

To je vše! Aplikace si už sama vytvoří databázický soubor `bandmanager.db` a můžete začít vesele managovat!
