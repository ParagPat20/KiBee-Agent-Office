@echo off
setlocal enabledelayedexpansion
title KiBee Agent Office - Pixel Agents

echo =========================================================
echo             KiBee Pixel Agent Office
echo =========================================================
echo.

cd /d "%~dp0"

:: Load .env variables if present
if exist .env (
    for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
        set "line=%%A"
        if not "!line:~0,1!"=="#" (
            if not "%%B"=="" set "%%A=%%B"
        )
    )
)

echo Starting Pixel Agents Office server...
echo Point your browser to the URL printed below.
echo.

node dist/cli.js --port 3100
pause
