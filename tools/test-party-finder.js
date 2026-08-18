const assert = require("node:assert/strict");
const {
  CATEGORY_OPTIONS,
  buildListUrl,
  buildDetailUrl,
  categoryLabel,
  detailLabel,
  normalizeDatacenter,
  datacenterVariants,
  isCnWorldId,
  normalizeListing,
  collectListings,
  formatTimeLeft,
  formatRelativeTime,
  parseSlotJobList,
  buildDetailFacts,
  createRequestCoordinator,
  createApiClient,
  fetchAllListings,
} = require("../party-finder.js");

async function main() {
  assert.equal(
    buildListUrl({
      page: 2,
      perPage: 100,
      category: "V&C Dungeon Finder",
      datacenter: "陆行鸟,陸行鳥",
      search: "零式",
    }),
    "https://xivpf.littlenightmare.top/api/listings?page=2&per_page=100&category=V%26C+Dungeon+Finder&datacenter=%E9%99%86%E8%A1%8C%E9%B8%9F%2C%E9%99%B8%E8%A1%8C%E9%B3%A5&search=%E9%9B%B6%E5%BC%8F"
  );
  assert.equal(
    buildListUrl({ page: 1, perPage: 100 }),
    "https://xivpf.littlenightmare.top/api/listings?page=1&per_page=100"
  );
  assert.equal(buildDetailUrl(128370), "https://xivpf.littlenightmare.top/api/listing/128370");

  const specialDungeon = CATEGORY_OPTIONS.find((item) => item.zh === "特殊迷宫探索");
  assert.equal(specialDungeon.value, "V&C Dungeon Finder", "special dungeon uses the deployed API value");
  assert.equal(new Set(CATEGORY_OPTIONS.map((item) => item.value)).size, CATEGORY_OPTIONS.length);
  assert.equal(CATEGORY_OPTIONS.length, 16);
  assert.equal(categoryLabel("FieldOperations"), "特殊场景探索");
  assert.equal(categoryLabel("AdventuringForays"), "特殊场景探索");
  assert.equal(categoryLabel("V&C Dungeon Finder"), "特殊迷宫探索");
  assert.equal(categoryLabel("VariantAndCriterionDungeonFinder"), "特殊迷宫探索");
  assert.equal(categoryLabel("UnexpectedCategory"), "其他分类");

  assert.equal(normalizeDatacenter("陸行鳥"), "陆行鸟");
  assert.equal(normalizeDatacenter("貓小胖"), "猫小胖");
  assert.deepEqual(datacenterVariants("陆行鸟"), ["陆行鸟", "陸行鳥"]);
  assert.deepEqual(datacenterVariants("猫小胖"), ["猫小胖", "貓小胖"]);
  assert.deepEqual(datacenterVariants(""), []);

  assert.equal(isCnWorldId(1000), true);
  assert.equal(isCnWorldId(1999), true);
  assert.equal(isCnWorldId(999), false);
  assert.equal(isCnWorldId(2000), false);
  assert.equal(isCnWorldId(4035), false);
  assert.equal(isCnWorldId(undefined), false);

  const normalized = normalizeListing({
    id: 10,
    name: "测试招募",
    description: "测试描述",
    created_world: "晨曦王座",
    created_world_id: 1174,
    home_world: "晨曦王座",
    datacenter: "陸行鳥",
    category: "AdventuringForays",
    duty: "特殊场景",
    slots_filled: 2,
    slots_available: 8,
    time_left: 600,
    updated_at: "2026-08-18T08:00:00Z",
    is_cross_world: true,
  });
  assert.equal(normalized.datacenter, "陆行鸟");
  assert.equal(normalized.categoryZh, "特殊场景探索");
  assert.equal(normalized.homeWorld, "");
  assert.equal(normalized.slotsFilled, 2);
  assert.equal(normalizeListing(null), null);
  assert.equal(normalizeListing({ name: "missing id" }), null);

  const deduped = collectListings([
    {
      id: 1,
      name: "旧数据",
      created_world_id: 1167,
      created_world: "红玉海",
      datacenter: "陆行鸟",
      updated_at: "2026-08-18T07:00:00Z",
    },
    {
      id: 2,
      name: "国际服数据",
      created_world_id: 4035,
      created_world: "泰坦",
      datacenter: "陸行鳥",
      updated_at: "2026-08-18T07:30:00Z",
    },
    {
      id: 1,
      name: "新数据",
      created_world_id: 1167,
      created_world: "红玉海",
      datacenter: "陆行鸟",
      updated_at: "2026-08-18T07:20:00Z",
    },
    {
      id: 3,
      name: "另一条",
      created_world_id: 1042,
      created_world: "拉诺西亚",
      datacenter: "陆行鸟",
      updated_at: "2026-08-18T07:40:00Z",
    },
  ]);
  assert.deepEqual(deduped.map((item) => item.id), [3, 1]);
  assert.equal(deduped[1].name, "新数据", "newest duplicate wins");

  assert.equal(formatTimeLeft(0), "已过期");
  assert.equal(formatTimeLeft(45), "剩 45 秒");
  assert.equal(formatTimeLeft(770.25), "剩 12 分 50 秒");
  assert.equal(formatTimeLeft(3691), "剩 1 小时 1 分");
  const now = Date.parse("2026-08-18T08:00:00Z");
  assert.equal(formatRelativeTime("2026-08-18T07:59:55Z", now), "刚刚");
  assert.equal(formatRelativeTime("2026-08-18T07:58:00Z", now), "2 分钟前");
  assert.equal(formatRelativeTime("not-a-date", now), "");

  assert.deepEqual(
    parseSlotJobList("CNJ PLD WHM BLM NIN").map((job) => job.name),
    ["幻术师", "骑士", "白魔法师", "黑魔法师", "忍者"]
  );
  assert.equal(parseSlotJobList("CNL")[0].name, "未知职业（CNL）", "the old typo is not treated as CNJ");
  assert.equal(parseSlotJobList("XYZ")[0].name, "未知职业（XYZ）");

  assert.equal(detailLabel("dutyType", "Roulette"), "随机任务");
  assert.equal(detailLabel("conditions", "DUTY_COMPLETE"), "已完成任务");
  assert.equal(detailLabel("conditions", "DUTY_INCOMPLETE"), "未完成任务");
  assert.equal(detailLabel("lootRules", "GREED_ONLY"), "仅限贪婪");
  assert.equal(detailLabel("lootRules", "LOOTMASTER"), "队长分配");
  assert.equal(detailLabel("objective", "DUTY_COMPLETION | PRACTICE"), "完成任务 / 练习");
  assert.equal(detailLabel("objective", "0x8"), "其他目的");
  assert.notEqual(detailLabel("objective", "0x20"), "0x20");

  const facts = Object.fromEntries(buildDetailFacts({
    id: 11,
    objective: "0x8",
    conditions: "DUTY_COMPLETE",
    loot_rules: "LOOTMASTER",
    duty_type: "Roulette",
    min_item_level: 710,
    beginners_welcome: true,
  }));
  assert.equal(facts.目的, "其他目的");
  assert.equal(facts.条件, "已完成任务");
  assert.equal(facts.战利品规则, "队长分配");
  assert.equal(facts.类型, "随机任务");
  assert.equal(facts.最低装等, "710");
  assert.equal(facts.新手欢迎, "是");

  const coordinator = createRequestCoordinator();
  const commits = [];
  let resolveOld;
  const oldDeferred = new Promise((resolve) => { resolveOld = resolve; });
  const oldRequest = coordinator.begin();
  const oldWork = oldDeferred.then((value) => {
    if (oldRequest.isCurrent()) commits.push(value);
  });
  const newRequest = coordinator.begin();
  assert.equal(oldRequest.signal.aborted, true, "starting a new request aborts the old one");
  if (newRequest.isCurrent()) commits.push("new");
  resolveOld("old");
  await oldWork;
  assert.deepEqual(commits, ["new"], "a slow old request cannot overwrite the newer result");

  const pageCalls = [];
  const pagedClient = {
    async fetchList(params) {
      pageCalls.push({ ...params });
      if (params.page === 1) {
        return {
          data: [
            { id: 20, name: "第一页", created_world_id: 1167, updated_at: "2026-08-18T07:00:00Z" },
            { id: 99, name: "国际服", created_world_id: 4035, updated_at: "2026-08-18T07:05:00Z" },
          ],
          pagination: { total: 4, page: 1, perPage: 100, totalPages: 3 },
        };
      }
      if (params.page === 2) throw new Error("temporary page failure");
      return {
        data: [
          { id: 20, name: "去重后的新版本", created_world_id: 1167, updated_at: "2026-08-18T07:20:00Z" },
          { id: 21, name: "第三页", created_world_id: 1042, updated_at: "2026-08-18T07:30:00Z" },
        ],
        pagination: { total: 4, page: 3, perPage: 100, totalPages: 3 },
      };
    },
  };
  const partial = await fetchAllListings(
    pagedClient,
    { datacenter: "陆行鸟", category: "V&C Dungeon Finder", search: "测试" },
    {}
  );
  assert.deepEqual(partial.failedPages, [2]);
  assert.deepEqual(partial.items.map((item) => item.id), [21, 20]);
  assert.equal(partial.items[1].name, "去重后的新版本");
  assert.equal(pageCalls.length, 3, "all advertised pages are attempted");
  assert.equal(pageCalls[0].datacenter, "陆行鸟,陸行鳥");
  assert.equal(pageCalls[0].category, "V&C Dungeon Finder");

  const fetchCalls = [];
  const client = createApiClient(async (url) => {
    fetchCalls.push(url);
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
        data: [{ id: 30, name: "接口测试" }],
        pagination: { total: 1, page: 1, per_page: 100, total_pages: 1 },
      }),
    };
  });
  const list = await client.fetchList({ page: 1, perPage: 100 });
  assert.equal(list.data.length, 1);
  assert.equal(list.pagination.total, 1);
  assert.ok(fetchCalls[0].includes("per_page=100"));
  await assert.rejects(
    () => client.fetchDetail(999),
    (error) => error.expired === true && error.status === 404
  );

  console.log("test-party-finder.js: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
