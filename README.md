# FF14 物价百科桌面版

一个面向 **FFXIV 国服玩家** 的 Windows 桌面工具。  
把 **国服价格查询**、**物品百科**、**任务信息** 和 **国服 Wiki 联动浏览** 集成到同一个软件里。

## 功能亮点

- `国服价格查询`
  - 查看中国国服各大区 / 数据中心 / 世界服价格
  - 展示最低价、上架数、库存量、更新时间

- `物品百科`
  - 搜索物品
  - 查看获取方式
  - 查看制作配方
  - 查看用途配方

- `任务支持`
  - 查看任务详情
  - 查看任务奖励
  - 查看前后置任务链
  - 查看任务坐标

- `Wiki 联动`
  - 软件内直接打开国服 Wiki
  - 在价格百科里点击来源卡片，可在右侧直接预览 Wiki 相关页面

## 软件模式

### 1. 价格百科

适合：

- 查国服价格
- 查物品用途
- 看获取方式
- 看采集 / 商店 / 制作相关信息

### 2. 国服 Wiki

适合：

- 查完整任务说明
- 查更详细地图
- 查 NPC / 商店 / 采集页面
- 浏览完整国服 Wiki 内容

## 项目结构

```text
ff14/
├─ desktop/
│  └─ FF14MarketDesktop/       # WinForms + WebView2 桌面壳
├─ index.html                  # 前端入口
├─ app.js                      # 前端逻辑
├─ styles.css                  # 前端样式
├─ start_app.bat               # 本地开发启动
├─ publish_app.bat             # 发布脚本
└─ dist_user_readme_template.txt
```

## 本地运行

### 方式一：直接启动

双击：

- `start_app.bat`

### 方式二：命令行运行

```powershell
dotnet run --project .\desktop\FF14MarketDesktop\FF14MarketDesktop.csproj
```

## 发布

双击：

- `publish_app.bat`

发布结果默认输出到：

- `dist\FF14MarketDesktop`

## 搜索说明

### 物品搜索

直接输入物品名称，例如：

- `秘银矿`
- `土之晶簇`
- `无限鬼神之剑`

### 任务搜索

当前公开接口对中文任务名检索不稳定，推荐：

- `任务:66358`
- `quest:66358`
- `q:66358`

或者直接切换到 `国服 Wiki` 模式搜索任务名。

## 分发说明

给最终用户分发时：

- 请分发整个发布目录
- 不要只单独发送 `exe`

用户启动程序：

- `FF14MarketDesktop.exe`

## 技术栈

- 前端：`HTML + CSS + JavaScript`
- 桌面壳：`.NET WinForms`
- 内嵌浏览器：`WebView2`
- 数据源：
  - `CafeMaker / FFCafe`
  - `Universalis`
  - `FF14 国服 Wiki`

## 当前说明

- 高关联物品（如碎晶、晶簇、矿石）会关联大量配方
- 为保证软件稳定性，不会无限制一次性加载全部内容
- 更完整的关联内容可通过软件右侧 `Wiki 预览` 查看
