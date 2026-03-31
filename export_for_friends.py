import os
import shutil

SOURCE_DIR = r"c:\Users\kunap\Documents\Projects\BandManager"
DEST_DIR = r"c:\Users\kunap\Documents\Projects\BandManager_Export"

# Co nekopírovat
EXCLUDE_DIRS = {".git", ".venv", "__pycache__", ".mypy_cache", ".vscode"}
EXCLUDE_FILES = {"bandmanager.db", ".env", "uv.lock", "BandManager.code-workspace"}


def copy_project():
    if os.path.exists(DEST_DIR):
        print(f"Mažu starý export v {DEST_DIR}...")
        shutil.rmtree(DEST_DIR)

    print(f"Kopíruji projekt do {DEST_DIR}...")
    shutil.copytree(
        SOURCE_DIR,
        DEST_DIR,
        ignore=shutil.ignore_patterns(*EXCLUDE_DIRS, *EXCLUDE_FILES),
    )
    print("Kopírování dokončeno.")


def modify_index_html():
    index_path = os.path.join(DEST_DIR, "frontend", "index.html")
    print(f"Upravuji {index_path}...")

    with open(index_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Změníme Mirkovo aktuální hlášení o "ostré produkci" na "Self-hosted" verzi
    old_warning = """<!-- Upozornění -->
                <div style="
                    background: rgba(251, 146, 60, 0.12);
                    border: 1px solid rgba(251, 146, 60, 0.45);
                    border-radius: 12px;
                    padding: 16px 18px;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                ">
                    <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #fb923c; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em;">
                        <i class="fa-solid fa-circle-info"></i>
                        Produkční nasazení
                    </div>
                    <ul style="margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 7px; color: rgba(255,255,255,0.82);">
                        <li>Aplikace je nyní <strong>ostře nasazena</strong> a propojena se sdílenou složkou a kalendářem orchestru.</li>
                        <li>Pro funkčnost je nutné se přihlásit účtem <strong style="color: #fb923c;">offbeatorchestra@gmail.com</strong> a potvrdit přístupy.</li>
                        <li>Změny provedené v aplikaci (akce, noty, playlisty) se promítají do <strong>reálných sdílených dat</strong>.</li>
                        <li>Pokud narazíte na jakoukoliv chybu, dejte mi prosím vědět – ladíme detaily za pochodu! 🙏</li>
                    </ul>
                </div>"""

    new_warning = ""

    content = content.replace(old_warning, new_warning)

    with open(index_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Úpravy index.html dokončeny.")


if __name__ == "__main__":
    copy_project()
    try:
        modify_index_html()
    except Exception as e:
        print(f"Chyba při úpravách: {e}")

    print(f"Hotovo! Verze pro kamarády je připravená v: {DEST_DIR}")
