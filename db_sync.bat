@echo off
REM ============================================================
REM  db_sync.bat – stáhne aktuální DB z Railway a uloží lokálně
REM  Spusť PŘED každým git push s kódovými změnami!
REM ============================================================

set RAILWAY_URL=https://bandmanager-production-3589.up.railway.app
set SECRET=sbZdMKmrJ4uqIwOf3SBK_jBP8oNnLpB__e4dWSNnpKI

echo.
echo [1/3] Stahuji databazi z Railway...
curl -L -o bandmanager.db "%RAILWAY_URL%/admin/backup-db?secret=%SECRET%"

if %ERRORLEVEL% neq 0 (
    echo CHYBA: Stazeni selhalo. Zkontroluj pripojeni nebo zda Railway bezi.
    pause
    exit /b 1
)

echo.
echo [2/3] Databaze stazena jako bandmanager.db
echo.
echo [3/3] Hotovo! Nyni proved:
echo    git add bandmanager.db
echo    git commit -m "sync: update db from Railway"  
echo    git push
echo.
pause
