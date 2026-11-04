@echo off
title FinTrack Launcher
echo =======================================================
echo          FinTrack Microservices Launcher
echo =======================================================
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0start-all.ps1"
pause
