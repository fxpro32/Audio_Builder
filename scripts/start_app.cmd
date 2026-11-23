@echo off
rem Audio Builder start for Windows 10/11 (W1_WINDOWS, R45). Double-click it, or run it from a terminal.
rem Same steps as start_app.sh, done by start_app.mjs: npm ci the first time, build if needed, start the server in the
rem background on port 8420 (log: data\private\server.log), then open http://localhost:8420 in the web browser.
setlocal
set "AB_DBL="
setlocal EnableDelayedExpansion
set "AB_CL=!cmdcmdline!"
if /i not "!AB_CL:%~nx0=!"=="!AB_CL!" (endlocal & set "AB_DBL=1") else endlocal
where node >nul 2>nul || (echo Node.js is not installed or not on the PATH. Install the LTS version from https://nodejs.org/ then run this again. & set "AB_RC=1" & goto :end)
where npm >nul 2>nul || (echo npm was not found. Install Node.js from https://nodejs.org/ [it includes npm] then run this again. & set "AB_RC=1" & goto :end)
node "%~dp0start_app.mjs" --open
set "AB_RC=%ERRORLEVEL%"
:end
if defined AB_DBL pause
exit /b %AB_RC%
