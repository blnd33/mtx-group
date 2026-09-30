@echo off
REM ===================================================================
REM  MTX POS - one-time till setup for silent receipt printing
REM
REM  Downloaded from inside the app (Settings -> Receipt & Invoice).
REM  Puts an "MTX POS" icon on the Desktop and in the Start menu that
REM  opens the till in its own window with --kiosk-printing, so receipts
REM  go straight to the default printer with no print dialog.
REM
REM    MTX-POS-Setup.bat                     Edge, https://mtx-group.net/
REM    MTX-POS-Setup.bat chrome              Chrome
REM    MTX-POS-Setup.bat edge https://...    another address
REM    MTX-POS-Setup.bat remove              delete the shortcuts again
REM
REM  With no browser given, the file's own name decides: the app saves it
REM  as MTX-POS-Setup-Chrome.bat or MTX-POS-Setup-Edge.bat to match the
REM  browser it was downloaded from.
REM
REM  A website cannot switch silent printing on for itself - Chrome and
REM  Edge only allow it as a start-up flag, or any site could print
REM  without asking. The shortcut is how the flag gets there. It uses its
REM  own browser profile because flags only apply to a NEW browser
REM  process; see run-kiosk.bat for the full story.
REM ===================================================================

setlocal

REM  Brackets in %ProgramFiles(x86)% end a ( ... ) block early; copy it
REM  into a bracket-free name before using it anywhere near one.
set "PF=%ProgramFiles%"
set "PF86=%ProgramFiles(x86)%"
set "LAD=%LOCALAPPDATA%"
set "HOME_DIR=%LAD%\MTX-POS-Kiosk"
set "EXE="

set "BROWSER=%~1"
set "URL=%~2"
if /i "%BROWSER%"=="remove" goto :remove
REM  Not inside ( ... ): a second download is saved as "...-Edge (1).bat",
REM  and that bracket in the name would end the block early.
if not "%BROWSER%"=="" goto :picked
echo "%~n0" | findstr /i "chrome" >nul && set "BROWSER=chrome"
if "%BROWSER%"=="" set "BROWSER=edge"
:picked
if "%URL%"=="" set "URL=https://mtx-group.net/"
if not "%URL:~-1%"=="/" set "URL=%URL%/"

if /i "%BROWSER%"=="edge"   goto :edge
if /i "%BROWSER%"=="chrome" goto :chrome
echo.
echo   Unknown browser "%BROWSER%" - use "edge" or "chrome".
goto :fail

:edge
set "LABEL=Microsoft Edge"
set "PROFILE=%HOME_DIR%\Edge"
call :try "%PF86%\Microsoft\Edge\Application\msedge.exe"
call :try "%PF%\Microsoft\Edge\Application\msedge.exe"
if not defined EXE call :fromregistry msedge.exe
goto :found

:chrome
set "LABEL=Google Chrome"
set "PROFILE=%HOME_DIR%\Chrome"
call :try "%PF%\Google\Chrome\Application\chrome.exe"
call :try "%PF86%\Google\Chrome\Application\chrome.exe"
call :try "%LAD%\Google\Chrome\Application\chrome.exe"
if not defined EXE call :fromregistry chrome.exe
goto :found

:try
if defined EXE exit /b 0
if exist "%~1" set "EXE=%~1"
exit /b 0

:fromregistry
for /f "usebackq tokens=2,*" %%A in (
  `reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\%~1" /ve 2^>nul`
) do if exist "%%B" set "EXE=%%B"
exit /b 0

:found
if defined EXE goto :setup
echo.
echo   Could not find %LABEL% on this computer.
echo   Install it, or download the setup from the other browser.
goto :fail

:setup
echo.
echo   MTX POS - till setup
echo   --------------------
echo     browser : %LABEL%
echo     address : %URL%
echo.

if not exist "%HOME_DIR%" mkdir "%HOME_DIR%"

REM  The shortcut's icon. Nothing breaks without it - the shortcut just
REM  shows the browser's own icon instead. The server answers a missing
REM  file with the app's own page (200, HTML), so check the download
REM  really is an .ico (it starts 00 00 01 00) before keeping it.
set "ICON=%HOME_DIR%\mtx-pos.ico"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$tmp = $env:ICON + '.part';" ^
  "try { Invoke-WebRequest -UseBasicParsing -Uri ($env:URL + 'assets/mtx-pos.ico') -OutFile $tmp -TimeoutSec 20 } catch { };" ^
  "if (Test-Path $tmp) {" ^
  "  $b = [IO.File]::ReadAllBytes($tmp);" ^
  "  if ($b.Length -gt 6 -and $b[0] -eq 0 -and $b[1] -eq 0 -and $b[2] -eq 1 -and $b[3] -eq 0) { Move-Item -Force $tmp $env:ICON } else { Remove-Item $tmp }" ^
  "}" >nul 2>&1

REM --app             its own window, no address bar or tabs
REM --kiosk-printing  receipts print straight to the default printer
REM --user-data-dir   own profile, so the flag always takes effect
set "ARGS=--app=%URL% --kiosk-printing --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --disable-session-crashed-bubble --disable-features=Translate,AutofillServerCommunication"

REM  Values go to PowerShell through the environment, not the command
REM  line, so paths with spaces or brackets need no extra quoting.
set "MTX_EXE=%EXE%"
set "MTX_ARGS=%ARGS%"
set "MTX_ICON=%ICON%"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$icon = if (Test-Path $env:MTX_ICON) { $env:MTX_ICON + ',0' } else { $env:MTX_EXE + ',0' };" ^
  "$made = 0;" ^
  "foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {" ^
  "  if (-not $dir) { continue };" ^
  "  $lnk = $ws.CreateShortcut((Join-Path $dir 'MTX POS.lnk'));" ^
  "  $lnk.TargetPath = $env:MTX_EXE;" ^
  "  $lnk.Arguments = $env:MTX_ARGS;" ^
  "  $lnk.WorkingDirectory = Split-Path $env:MTX_EXE;" ^
  "  $lnk.IconLocation = $icon;" ^
  "  $lnk.Description = 'MTX POS - receipts print without a dialog';" ^
  "  $lnk.Save();" ^
  "  if (Test-Path (Join-Path $dir 'MTX POS.lnk')) { $made++; Write-Host ('    created : ' + (Join-Path $dir 'MTX POS.lnk')) }" ^
  "};" ^
  "if ($made -eq 0) { exit 1 }"
if errorlevel 1 (
  echo.
  echo   The shortcuts could not be created.
  goto :fail
)

echo.
echo   Receipts will print to this computer's DEFAULT printer:
powershell -NoProfile -Command ^
  "$p = Get-CimInstance Win32_Printer -Filter 'Default=True' -ErrorAction SilentlyContinue;" ^
  "if ($p) { Write-Host ('    ' + $p.Name) } else { Write-Host '    (no default printer set)' }"
echo.
echo   If that is not the receipt printer, open Windows Settings -^> Printers
echo   and set the receipt printer as the default.
echo.
echo   From now on, open the till with the MTX POS icon.
echo   Sign in once there - it is a separate window from your browser.
echo.
choice /c YN /n /m "  Open MTX POS now? [Y/N] "
if errorlevel 2 goto :done
start "" "%EXE%" %ARGS%
goto :done

:remove
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {" ^
  "  $f = Join-Path $dir 'MTX POS.lnk'; if (Test-Path $f) { Remove-Item $f; Write-Host ('  removed : ' + $f) }" ^
  "}"
echo.
echo   Shortcuts removed. The till's browser profile is kept in
echo   %HOME_DIR% - delete that folder too to clear it fully.
echo.
pause
goto :done

:fail
echo.
pause
endlocal
exit /b 1

:done
echo.
endlocal
exit /b 0
