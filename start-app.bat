@echo off
setlocal enabledelayedexpansion
title KiBee Agent Office - Desktop App

echo =========================================================
echo       KiBee Pixel Agents - Windows Desktop App
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

node launch-app.js %*
