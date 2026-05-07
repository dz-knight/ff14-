@echo off
setlocal

cd /d E:\study\ff14

set "PROJECT=E:\study\ff14\desktop\FF14MarketDesktop\FF14MarketDesktop.csproj"
set "OUTDIR=E:\study\ff14\dist\FF14MarketDesktop"
set "WEBVIEW_RUNTIME=C:\Program Files (x86)\Microsoft\EdgeWebView\Application\147.0.3912.98"
set "README_TEMPLATE=E:\study\ff14\dist_user_readme_template.txt"
set "README_OUTPUT=E:\study\ff14\dist\FF14MarketDesktop\README.txt"
set "ZIP_OUTPUT=C:\Users\MR\Desktop\FF14MarketDesktop-user.zip"

taskkill /IM FF14MarketDesktop.exe /F >nul 2>nul

if exist "%OUTDIR%" rmdir /s /q "%OUTDIR%"

dotnet publish "%PROJECT%" -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o "%OUTDIR%"
if errorlevel 1 (
  echo Publish failed.
  pause
  exit /b 1
)

if exist "%WEBVIEW_RUNTIME%" (
  powershell -NoProfile -Command "Copy-Item -LiteralPath '%WEBVIEW_RUNTIME%' -Destination '%OUTDIR%\\WebView2Runtime' -Recurse -Force"
)

if exist "%README_TEMPLATE%" (
  copy /Y "%README_TEMPLATE%" "%README_OUTPUT%" >nul
)

if exist "%ZIP_OUTPUT%" del /f /q "%ZIP_OUTPUT%" >nul 2>nul
powershell -NoProfile -Command "Compress-Archive -LiteralPath '%OUTDIR%' -DestinationPath '%ZIP_OUTPUT%' -Force"

start "" "%OUTDIR%\FF14MarketDesktop.exe"
endlocal
