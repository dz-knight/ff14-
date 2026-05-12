const ENCYCLOPEDIA_API = "https://cafemaker.wakingsands.com";
const MARKET_API = "https://universalis.app/api/v2";
const DEFAULT_ITEM_ID = 5114;
const DEFAULT_ITEM_NAME = "秘银矿";
const CN_REGION_NAME = "中国";
const SEARCH_HISTORY_KEY = "ff14_market_search_history_v1";
const SEARCH_HISTORY_LIMIT = 12;
const DEBUG_LOG_KEY = "ff14_market_debug_log_v1";
const FETCH_LIMITS = {
  usageRecipes: 120,
  craftRecipes: 40,
  gatherItems: 24,
  relatedQuests: 16,
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
  caches: {
    item: new Map(),
    quest: new Map(),
    recipe: new Map(),
    gatherItem: new Map(),
    gatherBase: new Map(),
    gatherPoint: new Map(),
    market: new Map(),
    search: new Map(),
  },
};

const dom = {
  bootStatus: document.getElementById("boot-status"),
  searchInput: document.getElementById("item-search"),
  searchButton: document.getElementById("search-button"),
  searchResults: document.getElementById("search-results"),
  searchHistory: document.getElementById("search-history"),
  worldFilter: document.getElementById("world-filter"),
  priceTableBody: document.getElementById("price-table-body"),
  itemOverview: document.getElementById("item-overview"),
  marketOverview: document.getElementById("market-overview"),
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

async function bootstrap() {
  renderRegionFilters(["全部"]);
  bindEvents();
  renderSearchHistory();

  try {
    setBootStatus("正在载入区服映射");
    await loadMarketMetadata();
    renderRegionFilters(["全部", ...new Set(state.dataCenters.map((entry) => entry.region))]);
    const cnWorldCount = state.dataCenters.reduce((sum, entry) => sum + entry.worlds.length, 0);
    setBootStatus(`已载入国服 ${cnWorldCount} 个世界服`);
    await loadFromUrl({ replace: true });
  } catch (error) {
    console.error(error);
    setBootStatus("初始化失败");
    renderFatalError(error);
  }
}

function bindEvents() {
  dom.searchButton.addEventListener("click", () => performSearch(dom.searchInput.value.trim()));
  dom.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      performSearch(dom.searchInput.value.trim());
    }
  });
  dom.searchInput.addEventListener("input", () => handleSearchInput(dom.searchInput.value.trim()));
  dom.worldFilter.addEventListener("input", renderPriceTable);
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
      });
    }
  }
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

function renderAmbiguousSearchResult(keyword, results) {
  const topResults = results.slice(0, 8);
  const itemsMarkup = topResults.map((entry) => {
    const typeLabel = entry.type === "quest" ? "任务" : "物品";
    return `
      <div class="ingredient">
        <span class="ingredient__name">${escapeHtml(entry.name)}</span>
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
  dom.marketOverview.innerHTML = wrapCard("详情面板", "等待选择", `<div class="notice notice--soft">请点击上方搜索结果列表中的准确条目，或直接打开软件内 Wiki 搜索继续确认。</div>`);
  dom.obtainPanel.innerHTML = wrapCard("获取方式", "等待选择", `<div class="notice notice--soft">选择准确物品后再显示获取方式。</div>`);
  dom.craftPanel.innerHTML = wrapCard("制作配方", "等待选择", `<div class="notice notice--soft">选择准确物品后再显示制作配方。</div>`);
  dom.usagePanel.innerHTML = wrapCard("用途", "等待选择", `<div class="notice notice--soft">选择准确物品后再显示用途。</div>`);
  dom.priceTableBody.innerHTML = `<tr><td colspan="7" class="table-empty">请先从候选列表中选择准确物品</td></tr>`;
}

async function tryResolveAmbiguousViaWiki(keyword) {
  const wikiResolved = await resolveItemViaWikiFallback(keyword);
  if (!wikiResolved?.itemId) {
    return null;
  }

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

function renderAmbiguousSearchResult(keyword, results) {
  const topResults = results.slice(0, 8);
  const itemsMarkup = topResults.map((entry) => {
    const typeLabel = entry.type === "quest" ? "任务" : "物品";
    const route = renderRouteLink(entry.id, entry.name, entry.type === "quest" ? "quest" : "item");
    return `
      <div class="ingredient">
        <span class="ingredient__name">${route || escapeHtml(entry.name)}</span>
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

    icon.style.backgroundImage = `url(${toIconUrl(entry.icon)})`;
    name.textContent = entry.name;
    meta.textContent = `${entry.type === "quest" ? "任务" : "物品"} · ${entry.subtitle}`;

    node.addEventListener("click", async () => {
      dom.searchResults.classList.add("hidden");
      dom.searchInput.value = entry.name;
      if (entry.type === "quest") {
        await loadQuestPage(entry.id);
      } else {
        await loadItemPage(entry.id);
      }
    });

    fragment.appendChild(node);
  }

  dom.searchResults.appendChild(fragment);
  dom.searchResults.classList.remove("hidden");
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
      return data && data.success ? data : null;
    })
    .catch((error) => {
      debugLog(`[wikiFallback:http-error] keyword=${keyword} error=${error?.message || error}`);
      return null;
    });
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
  dom.searchInput.value = getPreferredItemName(item);
  renderItemOverview(item);
  renderMarketOverview(item, []);
  renderPriceTable();

  const links = item.GameContentLinks || {};
  const craftRecipeIds = uniqueNumbers(flattenLinkValues(links.Recipe?.ItemResult));
  const usageRecipeIds = uniqueNumbers(flattenLinkObject(links.Recipe, /^ItemIngredient/));
  const gatheringItemIds = uniqueNumbers(flattenLinkValues(links.GatheringItem?.Item));

  const limitedUsageRecipeIds = usageRecipeIds.slice(0, FETCH_LIMITS.usageRecipes);
  const craftIds = craftRecipeIds.slice(0, FETCH_LIMITS.craftRecipes);
  const gatherIds = gatheringItemIds.slice(0, FETCH_LIMITS.gatherItems);
  const aliasMeta = state.resolvedAliases.get(itemId) || null;
  const shouldSkipRelatedQuestSearch = !!aliasMeta?.fast || !Object.keys(links || {}).length;

  const [marketRows, craftRecipes, usageRecipes, gatherData, relatedQuests] = await Promise.all([
    getMarketRows(itemId),
    Promise.all(craftIds.map((id) => getRecipe(id))),
    Promise.all(limitedUsageRecipeIds.map((id) => getRecipe(id))),
    Promise.all(gatherIds.map((id) => getGatheringEntry(id))),
    shouldSkipRelatedQuestSearch
      ? Promise.resolve([])
      : searchQuests(item.Name || item.Name_en || "").catch(() => []),
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
    indirectCraftRecipes
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
  const aliasMeta = state.resolvedAliases.get(itemId) || null;
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

  return {
    ...base,
    Name: aliasMeta.preferredName || base.Name || base.Name_en || `物品 #${itemId}`,
    Name_en: base.Name_en || aliasMeta.preferredEnglishName || base.Name || "",
    Description: aliasMeta.preferredDescription || base.Description || "",
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
          ${renderExternalButton(buildWikiSearchUrl(itemName), "国服 Wiki 搜索")}
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
          ${renderExternalButton(buildWikiSearchUrl(quest.Name || quest.Name_en), "国服 Wiki 搜索")}
        </div>
      </div>
    </div>
  `;

  dom.itemOverview.innerHTML = wrapCard("任务详情", questName, markup);
}

function renderMarketOverview(item, worldRows) {
  const rowsWithPrice = worldRows.filter((row) => row.minPrice != null);
  const cheapest = rowsWithPrice[0];
  const regionsCovered = new Set(worldRows.map((row) => row.region)).size;
  const listedWorlds = rowsWithPrice.length;
  const totalListings = rowsWithPrice.reduce((sum, row) => sum + row.listingCount, 0);
  const totalUnits = rowsWithPrice.reduce((sum, row) => sum + row.unitsForSale, 0);
  const regionSummary = summarizeRegions(worldRows);

  const markup = `
    <div class="market-overview-grid">
      <div class="metric-card">
        <div class="metric-card__label">全服最低价</div>
        <div class="metric-card__value">${cheapest ? formatPrice(cheapest.minPrice) : "暂无上架"}</div>
        <div class="metric-card__detail">${cheapest ? `${escapeHtml(cheapest.region)} / ${escapeHtml(cheapest.dataCenter)} / ${escapeHtml(cheapest.worldName)}` : "当前没有读取到该物品的市场板上架。"}</div>
      </div>
      <div class="metric-card">
        <div class="metric-card__label">已覆盖世界服</div>
        <div class="metric-card__value">${listedWorlds} / ${worldRows.length}</div>
        <div class="metric-card__detail">发现价格的国服世界服 ${listedWorlds} 个，覆盖 ${regionsCovered} 个国服大区。</div>
      </div>
      <div class="metric-card">
        <div class="metric-card__label">总上架数</div>
        <div class="metric-card__value">${formatNumber(totalListings)}</div>
        <div class="metric-card__detail">汇总当前读取到的市场板记录。</div>
      </div>
      <div class="metric-card">
        <div class="metric-card__label">总库存量</div>
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

  dom.marketOverview.innerHTML = wrapCard("市场总览", `${getPreferredItemName(item) || item.Name_en} 全区服价格`, markup);
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
          ${renderExternalButton(buildWikiSearchUrl(quest.Name || quest.Name_en), "国服 Wiki 搜索")}
        </div>
      </div>
    </div>
  `);
}

function renderObtainPanel(item, gatherData, relatedQuests, usageRecipes, usageRecipeCount, craftRecipeCount, indirectCraftRecipes) {
  const gatherMarkup = gatherData.length
    ? `<div class="scroll-panel"><div class="gather-list">${gatherData.map((entry) => renderGatherCard(entry, item)).join("")}</div></div>`
    : `<div class="notice notice--soft">当前没有发现采集来源，可能是商店、任务、掉落或其他系统产出。</div>`;

  const sourceSummary = summarizeSourceLinks(item.GameContentLinks || {});
  const shopSources = collectShopSources(item);
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

  const shopMarkup = shopSources.length
    ? `
      <div class="subsection">
        <h3 class="subsection__title">商店 / NPC 来源</h3>
        <div class="scroll-panel"><div class="source-list">
          ${shopSources.map((entry) => `
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
      <span class="tag">商店来源 ${shopSources.length}</span>
      <span class="tag">相关任务 ${relatedQuests.length}</span>
    </div>
  `;

  dom.obtainPanel.innerHTML = wrapCard("获取方式", "如何获得", `${header}${gatherMarkup}${shopMarkup}${usagePreviewMarkup}${indirectCraftMarkup}${sourceMarkup}${questMarkup}`);
}

function renderCraftPanel(recipes, totalCount, indirectCraftRecipes) {
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
      </div>
      <div class="ingredient-list">
        ${ingredients.map((ingredient) => `
          <div class="ingredient">
            <span class="ingredient__name">${renderRouteLink(ingredient.itemId, ingredient.name, "item") || escapeHtml(ingredient.name)}</span>
            <span class="ingredient__amount">x${ingredient.amount}</span>
          </div>
        `).join("")}
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

function collectShopSources(item) {
  const links = item.GameContentLinks || {};
  const entries = [];
  const gilShopCount = flattenLinkValues(links.GilShopItem).length;
  const specialShopCount = flattenLinkValues(links.SpecialShop).length;
  const companyCount = flattenLinkValues(links.CompanyCraftSupplyItem).length;

  if (gilShopCount > 0) {
    entries.push({
      title: "普通商店来源",
      description: `检测到 ${gilShopCount} 条普通商店关联记录。该物品可通过 NPC 商店购买，目前已在软件内归类展示。`,
      lines: [
        { label: "来源类型", value: "普通商店" },
        { label: "关联记录", value: `${gilShopCount} 条` },
      ],
      query: `${item.Name || item.Name_en} 商店 NPC`,
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
      query: `${item.Name || item.Name_en} 特殊商店`,
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
      query: `${item.Name || item.Name_en} 部队工房`,
    });
  }

  return entries;
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

function renderPriceTable() {
  if (!state.currentWorldRows.length) {
    dom.priceTableBody.innerHTML = `<tr><td colspan="7" class="table-empty">当前页面没有价格数据</td></tr>`;
    return;
  }

  const keyword = dom.worldFilter.value.trim().toLowerCase();
  const rows = state.currentWorldRows.filter((row) => {
    const matchesRegion = state.selectedRegion === "全部" || row.region === state.selectedRegion;
    const haystack = `${row.region} ${row.dataCenter} ${row.worldName}`.toLowerCase();
    return matchesRegion && (!keyword || haystack.includes(keyword));
  });

  if (!rows.length) {
    dom.priceTableBody.innerHTML = `<tr><td colspan="7" class="table-empty">没有符合当前筛选条件的数据</td></tr>`;
    return;
  }

  dom.priceTableBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.region)}</td>
      <td>${escapeHtml(row.dataCenter)}</td>
      <td>${escapeHtml(row.worldName)}</td>
      <td><span class="price-value ${row.minPrice == null ? "is-missing" : ""}">${row.minPrice == null ? "暂无上架" : formatPrice(row.minPrice)}</span></td>
      <td>${formatNumber(row.listingCount)}</td>
      <td>${formatNumber(row.unitsForSale)}</td>
      <td>${formatTime(row.lastUploadTime)}</td>
    </tr>
  `).join("");
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

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`请求失败 ${response.status}: ${url}`);
  }
  return response.json();
}

function renderRouteLink(id, name, type) {
  if (!id || !name) {
    return "";
  }
  return `<a class="route-link" href="?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}">${escapeHtml(name)}</a>`;
}

function renderExternalButton(url, label) {
  return `<a class="link-button" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
}

function buildWikiSearchUrl(name) {
  return `https://ff14.huijiwiki.com/index.php?search=${encodeURIComponent(name || "")}`;
}

function toIconUrl(iconPath) {
  if (!iconPath) {
    return "";
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
  const normalized = String(path).replace(/^ui\/icon\//, "").replace(/\.tex$/i, ".png");
  return `https://xivapi.com/i/${normalized}`;
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
  const aliasMeta = item?.ID ? state.resolvedAliases.get(Number(item.ID)) : null;
  return aliasMeta?.preferredName || item?.Name || item?.Name_en || "";
}

function openWikiSearch(query) {
  const text = String(query || "").trim();
  if (!text) {
    return;
  }

  const target = /^https?:\/\//i.test(text) ? text : buildWikiSearchUrl(text);
  window.open(target, "_blank", "noopener,noreferrer");
}

const ITEM_MAPPING_URL = "./data/item_mapping.min.json";

async function loadItemMapping() {
  try {
    const payload = await fetchJson(ITEM_MAPPING_URL);
    const entries = Array.isArray(payload?.entries) ? payload.entries : (Array.isArray(payload?.Entries) ? payload.Entries : []);
    state.itemMappingEntries = entries.map(normalizeMappingEntry).filter(Boolean);
    state.itemMappingExact = new Map();

    for (const entry of state.itemMappingEntries) {
      const { itemId, zhName, enName, zhDescription, iconPath } = entry;
      const alias = {
        itemId: Number(itemId),
        name: String(zhName || ""),
        englishName: String(enName || ""),
        icon: iconPath ? `https://xivapi.com/i/${iconPath}` : "",
        fast: true,
        description: String(zhDescription || "该结果通过本地客户端双语映射表解析得到。"),
      };

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
  renderRegionFilters(["全部"]);
  bindEvents();
  renderSearchHistory();

  try {
    setBootStatus("正在载入双语映射与区服数据");
    await loadItemMapping();
    await loadMarketMetadata();
    renderRegionFilters(["全部", ...new Set(state.dataCenters.map((entry) => entry.region))]);
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
      icon: iconPath ? `https://xivapi.com/i/${iconPath}` : "",
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
    dataCenter: dataCenter.name,
    minPrice: null,
    listingCount: 0,
    unitsForSale: 0,
    qualityStats: finalizeQualityStats(createEmptyQualityStats()),
    lastUploadTime: null,
  };
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

  const rowsWithPrice = worldRows
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
  const regionsCovered = new Set(worldRows.map((row) => row.region)).size;
  const listedWorlds = rowsWithPrice.length;
  const totalListings = rowsWithPrice.reduce((sum, row) => sum + getSelectedQualityStat(row).listingCount, 0);
  const totalUnits = rowsWithPrice.reduce((sum, row) => sum + getSelectedQualityStat(row).unitsForSale, 0);
  const regionSummary = summarizeRegions(worldRows);
  const qualityOptions = getQualityOptions(item);
  const modeLabel = getMarketModeLabel();

  const markup = `
    <div class="market-quality-row">
      ${qualityOptions.map((entry) => `
        <button type="button" class="region-filter${getActiveMarketQuality() === entry.key ? " is-active" : ""}" data-market-quality="${entry.key}">${entry.label}</button>
      `).join("")}
    </div>
    <div class="market-overview-grid">
      <div class="metric-card">
        <div class="metric-card__label">${escapeHtml(modeLabel)} 全服最低价</div>
        <div class="metric-card__value">${cheapest ? formatPrice(getSelectedQualityStat(cheapest).minPrice) : "暂无上架"}</div>
        <div class="metric-card__detail">${cheapest ? `${escapeHtml(cheapest.region)} / ${escapeHtml(cheapest.dataCenter)} / ${escapeHtml(cheapest.worldName)}` : `当前没有读取到该物品 ${escapeHtml(modeLabel)} 品质的市场板上架。`}</div>
      </div>
      <div class="metric-card">
        <div class="metric-card__label">已覆盖世界服</div>
        <div class="metric-card__value">${listedWorlds} / ${worldRows.length}</div>
        <div class="metric-card__detail">发现价格的国服世界服 ${listedWorlds} 个，覆盖 1 个国服大区。</div>
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

  dom.marketOverview.innerHTML = wrapCard("市场总览", `${getPreferredItemName(item) || item.Name_en} ${modeLabel} 全区服价格`, markup);
}

function renderPriceTable() {
  if (!state.currentWorldRows.length) {
    dom.priceTableBody.innerHTML = `<tr><td colspan="7" class="table-empty">当前页面没有价格数据</td></tr>`;
    return;
  }

  const keyword = dom.worldFilter.value.trim().toLowerCase();
  const rows = state.currentWorldRows.filter((row) => {
    const matchesRegion = state.selectedRegion === "全部" || row.region === state.selectedRegion;
    const haystack = `${row.region} ${row.dataCenter} ${row.worldName}`.toLowerCase();
    return matchesRegion && (!keyword || haystack.includes(keyword));
  });

  if (!rows.length) {
    dom.priceTableBody.innerHTML = `<tr><td colspan="7" class="table-empty">没有符合当前筛选条件的数据</td></tr>`;
    return;
  }

  dom.priceTableBody.innerHTML = rows.map((row) => {
    const stat = getSelectedQualityStat(row);
    return `
      <tr>
        <td>${escapeHtml(row.region)}</td>
        <td>${escapeHtml(row.dataCenter)}</td>
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

function renderPriceTable() {
  if (!state.currentWorldRows.length) {
    dom.priceTableBody.innerHTML = `<tr><td colspan="7" class="table-empty">褰撳墠椤甸潰娌℃湁浠锋牸鏁版嵁</td></tr>`;
    return;
  }

  const keyword = dom.worldFilter.value.trim().toLowerCase();
  const rows = state.currentWorldRows
    .filter((row) => {
      const matchesRegion = state.selectedRegion === "鍏ㄩ儴" || row.region === state.selectedRegion;
      const haystack = `${row.region} ${row.dataCenter} ${row.worldName}`.toLowerCase();
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
    dom.priceTableBody.innerHTML = `<tr><td colspan="7" class="table-empty">娌℃湁绗﹀悎褰撳墠绛涢€夋潯浠剁殑鏁版嵁</td></tr>`;
    return;
  }

  dom.priceTableBody.innerHTML = rows.map((row) => {
    const stat = getSelectedQualityStat(row);
    return `
      <tr>
        <td>${escapeHtml(row.region)}</td>
        <td>${escapeHtml(row.dataCenter)}</td>
        <td>${escapeHtml(row.worldName)}</td>
        <td><span class="price-value ${stat.minPrice == null ? "is-missing" : ""}">${stat.minPrice == null ? "鏆傛棤涓婃灦" : formatPrice(stat.minPrice)}</span></td>
        <td>${formatNumber(stat.listingCount)}</td>
        <td>${formatNumber(stat.unitsForSale)}</td>
        <td>${formatTime(row.lastUploadTime)}</td>
      </tr>
    `;
  }).join("");
}
