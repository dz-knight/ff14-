@echo off
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"
dotnet run --project "%ROOT%desktop\FF14MarketDesktop\FF14MarketDesktop.csproj"
endlocal
