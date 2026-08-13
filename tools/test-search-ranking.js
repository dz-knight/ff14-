const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  normalizeSearchKey,
  rankLocalItems,
  rankSearchResults,
} = require("../search-ranking.js");

const localItems = [
  { itemId: 1643, zhName: "秘银宽刃剑", enName: "Mythril Broadsword" },
  { itemId: 5114, zhName: "秘银矿", enName: "Mythril Ore" },
  { itemId: 5065, zhName: "秘银锭", enName: "Mythril Ingot" },
  { itemId: 9999, zhName: "云银秘银摆件", enName: "Decorative Mythril" },
  { itemId: 48213, zhName: "管弦乐琴乐谱：飞空艇", enName: "The Airship Orchestrion Roll" },
  { itemId: 52351, zhName: "管弦乐琴乐谱：飞空艇", enName: "Airship Orchestrion Roll" },
];

assert.equal(normalizeSearchKey(" 秘 银 "), "秘银", "normalization removes spacing");

const fuzzy = rankLocalItems(localItems, "秘银");
assert.deepEqual(
  fuzzy.map((entry) => entry.itemId),
  [5065, 5114, 1643, 9999],
  "prefix matches rank before contains matches and retain relevant items"
);

const duplicateChineseName = rankLocalItems(localItems, "管弦乐琴乐谱：飞空艇");
assert.deepEqual(
  duplicateChineseName.map((entry) => entry.itemId),
  [48213, 52351],
  "duplicate exact Chinese names remain selectable"
);

const combined = rankSearchResults([
  { type: "quest", id: 1, name: "秘银调查" },
  { type: "item", id: 5114, name: "秘银矿", raw: { Name_en: "Mythril Ore" } },
  { type: "item", id: 2, name: "云银秘银摆件" },
], "秘银");
assert.deepEqual(
  combined.map((entry) => `${entry.type}:${entry.id}`),
  ["item:5114", "quest:1", "item:2"],
  "combined suggestions rank relevant prefix matches before contains matches"
);

const mappingPayload = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "data", "item_mapping.min.json"),
  "utf8"
));
const mappingEntries = (mappingPayload.entries || mappingPayload.Entries || []).map((entry) => ({
  itemId: Number(entry.ItemId ?? entry.itemId ?? 0),
  zhName: String(entry.ZhName ?? entry.zhName ?? ""),
  enName: String(entry.EnName ?? entry.enName ?? ""),
}));

const actualMythrilResults = rankLocalItems(mappingEntries, "秘银", 50);
assert.ok(
  actualMythrilResults.slice(0, 10).some((entry) => entry.itemId === 5114 && entry.zhName === "秘银矿"),
  "the real mapping surfaces 秘银矿 in the first ten fuzzy suggestions for 秘银"
);

const actualDuplicateResults = rankLocalItems(mappingEntries, "管弦乐琴乐谱：飞空艇", 50);
assert.deepEqual(
  actualDuplicateResults.map((entry) => entry.itemId),
  [48213, 52351],
  "the real mapping preserves both items with the same exact Chinese name"
);

const exactMythrilOre = rankLocalItems(mappingEntries, "秘银矿", 50)
  .filter((entry) => normalizeSearchKey(entry.zhName) === "秘银矿");
assert.equal(
  exactMythrilOre.length,
  1,
  "a unique exact local name remains eligible for direct opening"
);

console.log("search ranking tests passed");
