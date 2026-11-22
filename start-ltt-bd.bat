@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title LTT BD — Startup & Diagnostics
color 0B
set "LOG_FILE=%CD%\lttbd-startup.log"
set "APP_PORT=3000"

> "%LOG_FILE%" echo LTT BD startup log — %DATE% %TIME%
echo ============================================================================
echo   LTT BD — GROUP LOCATION TRACKING & ASSISTANCE SYSTEM
echo ============================================================================
echo.
echo [INFO] Project folder: %CD%
echo [INFO] Diagnostic log: %LOG_FILE%
echo.

where node >nul 2>nul
if errorlevel 1 goto node_missing
where npm >nul 2>nul
if errorlevel 1 goto npm_missing

for /f "delims=" %%V in ('node -v 2^>^&1') do set "NODE_VER=%%V"
for /f "delims=" %%V in ('npm -v 2^>^&1') do set "NPM_VER=%%V"
echo [OK] Node.js %NODE_VER% ^| npm %NPM_VER%
echo [OK] Node.js %NODE_VER% ^| npm %NPM_VER%>>"%LOG_FILE%"

echo [INFO] Preparing private local credentials and cryptographic secrets...
node scripts/bootstrap-local-env.mjs
if errorlevel 1 goto bootstrap_failed
echo [OK] Local environment is ready.>>"%LOG_FILE%"

if not exist "node_modules\.bin\next.cmd" if not exist "node_modules\.bin\next" (
    echo.
    echo [INFO] Installing app dependencies. This first-time step needs internet access.
    echo [INFO] Installation output is being saved to lttbd-startup.log.
    call npm install --no-audit --no-fund --fetch-retries=3 --fetch-retry-mintimeout=10000 --fetch-retry-maxtimeout=60000 --fetch-timeout=120000 >>"%LOG_FILE%" 2>&1
    if errorlevel 1 goto install_failed
)

if not exist "node_modules\.bin\next.cmd" if not exist "node_modules\.bin\next" goto next_missing

echo [OK] Application dependencies are installed.
echo [OK] Dependencies installed.>>"%LOG_FILE%"

echo [INFO] Running local verification checks...
node scripts/run-verification-tests.mjs >>"%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo [WARNING] Some verification checks reported a problem. Details are in lttbd-startup.log.
) else (
    echo [OK] Verification checks passed.
)

rem Find an available local port. If 3000 is occupied, use the next free port.
for /f "delims=" %%P in ('powershell -NoProfile -Command "$p=3000; while ($p -le 3010) { try { $l=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,$p); $l.Start(); $l.Stop(); break } catch { $p++ } }; if ($p -le 3010) { $p } else { exit 1 }" 2^>nul') do set "APP_PORT=%%P"
if "%APP_PORT%"=="3000" (
    echo [OK] Port 3000 is available.
) else (
    echo [WARNING] Port 3000 is already in use. LTT BD will use port %APP_PORT% instead.
)
set "PORT=%APP_PORT%"

echo.
echo [INFO] Starting LTT BD at http://localhost:%APP_PORT%
echo [IMPORTANT] KEEP THIS WINDOW OPEN while using the application.
echo [IMPORTANT] When you see Ready, open the address shown above.
echo [INFO] Startup diagnostics: %LOG_FILE%
echo ============================================================================

start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command "$url='http://localhost:%APP_PORT%'; for($i=0;$i -lt 60;$i++){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2; if($r.StatusCode -ge 200){ Start-Process $url; exit } } catch {}; Start-Sleep -Seconds 1 }"
call npm run dev
set "SERVER_EXIT=%ERRORLEVEL%"
echo.>>"%LOG_FILE%"
echo Server process exited with code %SERVER_EXIT% at %DATE% %TIME%.>>"%LOG_FILE%"
echo.
if not "%SERVER_EXIT%"=="0" echo [ERROR] The web server stopped. See lttbd-startup.log for installation and setup details.
echo Press any key to close this window.
pause >nul
exit /b %SERVER_EXIT%

:node_missing
echo [ERROR] Node.js is not installed or is not in PATH.
echo Install the current Node.js LTS release from https://nodejs.org/ and restart this script.
echo Node.js missing.>>"%LOG_FILE%"
goto show_log_and_exit

:npm_missing
echo [ERROR] npm is not available in PATH. Reinstall Node.js LTS and ensure npm is selected.
echo npm missing.>>"%LOG_FILE%"
goto show_log_and_exit

:bootstrap_failed
echo [ERROR] Local setup could not create .env.local. See message above.
echo Local environment setup failed.>>"%LOG_FILE%"
goto show_log_and_exit

:install_failed
echo.
echo [ERROR] Dependency installation failed. This is the most likely reason localhost refused the connection.
echo Check your internet connection, then run start-ltt-bd.bat again.
echo.
echo Last installation messages:
powershell -NoProfile -Command "Get-Content -LiteralPath '%LOG_FILE%' -Tail 35"
goto pause_and_exit

:next_missing
echo [ERROR] Next.js was not found after dependency installation.
echo Please check lttbd-startup.log and run the launcher again.
echo Next.js executable missing.>>"%LOG_FILE%"
goto show_log_and_exit

:show_log_and_exit
echo.
echo Diagnostic log: %LOG_FILE%
echo.
type "%LOG_FILE%"
:pause_and_exit
echo.
echo Press any key to close this window.
pause >nul
exit /b 1
