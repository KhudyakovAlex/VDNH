@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Portable: павильон + демка Dominion
net session >nul 2>&1
if not errorlevel 1 (
  echo Не от администратора: Postgres так не стартует. Запусти обычным двойным щелчком.
  pause
  exit /b 1
)
if not exist "%~dp0Test\index.html" (
  echo Нет папки Test
  pause
  exit /b 1
)
if not exist "%~dp0DominionPortable\start.bat" (
  echo Нет папки DominionPortable
  pause
  exit /b 1
)
start "Dominion — не закрывать" /D "%~dp0DominionPortable" cmd /k start.bat
echo Ждём демку http://127.0.0.1:18473/ ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; foreach($i in 1..90){ try { $r=Invoke-WebRequest 'http://127.0.0.1:18473/' -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -eq 200){ $ok=$true; break } } catch {}; Start-Sleep -Seconds 1 }; if(-not $ok){ Write-Host 'Демка не ответила. Павильон всё равно откроется.' }"
echo Павильон: http://127.0.0.1:8080/
echo Логотип справа снизу открывает демку. Окно Dominion не закрывать.
echo Стоп: stop.bat
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0portable-serve.ps1"
pause
