@echo off
cd /d "%~dp0"
echo Portable VDNH
echo Нужны папка Test рядом с этим файлом и PowerShell (есть в Windows).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0portable-serve.ps1"
pause
