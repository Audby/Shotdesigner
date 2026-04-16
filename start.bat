@echo off
title Shot Designer
cd /d "%~dp0"

:: Use the bundled Node.js
set "PATH=%~dp0tools\node;%PATH%"

echo Building Shot Designer...
call npm run build
echo.

echo Starting Shot Designer...
call npx electron .
