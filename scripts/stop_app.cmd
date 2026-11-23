@echo off
rem Audio Builder stop for Windows 10/11 (W1_WINDOWS, R45). Stops only the Audio_Builder server on port 8420
rem (same check as restart_app.cmd) and does not start it again. The work is done by restart_app.ps1 -StopOnly.
setlocal
set "AB_DBL="
setlocal EnableDelayedExpansion
set "AB_CL=!cmdcmdline!"
if /i not "!AB_CL:%~nx0=!"=="!AB_CL!" (endlocal & set "AB_DBL=1") else endlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart_app.ps1" -StopOnly
set "AB_RC=%ERRORLEVEL%"
if defined AB_DBL pause
exit /b %AB_RC%
