@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e execute este arquivo de novo.
  pause
  exit /b
)
echo MODO DEMONSTRACAO com dados de exemplo (arquivo separado: dados\demo.json)
start "" cmd /c "timeout /t 3 >nul & start http://localhost:8788"
node server\dev.mjs --arquivo dados\demo.json --seed
pause
