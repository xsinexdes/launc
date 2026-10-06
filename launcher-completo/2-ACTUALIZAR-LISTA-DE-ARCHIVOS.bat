@echo off
chcp 65001 >nul
node herramientas\generar-manifest.js
echo.
echo Ahora sube la carpeta servidor-archivos a tu hosting o a GitHub.
pause
