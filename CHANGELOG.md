# Changelog

## v1.0.1 - 2026-05-08

- Added built-in bilingual tradable item mapping generated from local CN client data and XIVAPI English data
- Integrated `data/item_mapping.min.json` into the desktop app package
- Switched search priority to `中文 -> 映射表 -> ItemID/英文名 -> Universalis`
- Fixed missing entries caused by batched XIVAPI row fetches by adding single-row retry fallback
- Fixed item detail descriptions to prefer Chinese descriptions from the local mapping table
- Fixed some mapped items reverting to English names after opening detail pages
- Removed temporary GarlandTools scratch files from the repo
