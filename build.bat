@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt pyinstaller
.venv\Scripts\pyinstaller --noconfirm --onedir --noconsole --name Roadmaps --icon assets\icon.ico ^
  --add-data "ui;ui" --add-data "examples;examples" app.py
copy /y LICENSE dist\Roadmaps\ >nul
copy /y THIRD_PARTY_NOTICES.md dist\Roadmaps\ >nul
echo.
echo Готово: dist\Roadmaps\Roadmaps.exe
pause
