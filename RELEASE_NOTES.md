# FF14 物价百科桌面端 v1.0.4 更新说明

## 2026-05-22

本次上传以代码清理和可调性增强为主，搜索链路本身没有改动。

- 清理重复的 `bootstrap`、搜索结果渲染和历史覆盖逻辑
- 收敛当前生效的市场总览、价格表与 Wiki 兜底逻辑
- 保持原有搜索链路不变，继续优先使用双语映射表
- 主题调色改为支持颜色盘和 `RGB` 颜色代码输入
- 桌面端透明度改为 `10%` 到 `100%` 自由滑杆调节
- 同步整理桌面端与网页端前端实现

## 验证

- `node --check app.js`
- `dotnet build desktop/FF14MarketDesktop/FF14MarketDesktop.csproj -c Release`
