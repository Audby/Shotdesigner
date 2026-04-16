@echo off
title Shot Designer (Dev Mode)
cd /d "%~dp0"

:: Use the bundled Node.js
set "PATH=%~dp0tools\node;%PATH%"

echo Starting Shot Designer in development mode...
call npx concurrently -k "vite" "wait-on http://localhost:5173 && cross-env NODE_ENV=development electron ."
