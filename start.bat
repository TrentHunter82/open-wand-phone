@echo off
setlocal
title OPEN WAND
cd /d "%~dp0"

rem ---- Agent options. Add --absolute for an exact 1:1 pointer that
rem ---- skips the Windows "Enhance pointer precision" setting.
rem ---- Example:  set "WAND_ARGS=--absolute --verbose"
set "WAND_ARGS="

rem ---- Toggle: if the agent already runs, stop it and exit. ----
set "FOUND="
for /f %%p in ('powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'python*' -and $_.CommandLine -match 'agent\.py' } | Select-Object -ExpandProperty ProcessId"') do (
    set "FOUND=1"
    echo Stopping the OPEN WAND agent, PID %%p ...
    taskkill /pid %%p /f >nul 2>&1
)
if defined FOUND (
    echo Agent stopped. This window closes in 3 seconds.
    ping -n 4 127.0.0.1 >nul
    exit /b 0
)

rem ---- First run: install dependencies if they are missing. ----
python -c "import aiohttp, qrcode, cryptography" >nul 2>&1
if errorlevel 1 (
    echo Installing dependencies ...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo.
        echo Dependency install failed. Check that Python 3.11+ is on PATH.
        pause
        exit /b 1
    )
)

echo Starting the OPEN WAND agent.
echo Close this window to stop it, or double-click start.bat again.
echo.
python agent.py %WAND_ARGS%
echo.
echo Agent exited.
pause
