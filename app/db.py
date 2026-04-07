import os
import shutil
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# Lokálně: ./bandmanager.db
# Na Railway: /data/bandmanager.db (Volume)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./bandmanager.db")

# Záchranné nahrání lokální DB do Volume
if "sqlite:////data/" in DATABASE_URL:
    vol_path = DATABASE_URL.replace("sqlite:///", "")
    local_path = "./bandmanager.db"
    
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
