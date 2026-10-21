@echo off
setlocal
cd /d "%~dp0"
title Teaching Timetable Setup
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Install-And-Start.ps1" %*
set "TIMETABLE_EXIT=%ERRORLEVEL%"
if not "%TIMETABLE_EXIT%"=="0" (
  echo.
  echo Setup did not complete. Review the message above.
  pause
)
exit /b %TIMETABLE_EXIT%

