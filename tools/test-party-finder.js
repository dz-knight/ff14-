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
  normalizePagination,
  mergeRefreshListings,
  selectRefreshPage,
  focusedListingPage,
  shouldResumeProgressiveLoad,
  captureListFocus,
  restoreListFocus,
  runAutoRefresh,
  formatTimeLeft,
  formatRelativeTime,
  parseSlotJobList,
  slotRoleLabel,
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
  assert.deepEqual(
    normalizePagination({ total: 250, page: 1, per_page: 100, total_pages: 3 }),
    { total: 250, page: 1, perPage: 100, totalPages: 3 }
  );
  assert.equal(
    normalizePagination({ total: 1, page: 1, per_page: 100, total_pages: 1000000 }),
    null,
    "untrusted pagination cannot trigger unbounded requests"
  );
  assert.equal(normalizePagination({ total: 1, page: 2, per_page: 100, total_pages: 1 }), null);
  assert.equal(normalizePagination({ total: 1, page: 1, per_page: 1000, total_pages: 1 }), null);
  assert.deepEqual(
    normalizePagination({ total: 0, page: 1, per_page: 100, total_pages: 0 }),
    { total: 0, page: 1, perPage: 100, totalPages: 0 }
  );
  assert.equal(normalizePagination({ total: 0, page: 1, per_page: 100, total_pages: 2 }), null);

  const longSearchUrl = new URL(buildListUrl({ page: 9999, perPage: 9999, search: "x".repeat(500) }));
  assert.equal(longSearchUrl.searchParams.get("page"), "100");
  assert.equal(longSearchUrl.searchParams.get("per_page"), "100");
  assert.equal(longSearchUrl.searchParams.get("search").length, 200);

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
  assert.equal(normalizeListing({ id: -1, name: "invalid id" }), null);
  assert.equal(normalizeListing({ id: 10, name: "x".repeat(500) }).name.length, 200);

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

  const oldSnapshot = [
    { id: 40, name: "旧版本", updatedAt: "2026-08-18T07:00:00Z" },
    { id: 41, name: "旧列表保留项", updatedAt: "2026-08-18T06:00:00Z" },
  ];
  const freshSnapshot = [
    { id: 40, name: "新版本", updatedAt: "2026-08-18T08:00:00Z" },
  ];
  const progressiveMerge = mergeRefreshListings(oldSnapshot, freshSnapshot, false);
  assert.deepEqual(progressiveMerge.map((item) => item.id), [40, 41]);
  assert.equal(progressiveMerge[0].name, "新版本", "fresh data wins while old rows remain visible");
  assert.deepEqual(
    mergeRefreshListings(oldSnapshot, freshSnapshot, true).map((item) => item.id),
    [40],
    "a complete successful refresh replaces the previous snapshot"
  );

  assert.equal(selectRefreshPage(1, 3, false, true), 3, "refresh uses the latest user page");
  assert.equal(selectRefreshPage(1, 3, false, false), 1, "a new filter starts on its requested page");
  assert.equal(
    selectRefreshPage(1, 3, true, false),
    3,
    "later progressive commits do not undo pagination performed after the first page"
  );
  assert.equal(
    focusedListingPage(
      { type: "listing", value: "77" },
      Array.from({ length: 25 }, (_, index) => ({ id: index === 22 ? 77 : index })),
      1,
      20
    ),
    2,
    "focus follows a listing that moved to another rendered page"
  );
  assert.equal(
    focusedListingPage({ type: "listing", value: "missing" }, [{ id: 1 }], 3, 20),
    3,
    "a removed listing keeps the requested page before focus falls back"
  );
  assert.equal(
    focusedListingPage({ type: "pagination", value: "next" }, [{ id: 1 }], 4, 20),
    4,
    "pagination focus does not change the requested page"
  );
  assert.equal(
    shouldResumeProgressiveLoad({ allItems: null, loadProgress: { settledPages: 1 } }),
    false,
    "reopening restarts a first page request through the normal empty-state path"
  );
  assert.equal(
    shouldResumeProgressiveLoad({ allItems: [{ id: 1 }], loadProgress: null }),
    false,
    "a completed load does not start an extra refresh when reopened"
  );
  assert.equal(
    shouldResumeProgressiveLoad({ allItems: [{ id: 1 }], loadProgress: { settledPages: 1 } }),
    true,
    "a partially displayed load resumes when reopened"
  );
  assert.equal(
    shouldResumeProgressiveLoad({ allItems: [{ id: 1 }], loadProgress: null, needsReload: true }),
    true,
    "a second close before the resumed first page returns keeps the resume marker"
  );

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
  assert.equal(slotRoleLabel({ job: "PLD WAR DRK GNB", role: "Tank" }), "坦克");
  assert.equal(slotRoleLabel({ job: "WHM SGE", role: "Tank" }), "治疗");
  assert.equal(slotRoleLabel({ job: "PLD WHM MNK", role: "Tank" }), "任意职责");
  assert.equal(slotRoleLabel({ job: "", role: "DPS" }), "输出");
  assert.equal(slotRoleLabel({ job: "XYZ", role: "UnknownRole" }), "其他职责");

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

  let resolveSlowPage;
  let slowRequestFinished = false;
  const slowProgress = [];
  const slowClient = {
    async fetchList(params) {
      if (params.page === 1) {
        return {
          data: [
            { id: 50, name: "立即显示", created_world_id: 1167, updated_at: "2026-08-18T08:00:00Z" },
          ],
          pagination: { total: 2, page: 1, perPage: 100, totalPages: 2 },
        };
      }
      return new Promise((resolve) => { resolveSlowPage = resolve; });
    },
  };
  const slowRequest = fetchAllListings(slowClient, {}, {
    onProgress(progress) {
      slowProgress.push(progress);
    },
  }).then((result) => {
    slowRequestFinished = true;
    return result;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(slowRequestFinished, false, "the remaining page is still loading in the background");
  assert.equal(slowProgress.length, 1, "the first page is committed before all pages finish");
  assert.equal(slowProgress[0].done, false);
  assert.deepEqual(slowProgress[0].items.map((item) => item.id), [50]);
  resolveSlowPage({
    data: [
      { id: 51, name: "后台补充", created_world_id: 1042, updated_at: "2026-08-18T07:30:00Z" },
    ],
    pagination: { total: 2, page: 2, perPage: 100, totalPages: 2 },
  });
  const slowResult = await slowRequest;
  assert.equal(slowRequestFinished, true);
  assert.equal(slowProgress.length, 2);
  assert.equal(slowProgress[1].done, true);
  assert.deepEqual(slowResult.items.map((item) => item.id), [50, 51]);

  const autoRefreshCalls = [];
  const recordAutoRefresh = (page, options) => autoRefreshCalls.push({ page, options });
  assert.equal(runAutoRefresh({ open: false, loading: false, page: 2 }, recordAutoRefresh), false);
  assert.equal(runAutoRefresh({ open: true, loading: true, page: 2 }, recordAutoRefresh), false);
  assert.equal(runAutoRefresh({ open: true, loading: false, page: 4 }, recordAutoRefresh), true);
  assert.deepEqual(autoRefreshCalls, [{
    page: 4,
    options: { preserveCurrent: true, silent: true, preserveScroll: true },
  }]);

  function focusNode(attributes, disabled) {
    return {
      attributes,
      disabled: Boolean(disabled),
      focused: false,
      closest(selector) {
        const attribute = selector.slice(1, -1);
        return Object.prototype.hasOwnProperty.call(this.attributes, attribute) ? this : null;
      },
      getAttribute(attribute) {
        return this.attributes[attribute] || null;
      },
      focus() {
        this.focused = true;
      },
    };
  }
  const oldCard = focusNode({ "data-pf-id": "77" });
  const newCard = focusNode({ "data-pf-id": "77" });
  const nextButton = focusNode({ "data-pf-action": "next" });
  const fallback = focusNode({});
  const oldList = { contains: (element) => element === oldCard };
  const newList = { querySelectorAll: () => [newCard] };
  const pagination = {
    contains: (element) => element === nextButton,
    querySelectorAll: () => [nextButton],
  };
  const cardFocusKey = captureListFocus(oldCard, oldList, pagination);
  assert.deepEqual(cardFocusKey, { type: "listing", value: "77" });
  assert.equal(restoreListFocus(cardFocusKey, newList, pagination, fallback), true);
  assert.equal(newCard.focused, true, "the same listing regains focus after list replacement");
  const pageFocusKey = captureListFocus(nextButton, oldList, pagination);
  assert.deepEqual(pageFocusKey, { type: "pagination", value: "next" });
  assert.equal(restoreListFocus(pageFocusKey, newList, pagination, fallback), true);
  assert.equal(nextButton.focused, true, "the same pagination control regains focus");

  const missingFocusKey = { type: "listing", value: "missing" };
  assert.equal(restoreListFocus(missingFocusKey, newList, pagination, fallback), false);
  assert.equal(fallback.focused, true, "focus falls back to search when the old row no longer exists");

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

  const listingsClient = createApiClient(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      listings: [],
      pagination: { total: 0, page: 1, per_page: 100, total_pages: 0 },
    }),
  }));
  const emptyList = await listingsClient.fetchList({ page: 1, perPage: 100 });
  assert.deepEqual(emptyList.data, []);
  assert.equal(emptyList.pagination.totalPages, 0);

  const wrongPageClient = createApiClient(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      listings: [{ id: 1 }],
      pagination: { total: 1, page: 1, per_page: 100, total_pages: 2 },
    }),
  }));
  await assert.rejects(
    () => wrongPageClient.fetchList({ page: 2, perPage: 100 }),
    (error) => error.code === "INVALID_RESPONSE"
  );

  const wrappedDetailClient = createApiClient(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ listing: { id: 42, name: "详情" } }),
  }));
  assert.equal((await wrappedDetailClient.fetchDetail(42)).name, "详情");
  await assert.rejects(
    () => wrappedDetailClient.fetchDetail(43),
    (error) => error.code === "INVALID_RESPONSE"
  );

  const invalidJsonClient = createApiClient(async () => ({
    ok: true,
    status: 200,
    json: async () => { throw new Error("invalid json"); },
  }));
  await assert.rejects(
    () => invalidJsonClient.fetchList({ page: 1 }),
    (error) => error.code === "INVALID_RESPONSE" && /格式无效/.test(error.message)
  );

  const invalidShapeClient = createApiClient(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: [] }),
  }));
  await assert.rejects(
    () => invalidShapeClient.fetchList({ page: 1 }),
    (error) => error.code === "INVALID_RESPONSE" && /格式无效/.test(error.message)
  );

  console.log("test-party-finder.js: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
