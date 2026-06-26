@echo off
cd /d "%~dp0"
title World Cup 2026 - Local Server

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js is not installed or not in PATH.
  echo Download from: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo.
echo Starting World Cup 2026 local server...
echo Open the URL shown below in your browser.
echo Do NOT open index.html directly.
echo.
node server.js
if errorlevel 1 (
  echo.
  echo [ERROR] Server failed to start. See message above.
  echo.
  pause
)