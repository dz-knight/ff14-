@echo off
rem %~dp0 展开为本脚本所在目录，仓库放到任何路径都能直接运行
dotnet run --project "%~dp0desktop\FF14MarketDesktop\FF14MarketDesktop.csproj"
