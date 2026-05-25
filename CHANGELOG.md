# Changelog

## v1.0.5 - 2026-05-25

- Added CN data-center filters for market prices: `陆行鸟`, `莫古力`, `猫小胖`, and `豆豆柴`
- Added NPC shop source cards with vendor price, NPC name, map, and precise `X/Y` coordinates when available
- Resolved shop NPCs from `GilShopItem` links through XIVAPI and supplemented missing NPC coordinates through Garland Tools search data
- Hid unresolved or coordinate-less shop records from the NPC source list to avoid showing misleading `待确认 NPC` entries
- Bumped frontend cache version to force clients onto the updated script

## v1.0.4 - 2026-05-22

- Cleaned up duplicated frontend bootstrap, search rendering, and legacy override paths
- Kept the search pipeline on the local bilingual mapping table plus Wiki fallback
- Added theme color controls via color picker and `RGB` input
- Added desktop opacity adjustment from `10%` to `100%`
- Fixed the search suggestion panel overlapping the search box
- Fixed related item navigation so mapped item detail pages keep the Chinese display name instead of reverting to English

## v1.0.2 - 2026-05-12

- Added `全部 / HQ / 非 HQ` market quality filters to the item price view
- Split market summary and world price table statistics by selected quality mode
- Fixed the desktop world price table sorting so `HQ / 非 HQ` mode now orders rows by the selected quality's lowest price
- Normalized Chinese variant numerals in item search, so queries like `神眼魔晶石三型` correctly match names such as `神眼魔晶石叁型`
- Cleaned up desktop build warnings; current `Release` build completes with `0 warnings / 0 errors`

## v1.0.1 - 2026-05-08

- Added built-in bilingual tradable item mapping generated from local CN client data and XIVAPI English data
- Integrated `data/item_mapping.min.json` into the desktop app package
- Switched search priority to `中文 -> 映射表 -> ItemID / 英文名 -> Universalis`
- Fixed missing entries caused by batched XIVAPI row fetches by adding single-row retry fallback
- Fixed item detail descriptions to prefer Chinese descriptions from the local mapping table
- Fixed some mapped items reverting to English names after opening detail pages
- Removed temporary GarlandTools scratch files from the repo

## v1.0.0 - 2026-05-07

- Initial public desktop release
- Added CN market board price query and item detail view
- Added CN Wiki browsing integration
- Added Windows desktop packaging based on WinForms + WebView2
