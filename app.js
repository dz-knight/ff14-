const ENCYCLOPEDIA_API = "https://cafemaker.wakingsands.com";
const MARKET_API = "https://universalis.app/api/v2";
const DEFAULT_ITEM_ID = 5114;
const DEFAULT_ITEM_NAME = "秘银矿";
const CN_REGION_NAME = "中国";
const SEARCH_HISTORY_KEY = "ff14_market_search_history_v1";
const SEARCH_HISTORY_LIMIT = 12;
const DEBUG_LOG_KEY = "ff14_market_debug_log_v1";
const THEME_PREFERENCE_KEY = "ff14_market_theme_v1";
const SALES_RANKING_STORAGE_KEY = "ff14_market_sales_ranking_cache_v2";
const DEFAULT_THEME_COLOR = "#bb6b1f";
const SALES_RANKING_LIMIT = 30;
const SALES_RANKING_BATCH_SIZE = 900;
const SALES_RANKING_CONCURRENCY = 6;
const SALES_RANKING_BATCH_TIMEOUT_MS = 20000;
const SALES_RANKING_TAX_RATE = 0.05;
const SALES_RANKING_CACHE_TTL_MS = 2 * 60 * 1000;
const SALES_RANKING_STORAGE_TTL_MS = 5 * 60 * 1000;
const ICON_PROXY_ENDPOINT = "/__icon";
const LOCAL_ICON_PROXY_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const FETCH_LIMITS = {
  usageRecipes: 120,
  craftRecipes: 40,
  gatherItems: 24,
  relatedQuests: 16,
  shopSources: 12,
  shopNpcsPerShop: 4,
};
const KNOWN_ITEM_ALIASES = {};

const NORMALIZED_KNOWN_ITEM_ALIASES = Object.fromEntries(
  Object.entries(KNOWN_ITEM_ALIASES).map(([key, value]) => [normalizeSearchKey(key), value])
);

const state = {
  dataCenters: [],
  worlds: [],
  worldMap: new Map(),
  selectedRegion: "全部",
  currentEntity: null,
  currentWorldRows: [],
  searchToken: 0,
  searchTimer: null,
  pendingWikiResolve: new Map(),
  resolvedAliases: new Map(),
  resolvedQueries: new Map(),
  selectedMarketQuality: "all",
  salesRankingMode: "price",
  salesRankingScope: "region:中国",
  salesRankingToken: 0,
  currentSalesRanking: null,
  currentCraftRecipes: new Map(),
  themeMode: "light",
  themeColor: DEFAULT_THEME_COLOR,
  caches: {
    item: new Map(),
    quest: new Map(),
    recipe: new Map(),
    gatherItem: new Map(),
    gatherBase: new Map(),
    gatherPoint: new Map(),
    market: new Map(),
    search: new Map(),
    shopSource: new Map(),
    shopNpc: new Map(),
    npcLocation: new Map(),
    npc: new Map(),
    map: new Map(),
    marketableItems: null,
    salesRanking: new Map(),
  },
};

const dom = {
  bootStatus: document.getElementById("boot-status"),
  searchInput: document.getElementById("item-search"),
  searchButton: document.getElementById("search-button"),
  searchResults: document.getElementById("search-results"),
  searchHistory: document.getElementById("search-history"),
  themeSwitch: document.getElementById("theme-switch"),
  themeColorPicker: document.getElementById("theme-color-picker"),
  themeRgbInput: document.getElementById("theme-rgb-input"),
  themeRgbApply: document.getElementById("theme-rgb-apply"),
  worldFilter: document.getElementById("world-filter"),
  priceTableBody: document.getElementById("price-table-body"),
  itemOverview: document.getElementById("item-overview"),
  marketOverview: document.getElementById("market-overview"),
  salesRankingPanel: document.getElementById("sales-ranking-panel"),
  salesRankingScope: document.getElementById("sales-ranking-scope"),
  salesRankingButton: document.getElementById("load-sales-ranking"),
  salesRankingStatus: document.getElementById("sales-ranking-status"),
  salesRankingSummary: document.getElementById("sales-ranking-summary"),
  salesRankingTabs: document.getElementById("sales-ranking-tabs"),
  salesRankingTableBody: document.getElementById("sales-ranking-table-body"),
  obtainPanel: document.getElementById("obtain-panel"),
  craftPanel: document.getElementById("craft-panel"),
  usagePanel: document.getElementById("usage-panel"),
  regionFilters: document.getElementById("region-filters"),
  resultTemplate: document.getElementById("result-item-template"),
};

const recipeColumns = [
  "ID",
  "AmountResult",
  "CraftType.Name",
  "RecipeLevelTable.ClassJobLevel",
  "ItemResult.Name",
  "ItemResult.Icon",
  "ItemResultTargetID",
  "AmountIngredient0",
  "AmountIngredient1",
  "AmountIngredient2",
  "AmountIngredient3",
  "AmountIngredient4",
  "AmountIngredient5",
  "AmountIngredient6",
  "AmountIngredient7",
  "ItemIngredient0.Name",
  "ItemIngredient1.Name",
  "ItemIngredient2.Name",
  "ItemIngredient3.Name",
  "ItemIngredient4.Name",
  "ItemIngredient5.Name",
  "ItemIngredient6.Name",
  "ItemIngredient7.Name",
  "ItemIngredient0.Icon",
  "ItemIngredient1.Icon",
  "ItemIngredient2.Icon",
  "ItemIngredient3.Icon",
  "ItemIngredient4.Icon",
  "ItemIngredient5.Icon",
  "ItemIngredient6.Icon",
  "ItemIngredient7.Icon",
  "ItemIngredient0TargetID",
  "ItemIngredient1TargetID",
  "ItemIngredient2TargetID",
  "ItemIngredient3TargetID",
  "ItemIngredient4TargetID",
  "ItemIngredient5TargetID",
  "ItemIngredient6TargetID",
  "ItemIngredient7TargetID",
];

const questColumns = [
  "ID",
  "Name",
  "Name_en",
  "Name_ja",
  "Icon",
  "ClassJobLevel0",
  "GilReward",
  "ExpFactor",
  "JournalGenre.Name",
  "IssuerStart.Name",
  "IssuerLocation.PlaceName.Name",
  "IssuerLocation.Map.PlaceName.Name",
  "IssuerLocation.Map.PlaceNameRegion.Name",
  "IssuerLocation.Map.SizeFactor",
  "IssuerLocation.Map.OffsetX",
  "IssuerLocation.Map.OffsetY",
  "IssuerLocation.X",
  "IssuerLocation.Y",
  "PreviousQuest0.Name",
  "PreviousQuest0TargetID",
  "PreviousQuest1.Name",
  "PreviousQuest1TargetID",
  "PreviousQuest2.Name",
  "PreviousQuest2TargetID",
  "NextQuest.Name",
  "NextQuestTargetID",
  "ItemReward0.Name",
  "ItemReward0TargetID",
  "ItemReward1.Name",
  "ItemReward1TargetID",
  "ItemReward2.Name",
  "ItemReward2TargetID",
  "ItemReward3.Name",
  "ItemReward3TargetID",
  "ItemReward4.Name",
  "ItemReward4TargetID",
  "ItemReward5.Name",
  "ItemReward5TargetID",
  "ItemReward6.Name",
  "ItemReward6TargetID",
  "ItemCountReward0",
  "ItemCountReward1",
  "ItemCountReward2",
  "ItemCountReward3",
  "ItemCountReward4",
  "ItemCountReward5",
  "ItemCountReward6",
  "OptionalItemReward0.Name",
  "OptionalItemReward0TargetID",
  "OptionalItemReward1.Name",
  "OptionalItemReward1TargetID",
  "OptionalItemReward2.Name",
  "OptionalItemReward2TargetID",
  "OptionalItemReward3.Name",
  "OptionalItemReward3TargetID",
  "OptionalItemReward4.Name",
  "OptionalItemReward4TargetID",
  "OptionalItemCountReward0",
  "OptionalItemCountReward1",
  "OptionalItemCountReward2",
  "OptionalItemCountReward3",
  "OptionalItemCountReward4",
  "Description",
];

document.addEventListener("DOMContentLoaded", bootstrap);
window.addEventListener("popstate", () => loadFromUrl({ replace: true }));

function bindEvents() {
  dom.themeSwitch?.querySelectorAll("[data-theme-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      setThemePreference({
        mode: button.getAttribute("data-theme-mode") || "light",
      });
    });
  });
  dom.themeColorPicker?.addEventListener("input", () => {
    setThemePreference({
      color: dom.themeColorPicker.value,
    });
  });
  dom.themeRgbApply?.addEventListener("click", () => {
    applyThemeColorInput();
  });
  dom.themeRgbInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyThemeColorInput();
    }
  });
  dom.searchButton.addEventListener("click", () => performSearch(dom.searchInput.value.trim()));
  dom.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      performSearch(dom.searchInput.value.trim());
    }
  });
  dom.searchInput.addEventListener("input", () => handleSearchInput(dom.searchInput.value.trim()));
  dom.worldFilter.addEventListener("input", renderPriceTable);
  dom.salesRankingScope?.addEventListener("change", () => {
    state.salesRankingScope = dom.salesRankingScope.value || state.salesRankingScope;
    renderSalesRankingIdle();
  });
  dom.salesRankingButton?.addEventListener("click", () => loadSalesRanking());
  dom.salesRankingTabs?.querySelectorAll("[data-sales-ranking-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.salesRankingMode = button.getAttribute("data-sales-ranking-mode") || "price";
      renderSalesRankingTabs();
      renderSalesRankingTable();
    });
  });
  document.addEventListener("click", (event) => {
    const wikiTarget = event.target instanceof Element ? event.target.closest("[data-wiki-search]") : null;
    if (wikiTarget) {
      event.preventDefault();
      openWikiSearch(wikiTarget.getAttribute("data-wiki-search") || "");
      return;
    }

    if (!dom.searchResults.contains(event.target) && event.target !== dom.searchInput) {
      dom.searchResults.classList.add("hidden");
    }
  });

  document.addEventListener("click", (event) => {
    const profitTarget = event.target instanceof Element ? event.target.closest("[data-profit-recipe-id]") : null;
    if (!profitTarget) {
      return;
    }

    event.preventDefault();
    const recipeId = Number(profitTarget.getAttribute("data-profit-recipe-id") || 0);
    const recipe = state.currentCraftRecipes.get(recipeId);
    if (recipe) {
      loadRecipeProfit(recipe, getSelectedRecipeProfitScope(recipeId));
    }
  });
}

async function loadFromUrl({ replace = false } = {}) {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");
  const id = Number(params.get("id"));
  const keyword = params.get("q");

  if (type === "quest" && id > 0) {
    await loadQuestPage(id, { replace });
    return;
  }

  if (type === "item" && id > 0) {
    await loadItemPage(id, { replace });
    return;
  }

  if (keyword) {
    dom.searchInput.value = keyword;
    await performSearch(keyword, { replace });
    return;
  }

  dom.searchInput.value = DEFAULT_ITEM_NAME;
  await loadItemPage(DEFAULT_ITEM_ID, { replace: true });
}

function updateRoute(type, id, name, replace = false) {
  const url = new URL(window.location.href);
  url.searchParams.set("type", type);
  url.searchParams.set("id", String(id));
  if (name) {
    url.searchParams.set("name", name);
  } else {
    url.searchParams.delete("name");
  }

  if (replace) {
    history.replaceState({}, "", url);
  } else {
    history.pushState({}, "", url);
  }
}

function setBootStatus(text) {
  dom.bootStatus.textContent = text;
  debugLog(`[status] ${text}`);
}

function renderFatalError(error) {
  const message = escapeHtml(error?.message || String(error));
  const markup = `<div class="notice notice--warn">无法初始化数据源。<br>错误信息：${message}</div>`;
  dom.itemOverview.innerHTML = wrapCard("物品总览", "加载失败", markup);
  dom.marketOverview.innerHTML = wrapCard("市场总览", "加载失败", markup);
  dom.obtainPanel.innerHTML = wrapCard("获取方式", "加载失败", markup);
  dom.craftPanel.innerHTML = wrapCard("制作配方", "加载失败", markup);
  dom.usagePanel.innerHTML = wrapCard("用途", "加载失败", markup);
}

async function loadMarketMetadata() {
  const [worldsResponse, dataCentersResponse] = await Promise.all([
    fetchJson(`${MARKET_API}/worlds`),
    fetchJson(`${MARKET_API}/data-centers`),
  ]);

  state.worlds = worldsResponse;
  state.dataCenters = dataCentersResponse
    .filter((entry) => entry.region === CN_REGION_NAME)
    .map((entry) => ({ ...entry }));
  state.worldMap = new Map();

  for (const dataCenter of state.dataCenters) {
    for (const worldId of dataCenter.worlds) {
      const sourceWorld = state.worlds.find((world) => world.id === worldId);
      state.worldMap.set(worldId, {
        ...(sourceWorld || { id: worldId, name: `#${worldId}` }),
        region: dataCenter.region,
        dataCenter: dataCenter.name,
        dataCenterName: dataCenter.name,
      });
    }
  }

  syncSalesRankingScopeOptions();
}

function syncSalesRankingScopeOptions() {
  if (!dom.salesRankingScope) {
    return;
  }

  const options = getMarketScopeOptions();

  dom.salesRankingScope.innerHTML = options.map((entry) => `
    <option value="${escapeHtml(entry.value)}">${escapeHtml(entry.label)}</option>
  `).join("");

  if (!options.some((entry) => entry.value === state.salesRankingScope)) {
    state.salesRankingScope = options[0].value;
  }
  dom.salesRankingScope.value = state.salesRankingScope;
  renderSalesRankingIdle();
}

function getMarketScopeOptions() {
  const options = [{ value: "region:中国", label: "中国全区", type: "region" }];
  for (const dataCenter of state.dataCenters) {
    options.push({ value: `dc:${dataCenter.name}`, label: dataCenter.name, type: "dc" });
    for (const worldId of dataCenter.worlds || []) {
      const world = state.worldMap.get(worldId);
      if (world?.name) {
        options.push({
          value: `world:${world.name}`,
          label: `${dataCenter.name} / ${world.name}`,
          type: "world",
          worldId,
        });
      }
    }
  }
  return options;
}

function handleSearchInput(keyword) {
  window.clearTimeout(state.searchTimer);
  if (!keyword) {
    dom.searchResults.classList.add("hidden");
    dom.searchResults.innerHTML = "";
    return;
  }

  const exactAlias = resolveKnownItemAlias(keyword);
  if (exactAlias) {
    renderSearchResults(searchEntitiesFromKnownAlias(keyword, exactAlias));
    return;
  }

  state.searchTimer = window.setTimeout(async () => {
    const token = ++state.searchToken;
    try {
      const results = await searchEntities(keyword, { allowDeepFallback: false });
      if (token !== state.searchToken) {
        return;
      }
      renderSearchResults(results);
    } catch (error) {
      console.error(error);
    }
  }, 220);
}

async function performSearch(keyword, { replace = false } = {}) {
  if (!keyword) {
    return;
  }

  dom.searchButton.disabled = true;
  dom.searchButton.textContent = "搜索中";
  setLoadingState(keyword);

  try {
    const exactAlias = resolveKnownItemAlias(keyword);
    if (exactAlias) {
      const fastResults = searchEntitiesFromKnownAlias(keyword, exactAlias);
      renderSearchResults(fastResults);
      const preferred = fastResults[0];
      dom.searchInput.value = preferred.name;
      saveSearchHistory(keyword);
      await loadItemPage(preferred.id, { replace });
      return;
    }

    const questIntent = parseQuestSearchIntent(keyword);
    if (questIntent.directQuestId) {
      await loadQuestPage(questIntent.directQuestId, { replace });
      return;
    }

    if (questIntent.forceQuestKeyword) {
      const forcedQuestResults = await searchQuests(questIntent.forceQuestKeyword);
      const mappedQuestResults = forcedQuestResults.map((entry) => ({
        type: "quest",
        id: entry.ID,
        name: entry.Name || entry.Name_en || `任务 #${entry.ID}`,
        subtitle: `${entry.JournalGenre?.Name || "任务"} · 等级 ${entry.ClassJobLevel0 || 0} · ${entry.Name_en || "无英文名"}`,
        icon: entry.Icon,
        raw: entry,
      }));
      renderSearchResults(mappedQuestResults);
      if (!mappedQuestResults.length) {
        renderQuestSearchNotFound(questIntent.forceQuestKeyword);
        return;
      }
      dom.searchInput.value = mappedQuestResults[0].name;
      saveSearchHistory(`任务:${mappedQuestResults[0].name}`);
      await loadQuestPage(mappedQuestResults[0].id, { replace });
      return;
    }

    const results = await searchEntities(keyword, { allowDeepFallback: true });
    renderSearchResults(results);

    if (!results.length) {
      renderNoSearchResult(keyword);
      return;
    }

    const preferred = pickPreferredSearchResult(results, keyword);
    if (!preferred || !preferred.shouldAutoOpen) {
      const wikiResolved = await tryResolveAmbiguousViaWiki(keyword);
      if (wikiResolved) {
        renderSearchResults([wikiResolved]);
        dom.searchInput.value = wikiResolved.name;
        saveSearchHistory(keyword);
        if (wikiResolved.type === "wiki") {
          renderAmbiguousSearchResult(keyword, [wikiResolved, ...results]);
          setBootStatus(`已找到 Wiki 结果，请确认条目或直接打开国服 Wiki`);
          return;
        }
        await loadItemPage(wikiResolved.id, { replace });
        return;
      }

      dom.searchInput.value = keyword;
      saveSearchHistory(keyword);
      setBootStatus(`找到 ${results.length} 条相关结果，请点击列表中的准确条目`);
      renderAmbiguousSearchResult(keyword, results);
      return;
    }

    const selected = preferred.entry;
    dom.searchInput.value = selected.name;
    saveSearchHistory(keyword);

    if (selected.type === "quest") {
      await loadQuestPage(selected.id, { replace });
    } else {
      if (selected.raw?.__mappingAlias) {
        rememberResolvedAlias(keyword, selected.raw.__mappingAlias);
      }
      await loadItemPage(selected.id, { replace });
    }
  } catch (error) {
    console.error(error);
    renderLoadError(error);
  } finally {
    dom.searchButton.disabled = false;
    dom.searchButton.textContent = "搜索";
  }
}

async function searchEntities(keyword, { allowDeepFallback = true } = {}) {
  const exactAlias = resolveKnownItemAlias(keyword);
  if (exactAlias) {
    return searchEntitiesFromKnownAlias(keyword, exactAlias);
  }

  const cacheKey = `${keyword.trim().toLowerCase()}::${allowDeepFallback ? "deep" : "light"}`;
  if (state.caches.search.has(cacheKey)) {
    return state.caches.search.get(cacheKey);
  }

  const promise = Promise.all([
    searchItems(keyword, { allowDeepFallback }),
    searchQuests(keyword),
  ]).then(([items, quests]) => {
    const mappedItems = items.map((entry) => ({
      type: "item",
      id: entry.ID,
      name: entry.Name || entry.Name_en || `物品 #${entry.ID}`,
      subtitle: `${entry.ItemUICategory?.Name || "未分类"} · 物品等级 ${entry.LevelItem || 0} · ${entry.Name_en || "无英文名"}`,
      icon: entry.Icon,
      raw: entry,
    }));

    const mappedQuests = quests.map((entry) => ({
      type: "quest",
      id: entry.ID,
      name: entry.Name || entry.Name_en || `任务 #${entry.ID}`,
      subtitle: `${entry.JournalGenre?.Name || "任务"} · 等级 ${entry.ClassJobLevel0 || 0} · ${entry.Name_en || "无英文名"}`,
      icon: entry.Icon,
      raw: entry,
    }));

    const combined = [...mappedItems, ...mappedQuests];
    if (!combined.length) {
      state.caches.search.delete(cacheKey);
    }
    return combined;
  });

  state.caches.search.set(cacheKey, promise);
  return promise;
}

function searchEntitiesFromKnownAlias(keyword, exactAlias) {
  const items = buildResolvedAliasItems(keyword, exactAlias);
  return items.map((entry) => ({
    type: "item",
    id: entry.ID,
    name: entry.Name || entry.Name_en || `物品 #${entry.ID}`,
    subtitle: `${entry.ItemUICategory?.Name || "未分类"} · 物品等级 ${entry.LevelItem || 0} · ${entry.Name_en || "无英文名"}`,
    icon: entry.Icon,
    raw: entry,
  }));
}

function pickPreferredSearchResult(results, keyword) {
  if (!results.length) {
    return null;
  }

  const normalizedKeyword = normalizeSearchKey(keyword);
  const scored = results.map((entry, index) => ({
    entry,
    index,
    score: scoreSearchResult(entry, normalizedKeyword),
  }));

  scored.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }
    return left.index - right.index;
  });

  const best = scored[0];
  if (!best) {
    return null;
  }

  return {
    entry: best.entry,
    shouldAutoOpen: best.score >= 100,
  };
}

function scoreSearchResult(entry, normalizedKeyword) {
  const names = [
    entry.name,
    entry.raw?.Name,
    entry.raw?.Name_en,
    entry.raw?.Name_ja,
  ]
    .filter(Boolean)
    .map(normalizeSearchKey);

  let best = 0;
  for (const name of names) {
    if (!name) continue;
    if (name === normalizedKeyword) {
      best = Math.max(best, 120);
      continue;
    }
    if (name.startsWith(normalizedKeyword)) {
      best = Math.max(best, 80);
      continue;
    }
    if (name.includes(normalizedKeyword)) {
      best = Math.max(best, 50);
    }
  }

  if (entry.type === "item") {
    best += 5;
  }

  return best;
}

async function searchItems(keyword, { allowDeepFallback = true } = {}) {
  const exactAlias = resolveKnownItemAlias(keyword);
  if (exactAlias) {
    debugLog(`[searchItems:known-alias] keyword=${keyword} itemId=${exactAlias.itemId} english=${exactAlias.englishName}`);
    return buildResolvedAliasItems(keyword, exactAlias);
  }

  debugLog(`[searchItems:start] keyword=${keyword}`);
  const encoded = encodeURIComponent(keyword);
  const columns = encodeURIComponent("ID,Name,Name_en,Name_ja,Icon,LevelItem,ItemUICategory.Name");
  const primaryUrl = `${ENCYCLOPEDIA_API}/search?indexes=Item&string=${encoded}&language=chs&limit=50&columns=${columns}`;
  const primary = await fetchJson(primaryUrl);
  const results = primary.Results || [];
  debugLog(`[searchItems:primary] keyword=${keyword} count=${results.length}`);

  if (results.length > 0) {
    return results;
  }

  const fallbackUrl = `${ENCYCLOPEDIA_API}/search?indexes=Item&string=${encoded}&language=en&limit=50&columns=${columns}`;
  const fallback = await fetchJson(fallbackUrl);
  const fallbackResults = fallback.Results || [];
  debugLog(`[searchItems:fallback-en] keyword=${keyword} count=${fallbackResults.length}`);
  if (fallbackResults.length > 0) {
    return fallbackResults;
  }

  if (!allowDeepFallback) {
    debugLog(`[searchItems:skip-deep-fallback] keyword=${keyword}`);
    return [];
  }

  const wikiResolved = await resolveItemViaWikiFallback(keyword);
  debugLog(`[searchItems:wiki-fallback-result] keyword=${keyword} success=${!!wikiResolved} itemId=${wikiResolved?.itemId ?? ""} english=${wikiResolved?.englishName ?? ""}`);
  if (wikiResolved?.itemId) {
    return buildResolvedAliasItems(keyword, {
      itemId: wikiResolved.itemId,
      englishName: wikiResolved.englishName || wikiResolved.title || keyword,
      description: "该物品通过国服 Wiki -> Universalis 英文站兜底解析得到，当前价格可用，但百科详情可能不完整。",
    });
  }

  return [];
}

function normalizeSearchKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[壹壱]/g, "一")
    .replace(/[贰貳弐]/g, "二")
    .replace(/[叁參参]/g, "三")
    .replace(/肆/g, "四")
    .replace(/伍/g, "五")
    .replace(/[陆陸]/g, "六")
    .replace(/柒/g, "七")
    .replace(/捌/g, "八")
    .replace(/玖/g, "九")
    .replace(/拾/g, "十")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function buildResolvedAliasItems(keyword, resolved) {
  const normalizedKeyword = normalizeSearchKey(keyword);
  state.resolvedQueries.set(normalizedKeyword, {
    itemId: resolved.itemId,
    name: resolved.name || keyword,
    englishName: resolved.englishName || keyword,
    icon: resolved.icon || "",
    fast: true,
    description: resolved.description || "",
  });
  state.resolvedAliases.set(resolved.itemId, {
    preferredName: resolved.name || keyword,
    preferredEnglishName: resolved.englishName || keyword,
    preferredDescription: resolved.description || "该物品通过中文别名映射或 Wiki/英文站兜底解析得到，当前价格可用，但百科详情可能不完整。",
    icon: resolved.icon || "",
    fast: !!resolved.fast,
  });
  state.caches.item.delete(resolved.itemId);

  return [
    {
      ID: resolved.itemId,
      Name: resolved.name || keyword,
      Name_en: resolved.englishName || keyword,
      Name_ja: "",
      Icon: resolved.icon || "",
      LevelItem: 0,
      ItemUICategory: { Name: "别名/Wiki -> Universalis 英文站兜底解析" },
    }
  ];
}

async function searchQuests(keyword) {
  const encoded = encodeURIComponent(keyword);
  const columns = encodeURIComponent("ID,Name,Name_en,Name_ja,Icon,JournalGenre.Name,ClassJobLevel0");
  const primaryUrl = `${ENCYCLOPEDIA_API}/search?indexes=Quest&string=${encoded}&language=chs&limit=50&columns=${columns}`;
  const primary = await fetchJson(primaryUrl);
  const results = primary.Results || [];

  if (results.length > 0) {
    return results;
  }

  const fallbackUrl = `${ENCYCLOPEDIA_API}/search?indexes=Quest&string=${encoded}&language=en&limit=50&columns=${columns}`;
  const fallback = await fetchJson(fallbackUrl);
  return fallback.Results || [];
}

function debugLog(message) {
  try {
    const current = loadDebugLog();
    current.push(`[${new Date().toLocaleString("zh-CN", { hour12: false })}] ${message}`);
    const next = current.slice(-200);
    localStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(next));
    fetch("/__debug_log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ Message: message }),
    }).catch(() => {});
  } catch {
    // ignore debug log failures
  }
}

function loadDebugLog() {
  try {
    const raw = localStorage.getItem(DEBUG_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function initializeTheme() {
  const saved = loadThemePreference();
  applyTheme(saved.mode, saved.color);
}

function normalizeThemeMode(theme) {
  return ["light", "dark"].includes(theme) ? theme : "light";
}

function loadThemePreference() {
  try {
    const raw = localStorage.getItem(THEME_PREFERENCE_KEY);
    if (!raw) {
      return { mode: "light", color: DEFAULT_THEME_COLOR };
    }
    const parsed = JSON.parse(raw);
    return {
      mode: normalizeThemeMode(parsed?.mode),
      color: normalizeThemeColor(parsed?.color),
    };
  } catch {
    return { mode: "light", color: DEFAULT_THEME_COLOR };
  }
}

function setThemePreference(partialTheme) {
  const nextTheme = {
    mode: normalizeThemeMode(partialTheme?.mode ?? state.themeMode),
    color: normalizeThemeColor(partialTheme?.color ?? state.themeColor),
  };
  try {
    localStorage.setItem(THEME_PREFERENCE_KEY, JSON.stringify(nextTheme));
  } catch {
    // ignore storage failures
  }
  applyTheme(nextTheme.mode, nextTheme.color);
}

function applyTheme(mode, color) {
  state.themeMode = normalizeThemeMode(mode);
  state.themeColor = normalizeThemeColor(color);
  document.documentElement.dataset.theme = state.themeMode;
  applyThemeColorVariables(state.themeColor, state.themeMode === "dark");
  syncThemeSwitch();
}

function syncThemeSwitch() {
  dom.themeSwitch?.querySelectorAll("[data-theme-mode]").forEach((button) => {
    const isActive = button.getAttribute("data-theme-mode") === state.themeMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
  if (dom.themeColorPicker) {
    dom.themeColorPicker.value = state.themeColor;
  }
  if (dom.themeRgbInput) {
    dom.themeRgbInput.value = formatRgbString(state.themeColor);
  }
}

function applyThemeColorInput() {
  const parsedColor = parseThemeColorInput(dom.themeRgbInput?.value || "");
  if (!parsedColor) {
    if (dom.themeRgbInput) {
      dom.themeRgbInput.value = formatRgbString(state.themeColor);
    }
    return;
  }
  setThemePreference({ color: parsedColor });
}

function normalizeThemeColor(value) {
  const text = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : DEFAULT_THEME_COLOR;
}

function parseThemeColorInput(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  if (/^#[0-9a-f]{6}$/i.test(text)) {
    return text.toLowerCase();
  }
  const rgbMatch = text.match(/^rgb\s*\(\s*(\d{1,3})\s*[,，]\s*(\d{1,3})\s*[,，]\s*(\d{1,3})\s*\)$/i)
    || text.match(/^(\d{1,3})\s*[,，]\s*(\d{1,3})\s*[,，]\s*(\d{1,3})$/);
  if (!rgbMatch) {
    return null;
  }
  const rgb = {
    r: clampColorChannel(Number(rgbMatch[1])),
    g: clampColorChannel(Number(rgbMatch[2])),
    b: clampColorChannel(Number(rgbMatch[3])),
  };
  return rgbToHex(rgb);
}

function applyThemeColorVariables(hexColor, isDarkMode) {
  const rootStyle = document.documentElement.style;
  const rgb = hexToRgb(hexColor);
  const lighter = mixRgb(rgb, { r: 255, g: 255, b: 255 }, 0.28);
  const lighterStrong = mixRgb(rgb, { r: 255, g: 255, b: 255 }, 0.62);
  const darker = mixRgb(rgb, { r: 0, g: 0, b: 0 }, isDarkMode ? 0.18 : 0.24);
  const darkerStrong = mixRgb(rgb, { r: 0, g: 0, b: 0 }, isDarkMode ? 0.34 : 0.42);
  const heroStart = mixRgb(rgb, { r: 18, g: 14, b: 12 }, isDarkMode ? 0.62 : 0.48);
  const heroEnd = mixRgb(rgb, { r: 255, g: 255, b: 255 }, isDarkMode ? 0.10 : 0.16);

  rootStyle.setProperty("--accent", rgbToCss(rgb));
  rootStyle.setProperty("--accent-strong", rgbToCss(isDarkMode ? lighter : darkerStrong));
  rootStyle.setProperty("--accent-faint", rgbaToCss(rgb, isDarkMode ? 0.18 : 0.12));
  rootStyle.setProperty("--focus-ring", rgbaToCss(rgb, isDarkMode ? 0.24 : 0.16));
  rootStyle.setProperty("--row-hover-bg", rgbaToCss(rgb, isDarkMode ? 0.14 : 0.08));
  rootStyle.setProperty("--bg-glow-1", rgbaToCss(lighterStrong, isDarkMode ? 0.18 : 0.76));
  rootStyle.setProperty("--bg-glow-2", rgbaToCss(rgb, isDarkMode ? 0.08 : 0.16));
  rootStyle.setProperty("--hero-bg-1", rgbaToCss(heroStart, isDarkMode ? 0.96 : 0.95));
  rootStyle.setProperty("--hero-bg-2", rgbaToCss(heroEnd, isDarkMode ? 0.92 : 0.90));
  rootStyle.setProperty("--hero-glow-1", rgbaToCss(lighter, isDarkMode ? 0.20 : 0.26));
  rootStyle.setProperty("--hero-highlight", rgbToCss(lighterStrong));
  rootStyle.setProperty("--card-glow", rgbaToCss(lighterStrong, isDarkMode ? 0.18 : 0.56));
  rootStyle.setProperty("--theme-switch-active-bg", `linear-gradient(135deg, ${rgbToCss(lighter)}, ${rgbToCss(darker)})`);
  rootStyle.setProperty("--icon-chip-bg", `linear-gradient(135deg, ${rgbToCss(lighterStrong)}, ${rgbToCss(lighter)})`);
}

function formatRgbString(hexColor) {
  const rgb = hexToRgb(hexColor);
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

function hexToRgb(hexColor) {
  const normalized = normalizeThemeColor(hexColor).slice(1);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex(rgb) {
  return `#${[rgb.r, rgb.g, rgb.b].map((value) => clampColorChannel(value).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToCss(rgb) {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

function rgbaToCss(rgb, alpha) {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function mixRgb(source, target, weight) {
  return {
    r: clampColorChannel(Math.round(source.r + ((target.r - source.r) * weight))),
    g: clampColorChannel(Math.round(source.g + ((target.g - source.g) * weight))),
    b: clampColorChannel(Math.round(source.b + ((target.b - source.b) * weight))),
  };
}

function clampColorChannel(value) {
  return Math.min(255, Math.max(0, Number.isFinite(value) ? value : 0));
}

function renderSearchHistory() {
  if (!dom.searchHistory) {
    return;
  }

  const history = loadSearchHistory();
  if (!history.length) {
    dom.searchHistory.innerHTML = "";
    return;
  }

  dom.searchHistory.innerHTML = `
    <div class="search-history__header">
      <span class="search-history__title">历史搜索</span>
      <button type="button" class="search-history__clear" id="clear-search-history">清空</button>
    </div>
    <div class="search-history__list">
      ${history.map((item) => `
        <button type="button" class="search-history__chip" data-search="${escapeHtml(item)}">${escapeHtml(item)}</button>
      `).join("")}
    </div>
  `;

  dom.searchHistory.querySelectorAll(".search-history__chip").forEach((button) => {
    button.addEventListener("click", async () => {
      const value = button.getAttribute("data-search") || "";
      dom.searchInput.value = value;
      await performSearch(value);
    });
  });

  dom.searchHistory.querySelector("#clear-search-history")?.addEventListener("click", () => {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
    renderSearchHistory();
  });
}

function loadSearchHistory() {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function saveSearchHistory(keyword) {
  const value = String(keyword || "").trim();
  if (!value) {
    return;
  }

  const current = loadSearchHistory().filter((item) => item !== value);
  current.unshift(value);
  const next = current.slice(0, SEARCH_HISTORY_LIMIT);
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
  renderSearchHistory();
}

function setLoadingState(keyword) {
  const markup = `<div class="loading">正在载入“${escapeHtml(keyword)}”的百科详情</div>`;
  dom.itemOverview.innerHTML = wrapCard("当前页面", "正在加载", markup);
  dom.marketOverview.innerHTML = wrapCard("详情面板", "正在加载", markup);
  dom.obtainPanel.innerHTML = wrapCard("获取方式", "正在加载", markup);
  dom.craftPanel.innerHTML = wrapCard("制作配方", "正在加载", markup);
  dom.usagePanel.innerHTML = wrapCard("用途", "正在加载", markup);
  dom.priceTableBody.innerHTML = `<tr><td colspan="7" class="table-empty"><span class="loading">正在载入详情</span></td></tr>`;
}

function renderNoSearchResult(keyword) {
  const hostHint = window.chrome?.webview?.postMessage
    ? "已启用桌面桥接，可继续走 Wiki 兜底。"
    : "当前未检测到桌面桥接，Wiki 兜底不会生效。";
  const markup = `<div class="notice notice--warn">没有找到“${escapeHtml(keyword)}”。可以尝试中文全称、英文名、日文名；任务目前建议用“任务:66358”这种格式直接打开。<br>${escapeHtml(hostHint)}</div>`;
  dom.itemOverview.innerHTML = wrapCard("搜索结果", "未找到内容", markup);
  dom.marketOverview.innerHTML = wrapCard("详情面板", "暂无数据", markup);
  dom.obtainPanel.innerHTML = wrapCard("获取方式", "暂无数据", markup);
  dom.craftPanel.innerHTML = wrapCard("制作配方", "暂无数据", markup);
  dom.usagePanel.innerHTML = wrapCard("用途", "暂无数据", markup);
  dom.priceTableBody.innerHTML = `<tr><td colspan="7" class="table-empty">暂无数据</td></tr>`;
}

function renderQuestSearchNotFound(keyword) {
  const markup = `<div class="notice notice--warn">没有找到任务“${escapeHtml(keyword)}”。当前公开数据源对中文任务名检索支持很弱。建议直接输入“任务:66358”这种任务 ID 格式，或者先通过物品关联任务进入任务详情。</div>`;
  dom.itemOverview.innerHTML = wrapCard("任务搜索", "未找到任务", markup);
  dom.marketOverview.innerHTML = wrapCard("任务搜索", "暂无任务结果", markup);
  dom.obtainPanel.innerHTML = wrapCard("任务搜索", "暂无任务结果", markup);
  dom.craftPanel.innerHTML = wrapCard("任务搜索", "暂无任务结果", markup);
  dom.usagePanel.innerHTML = wrapCard("任务搜索", "暂无任务结果", markup);
  dom.priceTableBody.innerHTML = `<tr><td colspan="7" class="table-empty">未找到任务</td></tr>`;
}

function renderLoadError(error) {
  const message = escapeHtml(error?.message || String(error));
  const markup = `<div class="notice notice--warn">读取数据失败：${message}</div>`;
  dom.itemOverview.innerHTML = wrapCard("当前页面", "加载失败", markup);
  dom.marketOverview.innerHTML = wrapCard("详情面板", "加载失败", markup);
  dom.obtainPanel.innerHTML = wrapCard("获取方式", "加载失败", markup);
  dom.craftPanel.innerHTML = wrapCard("制作配方", "加载失败", markup);
  dom.usagePanel.innerHTML = wrapCard("用途", "加载失败", markup);
}

async function loadItemPage(itemId, { replace = false } = {}) {
  setBootStatus(`正在载入物品 #${itemId}`);
  const item = await getItem(itemId);
  updateRoute("item", item.ID, item.Name, replace);
  state.currentEntity = { type: "item", data: item };
  state.currentWorldRows = [];
  state.currentCraftRecipes = new Map();
  dom.searchInput.value = getPreferredItemName(item);
  renderItemOverview(item);
  renderMarketOverview(item, []);
  renderPriceTable();

  const links = item.GameContentLinks || {};
  const craftRecipeIds = uniqueNumbers(flattenLinkValues(links.Recipe?.ItemResult));
  const usageRecipeIds = uniqueNumbers(flattenLinkObject(links.Recipe, /^ItemIngredient/));
  const gatheringItemIds = uniqueNumbers(flattenLinkValues(links.GatheringItem?.Item));
  const gilShopIds = getGilShopIds(item);

  const limitedUsageRecipeIds = usageRecipeIds.slice(0, FETCH_LIMITS.usageRecipes);
  const craftIds = craftRecipeIds.slice(0, FETCH_LIMITS.craftRecipes);
  const gatherIds = gatheringItemIds.slice(0, FETCH_LIMITS.gatherItems);
  const aliasMeta = state.resolvedAliases.get(itemId) || null;
  const shouldSkipRelatedQuestSearch = !!aliasMeta?.fast || !Object.keys(links || {}).length;

  const [marketRows, craftRecipes, usageRecipes, gatherData, relatedQuests, shopSources] = await Promise.all([
    getMarketRows(itemId),
    Promise.all(craftIds.map((id) => getRecipe(id))),
    Promise.all(limitedUsageRecipeIds.map((id) => getRecipe(id))),
    Promise.all(gatherIds.map((id) => getGatheringEntry(id))),
    shouldSkipRelatedQuestSearch
      ? Promise.resolve([])
      : searchQuests(item.Name || item.Name_en || "").catch(() => []),
    getShopSources(item, gilShopIds).catch((error) => {
      console.error("读取 NPC 商店来源失败", error);
      return [];
    }),
  ]);

  const directCraftRecipes = craftRecipes
    .filter(Boolean)
    .filter((recipe) => Number(recipe.ItemResultTargetID) === item.ID);
  const indirectCraftRecipes = craftRecipes
    .filter(Boolean)
    .filter((recipe) => Number(recipe.ItemResultTargetID) !== item.ID);

  state.currentWorldRows = marketRows;
  renderMarketOverview(item, marketRows);
  renderPriceTable();
  renderObtainPanel(
    item,
    gatherData.filter(Boolean),
    relatedQuests.slice(0, FETCH_LIMITS.relatedQuests),
    usageRecipes.filter(Boolean),
    usageRecipeIds.length,
    directCraftRecipes.length,
    indirectCraftRecipes,
    shopSources
  );
  renderCraftPanel(directCraftRecipes, craftRecipeIds.length, indirectCraftRecipes);
  renderUsagePanel(usageRecipes.filter(Boolean), usageRecipeIds.length, item.ID);
  setBootStatus(`已载入：${getPreferredItemName(item) || `#${item.ID}`}`);
}

async function loadQuestPage(questId, { replace = false } = {}) {
  setBootStatus(`正在载入任务 #${questId}`);
  const quest = await getQuest(questId);
  const questChain = await getQuestChainData(quest);
  updateRoute("quest", quest.ID, quest.Name, replace);
  state.currentEntity = { type: "quest", data: quest };
  state.currentWorldRows = [];
  dom.searchInput.value = quest.Name || quest.Name_en || "";

  renderQuestOverview(quest);
  renderQuestPanels(quest, questChain);
  dom.priceTableBody.innerHTML = `<tr><td colspan="7" class="table-empty">任务页不显示市场板价格</td></tr>`;
  setBootStatus(`已载入任务：${quest.Name || quest.Name_en || `#${quest.ID}`}`);
}

async function getItem(itemId) {
  if (!state.caches.item.has(itemId)) {
    state.caches.item.set(itemId, fetchItemWithFallback(itemId));
  }
  return state.caches.item.get(itemId);
}

async function fetchItemWithFallback(itemId) {
  const aliasMeta = state.resolvedAliases.get(itemId) || state.itemMappingById?.get(itemId) || null;
  const columns = encodeURIComponent([
    "ID",
    "Name",
    "Name_en",
    "Name_ja",
    "Description",
    "Icon",
    "ItemUICategory.Name",
    "LevelItem",
    "PriceLow",
    "PriceMid",
    "CanBeHq",
    "IsUntradable",
    "GamePatch.Name",
    "Patch",
    "GameContentLinks",
  ].join(","));
  const url = `${ENCYCLOPEDIA_API}/item/${itemId}?language=chs&columns=${columns}`;
  if (aliasMeta?.fast) {
    const [primary, xivapi] = await Promise.all([
      fetchJson(url).catch(() => null),
      fetchXivApiItem(itemId).catch(() => null),
    ]);
    return applyAliasMetaToItem(mergeItemPayload(primary, xivapi, itemId), aliasMeta, itemId);
  }

  const primary = await fetchJson(url).catch(() => null);
  if (!needsXivApiSupplement(primary, aliasMeta)) {
    return applyAliasMetaToItem(primary, aliasMeta, itemId);
  }

  const xivapi = await fetchXivApiItem(itemId).catch(() => null);
  return applyAliasMetaToItem(mergeItemPayload(primary, xivapi, itemId), aliasMeta, itemId);
}

function needsXivApiSupplement(item, aliasMeta) {
  if (!item) {
    return true;
  }
  if (!item.Name && !item.Name_en && aliasMeta) {
    return true;
  }
  if (!item.Icon) {
    return true;
  }
  return false;
}

async function fetchXivApiItem(itemId) {
  const url = `https://v2.xivapi.com/api/sheet/Item/${itemId}?fields=Name,Description,Icon,ItemUICategory.Name,LevelItem,CanBeHq,IsUntradable,Patch`;
  const payload = await fetchJson(url);
  const fields = payload?.fields || {};
  return {
    ID: itemId,
    Name: fields.Name || "",
    Name_en: fields.Name || "",
    Name_ja: "",
    Description: fields.Description || "",
    Icon: xivApiIconPathToUrl(fields.Icon?.path),
    ItemUICategory: {
      Name: fields.ItemUICategory?.fields?.Name || "未分类",
    },
    LevelItem: fields.LevelItem?.row_id || fields.LevelItem || 0,
    PriceLow: 0,
    PriceMid: 0,
    CanBeHq: !!fields.CanBeHq,
    IsUntradable: !!fields.IsUntradable,
    GamePatch: {
      Name: fields.Patch ? `Patch ${fields.Patch}` : "未知版本",
    },
    Patch: fields.Patch || 0,
    GameContentLinks: {},
  };
}

function mergeItemPayload(primary, fallback, itemId) {
  const source = primary || {};
  const backup = fallback || {};
  return {
    ID: source.ID || backup.ID || itemId,
    Name: source.Name || backup.Name || "",
    Name_en: source.Name_en || backup.Name_en || backup.Name || "",
    Name_ja: source.Name_ja || backup.Name_ja || "",
    Description: source.Description || backup.Description || "",
    Icon: source.Icon || backup.Icon || "",
    ItemUICategory: source.ItemUICategory?.Name
      ? source.ItemUICategory
      : (backup.ItemUICategory || { Name: "未分类" }),
    LevelItem: source.LevelItem || backup.LevelItem || 0,
    PriceLow: source.PriceLow || backup.PriceLow || 0,
    PriceMid: source.PriceMid || backup.PriceMid || 0,
    CanBeHq: source.CanBeHq ?? backup.CanBeHq ?? false,
    IsUntradable: source.IsUntradable ?? backup.IsUntradable ?? false,
    GamePatch: source.GamePatch?.Name ? source.GamePatch : (backup.GamePatch || { Name: "未知版本" }),
    Patch: source.Patch || backup.Patch || 0,
    GameContentLinks: source.GameContentLinks || backup.GameContentLinks || {},
  };
}

function applyAliasMetaToItem(item, aliasMeta, itemId) {
  const base = item || {
    ID: itemId,
    Name: "",
    Name_en: "",
    Name_ja: "",
    Description: "",
    Icon: "",
    ItemUICategory: { Name: "别名/Wiki/Universalis 兜底解析" },
    LevelItem: 0,
    PriceLow: 0,
    PriceMid: 0,
    CanBeHq: false,
    IsUntradable: false,
    GamePatch: { Name: "未知版本" },
    Patch: 0,
    GameContentLinks: {},
  };
  if (!aliasMeta) {
    return base;
  }

  const aliasName = getAliasDisplayName(aliasMeta);
  const aliasEnglishName = getAliasEnglishName(aliasMeta);
  const aliasDescription = getAliasDescription(aliasMeta);

  return {
    ...base,
    Name: aliasName || base.Name || base.Name_en || `物品 #${itemId}`,
    Name_en: base.Name_en || aliasEnglishName || base.Name || "",
    Description: aliasDescription || base.Description || "",
    Icon: base.Icon || aliasMeta.icon || "",
    ItemUICategory: base.ItemUICategory?.Name
      ? base.ItemUICategory
      : { Name: "别名/Wiki/Universalis 兜底解析" },
  };
}

async function getQuest(questId) {
  if (!state.caches.quest.has(questId)) {
    const columns = encodeURIComponent(questColumns.join(","));
    const url = `${ENCYCLOPEDIA_API}/quest/${questId}?language=chs&columns=${columns}`;
    state.caches.quest.set(questId, fetchJson(url));
  }
  return state.caches.quest.get(questId);
}

async function getRecipe(recipeId) {
  if (!state.caches.recipe.has(recipeId)) {
    const columns = encodeURIComponent(recipeColumns.join(","));
    const url = `${ENCYCLOPEDIA_API}/recipe/${recipeId}?language=chs&columns=${columns}`;
    state.caches.recipe.set(recipeId, fetchJson(url).catch(() => null));
  }
  return state.caches.recipe.get(recipeId);
}

async function getGatheringEntry(gatheringItemId) {
  if (!state.caches.gatherItem.has(gatheringItemId)) {
    const url = `${ENCYCLOPEDIA_API}/gatheringitem/${gatheringItemId}?language=chs`;
    state.caches.gatherItem.set(gatheringItemId, fetchJson(url).catch(() => null));
  }

  const entry = await state.caches.gatherItem.get(gatheringItemId);
  if (!entry) {
    return null;
  }

  const baseIds = uniqueNumbers(flattenLinkObject(entry.GameContentLinks?.GatheringPointBase, /^Item/)).slice(0, FETCH_LIMITS.gatherItems);
  const bases = await Promise.all(baseIds.map((id) => getGatheringBase(id)));
  return { entry, bases: bases.filter(Boolean) };
}

async function getGatheringBase(baseId) {
  if (!state.caches.gatherBase.has(baseId)) {
    const url = `${ENCYCLOPEDIA_API}/gatheringpointbase/${baseId}?language=chs`;
    state.caches.gatherBase.set(baseId, fetchJson(url).catch(() => null));
  }

  const base = await state.caches.gatherBase.get(baseId);
  if (!base) {
    return null;
  }

  const pointIds = uniqueNumbers(flattenLinkValues(base.GameContentLinks?.GatheringPoint?.GatheringPointBase)).slice(0, 24);
  const points = await Promise.all(pointIds.map((id) => getGatheringPoint(id)));
  return { ...base, points: points.filter(Boolean) };
}

async function getGatheringPoint(pointId) {
  if (!state.caches.gatherPoint.has(pointId)) {
    const url = `${ENCYCLOPEDIA_API}/gatheringpoint/${pointId}?language=chs`;
    state.caches.gatherPoint.set(pointId, fetchJson(url).catch(() => null));
  }
  return state.caches.gatherPoint.get(pointId);
}

async function getMarketRows(itemId) {
  if (state.caches.market.has(itemId)) {
    return state.caches.market.get(itemId);
  }

  const promise = Promise.all(
    state.dataCenters.map(async (dataCenter) => {
      const url = `${MARKET_API}/${encodeURIComponent(dataCenter.name)}/${itemId}`;
      try {
        const payload = await fetchJson(url);
        return buildWorldRowsFromPayload(dataCenter, payload);
      } catch (error) {
        console.error(`读取 ${dataCenter.name} 市场数据失败`, error);
        return dataCenter.worlds.map((worldId) => buildEmptyWorldRow(dataCenter, worldId));
      }
    })
  ).then((groups) =>
    groups.flat().sort((left, right) => {
      const leftMissing = left.minPrice == null ? 1 : 0;
      const rightMissing = right.minPrice == null ? 1 : 0;
      if (leftMissing !== rightMissing) {
        return leftMissing - rightMissing;
      }
      if (left.minPrice !== right.minPrice) {
        return (left.minPrice || Number.MAX_SAFE_INTEGER) - (right.minPrice || Number.MAX_SAFE_INTEGER);
      }
      return left.worldName.localeCompare(right.worldName, "zh-CN");
    })
  );

  state.caches.market.set(itemId, promise);
  return promise;
}

function buildWorldRowsFromPayload(dataCenter, payload) {
  const listings = Array.isArray(payload.listings) ? payload.listings : [];
  const uploadTimes = payload.worldUploadTimes || {};
  const grouped = new Map();

  for (const listing of listings) {
    const worldId = Number(listing.worldID);
    const listingId = listing.listingID || `${worldId}-${listing.pricePerUnit}-${listing.quantity}`;
    if (!grouped.has(worldId)) {
      grouped.set(worldId, {
        listingIds: new Set(),
        minPrice: null,
        listingCount: 0,
        unitsForSale: 0,
      });
    }

    const record = grouped.get(worldId);
    if (record.listingIds.has(listingId)) {
      continue;
    }

    record.listingIds.add(listingId);
    record.listingCount += 1;
    record.unitsForSale += Number(listing.quantity || 0);
    if (record.minPrice == null || Number(listing.pricePerUnit) < record.minPrice) {
      record.minPrice = Number(listing.pricePerUnit);
    }
  }

  return dataCenter.worlds.map((worldId) => {
    const world = state.worldMap.get(worldId);
    const record = grouped.get(worldId);
    return {
      worldId,
      worldName: world?.name || `#${worldId}`,
      region: world?.region || dataCenter.region,
      marketRegion: dataCenter.name,
      dataCenter: dataCenter.name,
      minPrice: record?.minPrice ?? null,
      listingCount: record?.listingCount ?? 0,
      unitsForSale: record?.unitsForSale ?? 0,
      lastUploadTime: Number(uploadTimes[worldId] || 0) || null,
    };
  });
}

function buildEmptyWorldRow(dataCenter, worldId) {
  const world = state.worldMap.get(worldId);
  return {
    worldId,
    worldName: world?.name || `#${worldId}`,
    region: world?.region || dataCenter.region,
    marketRegion: dataCenter.name,
    dataCenter: dataCenter.name,
    minPrice: null,
    listingCount: 0,
    unitsForSale: 0,
    lastUploadTime: null,
  };
}

function renderItemOverview(item) {
  const itemName = getPreferredItemName(item) || `#${item.ID}`;
  const patch = item.GamePatch?.Name || (item.Patch ? `Patch ${item.Patch}` : "未知版本");
  const tags = [
    item.ItemUICategory?.Name ? `<span class="tag">${escapeHtml(item.ItemUICategory.Name)}</span>` : "",
    `<span class="tag">物品等级 ${item.LevelItem || 0}</span>`,
    `<span class="tag">${item.CanBeHq ? "可 HQ" : "普通品质"}</span>`,
    `<span class="tag">${item.IsUntradable ? "不可交易" : "可交易"}</span>`,
    `<span class="tag">${escapeHtml(patch)}</span>`,
  ].filter(Boolean).join("");

  const markup = `
    <div class="overview">
      <div class="overview__icon">
        <img src="${toIconUrl(item.Icon)}" alt="${escapeHtml(itemName)}">
      </div>
      <div class="overview__meta">
        <div class="overview__title">
          <h3>${escapeHtml(itemName)}</h3>
          <span class="overview__subtitle">${escapeHtml(item.Name_en || "无英文名")} / ${escapeHtml(item.Name_ja || "无日文名")}</span>
        </div>
        <div class="tag-row">${tags}</div>
        <p class="overview__description">${escapeHtml(item.Description || "暂无物品描述。")}</p>
        <div class="link-row">
          <a class="link-button" href="?type=item&id=${encodeURIComponent(item.ID)}&name=${encodeURIComponent(itemName)}">当前物品详情</a>
          ${renderExternalButton(`https://universalis.app/market/${item.ID}`, "打开市场板")}
          ${renderWikiOpenButton(buildWikiArticleUrl(itemName, "物品"))}
        </div>
      </div>
    </div>
  `;

  dom.itemOverview.innerHTML = wrapCard("物品详情", itemName, markup);
}

function renderQuestOverview(quest) {
  const questName = quest.Name || quest.Name_en || `#${quest.ID}`;
  const region = quest.IssuerLocation?.Map?.PlaceNameRegion?.Name || quest.IssuerLocation?.PlaceName?.Name || "未知区域";
  const mapName = quest.IssuerLocation?.Map?.PlaceName?.Name || "未知地图";
  const issuer = quest.IssuerStart?.Name || "未知发布者";
  const location = quest.IssuerLocation?.PlaceName?.Name || "未公开";
  const coordinateText = formatQuestCoordinate(quest.IssuerLocation);
  const tags = [
    `<span class="tag">任务</span>`,
    `<span class="tag">${escapeHtml(quest.JournalGenre?.Name || "任务线")}</span>`,
    `<span class="tag">等级 ${quest.ClassJobLevel0 || 0}</span>`,
  ].join("");

  const markup = `
    <div class="overview">
      <div class="overview__icon">
        <img src="${toIconUrl(quest.Icon)}" alt="${escapeHtml(questName)}">
      </div>
      <div class="overview__meta">
        <div class="overview__title">
          <h3>${escapeHtml(questName)}</h3>
          <span class="overview__subtitle">${escapeHtml(quest.Name_en || "无英文名")} / ${escapeHtml(quest.Name_ja || "无日文名")}</span>
        </div>
        <div class="tag-row">${tags}</div>
        <p class="overview__description">
          发布 NPC：${escapeHtml(issuer)}<br>
          区域：${escapeHtml(region)} / ${escapeHtml(mapName)}${location && location !== "未公开" ? ` / ${escapeHtml(location)}` : ""}<br>
          地图坐标：${escapeHtml(coordinateText)}<br>
          ${quest.Description ? escapeHtml(quest.Description) : "当前接口未提供更多任务描述。"}
        </p>
        <div class="link-row">
          <a class="link-button" href="?type=quest&id=${encodeURIComponent(quest.ID)}&name=${encodeURIComponent(quest.Name || quest.Name_en || "")}">当前任务详情</a>
          ${renderWikiOpenButton(quest.Name || quest.Name_en)}
        </div>
      </div>
    </div>
  `;

  dom.itemOverview.innerHTML = wrapCard("任务详情", questName, markup);
}

function renderQuestPanels(quest, questChain) {
  const region = quest.IssuerLocation?.Map?.PlaceNameRegion?.Name || "未知区域";
  const mapName = quest.IssuerLocation?.Map?.PlaceName?.Name || "未知地图";
  const location = quest.IssuerLocation?.PlaceName?.Name || "未公开";
  const issuer = quest.IssuerStart?.Name || "未知发布者";
  const rewards = collectQuestRewards(quest);
  const fixedRewards = rewards.filter((reward) => reward.kind === "fixed");
  const optionalRewards = rewards.filter((reward) => reward.kind === "optional");

  dom.marketOverview.innerHTML = wrapCard("任务面板", "任务信息", `
    <div class="market-overview-grid">
      <div class="metric-card">
        <div class="metric-card__label">任务等级</div>
        <div class="metric-card__value">${quest.ClassJobLevel0 || 0}</div>
        <div class="metric-card__detail">${escapeHtml(quest.JournalGenre?.Name || "任务")}</div>
      </div>
      <div class="metric-card">
        <div class="metric-card__label">发布 NPC</div>
        <div class="metric-card__value">${escapeHtml(issuer)}</div>
        <div class="metric-card__detail">${escapeHtml(region)} / ${escapeHtml(mapName)} / ${escapeHtml(location)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-card__label">地图坐标</div>
        <div class="metric-card__value">${escapeHtml(formatQuestCoordinate(quest.IssuerLocation))}</div>
        <div class="metric-card__detail">基于任务发布点坐标换算。</div>
      </div>
    </div>
  `);

  dom.obtainPanel.innerHTML = wrapCard("任务链", "前后置任务", `
    <div class="section-stack">
      <div class="source-card">
        <h3 class="source-card__title">前置任务链</h3>
        <div class="source-card__meta">${renderQuestChainList(questChain.previous, "未记录前置任务")}</div>
      </div>
      <div class="source-card">
        <h3 class="source-card__title">后续任务链</h3>
        <div class="source-card__meta">${renderQuestChainList(questChain.next, "未记录后续任务")}</div>
      </div>
    </div>
  `);

  dom.craftPanel.innerHTML = wrapCard("任务奖励", "奖励内容", `
    <div class="section-stack">
      <div class="source-card">
        <h3 class="source-card__title">固定奖励</h3>
        <div class="source-card__meta">${fixedRewards.length ? renderQuestRewardList(fixedRewards) : "无固定道具奖励"}</div>
      </div>
      <div class="source-card">
        <h3 class="source-card__title">可选奖励</h3>
        <div class="source-card__meta">${optionalRewards.length ? renderQuestRewardList(optionalRewards) : "无可选道具奖励"}</div>
      </div>
      <div class="source-card">
        <h3 class="source-card__title">其他奖励</h3>
        <div class="source-card__meta">经验系数 ${quest.ExpFactor || 0} / 金币 ${formatNumber(quest.GilReward || 0)}</div>
      </div>
    </div>
  `);

  dom.usagePanel.innerHTML = wrapCard("任务操作", "可跳转页面", `
    <div class="section-stack">
      <div class="source-card">
        <h3 class="source-card__title">继续搜索相关内容</h3>
        <div class="link-row">
          <a class="link-button" href="?q=${encodeURIComponent(quest.Name || quest.Name_en || "")}">重新搜索同名内容</a>
          ${renderWikiOpenButton(quest.Name || quest.Name_en)}
        </div>
      </div>
    </div>
  `);
}

function renderObtainPanel(item, gatherData, relatedQuests, usageRecipes, usageRecipeCount, craftRecipeCount, indirectCraftRecipes, shopSources = []) {
  const gatherMarkup = gatherData.length
    ? `<div class="scroll-panel"><div class="gather-list">${gatherData.map((entry) => renderGatherCard(entry, item)).join("")}</div></div>`
    : `<div class="notice notice--soft">当前没有发现采集来源，可能是商店、任务、掉落或其他系统产出。</div>`;

  const sourceSummary = summarizeSourceLinks(item.GameContentLinks || {});
  const shopSummary = collectShopSources(item, shopSources);
  const sourceMarkup = sourceSummary.length
    ? `
      <div class="scroll-panel"><div class="source-list">
        ${sourceSummary.map((entry) => `
          <button type="button" class="source-card source-card--interactive" data-wiki-search="${escapeHtml((item.Name || item.Name_en || "") + " " + entry.label)}">
            <h3 class="source-card__title">${escapeHtml(entry.label)}</h3>
            <div class="source-card__meta">已关联 ${formatNumber(entry.count)} 条内容，点击可在软件内打开国服 Wiki 关联页。</div>
          </button>
        `).join("")}
      </div></div>
    `
    : "";

  const shopMarkup = shopSummary.length
    ? `
      <div class="subsection">
        <h3 class="subsection__title">商店 / NPC 来源</h3>
        <div class="scroll-panel"><div class="source-list">
          ${shopSummary.map((entry) => `
            <button type="button" class="source-card source-card--interactive" data-wiki-search="${escapeHtml(entry.query)}">
              <h3 class="source-card__title">${escapeHtml(entry.title)}</h3>
              <div class="source-card__meta">${escapeHtml(entry.description)}</div>
              ${entry.lines?.length ? `
                <div class="ingredient-list">
                  ${entry.lines.map((line) => `
                    <div class="ingredient">
                      <span class="ingredient__name">${escapeHtml(line.label)}</span>
                      <span class="ingredient__amount">${escapeHtml(line.value)}</span>
                    </div>
                  `).join("")}
                </div>
              ` : ""}
            </button>
          `).join("")}
        </div></div>
      </div>
    `
    : "";

  const indirectCraftMarkup = indirectCraftRecipes.length
    ? `
      <div class="subsection">
        <h3 class="subsection__title">相关制作来源</h3>
        <div class="scroll-panel"><div class="source-list">
          ${indirectCraftRecipes.map((recipe) => `
            <button type="button" class="source-card source-card--interactive" data-wiki-search="${escapeHtml(recipe.ItemResult?.Name || recipe.Name || "")}">
              <h3 class="source-card__title">${escapeHtml(recipe.ItemResult?.Name || recipe.Name || `配方 #${recipe.ID}`)}</h3>
              <div class="source-card__meta">这个配方的直接产物不是当前物品，而是包含当前物品的相关成品或容器，所以不再归类为“直接制作”。</div>
            </button>
          `).join("")}
        </div></div>
      </div>
    `
    : "";

  const questMarkup = relatedQuests.length
    ? `
      <div class="subsection">
        <h3 class="subsection__title">相关任务</h3>
        <div class="scroll-panel"><div class="usage-grid">
          ${relatedQuests.map((quest) => renderQuestReferenceCard(quest)).join("")}
        </div></div>
      </div>
    `
    : "";

  const usagePreviewMarkup = usageRecipes.length
    ? `
      <div class="subsection">
        <h3 class="subsection__title">用途配方</h3>
        <div class="scroll-panel"><div class="usage-grid">
          ${usageRecipes.slice(0, FETCH_LIMITS.usageRecipes).map((recipe) => renderUsageCard(recipe, item.ID)).join("")}
        </div></div>
        ${usageRecipeCount > usageRecipes.length ? `<div class="notice notice--soft">当前已稳定加载前 ${usageRecipes.length} 条用途配方。剩余更多关联内容可点击上方卡片在软件内 Wiki 中继续查看。</div>` : ""}
      </div>
    `
    : "";

  const header = `
    <div class="obtain-tags">
      <span class="tag">产出配方 ${craftRecipeCount}</span>
      <span class="tag">用途配方 ${usageRecipeCount}</span>
      <span class="tag">采集条目 ${gatherData.length}</span>
      <span class="tag">商店来源 ${shopSummary.length}</span>
      <span class="tag">相关任务 ${relatedQuests.length}</span>
    </div>
  `;

  dom.obtainPanel.innerHTML = wrapCard("获取方式", "如何获得", `${header}${gatherMarkup}${shopMarkup}${usagePreviewMarkup}${indirectCraftMarkup}${sourceMarkup}${questMarkup}`);
}

function renderCraftPanel(recipes, totalCount, indirectCraftRecipes) {
  state.currentCraftRecipes = new Map();
  if (!recipes.length) {
    const hint = indirectCraftRecipes.length
      ? "已发现相关成品/武具箱配方，但它们的直接产物不是当前物品本体，因此未作为直接制作显示。"
      : "该物品当前没有可直接读取到的产出配方。";
    dom.craftPanel.innerHTML = wrapCard("制作配方", "如何制作", `<div class="notice notice--soft">${hint}</div>`);
    return;
  }

  const header = totalCount > recipes.length
    ? `<div class="notice notice--soft">共发现 ${totalCount} 条产出配方，当前展示前 ${recipes.length} 条。</div>`
    : "";

  for (const recipe of recipes) {
    state.currentCraftRecipes.set(Number(recipe.ID), recipe);
  }
  dom.craftPanel.innerHTML = wrapCard("制作配方", "如何制作", `${header}<div class="recipe-list">${recipes.map((recipe) => renderRecipeCard(recipe)).join("")}</div>`);
}

function renderUsagePanel(recipes, totalCount, currentItemId) {
  if (!recipes.length) {
    dom.usagePanel.innerHTML = wrapCard("用途", "可用于哪些配方", `<div class="notice notice--soft">当前没有读取到该物品作为材料的配方。</div>`);
    return;
  }

  const header = totalCount > recipes.length
    ? `<div class="notice notice--soft">共发现 ${totalCount} 条用途配方。为保证稳定性，当前展示前 ${recipes.length} 条，其余可通过软件内 Wiki 继续查看。</div>`
    : "";

  dom.usagePanel.innerHTML = wrapCard("用途", "可用于哪些配方", `
    ${header}
    <div class="scroll-panel"><div class="usage-grid">
      ${recipes.map((recipe) => renderUsageCard(recipe, currentItemId)).join("")}
    </div></div>
  `);
}

function renderGatherCard(data, item) {
  const entry = data.entry;
  const locationLines = [];

  for (const base of data.bases || []) {
    const points = (base.points || []).map((point) => {
      const zoneName = point.TerritoryType?.PlaceName?.Name || point.TerritoryType?.Map?.PlaceName?.Name || "";
      const placeName = point.PlaceName?.Name || "未知地点";
      return zoneName ? `${zoneName} / ${placeName}` : placeName;
    });
    const uniquePoints = [...new Set(points.filter(Boolean))];
    locationLines.push(`${base.GatheringType?.Name || "采集"} · 采集等级 ${base.GatheringLevel || "-"}${uniquePoints.length ? ` · ${uniquePoints.join("、")}` : ""}`);
  }

  return `
    <button type="button" class="gather-card gather-card--interactive" data-wiki-search="${escapeHtml((item?.Name || entry.Item?.Name || "") + " 采集")}">
      <div class="gather-card__header">
        <div>
          <h3 class="gather-card__name">${escapeHtml(entry.Item?.Name || "采集来源")}</h3>
          <div class="gather-card__meta">
            采集等级 ${entry.GatheringItemLevel?.GatheringItemLevel || "-"}
            ${entry.IsHidden ? " · 隐藏采集" : ""}
            ${entry.PerceptionReq ? ` · 识别力需求 ${entry.PerceptionReq}` : ""}
          </div>
        </div>
      </div>
      <div class="ingredient-list">
        ${(locationLines.length ? locationLines : ["暂无更详细地点"]).map((line) => `
          <div class="ingredient">
            <span class="ingredient__name">${escapeHtml(line)}</span>
          </div>
        `).join("")}
      </div>
    </button>
  `;
}

function renderRecipeCard(recipe) {
  const ingredients = collectRecipeIngredients(recipe);
  const resultName = recipe.ItemResult?.Name || recipe.Name || `配方 #${recipe.ID}`;
  const craftName = recipe.CraftType?.Name || "制作";
  const level = recipe.RecipeLevelTable?.ClassJobLevel || "-";
  const resultLink = renderRouteLink(recipe.ItemResultTargetID, resultName, "item");
  const recipeId = Number(recipe.ID || 0);
  const scopeOptions = getRecipeProfitScopeOptions();
  const defaultScopeValue = getDefaultRecipeProfitScopeValue();

  return `
    <div class="recipe-card">
      <div class="recipe-card__header">
        <div class="recipe-card__title">
          <div class="recipe-card__icon" style="background-image:url('${toIconUrl(recipe.ItemResult?.Icon)}')"></div>
          <div>
            <h3 class="recipe-card__name">${resultLink || escapeHtml(resultName)}</h3>
            <div class="recipe-card__meta">${escapeHtml(craftName)} · 生产等级 ${level} · 产出 ${recipe.AmountResult || 1}</div>
          </div>
        </div>
        <div class="recipe-profit-actions">
          <label class="profit-scope-field">
            <span>区服</span>
            <select data-profit-scope-recipe-id="${recipeId}" aria-label="${escapeHtml(resultName)} 利润计算区服">
              ${scopeOptions.map((entry) => `<option value="${escapeHtml(entry.value)}"${entry.value === defaultScopeValue ? " selected" : ""}>${escapeHtml(entry.label)}</option>`).join("")}
            </select>
          </label>
          <button type="button" class="link-button recipe-profit-button" data-profit-recipe-id="${recipeId}">计算利润</button>
        </div>
      </div>
      <div class="ingredient-list">
        ${ingredients.map((ingredient) => `
          <div class="ingredient">
            <span class="ingredient__name">${renderRouteLink(ingredient.itemId, ingredient.name, "item") || escapeHtml(ingredient.name)}</span>
            <span class="ingredient__amount">x${ingredient.amount}</span>
          </div>
        `).join("")}
      </div>
      <div class="recipe-profit-panel" id="recipe-profit-${recipeId}">
        <div class="notice notice--soft">点击“计算利润”后再读取材料价格并计算成本。</div>
      </div>
    </div>
  `;
}

function renderUsageCard(recipe, currentItemId) {
  const resultName = recipe.ItemResult?.Name || recipe.Name || `配方 #${recipe.ID}`;
  const craftName = recipe.CraftType?.Name || "制作";
  const level = recipe.RecipeLevelTable?.ClassJobLevel || "-";
  const usedAmount = collectRecipeIngredients(recipe)
    .filter((entry) => entry.itemId === currentItemId)
    .reduce((sum, entry) => sum + entry.amount, 0);

  return `
    <div class="usage-result">
      <div class="usage-result__header">
        <div class="usage-result__icon" style="background-image:url('${toIconUrl(recipe.ItemResult?.Icon)}')"></div>
        <div class="usage-result__body">
          <div class="usage-result__name">${renderRouteLink(recipe.ItemResultTargetID, resultName, "item") || escapeHtml(resultName)}</div>
          <div class="usage-result__meta">${escapeHtml(craftName)} · 生产等级 ${level}</div>
          <div class="usage-result__footer">当前物品消耗数量：x${usedAmount || "-"}</div>
        </div>
      </div>
    </div>
  `;
}

function getCalculationApi() {
  if (window.FF14MarketCalculations) {
    return window.FF14MarketCalculations;
  }
  if (!window.__FF14InlineMarketCalculations) {
    window.__FF14InlineMarketCalculations = createInlineMarketCalculations();
  }
  return window.__FF14InlineMarketCalculations;
}

function createInlineMarketCalculations() {
  const qualityKeys = ["nq", "hq"];
  const metricValue = (row, metric) => {
    if (metric === "quantity") return row.saleQuantity;
    if (metric === "price") return row.currentPrice;
    return row.salesAmount;
  };
  const hasMetric = (row, metric) => {
    const value = Number(metricValue(row, metric));
    return Number.isFinite(value) && value > 0;
  };
  const sortRowsByMetric = (rows, metric) => [...rows].sort((left, right) => {
    const leftMissing = hasMetric(left, metric) ? 0 : 1;
    const rightMissing = hasMetric(right, metric) ? 0 : 1;
    if (leftMissing !== rightMissing) return leftMissing - rightMissing;
    const diff = Number(metricValue(right, metric) || 0) - Number(metricValue(left, metric) || 0);
    if (diff !== 0) return diff;
    const quantityDiff = Number(right.saleQuantity || 0) - Number(left.saleQuantity || 0);
    if (quantityDiff !== 0) return quantityDiff;
    const priceDiff = Number(right.currentPrice || 0) - Number(left.currentPrice || 0);
    if (priceDiff !== 0) return priceDiff;
    return String(left.itemName).localeCompare(String(right.itemName), "zh-CN");
  });
  const numberOrNull = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };
  const positiveOrNull = (value) => {
    const numeric = numberOrNull(value);
    return numeric != null && numeric > 0 ? numeric : null;
  };
  const pickScopeMetric = (bucket, scopeLevel) => {
    const metric = bucket?.[scopeLevel];
    return metric && typeof metric === "object" ? metric : null;
  };
  const maxTimestamp = (values) => {
    const timestamps = values.map(numberOrNull).filter((value) => value != null && value > 0);
    return timestamps.length ? Math.max(...timestamps) : null;
  };
  const resolveItemMeta = (itemLookup, itemId) => {
    if (!itemLookup) return null;
    if (typeof itemLookup === "function") return itemLookup(itemId) || null;
    if (itemLookup instanceof Map) return itemLookup.get(itemId) || null;
    return itemLookup[itemId] || itemLookup[String(itemId)] || null;
  };
  const getMetaName = (meta, itemId) => String(meta?.preferredName || meta?.name || meta?.zhName || meta?.ZhName || meta?.enName || meta?.EnName || `Item #${itemId}`);
  const getMetaIcon = (meta) => String(meta?.icon || meta?.iconUrl || meta?.IconUrl || meta?.iconPath || meta?.IconPath || "");
  const readQualitySummary = (result, qualityKey, scopeLevel) => {
    const quality = result?.[qualityKey] || {};
    const minListing = pickScopeMetric(quality.minListing, scopeLevel);
    const averageSalePrice = pickScopeMetric(quality.averageSalePrice, scopeLevel);
    const dailySaleVelocity = pickScopeMetric(quality.dailySaleVelocity, scopeLevel);
    const recentPurchase = pickScopeMetric(quality.recentPurchase, scopeLevel);
    const currentPrice = positiveOrNull(minListing?.price);
    const saleQuantity = positiveOrNull(dailySaleVelocity?.quantity) || 0;
    const avgSalePrice = positiveOrNull(averageSalePrice?.price);
    const recentPrice = positiveOrNull(recentPurchase?.price);
    return {
      quality: qualityKey,
      currentPrice,
      currentPriceWorldId: numberOrNull(minListing?.worldId),
      saleQuantity,
      averageSalePrice: avgSalePrice,
      salesAmount: avgSalePrice != null ? avgSalePrice * saleQuantity : 0,
      recentPrice,
      recentPurchaseWorldId: numberOrNull(recentPurchase?.worldId),
      recentTimestamp: numberOrNull(recentPurchase?.timestamp),
    };
  };
  const combineAggregatedItem = (result, itemLookup, options = {}) => {
    const itemId = Number(result?.itemId || result?.itemID || 0);
    if (!itemId) return null;
    const scopeLevel = options.scopeLevel || "region";
    const qualities = qualityKeys.map((qualityKey) => readQualitySummary(result, qualityKey, scopeLevel));
    const pricedQuality = qualities.filter((entry) => entry.currentPrice != null).sort((left, right) => left.currentPrice - right.currentPrice)[0] || null;
    const recentQuality = qualities.filter((entry) => entry.recentTimestamp != null).sort((left, right) => right.recentTimestamp - left.recentTimestamp)[0] || null;
    const saleQuantity = qualities.reduce((sum, entry) => sum + entry.saleQuantity, 0);
    const salesAmount = qualities.reduce((sum, entry) => sum + entry.salesAmount, 0);
    const uploadTimes = Array.isArray(result?.worldUploadTimes) ? result.worldUploadTimes : [];
    const scopedUploadTimes = options.scopeWorldId ? uploadTimes.filter((entry) => Number(entry.worldId) === Number(options.scopeWorldId)) : uploadTimes;
    const meta = resolveItemMeta(itemLookup, itemId);
    const worldId = pricedQuality?.currentPriceWorldId || recentQuality?.recentPurchaseWorldId || options.scopeWorldId || null;
    return {
      itemId,
      itemName: getMetaName(meta, itemId),
      icon: getMetaIcon(meta),
      currentPrice: pricedQuality?.currentPrice ?? null,
      currentPriceWorldId: pricedQuality?.currentPriceWorldId ?? null,
      saleQuantity,
      averageSalePrice: saleQuantity > 0 && salesAmount > 0 ? salesAmount / saleQuantity : null,
      salesAmount,
      recentPrice: recentQuality?.recentPrice ?? null,
      recentPurchaseWorldId: recentQuality?.recentPurchaseWorldId ?? null,
      scopeType: options.scopeType || scopeLevel,
      scopeName: options.scopeName || "",
      worldId,
      worldName: typeof options.worldNameResolver === "function" ? String(options.worldNameResolver(worldId) || "") : "",
      updatedAt: maxTimestamp([maxTimestamp(scopedUploadTimes.map((entry) => entry.timestamp)), recentQuality?.recentTimestamp]),
      qualities,
    };
  };
  const buildSalesRanking = (aggregatedResults, itemLookup, options = {}) => {
    const limit = Math.max(1, Number(options.limit || 30));
    const rows = (Array.isArray(aggregatedResults) ? aggregatedResults : [])
      .map((result) => combineAggregatedItem(result, itemLookup, options))
      .filter(Boolean)
      .filter((row) => hasMetric(row, "revenue") || hasMetric(row, "quantity") || hasMetric(row, "price"));
    const byRevenue = sortRowsByMetric(rows.filter((row) => hasMetric(row, "revenue")), "revenue").slice(0, limit);
    const byQuantity = sortRowsByMetric(rows.filter((row) => hasMetric(row, "quantity")), "quantity").slice(0, limit);
    const byPrice = sortRowsByMetric(rows.filter((row) => hasMetric(row, "price")), "price").slice(0, limit);
    return {
      rows,
      byRevenue,
      byQuantity,
      byPrice,
      topSoldItem: byQuantity[0] || null,
      highestPriceItem: byPrice[0] || null,
      limit,
      scopeName: options.scopeName || "",
      scopeType: options.scopeType || options.scopeLevel || "",
      generatedAt: options.generatedAt || Date.now(),
    };
  };
  const calculateRecipeProfit = (input = {}) => {
    const ingredients = Array.isArray(input.ingredients) ? input.ingredients : [];
    const amountResult = Math.max(1, Number(input.amountResult ?? input.recipe?.AmountResult ?? 1) || 1);
    const taxRateRaw = Number(input.taxRate ?? 0.05);
    const taxRate = Number.isFinite(taxRateRaw) && taxRateRaw >= 0 ? taxRateRaw : 0.05;
    const ingredientLines = ingredients.map((ingredient) => {
      const amount = Math.max(0, Number(ingredient.amount || 0));
      const unitPrice = positiveOrNull(ingredient.unitPrice);
      return {
        ...ingredient,
        amount,
        unitPrice,
        hasPrice: unitPrice != null,
        subtotal: unitPrice != null ? unitPrice * amount : null,
      };
    });
    const missingPriceCount = ingredientLines.filter((entry) => !entry.hasPrice).length;
    const knownCost = ingredientLines.reduce((sum, entry) => sum + (entry.subtotal || 0), 0);
    const totalCost = missingPriceCount ? null : knownCost;
    const resultUnitPrice = positiveOrNull(input.resultUnitPrice);
    const grossRevenue = resultUnitPrice != null ? resultUnitPrice * amountResult : null;
    const estimatedTax = grossRevenue != null ? Math.round(grossRevenue * taxRate) : null;
    const netRevenue = grossRevenue != null ? grossRevenue - estimatedTax : null;
    const netProfit = totalCost != null && netRevenue != null ? netRevenue - totalCost : null;
    return {
      amountResult,
      taxRate,
      ingredientLines,
      missingPriceCount,
      knownCost,
      totalCost,
      resultUnitPrice,
      grossRevenue,
      estimatedTax,
      netRevenue,
      netProfit,
      profitRate: totalCost != null && totalCost > 0 && netProfit != null ? netProfit / totalCost : null,
      canCalculateProfit: missingPriceCount === 0 && resultUnitPrice != null,
    };
  };
  return { buildSalesRanking, calculateRecipeProfit, combineAggregatedItem, sortRowsByMetric };
}

function getSalesRankingScope() {
  const rawValue = dom.salesRankingScope?.value || state.salesRankingScope || "region:中国";
  const [type, ...nameParts] = String(rawValue).split(":");
  const name = nameParts.join(":") || "中国";
  if (type === "world") {
    const world = state.worlds.find((entry) => entry.name === name);
    return {
      type,
      value: rawValue,
      name,
      apiName: name,
      scopeLevel: "world",
      scopeWorldId: Number(world?.id || 0) || null,
    };
  }
  if (type === "dc") {
    return {
      type,
      value: rawValue,
      name,
      apiName: name,
      scopeLevel: "dc",
      scopeWorldId: null,
    };
  }
  return {
    type: "region",
    value: "region:中国",
    name: "中国",
    apiName: "中国",
    scopeLevel: "region",
    scopeWorldId: null,
  };
}

function renderSalesRankingIdle() {
  if (!dom.salesRankingStatus || !dom.salesRankingSummary || !dom.salesRankingTableBody) {
    return;
  }
  const scope = getSalesRankingScope();
  dom.salesRankingStatus.innerHTML = `<div class="notice notice--soft">当前范围：${escapeHtml(scope.name)}。点击“加载排行”后再读取销售排行数据。</div>`;
  dom.salesRankingSummary.innerHTML = "";
  dom.salesRankingTableBody.innerHTML = `<tr><td colspan="7" class="table-empty">点击“加载排行”后显示前 ${SALES_RANKING_LIMIT} 名</td></tr>`;
  state.currentSalesRanking = null;
  renderSalesRankingTabs();
}

function renderSalesRankingLoading(scope, processed, total) {
  const progress = total > 0 ? `（${formatNumber(processed)} / ${formatNumber(total)}）` : "";
  dom.salesRankingStatus.innerHTML = `<div class="loading">正在读取 ${escapeHtml(scope.name)} 销售排行 ${progress}</div>`;
  dom.salesRankingSummary.innerHTML = "";
  dom.salesRankingTableBody.innerHTML = `<tr><td colspan="7" class="table-empty">排行数据加载中</td></tr>`;
}

function renderSalesRankingError(error) {
  const message = escapeHtml(error?.message || String(error || "未知错误"));
  dom.salesRankingStatus.innerHTML = `<div class="notice notice--warn">销售排行读取失败：${message}</div>`;
  dom.salesRankingSummary.innerHTML = "";
  dom.salesRankingTableBody.innerHTML = `<tr><td colspan="7" class="table-empty">接口异常，暂时无法展示排行</td></tr>`;
}

function renderSalesRankingTabs() {
  dom.salesRankingTabs?.querySelectorAll("[data-sales-ranking-mode]").forEach((button) => {
    const isActive = button.getAttribute("data-sales-ranking-mode") === state.salesRankingMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

async function loadSalesRanking() {
  const calc = getCalculationApi();
  if (!calc) {
    renderSalesRankingError(new Error("缺少市场计算模块"));
    return;
  }

  const scope = getSalesRankingScope();
  state.salesRankingScope = scope.value;
  const token = ++state.salesRankingToken;
  dom.salesRankingButton.disabled = true;
  renderSalesRankingLoading(scope, 0, 0);
  const preview = getCachedSalesRanking(scope);
  if (preview) {
    state.currentSalesRanking = preview.ranking;
    renderSalesRankingResult(preview.ranking, { isCachePreview: true, refreshing: true });
  }

  try {
    const ranking = await getSalesRanking(scope, (processed, total) => {
      if (token === state.salesRankingToken && !preview) {
        renderSalesRankingLoading(scope, processed, total);
      }
    }, { forceRefresh: true });
    if (token !== state.salesRankingToken) {
      return;
    }
    state.currentSalesRanking = ranking;
    renderSalesRankingResult(ranking);
  } catch (error) {
    if (token === state.salesRankingToken) {
      console.error("销售排行读取失败", error);
      if (preview) {
        state.currentSalesRanking = preview.ranking;
        renderSalesRankingResult(preview.ranking, { isCachePreview: true, refreshFailed: true, error });
      } else {
        renderSalesRankingError(error);
      }
    }
  } finally {
    if (token === state.salesRankingToken) {
      dom.salesRankingButton.disabled = false;
    }
  }
}

async function getSalesRanking(scope, onProgress, options = {}) {
  const now = Date.now();
  const cacheKey = getSalesRankingCacheKey(scope);
  if (!options.forceRefresh) {
    const cached = getCachedSalesRanking(scope, now);
    if (cached && cached.source === "memory") {
      return cached.ranking;
    }
  }

  const marketableIds = await getMarketableItemIds();
  const mappedMarketableIds = marketableIds.filter((itemId) => state.itemMappingById?.has(itemId));
  const targetIds = mappedMarketableIds.length ? mappedMarketableIds : marketableIds;
  const allResults = [];
  const failedBatches = [];
  const batches = chunkArray(targetIds, SALES_RANKING_BATCH_SIZE);
  let processed = 0;
  onProgress?.(processed, targetIds.length);

  await runWithConcurrency(batches, SALES_RANKING_CONCURRENCY, async (batch) => {
    try {
      const payload = await fetchAggregatedMarket(scope.apiName, batch, {
        timeoutMs: SALES_RANKING_BATCH_TIMEOUT_MS,
      });
      if (Array.isArray(payload.results)) {
        allResults.push(...payload.results);
      }
    } catch (error) {
      console.error("销售排行批次读取失败", error);
      failedBatches.push({ batch, error });
    } finally {
      processed += batch.length;
      onProgress?.(processed, targetIds.length);
    }
  });

  const calc = getCalculationApi();
  const ranking = calc.buildSalesRanking(allResults, (itemId) => state.itemMappingById?.get(Number(itemId)), {
    limit: SALES_RANKING_LIMIT,
    scopeLevel: scope.scopeLevel,
    scopeType: scope.type,
    scopeName: scope.name,
    scopeWorldId: scope.scopeWorldId,
    worldNameResolver: getWorldNameById,
    generatedAt: now,
  });
  ranking.requestedItemCount = targetIds.length;
  ranking.loadedItemCount = allResults.length;
  ranking.failedBatchCount = failedBatches.length;
  ranking.rowCount = ranking.rows.length;
  await hydrateSalesRankingNames(ranking);
  state.caches.salesRanking.set(cacheKey, { loadedAt: now, ranking });
  saveSalesRankingStorageCache(cacheKey, now, ranking);
  return ranking;
}

async function hydrateSalesRankingNames(ranking) {
  const rows = [
    ...(ranking?.byPrice || []),
    ...(ranking?.byQuantity || []),
    ranking?.topSoldItem,
    ranking?.highestPriceItem,
  ].filter(Boolean);
  const missingIds = uniqueNumbers(rows
    .filter((row) => needsRankingNameHydration(row))
    .map((row) => Number(row.itemId || 0))
    .filter((itemId) => itemId > 0))
    .slice(0, SALES_RANKING_LIMIT * 2);

  if (!missingIds.length) {
    return;
  }

  await runWithConcurrency(missingIds, 6, async (itemId) => {
    const item = await getItem(itemId).catch(() => null);
    const name = getPreferredItemName(item);
    if (!name || isFallbackRankingName(name, itemId)) {
      return;
    }
    const aliasMeta = state.resolvedAliases.get(itemId) || state.itemMappingById?.get(itemId) || null;
    state.resolvedAliases.set(itemId, {
      preferredName: name,
      preferredEnglishName: item?.Name_en || aliasMeta?.preferredEnglishName || aliasMeta?.englishName || "",
      preferredDescription: item?.Description || aliasMeta?.preferredDescription || aliasMeta?.description || "",
      icon: item?.Icon || aliasMeta?.icon || "",
      fast: true,
    });
  });
}

function needsRankingNameHydration(row) {
  const itemId = Number(row?.itemId || 0);
  if (!itemId) {
    return false;
  }
  return isFallbackRankingName(row?.itemName, itemId) && !getPreferredItemNameById(itemId, "");
}

function getSalesRankingCacheKey(scope) {
  return `${scope.value}|${state.itemMappingEntries?.length || 0}`;
}

function getCachedSalesRanking(scope, now = Date.now()) {
  const cacheKey = getSalesRankingCacheKey(scope);
  const cached = state.caches.salesRanking.get(cacheKey);
  if (cached && now - cached.loadedAt < SALES_RANKING_CACHE_TTL_MS) {
    return { ...cached, source: "memory" };
  }
  const stored = loadSalesRankingStorageCache(cacheKey, now);
  if (stored) {
    state.caches.salesRanking.set(cacheKey, { loadedAt: stored.loadedAt, ranking: stored.ranking });
    return { ...stored, source: "storage" };
  }
  return null;
}

function loadSalesRankingStorageCache(cacheKey, now = Date.now()) {
  try {
    const raw = localStorage.getItem(SALES_RANKING_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    const entry = parsed?.[cacheKey];
    if (!entry?.ranking || !Number.isFinite(Number(entry.loadedAt))) {
      return null;
    }
    if (now - Number(entry.loadedAt) > SALES_RANKING_STORAGE_TTL_MS) {
      return null;
    }
    return { loadedAt: Number(entry.loadedAt), ranking: entry.ranking };
  } catch {
    return null;
  }
}

function saveSalesRankingStorageCache(cacheKey, loadedAt, ranking) {
  try {
    const raw = localStorage.getItem(SALES_RANKING_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const next = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    next[cacheKey] = { loadedAt, ranking: toCompactSalesRanking(ranking) };
    const entries = Object.entries(next)
      .filter(([, entry]) => loadedAt - Number(entry?.loadedAt || 0) <= SALES_RANKING_STORAGE_TTL_MS)
      .sort((left, right) => Number(right[1]?.loadedAt || 0) - Number(left[1]?.loadedAt || 0))
      .slice(0, 8);
    localStorage.setItem(SALES_RANKING_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // ignore storage failures
  }
}

function toCompactSalesRanking(ranking) {
  return {
    byQuantity: compactRankingRows(ranking?.byQuantity),
    byPrice: compactRankingRows(ranking?.byPrice),
    topSoldItem: compactRankingRow(ranking?.topSoldItem),
    highestPriceItem: compactRankingRow(ranking?.highestPriceItem),
    limit: ranking?.limit || SALES_RANKING_LIMIT,
    scopeName: ranking?.scopeName || "",
    scopeType: ranking?.scopeType || "",
    generatedAt: ranking?.generatedAt || Date.now(),
    requestedItemCount: ranking?.requestedItemCount || 0,
    loadedItemCount: ranking?.loadedItemCount || 0,
    failedBatchCount: ranking?.failedBatchCount || 0,
    rowCount: ranking?.rowCount ?? ranking?.rows?.length ?? 0,
    rows: [],
  };
}

function compactRankingRows(rows) {
  return Array.isArray(rows) ? rows.map(compactRankingRow).filter(Boolean) : [];
}

function compactRankingRow(row) {
  if (!row) {
    return null;
  }
  return {
    itemId: row.itemId,
    itemName: getRankingDisplayName(row),
    icon: getRankingIcon(row),
    currentPrice: row.currentPrice,
    saleQuantity: row.saleQuantity,
    averageSalePrice: row.averageSalePrice,
    salesAmount: row.salesAmount,
    scopeName: row.scopeName,
    worldName: row.worldName,
    updatedAt: row.updatedAt,
  };
}

async function getMarketableItemIds() {
  if (state.caches.marketableItems) {
    return state.caches.marketableItems;
  }
  const promise = fetchJson(`${MARKET_API}/marketable`).then((payload) =>
    (Array.isArray(payload) ? payload : [])
      .map(Number)
      .filter((itemId) => Number.isFinite(itemId) && itemId > 0)
  );
  state.caches.marketableItems = promise;
  return promise;
}

async function fetchAggregatedMarket(scopeName, itemIds, options = {}) {
  const idText = itemIds.map(Number).filter(Boolean).join(",");
  if (!idText) {
    return { results: [], failedItems: [] };
  }
  return fetchJson(`${MARKET_API}/aggregated/${encodeURIComponent(scopeName)}/${encodeURIComponent(idText)}`, {
    timeoutMs: options.timeoutMs,
  });
}

function chunkArray(values, size) {
  const chunkSize = Math.max(1, Number(size) || 1);
  const chunks = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

async function runWithConcurrency(items, concurrency, worker) {
  const limit = Math.max(1, Number(concurrency) || 1);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await worker(item);
    }
  });
  await Promise.all(workers);
}

function renderSalesRankingResult(ranking, options = {}) {
  renderSalesRankingTabs();
  const scopeName = ranking?.scopeName || getSalesRankingScope().name;
  const rowCount = ranking?.rowCount ?? ranking?.rows?.length ?? 0;
  const topSoldItem = ranking?.topSoldItem;
  const highestPriceItem = ranking?.highestPriceItem;
  const topSoldItemName = getRankingDisplayName(topSoldItem);
  const highestPriceItemName = getRankingDisplayName(highestPriceItem);
  const updatedText = formatTime(ranking?.generatedAt);
  const refreshText = options.isCachePreview
    ? (options.refreshFailed
      ? `当前显示 ${updatedText} 的本地缓存，最新刷新失败：${escapeHtml(options.error?.message || String(options.error || "未知错误"))}。`
      : `当前先显示 ${updatedText} 的本地缓存，正在后台刷新最新数据。`)
    : "";
  const loadSummary = options.isCachePreview
    ? refreshText
    : ranking?.failedBatchCount > 0
    ? `已载入 ${formatNumber(ranking.loadedItemCount || rowCount)} 条返回数据，${formatNumber(ranking.failedBatchCount)} 个批次读取失败，当前结果为部分数据。`
    : `已载入 ${formatNumber(ranking.loadedItemCount || rowCount)} 条返回数据。`;
  dom.salesRankingStatus.innerHTML = `<div class="notice notice--soft">已载入 ${escapeHtml(scopeName)} 销售排行，默认展示前 ${ranking?.limit || SALES_RANKING_LIMIT} 名。${loadSummary}</div>`;
  dom.salesRankingSummary.innerHTML = `
    <div class="market-overview-grid ranking-summary-grid">
      <div class="metric-card">
        <div class="metric-card__label">当前服务器卖得最多</div>
        <div class="metric-card__value">${topSoldItem ? escapeHtml(topSoldItemName) : "暂无"}</div>
        <div class="metric-card__detail">${topSoldItem ? `${formatNumber(Math.round(topSoldItem.saleQuantity))} / 日` : "当前范围没有读取到销量数据。"}</div>
      </div>
      <div class="metric-card">
        <div class="metric-card__label">当前服务器价格最高</div>
        <div class="metric-card__value">${highestPriceItem ? escapeHtml(highestPriceItemName) : "暂无"}</div>
        <div class="metric-card__detail">${highestPriceItem ? formatPrice(highestPriceItem.currentPrice) : "当前范围没有读取到上架价格。"}</div>
      </div>
      <div class="metric-card">
        <div class="metric-card__label">参与排行物品</div>
        <div class="metric-card__value">${formatNumber(rowCount)}</div>
        <div class="metric-card__detail">仅统计本地映射表可识别且接口返回销售或价格数据的物品。</div>
      </div>
      <div class="metric-card">
        <div class="metric-card__label">更新时间</div>
        <div class="metric-card__value">${escapeHtml(updatedText)}</div>
        <div class="metric-card__detail">缓存仅作快速预览，点击加载会继续刷新最新数据。</div>
      </div>
    </div>
  `;
  renderSalesRankingTable();
}

function getActiveSalesRankingRows() {
  const ranking = state.currentSalesRanking;
  if (!ranking) {
    return [];
  }
  if (state.salesRankingMode === "quantity") {
    return ranking.byQuantity || [];
  }
  return ranking.byPrice || [];
}

function renderSalesRankingTable() {
  if (!dom.salesRankingTableBody) {
    return;
  }
  const rows = getActiveSalesRankingRows();
  if (!state.currentSalesRanking) {
    renderSalesRankingTabs();
    return;
  }
  if (!rows.length) {
    dom.salesRankingTableBody.innerHTML = `<tr><td colspan="7" class="table-empty">当前范围暂无可排序的销售数据</td></tr>`;
    return;
  }
  dom.salesRankingTableBody.innerHTML = rows.map((row, index) => {
    const displayName = getRankingDisplayName(row);
    const iconUrl = resolveRankingIconUrl(getRankingIcon(row));
    const fallbackIconUrls = getRankingIconFallbackUrls(row, iconUrl);
    const fallbackAttr = fallbackIconUrls.length ? ` data-fallback-srcs="${escapeHtml(JSON.stringify(fallbackIconUrls))}"` : "";
    return `
      <tr>
        <td>${index + 1}</td>
        <td>
          <div class="ranking-item">
            <span class="ranking-item__icon">${iconUrl ? `<img src="${escapeHtml(iconUrl)}"${fallbackAttr} alt="${escapeHtml(displayName)}" loading="eager" decoding="async" referrerpolicy="no-referrer" onerror="handleRankingIconError(this)">` : ""}</span>
            <span>${renderRouteLink(row.itemId, displayName, "item") || escapeHtml(displayName)}</span>
          </div>
        </td>
        <td>${escapeHtml(row.scopeName || getSalesRankingScope().name)}</td>
        <td>${row.currentPrice == null ? "暂无" : formatPrice(row.currentPrice)}</td>
        <td>${formatNumber(Math.round(row.saleQuantity || 0))}</td>
        <td>${row.averageSalePrice == null ? "暂无" : formatPrice(Math.round(row.averageSalePrice))}</td>
        <td>${formatTime(row.updatedAt)}</td>
      </tr>
    `;
  }).join("");
}

function getRankingDisplayName(row) {
  const itemId = Number(row?.itemId || 0);
  const fallback = String(row?.itemName || "").trim();
  if (!itemId) {
    return fallback;
  }
  const preferred = getPreferredItemNameById(itemId, "");
  if (preferred) {
    return preferred;
  }
  return fallback || `Item #${itemId}`;
}

function isFallbackRankingName(name, itemId) {
  const text = String(name || "").trim();
  if (!text) {
    return true;
  }
  const id = Number(itemId || 0);
  if (!id) {
    return false;
  }
  return new RegExp(`^(?:item\\s*#?|#|物品\\s*#?)\\s*${id}$`, "i").test(text);
}

function getRankingIcon(row) {
  const itemId = Number(row?.itemId || 0);
  const aliasMeta = itemId ? (state.resolvedAliases.get(itemId) || state.itemMappingById?.get(itemId) || null) : null;
  return String(aliasMeta?.icon || aliasMeta?.iconUrl || aliasMeta?.IconUrl || aliasMeta?.iconPath || aliasMeta?.IconPath || row?.icon || "");
}

function getRankingIconFallbackUrls(row, primaryUrl) {
  const itemId = Number(row?.itemId || 0);
  const aliasMeta = itemId ? (state.resolvedAliases.get(itemId) || state.itemMappingById?.get(itemId) || null) : null;
  const normalizedPath = [
    aliasMeta?.iconPath,
    aliasMeta?.IconPath,
    row?.iconPath,
    row?.IconPath,
    aliasMeta?.icon,
    aliasMeta?.iconUrl,
    aliasMeta?.IconUrl,
    row?.icon,
  ].map(normalizeIconPath).find(Boolean);
  const primary = String(primaryUrl || "");
  const urls = [];
  const addUrl = (url) => {
    if (url && url !== primary && !urls.includes(url)) {
      urls.push(url);
    }
  };
  if (normalizedPath) {
    addUrl(iconPathToXivApiAssetUrl(normalizedPath));
    addUrl(`https://cafemaker.wakingsands.com/i/${normalizedPath}`);
    addUrl(`https://xivapi.com/i/${normalizedPath}`);
  }
  if (primary.includes("cafemaker.wakingsands.com/i/")) {
    addUrl(primary.replace("https://cafemaker.wakingsands.com/i/", "https://xivapi.com/i/"));
  }
  if (primary.includes("xivapi.com/i/")) {
    addUrl(primary.replace("https://xivapi.com/i/", "https://cafemaker.wakingsands.com/i/"));
  }
  return urls;
}

function resolveRankingIconUrl(iconPath) {
  if (!iconPath) {
    return "";
  }
  const proxyUrl = iconPathToProxyUrl(iconPath);
  if (proxyUrl) {
    return proxyUrl;
  }
  if (/^https?:\/\//i.test(iconPath)) {
    return iconPath;
  }
  return xivApiIconPathToUrl(iconPath);
}

function handleRankingIconError(image) {
  if (!(image instanceof HTMLImageElement)) {
    return;
  }

  let fallbacks = [];
  try {
    const parsed = JSON.parse(image.dataset.fallbackSrcs || "[]");
    if (Array.isArray(parsed)) {
      fallbacks = parsed.map(String).filter(Boolean);
    }
  } catch {
    fallbacks = [];
  }

  const current = image.currentSrc || image.src;
  const nextIndex = fallbacks.findIndex((url) => url && url !== current);
  if (nextIndex >= 0) {
    const nextUrl = fallbacks[nextIndex];
    image.dataset.fallbackSrcs = JSON.stringify(fallbacks.slice(nextIndex + 1));
    image.src = nextUrl;
    return;
  }

  image.classList.add("is-hidden");
}

window.handleRankingIconError = handleRankingIconError;

function getWorldNameById(worldId) {
  const world = state.worldMap.get(Number(worldId));
  return world?.name || (worldId ? `#${worldId}` : "");
}

async function loadRecipeProfit(recipe, selectedScope = null) {
  const recipeId = Number(recipe.ID || 0);
  const panel = document.getElementById(`recipe-profit-${recipeId}`);
  if (!panel) {
    return;
  }

  const ingredients = collectRecipeIngredients(recipe);
  if (!ingredients.length) {
    panel.innerHTML = `<div class="notice notice--soft">当前配方没有可读取的材料数据。</div>`;
    return;
  }

  const scope = selectedScope || getSelectedRecipeProfitScope(recipeId);
  panel.innerHTML = `<div class="loading">正在读取 ${escapeHtml(scope.name)} 材料价格并计算利润</div>`;

  try {
    const pricedIngredients = await Promise.all(ingredients.map(async (ingredient) => ({
      ...ingredient,
      unitPrice: await getLowestMarketPrice(ingredient.itemId, scope),
    })));
    const resultItemId = Number(recipe.ItemResultTargetID || recipe.ItemResult?.ID || 0);
    const resultUnitPrice = resultItemId ? await getLowestMarketPrice(resultItemId, scope) : null;
    const calc = getCalculationApi();
    const calculation = calc.calculateRecipeProfit({
      recipe,
      amountResult: recipe.AmountResult || 1,
      resultUnitPrice,
      taxRate: SALES_RANKING_TAX_RATE,
      ingredients: pricedIngredients,
    });
    panel.innerHTML = renderRecipeProfitResult(recipe, calculation, scope);
  } catch (error) {
    console.error("利润计算失败", error);
    panel.innerHTML = `<div class="notice notice--warn">利润计算失败：${escapeHtml(error?.message || String(error))}</div>`;
  }
}

function getRecipeProfitScopeOptions() {
  return getMarketScopeOptions();
}

function getDefaultRecipeProfitScopeValue() {
  if (state.selectedRegion && state.selectedRegion !== "全部") {
    return `dc:${state.selectedRegion}`;
  }
  const rankingScope = getSalesRankingScope();
  if (rankingScope.type === "world" || rankingScope.type === "dc") {
    return rankingScope.value;
  }
  return "region:中国";
}

function getSelectedRecipeProfitScope(recipeId) {
  const selector = document.querySelector(`[data-profit-scope-recipe-id="${Number(recipeId)}"]`);
  return parseRecipeProfitScope(selector?.value || getDefaultRecipeProfitScopeValue());
}

function parseRecipeProfitScope(rawValue) {
  const [type, ...nameParts] = String(rawValue || "region:中国").split(":");
  const name = nameParts.join(":") || "中国";
  if (type === "world" && name) {
    const world = state.worlds.find((entry) => entry.name === name);
    return {
      type: "world",
      value: `world:${name}`,
      name,
      apiName: name,
      scopeLevel: "world",
      scopeWorldId: Number(world?.id || 0) || null,
    };
  }
  if (type === "dc" && name) {
    return {
      type: "dc",
      value: `dc:${name}`,
      name,
      apiName: name,
      scopeLevel: "dc",
      scopeWorldId: null,
    };
  }
  return {
    type: "region",
    value: "region:中国",
    name: "中国全区",
    apiName: "中国",
    scopeLevel: "region",
    scopeWorldId: null,
  };
}

async function getLowestMarketPrice(itemId, scope) {
  const itemRows = await getMarketRows(itemId);
  const rows = itemRows.filter((row) => {
    if (scope.type === "world") {
      return row.worldName === scope.name;
    }
    if (scope.type === "dc") {
      return getRowMarketRegion(row) === scope.name;
    }
    return true;
  });
  const priced = rows
    .map((row) => row?.qualityStats?.all?.minPrice ?? row?.minPrice ?? null)
    .filter((price) => price != null)
    .sort((left, right) => left - right);
  return priced[0] ?? null;
}

function renderRecipeProfitResult(recipe, calculation, scope) {
  const resultName = recipe.ItemResult?.Name || recipe.Name || `配方 #${recipe.ID}`;
  const profitClass = calculation.netProfit == null ? "" : (calculation.netProfit >= 0 ? "is-profit" : "is-loss");
  const materialMarkup = calculation.ingredientLines.map((line) => `
    <div class="profit-material">
      <span class="profit-material__name">${renderRouteLink(line.itemId, line.name, "item") || escapeHtml(line.name)}</span>
      <span class="profit-material__price">${line.hasPrice ? formatPrice(line.unitPrice) : "暂无价格"}</span>
      <span class="profit-material__amount">x${formatNumber(line.amount)}</span>
      <span class="profit-material__subtotal">${line.subtotal == null ? "不计入" : formatPrice(line.subtotal)}</span>
    </div>
  `).join("");
  const missingHint = calculation.missingPriceCount
    ? `<div class="notice notice--warn">有 ${calculation.missingPriceCount} 种材料暂无价格，因此不展示总成本和净利润，避免误导。</div>`
    : "";
  const resultPriceHint = calculation.resultUnitPrice == null
    ? `<div class="notice notice--warn">成品当前没有读取到售价，暂不能计算预计利润。</div>`
    : "";

  return `
    <div class="recipe-profit-result">
      <div class="profit-material-list">
        <div class="profit-material profit-material--head">
          <span>材料</span>
          <span>当前单价</span>
          <span>数量</span>
          <span>小计</span>
        </div>
        ${materialMarkup}
      </div>
      <div class="profit-summary-grid">
        <div class="metric-card">
          <div class="metric-card__label">成本总价</div>
          <div class="metric-card__value">${calculation.totalCost == null ? "无法计算" : formatPrice(calculation.totalCost)}</div>
          <div class="metric-card__detail">范围：${escapeHtml(scope.name)}，按材料当前最低价估算。</div>
        </div>
        <div class="metric-card">
          <div class="metric-card__label">当前售卖最低价</div>
          <div class="metric-card__value">${calculation.resultUnitPrice == null ? "暂无价格" : formatPrice(calculation.resultUnitPrice)}</div>
          <div class="metric-card__detail">${escapeHtml(resultName)} · 产出 ${calculation.amountResult}</div>
        </div>
        <div class="metric-card">
          <div class="metric-card__label">预计税费</div>
          <div class="metric-card__value">${calculation.estimatedTax == null ? "暂无" : formatPrice(calculation.estimatedTax)}</div>
          <div class="metric-card__detail">按市场常见 ${Math.round(calculation.taxRate * 100)}% 税费估算。</div>
        </div>
        <div class="metric-card ${profitClass}">
          <div class="metric-card__label">预计净利润</div>
          <div class="metric-card__value">${calculation.netProfit == null ? "无法计算" : formatPrice(calculation.netProfit)}</div>
          <div class="metric-card__detail">利润率：${calculation.profitRate == null ? "暂无" : `${(calculation.profitRate * 100).toFixed(1)}%`}</div>
        </div>
      </div>
      ${missingHint}
      ${resultPriceHint}
    </div>
  `;
}

function renderQuestReferenceCard(quest) {
  return `
    <div class="usage-result">
      <div class="usage-result__header">
        <div class="usage-result__icon" style="background-image:url('${toIconUrl(quest.Icon)}')"></div>
        <div class="usage-result__body">
          <div class="usage-result__name">${renderRouteLink(quest.ID, quest.Name, "quest") || escapeHtml(quest.Name)}</div>
          <div class="usage-result__meta">${escapeHtml(quest.JournalGenre?.Name || "任务")} · 等级 ${quest.ClassJobLevel0 || 0}</div>
        </div>
      </div>
    </div>
  `;
}

async function getQuestChainData(quest) {
  const previous = [];
  const next = [];
  const visitedPrevious = new Set([quest.ID]);
  const visitedNext = new Set([quest.ID]);

  await collectPreviousQuestChain(quest, previous, visitedPrevious);
  await collectNextQuestChain(quest, next, visitedNext);

  return {
    previous: previous.reverse(),
    next,
  };
}

async function collectPreviousQuestChain(quest, target, visited) {
  const previousCandidates = [
    { id: quest.PreviousQuest0TargetID, name: quest.PreviousQuest0?.Name },
    { id: quest.PreviousQuest1TargetID, name: quest.PreviousQuest1?.Name },
    { id: quest.PreviousQuest2TargetID, name: quest.PreviousQuest2?.Name },
  ].filter((entry) => entry.id && !visited.has(entry.id));

  for (const entry of previousCandidates) {
    visited.add(entry.id);
    const previousQuest = await getQuest(entry.id);
    await collectPreviousQuestChain(previousQuest, target, visited);
    target.push(previousQuest);
  }
}

async function collectNextQuestChain(quest, target, visited) {
  const nextId = quest.NextQuestTargetID;
  if (!nextId || visited.has(nextId)) {
    return;
  }

  visited.add(nextId);
  const nextQuest = await getQuest(nextId);
  target.push(nextQuest);
  await collectNextQuestChain(nextQuest, target, visited);
}

function collectQuestRewards(quest) {
  const rewards = [];

  for (let index = 0; index <= 6; index += 1) {
    const reward = quest[`ItemReward${index}`];
    const targetId = quest[`ItemReward${index}TargetID`];
    const count = Number(quest[`ItemCountReward${index}`] || 0);
    if (reward?.Name && targetId) {
      rewards.push({
        kind: "fixed",
        name: reward.Name,
        itemId: targetId,
        amount: count || 1,
      });
    }
  }

  for (let index = 0; index <= 4; index += 1) {
    const reward = quest[`OptionalItemReward${index}`];
    const targetId = quest[`OptionalItemReward${index}TargetID`];
    const count = Number(quest[`OptionalItemCountReward${index}`] || 0);
    if (reward?.Name && targetId) {
      rewards.push({
        kind: "optional",
        name: reward.Name,
        itemId: targetId,
        amount: count || 1,
      });
    }
  }

  return rewards;
}

function renderQuestRewardList(rewards) {
  return `
    <div class="ingredient-list">
      ${rewards.map((reward) => `
        <div class="ingredient">
          <span class="ingredient__name">${renderRouteLink(reward.itemId, reward.name, "item") || escapeHtml(reward.name)}</span>
          <span class="ingredient__amount">x${reward.amount}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderQuestChainList(quests, emptyText) {
  if (!quests.length) {
    return emptyText;
  }

  return `
    <div class="ingredient-list">
      ${quests.map((quest) => `
        <div class="ingredient">
          <span class="ingredient__name">${renderRouteLink(quest.ID, quest.Name, "quest") || escapeHtml(quest.Name || `任务 #${quest.ID}`)}</span>
          <span class="ingredient__amount">Lv.${quest.ClassJobLevel0 || 0}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function collectShopSources(item, resolvedGilShopSources = []) {
  const links = item.GameContentLinks || {};
  const entries = [];
  const gilShopIds = getGilShopIds(item);
  const gilShopCount = gilShopIds.length;
  const specialShopCount = flattenLinkValues(links.SpecialShop).length;
  const companyCount = flattenLinkValues(links.CompanyCraftSupplyItem).length;
  const itemName = getPreferredItemName(item) || item.Name || item.Name_en || "";

  if (resolvedGilShopSources.length > 0) {
    for (const source of resolvedGilShopSources) {
      const location = formatShopLocation(source);
      if (!source.npcName || !source.coordinate || !location) {
        continue;
      }
      const vendorText = [source.npcName, source.npcTitle].filter(Boolean).join(" / ");
      entries.push({
        title: `${vendorText}`,
        description: `NPC 商店售价 ${formatPrice(source.price)}。位置：${location}。`,
        lines: [
          { label: "售价", value: formatPrice(source.price) },
          { label: "位置", value: location },
          { label: "商店记录", value: `#${source.shopId}` },
        ],
        query: source.wikiQuery || `${itemName} ${source.npcName || ""} 商店`,
      });
    }
  } else if (gilShopCount > 0) {
    entries.push({
      title: "普通商店来源",
      description: `检测到 ${gilShopCount} 条普通商店关联记录。该物品可通过 NPC 商店购买，售价通常为 ${formatPrice(getNpcShopPrice(item))}。`,
      lines: [
        { label: "来源类型", value: "普通商店" },
        { label: "NPC 售价", value: formatPrice(getNpcShopPrice(item)) },
        { label: "关联记录", value: `${gilShopCount} 条` },
      ],
      query: `${itemName} 商店 NPC`,
    });
  }

  if (specialShopCount > 0) {
    entries.push({
      title: "特殊商店来源",
      description: `检测到 ${specialShopCount} 条特殊商店关联记录。该物品可能通过代币、票据或兑换型商店获取。`,
      lines: [
        { label: "来源类型", value: "特殊商店 / 兑换商店" },
        { label: "关联记录", value: `${specialShopCount} 条` },
      ],
      query: `${itemName} 特殊商店`,
    });
  }

  if (companyCount > 0) {
    entries.push({
      title: "工房 / 部队来源",
      description: `检测到 ${companyCount} 条部队工房关联记录。该物品可能与部队工房或相关 NPC 交互有关。`,
      lines: [
        { label: "来源类型", value: "部队工房 / 工房供应" },
        { label: "关联记录", value: `${companyCount} 条` },
      ],
      query: `${itemName} 部队工房`,
    });
  }

  return entries;
}

function getGilShopIds(item) {
  return uniqueNumbers(flattenRawLinkValues(item?.GameContentLinks?.GilShopItem)
    .map((value) => Math.trunc(Number(value)))
    .filter((value) => Number.isFinite(value) && value > 0));
}

function getNpcShopPrice(item) {
  const price = Number(item?.PriceMid || 0);
  return Number.isFinite(price) && price > 0 ? price : null;
}

async function getShopSources(item, shopIds) {
  const ids = uniqueNumbers(shopIds).slice(0, FETCH_LIMITS.shopSources);
  if (!ids.length) {
    return [];
  }

  const groups = await Promise.all(ids.map((shopId) => getShopSource(item, shopId)));
  return groups.flat().filter(Boolean);
}

async function getShopSource(item, shopId) {
  if (!shopId) {
    return [];
  }

  const cacheKey = `${item?.ID || 0}:${shopId}`;
  if (state.caches.shopSource.has(cacheKey)) {
    return state.caches.shopSource.get(cacheKey);
  }

  const promise = resolveShopSource(item, shopId);
  state.caches.shopSource.set(cacheKey, promise);
  return promise;
}

async function resolveShopSource(item, shopId) {
  const npcs = await findShopNpcs(shopId);
  const price = getNpcShopPrice(item);
  const itemName = getPreferredItemName(item) || item?.Name || item?.Name_en || "";

  if (!npcs.length) {
    debugLog(`[shopSource:unresolved] shopId=${shopId} item=${itemName}`);
    return [];
  }

  const details = await Promise.all(
    npcs.slice(0, FETCH_LIMITS.shopNpcsPerShop).map((npc) => getNpcShopDetail(npc.id || npc.rowId, shopId, itemName, price))
  );
  const validDetails = details.filter((detail) => detail?.coordinate);
  if (!validDetails.length) {
    debugLog(`[shopSource:no-coordinate] shopId=${shopId} item=${itemName}`);
  }
  return validDetails;
}

async function findShopNpcs(shopId) {
  if (state.caches.shopNpc.has(shopId)) {
    return state.caches.shopNpc.get(shopId);
  }

  const query = encodeURIComponent(`+ENpcData[]=${shopId}`);
  const fields = encodeURIComponent("ENpcData");
  const url = `https://v2.xivapi.com/api/search?sheets=ENpcBase&fields=${fields}&limit=${FETCH_LIMITS.shopNpcsPerShop}&query=${query}`;
  const promise = fetchJson(url)
    .then((payload) => (payload.results || []).map((entry) => ({
      id: Number(entry.row_id || 0),
      rowId: Number(entry.row_id || 0),
    })).filter((entry) => entry.id > 0))
    .catch((error) => {
      debugLog(`[shopNpc:failed] shopId=${shopId} error=${error?.message || error}`);
      return [];
    });

  state.caches.shopNpc.set(shopId, promise);
  return promise;
}

async function getNpcShopDetail(npcId, shopId, itemName, price) {
  if (!npcId) {
    return null;
  }

  const npc = await getNpcResident(npcId);
  if (!npc?.name && !npc?.nameEn) {
    return null;
  }
  const [map, location] = await Promise.all([
    npc?.mapId ? getMapInfo(npc.mapId) : null,
    getNpcLocation(npcId, npc).catch((error) => {
      debugLog(`[npcLocation:failed] npcId=${npcId} error=${error?.message || error}`);
      return null;
    }),
  ]);
  const locationMap = location?.mapId && location.mapId !== map?.id
    ? await getMapInfo(location.mapId)
    : null;
  const displayMap = locationMap || map;
  return {
    shopId,
    npcId,
    npcName: npc?.name || npc?.nameEn || `NPC #${npcId}`,
    npcTitle: npc?.title || "",
    price,
    mapName: displayMap?.name || map?.name || "",
    regionName: displayMap?.region || map?.region || "",
    placeName: displayMap?.place || map?.place || "",
    coordinate: location?.coordinate || "",
    wikiQuery: `${itemName} ${npc?.name || npc?.nameEn || ""}`,
  };
}

async function getNpcResident(npcId) {
  if (state.caches.npc.has(npcId)) {
    return state.caches.npc.get(npcId);
  }

  const columns = encodeURIComponent("ID,Name,Name_en,Title,Title_en,Map");
  const url = `${ENCYCLOPEDIA_API}/ENpcResident/${npcId}?language=chs&columns=${columns}`;
  const promise = fetchJson(url)
    .then((payload) => ({
      id: Number(payload.ID || npcId),
      name: payload.Name || payload.Name_chs || "",
      nameEn: payload.Name_en || "",
      title: payload.Title || payload.Title_chs || "",
      titleEn: payload.Title_en || "",
      mapId: Number(payload.Map || 0) || null,
    }))
    .catch((error) => {
      debugLog(`[npc:failed] npcId=${npcId} error=${error?.message || error}`);
      return null;
    });

  state.caches.npc.set(npcId, promise);
  return promise;
}

async function getMapInfo(mapId) {
  if (state.caches.map.has(mapId)) {
    return state.caches.map.get(mapId);
  }

  const columns = encodeURIComponent("ID,PlaceName.Name,PlaceNameRegion.Name,PlaceNameSub.Name,SizeFactor,OffsetX,OffsetY");
  const url = `${ENCYCLOPEDIA_API}/map/${mapId}?language=chs&columns=${columns}`;
  const promise = fetchJson(url)
    .then((payload) => ({
      id: Number(payload.ID || mapId),
      name: payload.PlaceName?.Name || "",
      region: payload.PlaceNameRegion?.Name || "",
      place: payload.PlaceNameSub?.Name || "",
      sizeFactor: Number(payload.SizeFactor || 100),
      offsetX: Number(payload.OffsetX || 0),
      offsetY: Number(payload.OffsetY || 0),
    }))
    .catch((error) => {
      debugLog(`[map:failed] mapId=${mapId} error=${error?.message || error}`);
      return null;
    });

  state.caches.map.set(mapId, promise);
  return promise;
}

function formatShopLocation(source) {
  const location = [source.regionName, source.mapName, source.placeName]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .join(" / ");
  return [location, source.coordinate].filter(Boolean).join(" / ");
}

async function getNpcLocation(npcId, npc = null) {
  if (state.caches.npcLocation.has(npcId)) {
    return state.caches.npcLocation.get(npcId);
  }

  const promise = resolveNpcLocation(npcId, npc);
  state.caches.npcLocation.set(npcId, promise);
  return promise;
}

async function resolveNpcLocation(npcId, npc = null) {
  const levelLocation = await getNpcLevelLocation(npcId, npc?.mapId);
  if (levelLocation) {
    return levelLocation;
  }

  if (!npc?.nameEn) {
    return null;
  }

  return getNpcGarlandLocation(npcId, npc);
}

async function getNpcLevelLocation(npcId, preferredMapId = null) {
  const query = encodeURIComponent(`+Object=${npcId}`);
  const fields = encodeURIComponent("Map.SizeFactor,Map.OffsetX,Map.OffsetY,X,Z,Type");
  const url = `https://v2.xivapi.com/api/search?sheets=Level&fields=${fields}&limit=12&query=${query}`;
  const payload = await fetchJson(url).catch((error) => {
    debugLog(`[npcLevel:failed] npcId=${npcId} error=${error?.message || error}`);
    return null;
  });
  const entries = (payload?.results || [])
    .map((entry) => mapLevelLocation(entry))
    .filter(Boolean);

  if (!entries.length) {
    return null;
  }

  const exactMap = preferredMapId
    ? entries.find((entry) => entry.mapId === preferredMapId)
    : null;
  return exactMap || entries[0];
}

function mapLevelLocation(entry) {
  const fields = entry?.fields || {};
  const rawX = Number(fields.X);
  const rawY = Number(fields.Z);
  const mapId = Number(fields.Map?.value || fields.Map?.row_id || fields.Map || 0) || null;
  const mapFields = fields.Map?.fields || {};
  const scale = Number(mapFields.SizeFactor || 100);
  const offsetX = Number(mapFields.OffsetX || 0);
  const offsetY = Number(mapFields.OffsetY || 0);

  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
    return null;
  }

  const x = toMapCoordinate(rawX, scale, offsetX);
  const y = toMapCoordinate(rawY, scale, offsetY);
  return {
    mapId,
    rawX,
    rawY,
    coordinate: formatNpcCoordinate(x, y),
  };
}

async function getNpcGarlandLocation(npcId, npc) {
  const url = `https://www.garlandtools.org/api/search.php?text=${encodeURIComponent(npc.nameEn)}`;
  const payload = await fetchJson(url).catch((error) => {
    debugLog(`[npcGarland:failed] npcId=${npcId} error=${error?.message || error}`);
    return null;
  });
  const match = pickGarlandNpcSearchResult(payload, npcId, npc);
  const coords = match?.obj?.c;
  if (!Array.isArray(coords) || coords.length < 2) {
    return null;
  }

  const x = Number(coords[0]);
  const y = Number(coords[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return {
    mapId: Number(match.obj.m || match.obj.map || 0) || null,
    coordinate: formatNpcCoordinate(x, y),
  };
}

function pickGarlandNpcSearchResult(payload, npcId, npc) {
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.value)
    ? payload.value
    : (payload?.type === "npc" ? [payload] : []);
  const normalizedName = normalizeSearchKey(npc?.nameEn || npc?.name || "");
  return candidates.find((entry) => Number(entry?.id || entry?.obj?.i || 0) === Number(npcId))
    || candidates.find((entry) => entry?.type === "npc" && normalizeSearchKey(entry?.obj?.n || "") === normalizedName)
    || candidates.find((entry) => entry?.type === "npc" && Array.isArray(entry?.obj?.c));
}

function formatNpcCoordinate(x, y) {
  return `X:${Number(x).toFixed(1)} Y:${Number(y).toFixed(1)}`;
}

function parseQuestSearchIntent(keyword) {
  const text = String(keyword || "").trim();
  const match = text.match(/^(?:任务[:：# ]?|quest[:：# ]?|q[:：# ]?)(.+)$/i);
  if (!match) {
    return { directQuestId: null, forceQuestKeyword: null };
  }

  const payload = match[1].trim();
  if (/^\d{3,}$/.test(payload)) {
    return { directQuestId: Number(payload), forceQuestKeyword: null };
  }

  return { directQuestId: null, forceQuestKeyword: payload };
}

function formatQuestCoordinate(location) {
  if (!location?.Map) {
    return "未公开";
  }

  const rawX = Number(location.X);
  const rawY = Number(location.Y);
  const scale = Number(location.Map.SizeFactor || 100);
  const offsetX = Number(location.Map.OffsetX || 0);
  const offsetY = Number(location.Map.OffsetY || 0);

  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
    return "未公开";
  }

  const x = toMapCoordinate(rawX, scale, offsetX);
  const y = toMapCoordinate(rawY, scale, offsetY);
  return `X:${x.toFixed(1)} Y:${y.toFixed(1)}`;
}

function toMapCoordinate(value, scale, offset) {
  const scaled = scale / 100;
  return ((41 / scaled) * ((((value + offset) * scaled) + 1024) / 2048)) + 1;
}

function summarizeRegions(worldRows) {
  const buckets = new Map();
  for (const row of worldRows) {
    if (!buckets.has(row.region)) {
      buckets.set(row.region, []);
    }
    buckets.get(row.region).push(row);
  }

  return Array.from(buckets.entries()).map(([region, rows]) => {
    const priced = rows.filter((row) => row.minPrice != null).sort((a, b) => a.minPrice - b.minPrice);
    return {
      region,
      cheapestPrice: priced[0]?.minPrice ?? null,
    };
  });
}

function renderRegionFilters(regionNames) {
  dom.regionFilters.innerHTML = "";
  const fragment = document.createDocumentFragment();

  for (const region of regionNames) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `region-filter${region === state.selectedRegion ? " is-active" : ""}`;
    button.textContent = region;
    button.addEventListener("click", () => {
      state.selectedRegion = region;
      renderRegionFilters(regionNames);
      if (state.currentEntity?.type === "item") {
        renderMarketOverview(state.currentEntity.data, state.currentWorldRows);
      }
      renderPriceTable();
    });
    fragment.appendChild(button);
  }

  dom.regionFilters.appendChild(fragment);
}

function wrapCard(eyebrow, title, body) {
  return `
    <div class="card__header">
      <div>
        <p class="card__eyebrow">${escapeHtml(eyebrow)}</p>
        <h2>${escapeHtml(title)}</h2>
      </div>
    </div>
    ${body}
  `;
}

function collectRecipeIngredients(recipe) {
  const list = [];
  for (let index = 0; index < 8; index += 1) {
    const item = recipe[`ItemIngredient${index}`];
    const amount = Number(recipe[`AmountIngredient${index}`] || 0);
    const itemId = Number(recipe[`ItemIngredient${index}TargetID`] || 0);
    if (!item?.Name || !amount) {
      continue;
    }
    list.push({ name: item.Name, amount, itemId });
  }
  return list;
}

function summarizeSourceLinks(links) {
  const mapping = {
    RetainerTaskNormal: "雇员探险",
    CompanyCraftSupplyItem: "部队工房",
    GCSupplyDuty: "军票筹备",
    LeveRewardItemGroup: "理符 / 奖励组",
    GilShopItem: "商店售卖",
    SpecialShop: "特殊商店",
    GatheringItem: "采集系统",
    Recipe: "制作系统",
  };

  const list = [];
  for (const [key, value] of Object.entries(links)) {
    if (key === "Recipe" || key === "GatheringItem" || key === "GilShopItem" || key === "SpecialShop") {
      continue;
    }
    const count = flattenLinkValues(value).length;
    if (count > 0) {
      list.push({
        label: mapping[key] || key,
        count,
        ids: uniqueNumbers(flattenLinkValues(value)),
      });
    }
  }
  return list.sort((left, right) => right.count - left.count);
}

function flattenLinkValues(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(flattenLinkValues);
  }
  if (typeof value === "object") {
    return Object.values(value).flatMap(flattenLinkValues);
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? [numeric] : [];
}

function flattenRawLinkValues(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(flattenRawLinkValues);
  }
  if (typeof value === "object") {
    return Object.values(value).flatMap(flattenRawLinkValues);
  }
  return [value];
}

function flattenLinkObject(object, keyPattern) {
  if (!object) {
    return [];
  }
  const values = [];
  for (const [key, value] of Object.entries(object)) {
    if (keyPattern && !keyPattern.test(key)) {
      continue;
    }
    values.push(...flattenLinkValues(value));
  }
  return values;
}

function uniqueNumbers(values) {
  return [...new Set(values.filter((value) => Number.isFinite(Number(value))).map(Number))];
}

async function fetchJson(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 0);
  const controller = timeoutMs > 0 && typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!response.ok) {
      throw new Error(`请求失败 ${response.status}: ${url}`);
    }
    return response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`请求超时: ${url}`);
    }
    throw error;
  } finally {
    if (timer) {
      window.clearTimeout(timer);
    }
  }
}

function renderRouteLink(id, name, type) {
  if (!id || !name) {
    return "";
  }
  const routeName = type === "item"
    ? getPreferredItemNameById(id, name)
    : name;
  return `<a class="route-link" href="?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}&name=${encodeURIComponent(routeName)}">${escapeHtml(routeName)}</a>`;
}

function renderExternalButton(url, label) {
  return `<a class="link-button" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
}

function renderWikiOpenButton(query, label = "打开国服 Wiki") {
  return `<button type="button" class="link-button" data-wiki-search="${escapeHtml(query || "")}">${escapeHtml(label)}</button>`;
}

function buildWikiSearchUrl(name) {
  return `https://ff14.huijiwiki.com/index.php?search=${encodeURIComponent(name || "")}`;
}

function buildWikiArticleUrl(name, namespace = "") {
  const title = String(name || "").trim();
  const prefix = String(namespace || "").trim();
  const pageTitle = prefix ? `${prefix}:${title}` : title;
  return title
    ? `https://ff14.huijiwiki.com/wiki/${encodeURIComponent(pageTitle).replace(/%20/g, "_")}`
    : buildWikiSearchUrl(title);
}

function toIconUrl(iconPath) {
  if (!iconPath) {
    return "";
  }
  const proxyUrl = iconPathToProxyUrl(iconPath);
  if (proxyUrl) {
    return proxyUrl;
  }
  const normalized = normalizeIconPath(iconPath);
  if (normalized) {
    return iconPathToXivApiAssetUrl(normalized);
  }
  if (/^https?:\/\//.test(iconPath)) {
    return iconPath;
  }
  return `https://cafemaker.wakingsands.com${iconPath}`;
}

function xivApiIconPathToUrl(path) {
  if (!path) {
    return "";
  }
  if (/^https?:\/\//i.test(path) && !normalizeIconPath(path)) {
    return path;
  }
  const normalized = normalizeIconPath(path);
  if (!normalized) {
    return "";
  }
  return iconPathToXivApiAssetUrl(normalized);
}

function iconPathToXivApiAssetUrl(iconPath) {
  const normalized = normalizeIconPath(iconPath);
  if (!normalized) {
    return "";
  }
  const texPath = normalized.replace(/\.png$/i, ".tex");
  return `https://v2.xivapi.com/api/asset?path=${encodeURIComponent(`ui/icon/${texPath}`)}&format=png`;
}

function iconPathToProxyUrl(iconPath) {
  const normalized = normalizeIconPath(iconPath);
  if (!normalized || !canUseLocalIconProxy()) {
    return "";
  }
  return `${window.location.origin}${ICON_PROXY_ENDPOINT}?path=${encodeURIComponent(normalized)}`;
}

function canUseLocalIconProxy() {
  if (typeof window === "undefined" || !window.location) {
    return false;
  }
  return (window.location.protocol === "http:" || window.location.protocol === "https:")
    && LOCAL_ICON_PROXY_HOSTS.has(window.location.hostname);
}

function normalizeIconPath(iconPath) {
  if (!iconPath) {
    return "";
  }

  let value = String(iconPath).trim();
  if (!value) {
    return "";
  }

  try {
    if (/^https?:\/\//i.test(value)) {
      value = new URL(value).pathname;
    }
  } catch {
    // Keep the original value and let the path validation reject invalid input.
  }

  value = value
    .replace(/\\/g, "/")
    .replace(/^https?:\/\/[^/]+/i, "")
    .split("?")[0]
    .split("#")[0]
    .replace(/^\/+/, "")
    .replace(/^i\//i, "")
    .replace(/^ui\/icon\//i, "")
    .replace(/\.tex$/i, ".png");

  try {
    value = decodeURIComponent(value);
  } catch {
    // Ignore malformed escapes; validation below will reject unsafe paths.
  }

  return /^\d{6}\/\d{6}\.png$/i.test(value) ? value : "";
}

function formatPrice(value) {
  return value == null ? "暂无" : `${Number(value).toLocaleString("zh-CN")} Gil`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function formatTime(epochMs) {
  if (!epochMs) {
    return "暂无";
  }
  const date = new Date(epochMs);
  if (Number.isNaN(date.getTime())) {
    return "暂无";
  }
  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function jsonString(value) {
  return JSON.stringify(String(value ?? ""));
}

function getPreferredItemName(item) {
  const itemId = item?.ID ? Number(item.ID) : 0;
  const aliasMeta = itemId
    ? (state.resolvedAliases.get(itemId) || state.itemMappingById?.get(itemId) || null)
    : null;
  return getAliasDisplayName(aliasMeta) || item?.Name || item?.Name_en || "";
}

function getPreferredItemNameById(itemId, fallbackName = "") {
  const numericId = Number(itemId);
  const aliasMeta = state.resolvedAliases.get(numericId) || state.itemMappingById?.get(numericId) || null;
  const preferredName = getAliasDisplayName(aliasMeta);
  if (preferredName) {
    return preferredName;
  }
  return String(fallbackName || "");
}

function getAliasDisplayName(aliasMeta) {
  return String(aliasMeta?.preferredName || aliasMeta?.name || "").trim();
}

function getAliasEnglishName(aliasMeta) {
  return String(aliasMeta?.preferredEnglishName || aliasMeta?.englishName || "").trim();
}

function getAliasDescription(aliasMeta) {
  return String(aliasMeta?.preferredDescription || aliasMeta?.description || "").trim();
}

async function openWikiSearch(query) {
  const text = String(query || "").trim();
  if (!text) {
    return;
  }

  if (/^https?:\/\//i.test(text)) {
    window.open(text, "_blank", "noopener,noreferrer");
    return;
  }

  const resolved = await resolveItemViaWikiFallback(text).catch(() => null);
  const target = resolved?.url || buildWikiArticleUrl(text) || buildWikiSearchUrl(text);
  window.open(target, "_blank", "noopener,noreferrer");
}

const ITEM_MAPPING_URL = "./data/item_mapping.min.json?v=20260609-v1";

async function loadItemMapping() {
  try {
    const payload = await fetchJson(ITEM_MAPPING_URL);
    const entries = Array.isArray(payload?.entries) ? payload.entries : (Array.isArray(payload?.Entries) ? payload.Entries : []);
    state.itemMappingEntries = entries.map(normalizeMappingEntry).filter(Boolean);
    state.itemMappingExact = new Map();
    state.itemMappingById = new Map();

    for (const entry of state.itemMappingEntries) {
      const { itemId, zhName, enName, zhDescription, iconPath } = entry;
      const alias = {
        itemId: Number(itemId),
        name: String(zhName || ""),
        englishName: String(enName || ""),
        icon: iconPath ? xivApiIconPathToUrl(iconPath) : "",
        iconPath: String(iconPath || ""),
        fast: true,
        description: String(zhDescription || "该结果通过本地客户端双语映射表解析得到。"),
      };
      state.itemMappingById.set(alias.itemId, alias);

      for (const key of [alias.name, alias.englishName]) {
        const normalized = normalizeSearchKey(key);
        if (!normalized) continue;
        if (!state.itemMappingExact.has(normalized)) {
          state.itemMappingExact.set(normalized, []);
        }
        state.itemMappingExact.get(normalized).push(alias);
      }
    }

    debugLog(`[mapping] loaded entries=${state.itemMappingEntries.length}`);
  } catch (error) {
    state.itemMappingEntries = [];
    state.itemMappingExact = new Map();
    state.itemMappingById = new Map();
    debugLog(`[mapping] load-failed error=${error?.message || error}`);
  }
}

function normalizeMappingEntry(entry) {
  if (Array.isArray(entry)) {
    const [itemId, zhName, enName, iconPath] = entry;
    return {
      itemId: Number(itemId),
      zhName: String(zhName || ""),
      enName: String(enName || ""),
      iconPath: String(iconPath || ""),
    };
  }

  if (entry && typeof entry === "object") {
    return {
      itemId: Number(entry.ItemId ?? entry.itemId ?? 0),
      zhName: String(entry.ZhName ?? entry.zhName ?? ""),
      enName: String(entry.EnName ?? entry.enName ?? ""),
      zhDescription: String(entry.ZhDescription ?? entry.zhDescription ?? ""),
      iconPath: String(entry.IconPath ?? entry.iconPath ?? ""),
    };
  }

  return null;
}

async function bootstrap() {
  initializeTheme();
  renderRegionFilters(["全部"]);
  bindEvents();
  renderSearchHistory();

  try {
    setBootStatus("正在载入双语映射与区服数据");
    await loadItemMapping();
    await loadMarketMetadata();
    renderRegionFilters(getMarketRegionOptions());
    const cnWorldCount = state.dataCenters.reduce((sum, entry) => sum + entry.worlds.length, 0);
    setBootStatus(`已载入国服 ${cnWorldCount} 个世界服，双语映射 ${state.itemMappingEntries?.length || 0} 条`);
    await loadFromUrl({ replace: true });
  } catch (error) {
    console.error(error);
    setBootStatus("初始化失败");
    renderFatalError(error);
  }
}

function resolveKnownItemAlias(keyword) {
  const text = normalizeSearchKey(keyword);
  const matches = state.itemMappingExact?.get(text) || state.resolvedQueries.get(text) || NORMALIZED_KNOWN_ITEM_ALIASES[text] || null;
  if (Array.isArray(matches)) {
    return matches.length === 1 ? matches[0] : null;
  }
  return matches;
}

function rememberResolvedAlias(keyword, resolved) {
  if (!resolved?.itemId) {
    return;
  }

  const normalizedKeyword = normalizeSearchKey(keyword);
  const alias = {
    itemId: Number(resolved.itemId),
    name: String(resolved.name || keyword || ""),
    englishName: String(resolved.englishName || ""),
    icon: String(resolved.icon || ""),
    fast: true,
    description: String(resolved.description || ""),
  };

  if (normalizedKeyword) {
    state.resolvedQueries.set(normalizedKeyword, alias);
  }

  state.resolvedAliases.set(alias.itemId, {
    preferredName: alias.name,
    preferredEnglishName: alias.englishName,
    preferredDescription: alias.description,
    icon: alias.icon,
    fast: true,
  });
}

function searchItemsFromMapping(keyword) {
  const normalized = normalizeSearchKey(keyword);
  if (!normalized || !Array.isArray(state.itemMappingEntries) || !state.itemMappingEntries.length) {
    return [];
  }

  const exact = state.itemMappingExact?.get(normalized) || [];
  if (exact.length) {
    return exact.map((entry) => buildResolvedAliasItems(keyword, entry)[0]);
  }

  const results = [];
  for (const row of state.itemMappingEntries) {
    const { itemId, zhName, enName, zhDescription, iconPath } = row;
    const zhKey = normalizeSearchKey(zhName);
    const enKey = normalizeSearchKey(enName);
    if (!zhKey.includes(normalized) && !enKey.includes(normalized)) {
      continue;
    }
    const mappingAlias = {
      itemId: Number(itemId),
      name: String(zhName || ""),
      englishName: String(enName || ""),
      description: String(zhDescription || ""),
      icon: iconPath ? xivApiIconPathToUrl(iconPath) : "",
      iconPath: String(iconPath || ""),
      fast: true,
    };
    results.push({
      ID: Number(itemId),
      Name: String(zhName || ""),
      Name_en: String(enName || ""),
      Name_ja: "",
      Description: String(zhDescription || ""),
      Icon: mappingAlias.icon,
      LevelItem: 0,
      ItemUICategory: { Name: "双语映射" },
      __mappingAlias: mappingAlias,
    });
    if (results.length >= 50) {
      break;
    }
  }

  return results;
}

async function searchItems(keyword, { allowDeepFallback = true } = {}) {
  const exactAlias = resolveKnownItemAlias(keyword);
  if (exactAlias) {
    debugLog(`[searchItems:mapping-exact] keyword=${keyword} itemId=${exactAlias.itemId} english=${exactAlias.englishName}`);
    return buildResolvedAliasItems(keyword, exactAlias);
  }

  const mapped = searchItemsFromMapping(keyword);
  if (mapped.length) {
    debugLog(`[searchItems:mapping-fuzzy] keyword=${keyword} count=${mapped.length}`);
    return mapped;
  }

  debugLog(`[searchItems:start] keyword=${keyword}`);
  const encoded = encodeURIComponent(keyword);
  const columns = encodeURIComponent("ID,Name,Name_en,Name_ja,Icon,LevelItem,ItemUICategory.Name");
  const primaryUrl = `${ENCYCLOPEDIA_API}/search?indexes=Item&string=${encoded}&language=chs&limit=50&columns=${columns}`;
  const primary = await fetchJson(primaryUrl);
  const results = primary.Results || [];
  debugLog(`[searchItems:primary] keyword=${keyword} count=${results.length}`);

  if (results.length > 0) {
    return results;
  }

  const fallbackUrl = `${ENCYCLOPEDIA_API}/search?indexes=Item&string=${encoded}&language=en&limit=50&columns=${columns}`;
  const fallback = await fetchJson(fallbackUrl);
  const fallbackResults = fallback.Results || [];
  debugLog(`[searchItems:fallback-en] keyword=${keyword} count=${fallbackResults.length}`);
  if (fallbackResults.length > 0) {
    return fallbackResults;
  }

  if (!allowDeepFallback) {
    debugLog(`[searchItems:skip-deep-fallback] keyword=${keyword}`);
    return [];
  }

  const wikiResolved = await resolveItemViaWikiFallback(keyword);
  debugLog(`[searchItems:wiki-fallback-result] keyword=${keyword} success=${!!wikiResolved} itemId=${wikiResolved?.itemId ?? ""} english=${wikiResolved?.englishName ?? ""}`);
  if (wikiResolved?.itemId) {
    return buildResolvedAliasItems(keyword, {
      itemId: wikiResolved.itemId,
      name: wikiResolved.title || keyword,
      englishName: wikiResolved.englishName || wikiResolved.title || keyword,
      icon: "",
      fast: true,
      description: "该结果通过 Wiki -> 双语运行时缓存兜底解析得到。",
    });
  }

  return [];
}

function resolveItemViaWikiFallback(keyword) {
  const query = String(keyword || "").trim();
  if (!query) {
    return Promise.resolve(null);
  }

  debugLog(`[wikiFallback:http-begin] keyword=${keyword}`);
  return fetch(`/__resolve_item`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ Query: query }),
    })
    .then(async (response) => {
      debugLog(`[wikiFallback:http-status] keyword=${keyword} status=${response.status}`);
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        debugLog(`[wikiFallback:http-nonok-body] keyword=${keyword} body=${text}`);
        return null;
      }

      const data = await response.json();
      debugLog(`[wikiFallback:http-result] keyword=${keyword} success=${!!data?.success} itemId=${data?.itemId ?? ""} english=${data?.englishName ?? ""}`);
      return (data && (data.success || data.itemId || data.title || data.url || data.englishName)) ? data : null;
    })
    .catch((error) => {
      debugLog(`[wikiFallback:http-error] keyword=${keyword} error=${error?.message || error}`);
      return null;
    });
}

async function tryResolveAmbiguousViaWiki(keyword) {
  const wikiResolved = await resolveItemViaWikiFallback(keyword);
  if (!wikiResolved) {
    return null;
  }

  if (wikiResolved.itemId) {
    const entry = buildResolvedAliasItems(keyword, {
      itemId: wikiResolved.itemId,
      name: wikiResolved.title || keyword,
      englishName: wikiResolved.englishName || wikiResolved.title || keyword,
      icon: "",
      fast: true,
      description: "该结果通过国服 Wiki 二次兜底解析得到。",
    })[0];

    return {
      type: "item",
      id: entry.ID,
      name: entry.Name || entry.Name_en || `物品 #${entry.ID}`,
      subtitle: `${entry.ItemUICategory?.Name || "未分类"} · 物品等级 ${entry.LevelItem || 0} · ${entry.Name_en || "无英文名"}`,
      icon: entry.Icon,
      raw: entry,
    };
  }

  if (wikiResolved.title || wikiResolved.url) {
    return {
      type: "wiki",
      id: 0,
      name: wikiResolved.title || keyword,
      subtitle: "国服 Wiki 命中结果，当前无法直接映射为可定价物品，可先打开 Wiki 继续确认",
      icon: "",
      raw: {
        wikiUrl: wikiResolved.url || buildWikiSearchUrl(keyword),
      },
    };
  }

  return null;
}

function renderSearchResults(results) {
  if (!results.length) {
    dom.searchResults.classList.add("hidden");
    dom.searchResults.innerHTML = "";
    return;
  }

  dom.searchResults.innerHTML = "";
  const fragment = document.createDocumentFragment();

  for (const entry of results) {
    const node = dom.resultTemplate.content.firstElementChild.cloneNode(true);
    const icon = node.querySelector(".result-item__icon");
    const name = node.querySelector(".result-item__name");
    const meta = node.querySelector(".result-item__meta");
    const typeLabel = entry.type === "quest" ? "任务" : entry.type === "wiki" ? "Wiki" : "物品";

    icon.style.backgroundImage = `url(${toIconUrl(entry.icon)})`;
    name.textContent = entry.name;
    meta.textContent = `${typeLabel} · ${entry.subtitle}`;

    node.addEventListener("click", async () => {
      dom.searchResults.classList.add("hidden");
      dom.searchInput.value = entry.name;
      if (entry.type === "quest") {
        await loadQuestPage(entry.id);
      } else if (entry.type === "wiki") {
        openWikiSearch(entry.raw?.wikiUrl || entry.name);
      } else {
        await loadItemPage(entry.id);
      }
    });

    fragment.appendChild(node);
  }

  dom.searchResults.appendChild(fragment);
  dom.searchResults.classList.remove("hidden");
}

function renderAmbiguousSearchResult(keyword, results) {
  const topResults = results.slice(0, 8);
  const itemsMarkup = topResults.map((entry) => {
    const typeLabel = entry.type === "quest" ? "任务" : entry.type === "wiki" ? "Wiki" : "物品";
    const nameMarkup = entry.type === "wiki"
      ? `<button type="button" class="link-button" data-wiki-search="${escapeHtml(entry.raw?.wikiUrl || entry.name)}">${escapeHtml(entry.name)}</button>`
      : (renderRouteLink(entry.id, entry.name, entry.type === "quest" ? "quest" : "item") || escapeHtml(entry.name));
    return `
      <div class="ingredient">
        <span class="ingredient__name">${nameMarkup}</span>
        <span class="ingredient__amount">${escapeHtml(typeLabel)}</span>
      </div>
    `;
  }).join("");

  const wikiButton = `
    <div class="link-row">
      <button type="button" class="link-button" data-wiki-search="${escapeHtml(keyword)}">在软件内打开国服 Wiki 搜索</button>
    </div>
  `;

  const markup = `
    <div class="notice notice--soft">
      “${escapeHtml(keyword)}” 当前命中了相关条目，但没有足够把握自动跳转到准确物品。
    </div>
    <div class="subsection">
      <h3 class="subsection__title">相关候选</h3>
      <div class="ingredient-list">${itemsMarkup}</div>
    </div>
    ${wikiButton}
  `;

  dom.itemOverview.innerHTML = wrapCard("搜索结果", "需要你确认准确条目", markup);
  dom.marketOverview.innerHTML = wrapCard("详情面板", "等待选择", `<div class="notice notice--soft">请点击上方候选条目，或直接打开软件内国服 Wiki 搜索继续确认。</div>`);
  dom.obtainPanel.innerHTML = wrapCard("获取方式", "等待选择", `<div class="notice notice--soft">选择准确物品后再显示获取方式。</div>`);
  dom.craftPanel.innerHTML = wrapCard("制作配方", "等待选择", `<div class="notice notice--soft">选择准确物品后再显示制作配方。</div>`);
  dom.usagePanel.innerHTML = wrapCard("用途", "等待选择", `<div class="notice notice--soft">选择准确物品后再显示用途。</div>`);
  dom.priceTableBody.innerHTML = `<tr><td colspan="7" class="table-empty">请先从候选列表中选择准确物品</td></tr>`;
}
// HQ / NQ market quality overrides
function getActiveMarketQuality() {
  return state.selectedMarketQuality || "all";
}

function setActiveMarketQuality(value) {
  state.selectedMarketQuality = value || "all";
}

function createEmptyQualityStats() {
  return {
    all: { listingIds: new Set(), minPrice: null, listingCount: 0, unitsForSale: 0 },
    hq: { listingIds: new Set(), minPrice: null, listingCount: 0, unitsForSale: 0 },
    nq: { listingIds: new Set(), minPrice: null, listingCount: 0, unitsForSale: 0 },
  };
}

function accumulateQualityStat(bucket, listing, listingId) {
  if (bucket.listingIds.has(listingId)) {
    return;
  }

  bucket.listingIds.add(listingId);
  bucket.listingCount += 1;
  bucket.unitsForSale += Number(listing.quantity || 0);
  const price = Number(listing.pricePerUnit);
  if (bucket.minPrice == null || price < bucket.minPrice) {
    bucket.minPrice = price;
  }
}

function finalizeQualityStats(stats) {
  const toPublic = (bucket) => ({
    minPrice: bucket.minPrice,
    listingCount: bucket.listingCount,
    unitsForSale: bucket.unitsForSale,
  });

  return {
    all: toPublic(stats.all),
    hq: toPublic(stats.hq),
    nq: toPublic(stats.nq),
  };
}

function getSelectedQualityStat(row) {
  const quality = getActiveMarketQuality();
  return row?.qualityStats?.[quality] || row?.qualityStats?.all || {
    minPrice: null,
    listingCount: 0,
    unitsForSale: 0,
  };
}

function getQualityOptions(item) {
  return item?.CanBeHq
    ? [
        { key: "all", label: "全部" },
        { key: "hq", label: "HQ" },
        { key: "nq", label: "非 HQ" },
      ]
    : [{ key: "all", label: "全部" }];
}

function getMarketModeLabel() {
  const quality = getActiveMarketQuality();
  if (quality === "hq") return "HQ";
  if (quality === "nq") return "非 HQ";
  return "全部";
}

function buildWorldRowsFromPayload(dataCenter, payload) {
  const listings = Array.isArray(payload.listings) ? payload.listings : [];
  const uploadTimes = payload.worldUploadTimes || {};
  const grouped = new Map();

  for (const listing of listings) {
    const worldId = Number(listing.worldID);
    const listingId = listing.listingID || `${worldId}-${listing.pricePerUnit}-${listing.quantity}`;
    if (!grouped.has(worldId)) {
      grouped.set(worldId, { stats: createEmptyQualityStats() });
    }

    const record = grouped.get(worldId);
    if (record.stats.all.listingIds.has(listingId)) {
      continue;
    }

    const qualityKey = listing.hq ? "hq" : "nq";
    accumulateQualityStat(record.stats.all, listing, listingId);
    accumulateQualityStat(record.stats[qualityKey], listing, listingId);
  }

  return dataCenter.worlds.map((worldId) => {
    const world = state.worldMap.get(worldId);
    const record = grouped.get(worldId);
    const qualityStats = record?.stats ? finalizeQualityStats(record.stats) : finalizeQualityStats(createEmptyQualityStats());
    return {
      worldId,
      worldName: world?.name || `#${worldId}`,
      region: world?.region || dataCenter.region,
      marketRegion: dataCenter.name,
      dataCenter: dataCenter.name,
      minPrice: qualityStats.all.minPrice,
      listingCount: qualityStats.all.listingCount,
      unitsForSale: qualityStats.all.unitsForSale,
      qualityStats,
      lastUploadTime: Number(uploadTimes[worldId] || 0) || null,
    };
  });
}

function buildEmptyWorldRow(dataCenter, worldId) {
  const world = state.worldMap.get(worldId);
  return {
    worldId,
    worldName: world?.name || `#${worldId}`,
    region: world?.region || dataCenter.region,
    marketRegion: dataCenter.name,
    dataCenter: dataCenter.name,
    minPrice: null,
    listingCount: 0,
    unitsForSale: 0,
    qualityStats: finalizeQualityStats(createEmptyQualityStats()),
    lastUploadTime: null,
  };
}

function getRowMarketRegion(row) {
  return row?.marketRegion || row?.dataCenter || row?.region || "未知大区";
}

function getMarketRegionOptions() {
  return ["全部", ...new Set(state.dataCenters.map((entry) => entry.name).filter(Boolean))];
}

function getSelectedRegionLabel() {
  return state.selectedRegion === "全部" ? "全大区" : state.selectedRegion;
}

function filterRowsBySelectedRegion(rows) {
  if (state.selectedRegion === "全部") {
    return rows;
  }
  return rows.filter((row) => getRowMarketRegion(row) === state.selectedRegion);
}

function summarizeRegions(worldRows) {
  const buckets = new Map();
  for (const row of worldRows) {
    const region = getRowMarketRegion(row);
    if (!buckets.has(region)) {
      buckets.set(region, []);
    }
    buckets.get(region).push(row);
  }

  return Array.from(buckets.entries()).map(([region, rows]) => {
    const priced = rows
      .filter((row) => getSelectedQualityStat(row).minPrice != null)
      .sort((a, b) => getSelectedQualityStat(a).minPrice - getSelectedQualityStat(b).minPrice);
    return {
      region,
      cheapestPrice: getSelectedQualityStat(priced[0] || {}).minPrice ?? null,
    };
  });
}

function renderMarketOverview(item, worldRows) {
  if (!item?.CanBeHq) {
    setActiveMarketQuality("all");
  }

  const scopedRows = filterRowsBySelectedRegion(worldRows);
  const rowsWithPrice = scopedRows
    .filter((row) => getSelectedQualityStat(row).minPrice != null)
    .sort((left, right) => {
      const leftStat = getSelectedQualityStat(left);
      const rightStat = getSelectedQualityStat(right);
      if (leftStat.minPrice !== rightStat.minPrice) {
        return (leftStat.minPrice || Number.MAX_SAFE_INTEGER) - (rightStat.minPrice || Number.MAX_SAFE_INTEGER);
      }
      return left.worldName.localeCompare(right.worldName, "zh-CN");
    });
  const cheapest = rowsWithPrice[0];
  const regionsCovered = new Set(scopedRows.map((row) => getRowMarketRegion(row))).size;
  const listedWorlds = rowsWithPrice.length;
  const totalListings = rowsWithPrice.reduce((sum, row) => sum + getSelectedQualityStat(row).listingCount, 0);
  const totalUnits = rowsWithPrice.reduce((sum, row) => sum + getSelectedQualityStat(row).unitsForSale, 0);
  const regionSummary = summarizeRegions(worldRows);
  const qualityOptions = getQualityOptions(item);
  const modeLabel = getMarketModeLabel();
  const regionLabel = getSelectedRegionLabel();

  const markup = `
    <div class="market-quality-row">
      ${qualityOptions.map((entry) => `
        <button type="button" class="region-filter${getActiveMarketQuality() === entry.key ? " is-active" : ""}" data-market-quality="${entry.key}">${entry.label}</button>
      `).join("")}
    </div>
    <div class="market-overview-grid">
      <div class="metric-card">
        <div class="metric-card__label">${escapeHtml(modeLabel)} ${escapeHtml(regionLabel)}最低价</div>
        <div class="metric-card__value">${cheapest ? formatPrice(getSelectedQualityStat(cheapest).minPrice) : "暂无上架"}</div>
        <div class="metric-card__detail">${cheapest ? `${escapeHtml(getRowMarketRegion(cheapest))} / ${escapeHtml(cheapest.worldName)}` : `当前大区没有读取到该物品 ${escapeHtml(modeLabel)} 品质的市场板上架。`}</div>
      </div>
      <div class="metric-card">
        <div class="metric-card__label">已覆盖世界服</div>
        <div class="metric-card__value">${listedWorlds} / ${scopedRows.length}</div>
        <div class="metric-card__detail">当前筛选发现价格的世界服 ${listedWorlds} 个，覆盖 ${regionsCovered} 个国服大区。</div>
      </div>
      <div class="metric-card">
        <div class="metric-card__label">${escapeHtml(modeLabel)} 总上架数</div>
        <div class="metric-card__value">${formatNumber(totalListings)}</div>
        <div class="metric-card__detail">汇总当前读取到的市场板记录。</div>
      </div>
      <div class="metric-card">
        <div class="metric-card__label">${escapeHtml(modeLabel)} 总库存量</div>
        <div class="metric-card__value">${formatNumber(totalUnits)}</div>
        <div class="metric-card__detail">按当前读取到的库存数量累计。</div>
      </div>
    </div>
    <div class="market-chip-row">
      ${regionSummary.map((entry) => `
        <div class="market-chip">
          <span>${escapeHtml(entry.region)}</span>
          <strong>${entry.cheapestPrice != null ? formatPrice(entry.cheapestPrice) : "暂无"}</strong>
        </div>
      `).join("")}
    </div>
  `;

  dom.marketOverview.innerHTML = wrapCard("市场总览", `${getPreferredItemName(item) || item.Name_en} ${modeLabel} ${regionLabel}价格`, markup);
}

function renderPriceTable() {
  if (!state.currentWorldRows.length) {
    dom.priceTableBody.innerHTML = `<tr><td colspan="7" class="table-empty">当前页面没有价格数据</td></tr>`;
    return;
  }

  const keyword = dom.worldFilter.value.trim().toLowerCase();
  const rows = state.currentWorldRows
    .filter((row) => {
      const matchesRegion = state.selectedRegion === "全部" || getRowMarketRegion(row) === state.selectedRegion;
      const haystack = `${row.region} ${getRowMarketRegion(row)} ${row.worldName}`.toLowerCase();
      return matchesRegion && (!keyword || haystack.includes(keyword));
    })
    .sort((left, right) => {
      const leftStat = getSelectedQualityStat(left);
      const rightStat = getSelectedQualityStat(right);
      const leftMissing = leftStat.minPrice == null ? 1 : 0;
      const rightMissing = rightStat.minPrice == null ? 1 : 0;
      if (leftMissing !== rightMissing) {
        return leftMissing - rightMissing;
      }
      if (leftStat.minPrice !== rightStat.minPrice) {
        return (leftStat.minPrice || Number.MAX_SAFE_INTEGER) - (rightStat.minPrice || Number.MAX_SAFE_INTEGER);
      }
      return left.worldName.localeCompare(right.worldName, "zh-CN");
    });

  if (!rows.length) {
    dom.priceTableBody.innerHTML = `<tr><td colspan="7" class="table-empty">没有符合当前筛选条件的数据</td></tr>`;
    return;
  }

  dom.priceTableBody.innerHTML = rows.map((row) => {
    const stat = getSelectedQualityStat(row);
    return `
      <tr>
        <td>${escapeHtml(getRowMarketRegion(row))}</td>
        <td>${escapeHtml(row.region)}</td>
        <td>${escapeHtml(row.worldName)}</td>
        <td><span class="price-value ${stat.minPrice == null ? "is-missing" : ""}">${stat.minPrice == null ? "暂无上架" : formatPrice(stat.minPrice)}</span></td>
        <td>${formatNumber(stat.listingCount)}</td>
        <td>${formatNumber(stat.unitsForSale)}</td>
        <td>${formatTime(row.lastUploadTime)}</td>
      </tr>
    `;
  }).join("");
}

document.addEventListener("click", (event) => {
  const qualityTarget = event.target instanceof Element ? event.target.closest("[data-market-quality]") : null;
  if (!qualityTarget) {
    return;
  }

  event.preventDefault();
  setActiveMarketQuality(qualityTarget.getAttribute("data-market-quality") || "all");
  if (state.currentEntity?.type === "item") {
    renderMarketOverview(state.currentEntity.data, state.currentWorldRows);
  }
  renderPriceTable();
});
