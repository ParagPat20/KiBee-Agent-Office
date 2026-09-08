@echo off
setlocal enabledelayedexpansion
title KiBee Boss Orchestrator

echo =========================================================
echo      KiBee Boss Orchestrator (Powered by Gemini API)
echo =========================================================
echo.

cd /d "%~dp0"

:: Load .env variables
if exist .env (
    for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
        set "line=%%A"
        if not "!line:~0,1!"=="#" (
            if not "%%B"=="" set "%%A=%%B"
        )
    )
)

node boss.js %*
pause
