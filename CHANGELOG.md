# Changelog

## v1.1.0 - 2026-08-18

- Added real-time CN party finder browsing with search, data-center and category filters, pagination, refresh, and listing details
- Corrected the Variant & Criterion filter contract to `V&C Dungeon Finder` and mapped source aliases such as `AdventuringForays`
- Added request cancellation and generation guards so stale searches and filters cannot replace newer results
- Added batched page loading, listing ID deduplication, partial-failure warnings, and friendly fallbacks for unknown enum values
- Scoped the required project contact User-Agent to the party finder host in the desktop WebView2 client
- Added deterministic tests for category contracts, aliases, detail mappings, pagination failures, deduplication, and request races

## v1.0.9 - 2026-08-13

- Added fast local-first fuzzy suggestions for Chinese and English item names, including `秘银` -> `秘银矿`
- Stopped fuzzy, quest-name, and duplicate-name searches from auto-opening a result; users now choose an entry with its entity ID visible
- Isolated item and quest failures with independent fallbacks and capped CafeMaker search requests at four seconds
- Prevented stale search and detail requests from replacing newer input or selections
- Added deterministic search-ranking tests against the real bilingual item mapping

## v1.0.8 - 2026-06-09

- Fixed newly added item icons by using the XIVAPI v2 asset endpoint when the legacy icon mirrors have not synced the image yet
- Added the same XIVAPI v2 fallback to the desktop and local static icon proxy
- Bumped the frontend script cache version so clients load the icon fallback fix

## v1.0.7 - 2026-06-09

- Updated the built-in bilingual item mapping with 45 newly tradable CN items from the latest local CN client data and XIVAPI
- Added missing search coverage for Auxesia and Cosmic Exploration items, including `奥克塞西亚能源包` / `Auxesia Drone Module`
- Bumped the item mapping cache version so desktop and web clients refresh the updated data file

## v1.0.6 - 2026-05-29

- Added current-scope sales rankings for CN region, data center, and world scopes with top-30 price and quantity views
- Added click-triggered recipe cost and profit calculation with material prices, total cost, current lowest sale price, tax, net profit, and profit rate
- Optimized ranking loading with batched concurrent Universalis aggregated requests and short preview caching while still refreshing on click
- Fixed web ranking item names and icons by hydrating local mapping data and adding a local icon proxy/cache fallback

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
