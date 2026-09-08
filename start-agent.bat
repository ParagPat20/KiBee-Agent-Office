@echo off
setlocal enabledelayedexpansion
title KiBee Antigravity Agent

echo =========================================================
echo         KiBee Antigravity Agent (Gemini API)
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

echo Using Gemini API Key configured in .env
echo Launching Antigravity CLI (agy)...
echo.

agy %*
if errorlevel 1 (
    echo.
    echo If agy is not authenticated, please run 'agy' interactively.
)
pause
