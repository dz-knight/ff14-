const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8").replace(/\r\n/g, "\n");

function extractBlock(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return appSource.slice(start, end + 2);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function testFetchJson() {
  const source = extractBlock(
    "async function fetchJson",
    "\n}\n\nfunction renderRouteLink"
  );
  const calls = [];
  const context = {
    MAX_SEARCH_QUERY_LENGTH: 256,
    AbortController,
    DEFAULT_FETCH_TIMEOUT_MS: 15000,
    setTimeout,
    clearTimeout,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      };
    },
  };
  vm.createContext(context);
  vm.runInContext(`${source}; globalThis.fetchJsonForTest = fetchJson;`, context);

  const payload = await context.fetchJsonForTest("/endpoint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    timeoutMs: 100,
  });
  assert.equal(payload.ok, true);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.body, "{}");
  assert.ok(calls[0].options.signal instanceof AbortSignal);

  context.fetch = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });
  await assert.rejects(
    () => context.fetchJsonForTest("/slow", { timeoutMs: 20 }),
    (error) => error.name === "TimeoutError" && /请求超时/.test(error.message)
  );

  const external = new AbortController();
  const cancelled = context.fetchJsonForTest("/cancelled", {
    signal: external.signal,
    timeoutMs: 1000,
  });
  external.abort();
  await assert.rejects(
    () => cancelled,
    (error) => error.name === "AbortError" && /请求已取消/.test(error.message)
  );
}

function createSearchHarness(options = {}) {
  const source = extractBlock(
    "async function performSearch",
    "\n}\n\nasync function searchEntities"
  );
  const queries = new Map();
  const events = [];
  const context = {
    MAX_SEARCH_QUERY_LENGTH: 256,
    dom: {
      searchButton: { disabled: false, textContent: "搜索" },
      searchInput: { value: "" },
    },
    state: { searchToken: 0, entityLoadToken: 0 },
    console: { error() {} },
    setLoadingState(keyword) { events.push(`loading:${keyword}`); },
    resolveKnownItemAlias() { return null; },
    searchItemsFromMapping() { return options.localItems || []; },
    normalizeSearchKey(value) { return String(value); },
    mapItemsToSearchEntities(items) { return options.useMappedItems ? items : []; },
    parseQuestSearchIntent(keyword) {
      return options.questIntent || { directQuestId: null, forceQuestKeyword: keyword };
    },
    updateSearchRoute() {},
    searchQuests(keyword) {
      const pending = deferred();
      queries.set(keyword, pending);
      return pending.promise;
    },
    renderSearchResults(results) { events.push(`results:${results.map((entry) => entry.id ?? entry.ID).join(",")}`); },
    renderQuestSearchNotFound(keyword) { events.push(`not-found:${keyword}`); },
    saveSearchHistory() {},
    setBootStatus() {},
    renderAmbiguousSearchResult(_keyword, results) {
      events.push(`ambiguous:${results.map((entry) => entry.id ?? entry.ID).join(",")}`);
    },
    rankSearchResults(results) { return options.useMappedItems ? results : []; },
    searchEntities() { return Promise.resolve(options.remoteResults || []); },
    renderNoSearchResult() {},
    renderLoadError() { events.push("load-error"); },
    searchEntitiesFromKnownAlias() { return []; },
    rememberResolvedAlias() {},
    loadItemPage() {
      events.push("load-item");
      return Promise.resolve();
    },
    loadQuestPage() { return Promise.resolve(); },
  };
  context.setSearchButtonBusy = (busy) => {
    context.dom.searchButton.disabled = Boolean(busy);
    context.dom.searchButton.textContent = busy ? "搜索中" : "搜索";
  };
  vm.createContext(context);
  vm.runInContext(`${source}; globalThis.performSearchForTest = performSearch;`, context);
  return { context, events, queries };
}

async function testFuzzySearchRequiresSelection() {
  const fuzzy = createSearchHarness({
    localItems: [{ type: "item", id: 5114, name: "秘银矿", Name: "秘银矿" }],
    remoteResults: [{ type: "item", id: 5114, name: "秘银矿" }],
    questIntent: { directQuestId: null, forceQuestKeyword: null },
    useMappedItems: true,
  });
  await fuzzy.context.performSearchForTest("秘银");
  assert.equal(fuzzy.events.includes("load-item"), false, "a fuzzy item match must not auto-open");
  assert.equal(fuzzy.events.includes("ambiguous:5114"), true, "a fuzzy item match remains selectable");
}

async function testSearchRace() {
  const first = createSearchHarness();
  const oldRequest = first.context.performSearchForTest("old");
  const currentRequest = first.context.performSearchForTest("current");
  first.queries.get("old").reject(new Error("old failure"));
  await oldRequest;
  assert.equal(first.events.includes("load-error"), false, "stale failure must not replace current UI");
  assert.equal(first.context.dom.searchButton.disabled, true, "stale completion must not enable current search");
  first.queries.get("current").resolve([]);
  await currentRequest;
  assert.equal(first.context.dom.searchButton.disabled, false);
  assert.equal(first.context.dom.searchButton.textContent, "搜索");

  const second = createSearchHarness();
  const staleSuccess = second.context.performSearchForTest("old");
  const latestSuccess = second.context.performSearchForTest("current");
  second.queries.get("old").resolve([{ ID: 1 }]);
  await staleSuccess;
  assert.equal(second.events.some((event) => event === "results:1"), false, "stale result must not render");
  second.queries.get("current").resolve([{ ID: 2 }]);
  await latestSuccess;
  assert.equal(second.events.some((event) => event === "results:2"), true);
}

async function testRejectedQuestCacheIsEvicted() {
  const source = extractBlock(
    "async function getQuest",
    "\n}\n\nasync function getRecipe"
  );
  let attempts = 0;
  const context = {
    state: { caches: { quest: new Map() } },
    questColumns: [],
    ENCYCLOPEDIA_API: "https://example.invalid",
    fetchJson() {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error("temporary failure"))
        : Promise.resolve({ ID: 7 });
    },
    encodeURIComponent,
  };
  vm.createContext(context);
  vm.runInContext(`${source}; globalThis.getQuestForTest = getQuest;`, context);

  await assert.rejects(() => context.getQuestForTest(7), /temporary failure/);
  assert.equal(context.state.caches.quest.has(7), false);
  const recovered = await context.getQuestForTest(7);
  assert.equal(recovered.ID, 7);
  assert.equal(attempts, 2);
}

async function testCombinedSearchFailureIsRetryable() {
  const source = extractBlock(
    "async function searchEntities",
    "\n}\n\nfunction searchEntitiesFromKnownAlias"
  );
  const context = {
    state: { caches: { search: new Map() } },
    searchItems: async () => { throw new Error("item source down"); },
    searchQuests: async () => { throw new Error("quest source down"); },
    debugLog() {},
    mapItemsToSearchEntities() { return []; },
    rankSearchResults() { return []; },
  };
  vm.createContext(context);
  vm.runInContext(`${source}; globalThis.searchEntitiesForTest = searchEntities;`, context);
  await assert.rejects(
    () => context.searchEntitiesForTest("unknown"),
    /远程物品与任务数据源均不可用/
  );
  assert.equal(context.state.caches.search.size, 0, "failed combined search must be retryable");

  const itemOnlyContext = {
    state: { caches: { search: new Map() } },
    searchItems: async () => [{ ID: 5114, Name: "秘银矿" }],
    searchQuests: async () => { throw new Error("quest source down"); },
    debugLog() {},
    mapItemsToSearchEntities(items) {
      return items.map((entry) => ({ type: "item", id: entry.ID, name: entry.Name }));
    },
    rankSearchResults(results) { return results; },
  };
  vm.createContext(itemOnlyContext);
  vm.runInContext(`${source}; globalThis.searchEntitiesForTest = searchEntities;`, itemOnlyContext);
  assert.equal(
    JSON.stringify((await itemOnlyContext.searchEntitiesForTest("秘银")).map((entry) => entry.id)),
    "[5114]",
    "item results remain available when quest search fails"
  );

  const questOnlyContext = {
    state: { caches: { search: new Map() } },
    searchItems: async () => { throw new Error("item source down"); },
    searchQuests: async () => [{ ID: 66358, Name: "测试任务" }],
    debugLog() {},
    mapItemsToSearchEntities() { return []; },
    rankSearchResults(results) { return results; },
  };
  vm.createContext(questOnlyContext);
  vm.runInContext(`${source}; globalThis.searchEntitiesForTest = searchEntities;`, questOnlyContext);
  assert.equal(
    JSON.stringify((await questOnlyContext.searchEntitiesForTest("测试")).map((entry) => entry.id)),
    "[66358]",
    "quest results remain available when item search fails"
  );
}

async function testOptionalCachesRecover() {
  const recipeSource = extractBlock(
    "async function getRecipe",
    "\n}\n\nasync function getGatheringEntry"
  );
  let recipeAttempts = 0;
  const recipeContext = {
    state: { caches: { recipe: new Map() } },
    recipeColumns: [],
    ENCYCLOPEDIA_API: "https://example.invalid",
    fetchJson() {
      recipeAttempts += 1;
      return recipeAttempts === 1
        ? Promise.reject(new Error("temporary failure"))
        : Promise.resolve({ ID: 8 });
    },
    encodeURIComponent,
  };
  vm.createContext(recipeContext);
  vm.runInContext(`${recipeSource}; globalThis.getRecipeForTest = getRecipe;`, recipeContext);
  assert.equal(await recipeContext.getRecipeForTest(8), null);
  assert.equal(recipeContext.state.caches.recipe.has(8), false);
  assert.equal((await recipeContext.getRecipeForTest(8)).ID, 8);
  assert.equal(recipeAttempts, 2);

  const marketSource = extractBlock(
    "async function getMarketRows",
    "\n}\n\nfunction renderItemOverview"
  );
  let marketAttempts = 0;
  const marketContext = {
    MARKET_API: "https://example.invalid",
    MARKET_CACHE_TTL_MS: 60000,
    state: {
      dataCenters: [{ name: "中国", worlds: [1] }],
      caches: { market: new Map() },
    },
    fetchJson() {
      marketAttempts += 1;
      return marketAttempts === 1
        ? Promise.reject(new Error("temporary failure"))
        : Promise.resolve({ listings: [] });
    },
    buildWorldRowsFromPayload() {
      return [{ worldName: "测试", minPrice: 10 }];
    },
    buildEmptyWorldRow() {
      return { worldName: "测试", minPrice: null };
    },
    console: { error() {} },
    encodeURIComponent,
  };
  vm.createContext(marketContext);
  vm.runInContext(`${marketSource}; globalThis.getMarketRowsForTest = getMarketRows;`, marketContext);
  await marketContext.getMarketRowsForTest(9);
  assert.equal(marketContext.state.caches.market.has(9), false);
  await marketContext.getMarketRowsForTest(9);
  await marketContext.getMarketRowsForTest(9);
  assert.equal(marketAttempts, 2, "successful market data should use the short-lived cache");
}

async function testLoadItemPageCompletes() {
  const source = extractBlock(
    "async function loadItemPage",
    "\n}\n\nasync function loadQuestPage"
  );
  const events = [];
  const context = {
    FETCH_LIMITS: { usageRecipes: 5, craftRecipes: 5, gatherItems: 5, relatedQuests: 5 },
    state: {
      entityLoadToken: 0,
      resolvedAliases: new Map(),
      currentEntity: null,
      currentWorldRows: [],
      currentCraftRecipes: new Map(),
    },
    dom: { searchInput: { value: "" } },
    console: { error() {} },
    getItem: async () => ({ ID: 99, Name: "测试物品", GameContentLinks: {} }),
    getPreferredItemName: (item) => item.Name,
    updateRoute() {},
    renderItemOverview() {},
    renderMarketOverview() {},
    renderPriceTable() {},
    uniqueNumbers: () => [],
    flattenLinkValues: () => [],
    flattenLinkObject: () => [],
    getGilShopIds: () => [],
    getMarketRows: async () => [],
    getRecipe: async () => null,
    getGatheringEntry: async () => null,
    searchQuests: async () => [],
    getShopSources: async () => [],
    renderObtainPanel() {},
    renderCraftPanel() {},
    renderUsagePanel() {},
    setBootStatus(message) { events.push(message); },
  };
  vm.createContext(context);
  vm.runInContext(`${source}; globalThis.loadItemPageForTest = loadItemPage;`, context);
  await context.loadItemPageForTest(99);
  assert.equal(context.state.currentEntity.data.ID, 99);
  assert.equal(context.dom.searchInput.value, "测试物品");
  assert.match(events.at(-1), /已载入/);
}

async function testItemFallbackRejectsEmptyRemoteData() {
  const source = extractBlock(
    "async function fetchItemWithFallback",
    "\n}\n\nasync function fetchXivApiItem"
  );
  const aliases = new Map([[2, { fast: true, name: "本地物品" }]]);
  const context = {
    ENCYCLOPEDIA_API: "https://example.invalid",
    state: { resolvedAliases: aliases, itemMappingById: new Map() },
    fetchJson: async () => ({}),
    fetchXivApiItem: async () => { throw new Error("offline"); },
    mergeItemPayload: () => ({}),
    applyAliasMetaToItem: (_item, alias, itemId) => ({ ID: itemId, Name: alias?.name || "" }),
    encodeURIComponent,
  };
  vm.createContext(context);
  vm.runInContext(`${source}; globalThis.fetchItemWithFallbackForTest = fetchItemWithFallback;`, context);
  await assert.rejects(
    () => context.fetchItemWithFallbackForTest(1),
    /百科数据暂不可用/
  );
  const localFallback = await context.fetchItemWithFallbackForTest(2);
  assert.equal(localFallback.Name, "本地物品");
}

function testStorageFailureDoesNotBreakSearch() {
  const source = extractBlock(
    "function saveSearchHistory",
    "\n}\n\nfunction setLoadingState"
  );
  const context = {
    MAX_SEARCH_QUERY_LENGTH: 256,
    SEARCH_HISTORY_LIMIT: 8,
    SEARCH_HISTORY_KEY: "history",
    loadSearchHistory: () => [],
    renderSearchHistory() {
      throw new Error("render must not run after failed persistence");
    },
    localStorage: {
      setItem() { throw new Error("storage disabled"); },
    },
  };
  vm.createContext(context);
  vm.runInContext(`${source}; globalThis.saveSearchHistoryForTest = saveSearchHistory;`, context);
  assert.doesNotThrow(() => context.saveSearchHistoryForTest("秘银"));
}

function testIconPathNormalizationAndEmptyMarkup() {
  const source = extractBlock(
    "function toIconUrl",
    "\n}\n\nfunction formatPrice"
  );
  const context = {
    ICON_PROXY_ENDPOINT: "/__icon",
    LOCAL_ICON_PROXY_HOSTS: new Set(["127.0.0.1", "localhost", "::1", "[::1]"]),
    URL,
    decodeURIComponent,
    encodeURIComponent,
    escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    },
    window: {
      location: {
        protocol: "http:",
        hostname: "127.0.0.1",
        origin: "http://127.0.0.1:4174",
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(
    `${source}; globalThis.normalizeIconPathForTest = normalizeIconPath; globalThis.toIconUrlForTest = toIconUrl; globalThis.renderOverviewIconForTest = renderOverviewIcon; globalThis.renderBackgroundIconStyleForTest = renderBackgroundIconStyle;`,
    context
  );

  const assetUrl = "https://v2.xivapi.com/api/asset?path=ui%2Ficon%2F021000%2F021208.tex&format=png";
  assert.equal(context.normalizeIconPathForTest(assetUrl), "021000/021208.png");
  assert.equal(
    context.toIconUrlForTest(assetUrl),
    "http://127.0.0.1:4174/__icon?path=021000%2F021208.png"
  );
  assert.match(context.renderOverviewIconForTest("021000/021208.png", "秘银矿"), /__icon\?path=/);
  assert.equal(context.renderOverviewIconForTest("", "无图标"), "");
  assert.equal(context.renderBackgroundIconStyleForTest(""), "");
  assert.equal(context.normalizeIconPathForTest("https://example.com/not-an-icon.svg"), "");
}

async function testMarketableValidationAndRetry() {
  const source = extractBlock(
    "async function getMarketableItemIds",
    "\n}\n\nasync function fetchAggregatedMarket"
  );
  let response = [];
  const context = {
    MARKET_API: "https://example.invalid",
    state: { caches: { marketableItems: null } },
    fetchJson: async () => response,
  };
  vm.createContext(context);
  vm.runInContext(`${source}; globalThis.getMarketableItemIdsForTest = getMarketableItemIds;`, context);
  await assert.rejects(() => context.getMarketableItemIdsForTest(), /未返回可交易物品/);
  assert.equal(context.state.caches.marketableItems, null);
  response = [1, "1", 2, -3, 1.5];
  const recovered = await context.getMarketableItemIdsForTest();
  assert.deepEqual(Array.from(recovered), [1, 2]);
}

async function testAllRankingBatchesFail() {
  const source = extractBlock(
    "async function getSalesRanking",
    "\n}\n\nasync function hydrateSalesRankingNames"
  );
  const context = {
    SALES_RANKING_BATCH_SIZE: 2,
    SALES_RANKING_CONCURRENCY: 2,
    SALES_RANKING_BATCH_TIMEOUT_MS: 50,
    SALES_RANKING_LIMIT: 30,
    state: { itemMappingById: new Map(), caches: { salesRanking: new Map() } },
    getSalesRankingCacheKey: () => "scope",
    getCachedSalesRanking: () => null,
    getMarketableItemIds: async () => [1, 2, 3],
    chunkArray(values, size) {
      const chunks = [];
      for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
      return chunks;
    },
    async runWithConcurrency(values, _limit, worker) {
      await Promise.all(values.map(worker));
    },
    fetchAggregatedMarket: async () => { throw new Error("offline"); },
    console: { error() {} },
  };
  vm.createContext(context);
  vm.runInContext(`${source}; globalThis.getSalesRankingForTest = getSalesRanking;`, context);
  await assert.rejects(
    () => context.getSalesRankingForTest({ scopeLevel: "region" }),
    /销售排行请求全部失败/
  );
  assert.equal(context.state.caches.salesRanking.size, 0);
}

async function main() {
  await testFetchJson();
  await testSearchRace();
  await testFuzzySearchRequiresSelection();
  await testRejectedQuestCacheIsEvicted();
  await testCombinedSearchFailureIsRetryable();
  await testOptionalCachesRecover();
  await testLoadItemPageCompletes();
  await testItemFallbackRejectsEmptyRemoteData();
  testStorageFailureDoesNotBreakSearch();
  testIconPathNormalizationAndEmptyMarkup();
  await testMarketableValidationAndRetry();
  await testAllRankingBatchesFail();
  assert.match(
    appSource,
    /fetchJson\(\x60?\/__resolve_item|fetchJson\(\`\/__resolve_item/
  );
  assert.match(appSource, /timeoutMs:\s*WIKI_RESOLVER_TIMEOUT_MS/);
  console.log("test-app-regressions.js: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
