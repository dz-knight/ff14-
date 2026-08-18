@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

set "PROJECT=%ROOT%desktop\FF14MarketDesktop\FF14MarketDesktop.csproj"
set "DISTDIR=%ROOT%dist"
set "OUTDIR=%ROOT%dist\FF14MarketDesktop"
set "README_TEMPLATE=%ROOT%dist_user_readme_template.txt"
set "ZIP_OUTPUT=%ROOT%dist\FF14MarketDesktop-v1.1.0-user.zip"
set "RUN_ID=%RANDOM%-%RANDOM%"
set "STAGE_ROOT=%DISTDIR%\.publish-staging-%RUN_ID%"
set "STAGE_OUT=%STAGE_ROOT%\FF14MarketDesktop"
set "STAGE_ZIP=%STAGE_ROOT%\FF14MarketDesktop-v1.1.0-user.zip"
set "BACKUP_ROOT=%DISTDIR%\.publish-backup-%RUN_ID%"
set "BACKUP_OUT=%BACKUP_ROOT%\FF14MarketDesktop"
set "BACKUP_ZIP=%BACKUP_ROOT%\FF14MarketDesktop-v1.1.0-user.zip"
set "NEW_OUT_MOVED=0"
set "RESTORE_FAILED=0"

if exist "%STAGE_ROOT%" (
  echo Staging path already exists: %STAGE_ROOT%
  exit /b 1
)
mkdir "%STAGE_ROOT%"
if errorlevel 1 goto :stage_failed

dotnet publish "%PROJECT%" -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o "%STAGE_OUT%"
if errorlevel 1 goto :stage_failed

if exist "%README_TEMPLATE%" (
  copy /Y "%README_TEMPLATE%" "%STAGE_OUT%\README.txt" >nul
  if errorlevel 1 goto :stage_failed
)

powershell -NoProfile -Command "Compress-Archive -LiteralPath $env:STAGE_OUT -DestinationPath $env:STAGE_ZIP -Force"
if errorlevel 1 goto :stage_failed
if not exist "%STAGE_OUT%\FF14MarketDesktop.exe" goto :stage_failed
if not exist "%STAGE_ZIP%" goto :stage_failed

if exist "%BACKUP_ROOT%" goto :stage_failed
mkdir "%BACKUP_ROOT%"
if errorlevel 1 goto :stage_failed
if exist "%OUTDIR%" (
  move /Y "%OUTDIR%" "%BACKUP_OUT%" >nul
  if errorlevel 1 goto :replace_failed
)
if exist "%ZIP_OUTPUT%" (
  move /Y "%ZIP_OUTPUT%" "%BACKUP_ZIP%" >nul
  if errorlevel 1 goto :replace_failed
)

move /Y "%STAGE_OUT%" "%OUTDIR%" >nul
if errorlevel 1 goto :replace_failed
set "NEW_OUT_MOVED=1"
move /Y "%STAGE_ZIP%" "%ZIP_OUTPUT%" >nul
if errorlevel 1 goto :replace_failed

rmdir /s /q "%BACKUP_ROOT%" >nul 2>nul
rmdir /s /q "%STAGE_ROOT%" >nul 2>nul
echo Publish completed: %ZIP_OUTPUT%
exit /b 0

:replace_failed
echo Replacement failed. Restoring the previous artifacts.
if "%NEW_OUT_MOVED%"=="1" if exist "%OUTDIR%" (
  move /Y "%OUTDIR%" "%STAGE_ROOT%\failed-FF14MarketDesktop" >nul 2>nul
  if errorlevel 1 set "RESTORE_FAILED=1"
)
if exist "%BACKUP_OUT%" (
  if exist "%OUTDIR%" (
    set "RESTORE_FAILED=1"
  ) else (
    move /Y "%BACKUP_OUT%" "%OUTDIR%" >nul 2>nul
    if errorlevel 1 set "RESTORE_FAILED=1"
  )
)
if exist "%BACKUP_ZIP%" (
  if exist "%ZIP_OUTPUT%" (
    set "RESTORE_FAILED=1"
  ) else (
    move /Y "%BACKUP_ZIP%" "%ZIP_OUTPUT%" >nul 2>nul
    if errorlevel 1 set "RESTORE_FAILED=1"
  )
)
if "%RESTORE_FAILED%"=="1" (
  echo Automatic restore was incomplete. Backups remain in: %BACKUP_ROOT%
  echo Staged files remain in: %STAGE_ROOT%
  exit /b 1
)
rmdir /s /q "%BACKUP_ROOT%" >nul 2>nul
rmdir /s /q "%STAGE_ROOT%" >nul 2>nul
exit /b 1

:stage_failed
echo Publish or archive failed. Existing artifacts were not replaced.
rmdir /s /q "%STAGE_ROOT%" >nul 2>nul
exit /b 1

endlocal
