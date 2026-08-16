@echo off
setlocal

rem %~dp0 展开为本脚本所在目录，仓库放到任何路径都能直接运行
cd /d "%~dp0"

set "PROJECT=%~dp0desktop\FF14MarketDesktop\FF14MarketDesktop.csproj"
set "OUTDIR=%~dp0dist\FF14MarketDesktop"
set "README_TEMPLATE=%~dp0dist_user_readme_template.txt"
set "README_OUTPUT=%~dp0dist\FF14MarketDesktop\README.txt"
set "ZIP_OUTPUT=%~dp0dist\FF14MarketDesktop-v1.0.9-user.zip"

taskkill /IM FF14MarketDesktop.exe /F >nul 2>nul

if exist "%OUTDIR%" rmdir /s /q "%OUTDIR%"

dotnet publish "%PROJECT%" -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o "%OUTDIR%"
if errorlevel 1 (
  echo Publish failed.
  pause
  exit /b 1
)

if exist "%README_TEMPLATE%" (
  copy /Y "%README_TEMPLATE%" "%README_OUTPUT%" >nul
)

if exist "%ZIP_OUTPUT%" del /f /q "%ZIP_OUTPUT%" >nul 2>nul
powershell -NoProfile -Command "Compress-Archive -LiteralPath '%OUTDIR%' -DestinationPath '%ZIP_OUTPUT%' -Force"

endlocal
