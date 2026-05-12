# FF14 物价百科 v1.0.2

面向《最终幻想 XIV》国服玩家的桌面查价工具。

当前核心查询链路：

`中文搜索 -> 内置双语映射表 -> ItemID / 英文名 -> Universalis 国服价格`

## 主要功能

- 国服市场板价格查询
- 物品详情与配方 / 用途查看
- 国服 Wiki 外链搜索
- 中文 / 英文双语物品映射
- `全部 / HQ / 非 HQ` 价格查看

## v1.0.2 更新

- 新增 `全部 / HQ / 非 HQ` 市场品质切换
- 市场总览和世界服价格表按品质分别统计
- 搜索新增中文数字异体字归一化
  - 例如：`神眼魔晶石三型` 可以命中 `神眼魔晶石叁型`
- 清理桌面版构建警告，当前 `Release` 构建为 `0 warnings / 0 errors`

## 历史版本

### v1.0.1

- 内置双语可交易物品映射表
- 搜索优先走本地映射，不再优先依赖 Wiki 映射
- 修复部分物品映射缺失和详情页名称 / 描述异常

### v1.0.0

- 首次公开发布桌面版
- 提供国服市场板查价、物品详情和国服 Wiki 联动

## 项目结构

```text
ff14/
  desktop/FF14MarketDesktop/   # WinForms + WebView2 桌面壳
  data/                        # 内置数据
    item_mapping.min.json      # 双语物品映射表
  tools/ItemMappingBuilder/    # 映射表生成工具
  index.html                   # 前端入口
  app.js                       # 前端逻辑
  styles.css                   # 前端样式
  start_app.bat                # 源码版启动
  publish_app.bat              # 发布脚本
```

## 启动方式

源码版：

```bat
start_app.bat
```

发布版打包：

```bat
publish_app.bat
```

## 重新生成双语映射表

```powershell
dotnet run --project .\tools\ItemMappingBuilder\ItemMappingBuilder.csproj -- "E:\ff14\最终幻想XIV\game\sqpack" ".\data\item_mapping.min.json"
```

## 说明

- 当前桌面版仍保留国服 Wiki 外链入口，但价格查询主链已经切换到本地双语映射表
- 映射表会直接参与桌面版搜索与价格查询
- 更详细的版本记录见 [CHANGELOG.md](./CHANGELOG.md)
