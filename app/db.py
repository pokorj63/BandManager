import os
import shutil
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# Lokální fallback (nebo definice přes prostředí)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./bandmanager.db")

# Záchranné nahrání lokální DB do Volume a automatické nastavení
vol_dir = "/data"
vol_path = "/data/bandmanager.db"
local_path = "./bandmanager.db"

if os.path.isdir(vol_dir):
    # Přepíšeme URL napřímo - pro případ, že chybí systémová proměnná
    DATABASE_URL = f"sqlite:///{vol_path}"
    
    # Pokud máme v Gitu nahranou lokální výchozí databázi...
    if os.path.exists(local_path):
        # A ta napojená ve Volume buď chybí, nebo je prázdná (< 50 KB)...
        if not os.path.exists(vol_path) or os.path.getsize(vol_path) < 50000:
            print(f"Byla zjištěna prázdná/nová databáze ve Volume. Nasazuji výchozí lokální zálohu...")
            shutil.copy2(local_path, vol_path)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # nutné pro SQLite ve FastAPI
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
