const assert = require("node:assert/strict");
const {
  buildListUrl,
  buildDetailUrl,
  normalizeDatacenter,
  datacenterVariants,
  isCnWorldId,
  collectListings,
  formatTimeLeft,
  formatRelativeTime,
  normalizeListing,
  parseSlotJobList,
  createApiClient,
  CATEGORY_OPTIONS,
} = require("../party-finder.js");

// ---- URL 构建 ----
assert.equal(
  buildListUrl({ page: 2, perPage: 100, category: "Dungeons", datacenter: "陆行鸟", search: "装修" }),
  "https://xivpf.littlenightmare.top/api/listings?page=2&per_page=100&category=Dungeons&datacenter=%E9%99%86%E8%A1%8C%E9%B8%9F&search=%E8%A3%85%E4%BF%AE",
  "buildListUrl encodes all params"
);
assert.equal(
  buildListUrl({ page: 1, perPage: 100 }),
  "https://xivpf.littlenightmare.top/api/listings?page=1&per_page=100",
  "empty filters are omitted"
);
assert.equal(buildDetailUrl(128370), "https://xivpf.littlenightmare.top/api/listing/128370");

// ---- 大区简繁归一化 ----
assert.equal(normalizeDatacenter("陸行鳥"), "陆行鸟");
assert.equal(normalizeDatacenter("陆行鸟"), "陆行鸟");
assert.equal(normalizeDatacenter("貓小胖"), "猫小胖");
assert.equal(normalizeDatacenter("莫古力"), "莫古力");
assert.equal(normalizeDatacenter(""), "");
assert.deepEqual(datacenterVariants("陆行鸟"), ["陆行鸟", "陸行鳥"]);
assert.deepEqual(datacenterVariants("猫小胖"), ["猫小胖", "貓小胖"]);
assert.deepEqual(datacenterVariants(""), [null], "no datacenter filter sends no param");

// ---- 国服世界判定与全量过滤（默认只显示国服）----
assert.equal(isCnWorldId(1042), true, "CN world range starts at 1042");
assert.equal(isCnWorldId(1201), true, "CN world range ends around 1201");
assert.equal(isCnWorldId(1999), true, "upper CN bound inclusive");
assert.equal(isCnWorldId(999), false);
assert.equal(isCnWorldId(2000), false, "KR worlds excluded");
assert.equal(isCnWorldId(2075), false);
assert.equal(isCnWorldId(4028), false, "JP worlds (伊弗利特) excluded");
assert.equal(isCnWorldId(4035), false, "JP worlds (泰坦) excluded");
assert.equal(isCnWorldId(0), false);
assert.equal(isCnWorldId(undefined), false);
assert.equal(isCnWorldId(Number.NaN), false);

{
  const rawItems = [
    { id: 1, name: "A", created_world: "紫水栈桥", created_world_id: 1169, home_world: "紫水栈桥", datacenter: "猫小胖", time_left: 600, updated_at: "2026-08-16T07:00:00Z" },
    { id: 2, name: "B", created_world: "泰坦", created_world_id: 4035, home_world: "泰坦", datacenter: "陸行鳥", time_left: 600, updated_at: "2026-08-16T07:05:00Z" },
    { id: 3, name: "C", created_world: "拉诺西亚", created_world_id: 1042, home_world: "紫水栈桥", datacenter: "陆行鸟", time_left: 600, updated_at: "2026-08-16T07:10:00Z" },
  ];
  const cnOnly = collectListings(rawItems);
  assert.deepEqual(cnOnly.map((l) => l.id), [3, 1], "JP listings filtered out, sorted by updated_at desc");
  assert.equal(cnOnly[0].homeWorld, "紫水栈桥", "differing home world retained");
  assert.equal(cnOnly[0].datacenter, "陆行鸟", "datacenter normalized to simplified");

  assert.deepEqual(collectListings(null), [], "null input tolerated");
}

// ---- 时间格式化（API time_left 单位为秒）----
assert.equal(formatTimeLeft(0), "已过期");
assert.equal(formatTimeLeft(-1), "已过期");
assert.equal(formatTimeLeft(0.5), "已过期", "亚秒级视为已过期");
assert.equal(formatTimeLeft(2.904), "剩 2 秒");
assert.equal(formatTimeLeft(45), "剩 45 秒");
assert.equal(formatTimeLeft(770.25), "剩 12 分 50 秒");
assert.equal(formatTimeLeft(3691), "剩 1 小时 1 分");
assert.equal(formatTimeLeft(65535), "剩 18 小时 12 分", "ushort 秒上限约 18.2 小时");
assert.equal(formatTimeLeft(Number.NaN), "");

{
  const now = Date.parse("2026-08-16T07:00:00Z");
  assert.equal(formatRelativeTime("2026-08-16T06:59:55Z", now), "刚刚");
  assert.equal(formatRelativeTime("2026-08-16T06:59:00Z", now), "1 分钟前");
  assert.equal(formatRelativeTime("2026-08-16T06:50:27Z", now), "9 分钟前");
  assert.equal(formatRelativeTime("2026-08-16T05:00:00Z", now), "2 小时前");
  assert.equal(formatRelativeTime("2026-08-14T07:00:00Z", now), "2 天前");
  assert.equal(formatRelativeTime("not-a-date", now), "");
}

// ---- listing 归一化 ----
{
  const listing = normalizeListing({
    id: 128370,
    name: "你的沙琪玛",
    description: "出材料 2W",
    created_world: "晨曦王座",
    home_world: "晨曦王座",
    datacenter: "陸行鳥",
    category: "Guildhests",
    duty: "完成集团战训练！",
    min_item_level: 0,
    slots_filled: 1,
    slots_available: 4,
    time_left: 22.296,
    updated_at: "2026-08-16T06:51:31.362+00:00",
    is_cross_world: true,
  });
  assert.equal(listing.datacenter, "陆行鸟", "datacenter normalized to simplified");
  assert.equal(listing.categoryZh, "行会令");
  assert.equal(listing.homeWorld, "", "same home world collapses");
  assert.equal(listing.slotsFilled, 1);
  assert.ok(listing.isCrossWorld);
  assert.equal(normalizeListing(null), null);
}

// ---- 槽位职业解析 ----
assert.deepEqual(
  parseSlotJobList("GLA PGL MRD").map((j) => j.name),
  ["剑术师", "格斗家", "斧术师"]
);
assert.deepEqual(parseSlotJobList("BSM").map((j) => j.name), ["锻铁匠"]);
assert.deepEqual(parseSlotJobList("XYZ").map((j) => j.name), ["XYZ"], "unknown abbreviations pass through");
assert.deepEqual(parseSlotJobList(""), []);

// ---- API 客户端（mock fetch）----
(async () => {
  const calls = [];
  const client = createApiClient(async (url) => {
    calls.push(url);
    if (url.includes("/api/listing/")) {
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: "未找到招募信息" }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ id: 1, name: "测试", datacenter: "陆行鸟", time_left: 1, updated_at: "2026-08-16T06:00:00Z" }],
        pagination: { total: 1, page: 1, per_page: 100, total_pages: 1 },
      }),
    };
  });

  const list = await client.fetchList({ page: 1, perPage: 100, datacenter: "陆行鸟" });
  assert.equal(list.data.length, 1);
  assert.equal(list.pagination.total, 1);
  assert.ok(calls[0].includes("datacenter="));

  await assert.rejects(
    () => client.fetchDetail(999),
    (error) => error.expired === true && error.status === 404,
    "detail 404 is surfaced as expired"
  );

  // 分类枚举完备性：下拉值不重复
  const enValues = CATEGORY_OPTIONS.map((o) => o.en);
  assert.equal(new Set(enValues).size, enValues.length, "category options unique");
  assert.equal(enValues.length, 16, "16 categories");

  console.log("test-party-finder.js: all assertions passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
