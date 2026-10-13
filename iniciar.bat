@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e execute este arquivo de novo.
  pause
  exit /b
)
echo Abrindo o sistema... (deixe esta janela aberta enquanto usa; feche para encerrar)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8788"
node server\dev.mjs --arquivo dados\cascata.json
pause
