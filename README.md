# FF14 物价百科 v1.0.1

一个面向《最终幻想 XIV》中国国服玩家的桌面百科工具。

当前版本的核心数据链路已经调整为：

`中文搜索 -> 内置双语映射表 -> 英文名 / ItemID -> Universalis 国服价格`

这意味着软件不再依赖 Wiki 页面临时抓取英文名来完成价格查询，搜索稳定性和速度都会更好。

## 主要功能

- 国服市场板价格查询
- 物品百科详情
- 任务详情页
- 国服 Wiki 联动浏览
- 中文/英文双语物品映射

## v1.0.1 更新

- 新增基于本地国服客户端 + XIVAPI 英文数据生成的内置双语映射表
- 双语映射表已集成进软件发布内容中，最终用户无需单独放置文件
- 搜索优先走本地双语映射，不再优先依赖 Wiki 页面映射
- 修复 `羊角笛`、`猫车角笛`、`轮式工程车启动钥匙` 等条目的映射链路
- 修复中文描述被英文描述覆盖的问题，详情页优先显示中文描述
- 修复部分条目进入详情页后搜索框或标题回退成英文名的问题

## 项目结构

```text
ff14/
├─ desktop/FF14MarketDesktop/   # WinForms + WebView2 桌面壳
├─ data/                        # 软件内置数据
│  └─ item_mapping.min.json     # 可交易物品双语映射表
├─ tools/ItemMappingBuilder/    # 双语映射表生成器
├─ index.html                   # 前端入口
├─ app.js                       # 前端逻辑
├─ styles.css                   # 前端样式
├─ start_app.bat                # 开发/源码版启动
└─ publish_app.bat              # 发布脚本
```

## 双语映射表

映射表来源：

- 本地国服客户端数据：`E:\ff14\最终幻想XIV\game\sqpack`
- XIVAPI 英文物品数据

当前映射表只保留：

- 可交易物品
- `ItemId`
- 中文名
- 英文名
- 中文描述
- 图标路径

映射文件当前体积约 `1 MB`。

## 启动方式

源码版启动：

```bat
start_app.bat
```

发布版打包：

```bat
publish_app.bat
```

## 重新生成双语表

如果本地客户端更新后需要重建映射表，可运行：

```powershell
dotnet run --project .\tools\ItemMappingBuilder\ItemMappingBuilder.csproj -- "E:\ff14\最终幻想XIV\game\sqpack" ".\data\item_mapping.min.json"
```

生成完成后，桌面版会自动把 `data\item_mapping.min.json` 复制到 `wwwroot\data\` 中。

## 当前说明

- 软件目前仍保留国服 Wiki 兜底入口，但价格查询主链已经切换到双语映射表
- 若后续需要扩大覆盖范围，可继续重建映射表，而不是修改搜索逻辑
- 若要继续提升模糊搜索体验，建议优化双语映射表的中文别名索引，而不是回退到网页抓取
