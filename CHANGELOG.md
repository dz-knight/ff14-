# Changelog

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
