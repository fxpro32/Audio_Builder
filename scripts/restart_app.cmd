@echo off
rem Audio Builder restart for Windows 10/11 (W1_WINDOWS, R45). Double-click it, or run it from a terminal.
rem Stops only the Audio_Builder server on port 8420 (its command line must contain server\server.mjs or server/server.mjs;
rem anything else on that port is left alone), then starts it again. The work is done by restart_app.ps1.
setlocal
set "AB_DBL="
setlocal EnableDelayedExpansion
set "AB_CL=!cmdcmdline!"
if /i not "!AB_CL:%~nx0=!"=="!AB_CL!" (endlocal & set "AB_DBL=1") else endlocal
where node >nul 2>nul || (echo Node.js is not installed or not on the PATH. Install the LTS version from https://nodejs.org/ then run this again. & set "AB_RC=1" & goto :end)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart_app.ps1"
set "AB_RC=%ERRORLEVEL%"
:end
if defined AB_DBL pause
exit /b %AB_RC%
