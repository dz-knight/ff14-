# FF14 物价百科桌面版

一个基于 `HTML + CSS + JavaScript + WinForms + WebView2` 的 Windows 桌面工具。

功能目标：

- 查询中国国服市场板价格
- 搜索物品和任务
- 查看获取方式、制作配方、用途配方
- 在软件内联动查看国服 Wiki

## 仓库结构

```text
ff14/
├─ desktop/                    # WinForms 桌面壳工程
│  └─ FF14MarketDesktop/
├─ index.html                  # 前端入口
├─ app.js                      # 前端逻辑
├─ styles.css                  # 前端样式
├─ start_app.bat               # 本地开发启动
├─ publish_app.bat             # 发布桌面版
└─ dist_user_readme_template.txt
```

## 运行开发版

直接双击：

- `start_app.bat`

或者命令行执行：

```powershell
dotnet run --project .\desktop\FF14MarketDesktop\FF14MarketDesktop.csproj
```

## 发布桌面版

直接双击：

- `publish_app.bat`

发布结果默认输出到：

- `dist\FF14MarketDesktop`

## 软件使用

软件包含两个模式：

- `价格百科`
- `国服 Wiki`

### 价格百科

可用于：

- 搜索物品
- 搜索任务
- 查看国服价格
- 查看获取方式
- 查看制作配方
- 查看用途配方

### 国服 Wiki

可用于：

- 直接浏览 FF14 国服 Wiki
- 查看任务说明
- 查看采集地图
- 查看 NPC / 商店 / 关联页面

### 任务搜索说明

当前公开接口对中文任务名检索不稳定，推荐：

- `任务:66358`
- `quest:66358`
- `q:66358`

或者直接切到 `国服 Wiki` 模式搜索任务名。

## 分发说明

给最终用户分发时：

- 请分发整个发布目录
- 不要只单独发送 `exe`

用户启动程序：

- `FF14MarketDesktop.exe`

## 当前状态

当前仓库主要保存：

- 源代码
- 发布脚本
- 用户说明模板

构建输出、运行时目录、压缩包等发布产物默认不入库。
