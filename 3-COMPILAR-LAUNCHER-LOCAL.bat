@echo off
chcp 65001 >nul
echo Necesitas Node.js instalado (https://nodejs.org). Si falla, usa GitHub Actions (mira el LEEME).
cd launcher
call npm install
call npm run dist
echo.
echo Listo: los .exe estan en launcher\dist
pause
