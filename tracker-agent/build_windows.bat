@echo off
REM Builds a standalone Windows executable for the DelCargo Tracker agent.
REM Run this ON A WINDOWS MACHINE (PyInstaller cannot cross-compile from
REM Linux/Mac to Windows). The GitHub Actions workflow in
REM .github/workflows/build-tracker-agent.yml does this automatically on a
REM windows-latest runner if you don't want to build locally.

python -m pip install --upgrade pip
pip install -r requirements.txt

REM Sanity check: fail loudly here instead of PyInstaller silently packaging
REM a build that crashes on launch with a SyntaxError (this happened once —
REM see the "reason_text" bug fixed in agent_gui.py).
python -m py_compile agent_gui.py || (echo agent_gui.py failed to compile — aborting build. && exit /b 1)

REM Regenerates icon.ico / icon.png from "Tracker Icon.png" if present —
REM safe to skip (build still works, just without a custom icon) if you
REM haven't added a brand icon file yet.
if exist "Tracker Icon.png" python generate_icons.py

set ICON_FLAG=
if exist "icon.ico" set ICON_FLAG=--icon "icon.ico"

REM --add-data bundles icon.png inside the exe so the in-app window/taskbar
REM icon and tray icon can find it at runtime via sys._MEIPASS (see
REM _app_icon_path() in agent_gui.py). Skipped if icon.png doesn't exist.
set DATA_FLAG=
if exist "icon.png" set DATA_FLAG=--add-data "icon.png;."

pyinstaller --onefile --windowed --name "DelCargo Tracker" %ICON_FLAG% %DATA_FLAG% agent_gui.py

echo.
echo Build complete. Find it at dist\DelCargo Tracker.exe
