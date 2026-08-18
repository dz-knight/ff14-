(function attachPartyFinder(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.FF14PartyFinder = api;
  }
  if (typeof document !== "undefined" && !(typeof module === "object" && module.exports)) {
    const tryInit = () => {
      try {
        api.init();
      } catch (error) {
        if (typeof console !== "undefined" && console.error) {
          console.error("party-finder init failed:", error);
        }
      }
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", tryInit);
    } else {
      tryInit();
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : null, function createPartyFinder() {
  "use strict";

  const API_BASE = "https://xivpf.littlenightmare.top";
  const API_PAGE_SIZE = 100;
  const DISPLAY_PAGE_SIZE = 20;
  const REQUEST_TIMEOUT_MS = 45000;
  const AUTO_REFRESH_MS = 60000;
  const PAGE_BATCH_SIZE = 5;
  const MAX_API_PAGES = 100;
  const MAX_API_LISTINGS = API_PAGE_SIZE * MAX_API_PAGES;
  const MAX_SEARCH_LENGTH = 200;
  const MAX_NAME_LENGTH = 200;
  const MAX_DESCRIPTION_LENGTH = 4000;

  const CATEGORY_OPTIONS = [
    { value: "DutyRoulette", zh: "随机任务" },
    { value: "Dungeons", zh: "迷宫挑战" },
    { value: "Guildhests", zh: "行会令" },
    { value: "Trials", zh: "讨伐歼灭战" },
    { value: "Raids", zh: "大型任务" },
    { value: "HighEndDuty", zh: "高难度任务" },
    { value: "Pvp", zh: "玩家对战" },
    { value: "GoldSaucer", zh: "金碟游乐场" },
    { value: "Fates", zh: "危命任务" },
    { value: "TreasureHunt", zh: "寻宝" },
    { value: "TheHunt", zh: "怪物狩猎" },
    { value: "GatheringForays", zh: "采集活动" },
    { value: "DeepDungeons", zh: "深层迷宫" },
    { value: "FieldOperations", zh: "特殊场景探索" },
    { value: "V&C Dungeon Finder", zh: "特殊迷宫探索" },
    { value: "None", zh: "无分类" },
  ];

  const CATEGORY_NAMES = Object.assign(
    Object.fromEntries(CATEGORY_OPTIONS.map((option) => [option.value, option.zh])),
    {
      AdventuringForays: "特殊场景探索",
      VariantAndCriterionDungeonFinder: "特殊迷宫探索",
    }
  );

  const DATACENTER_OPTIONS = [
    { key: "陆行鸟", variants: ["陆行鸟", "陸行鳥"] },
    { key: "猫小胖", variants: ["猫小胖", "貓小胖"] },
    { key: "莫古力", variants: ["莫古力"] },
    { key: "豆豆柴", variants: ["豆豆柴"] },
  ];

  const JOB_NAMES = {
    GLA: "剑术师", PGL: "格斗家", MRD: "斧术师", LNC: "枪术师", ARC: "弓箭手",
    CNJ: "幻术师", THM: "咒术师", ACN: "秘术师", ROG: "双剑师",
    PLD: "骑士", MNK: "武僧", WAR: "战士", DRG: "龙骑士", BRD: "吟游诗人",
    WHM: "白魔法师", BLM: "黑魔法师", SMN: "召唤师", SCH: "学者", NIN: "忍者",
    MCH: "机工士", DRK: "暗黑骑士", AST: "占星术士", SAM: "武士", RDM: "赤魔法师",
    BLU: "青魔法师", GNB: "绝枪战士", DNC: "舞者", RPR: "钐镰客", SGE: "贤者",
    VPR: "蝰蛇剑士", PCT: "绘灵法师", BST: "魔兽使",
    CRP: "木匠", BSM: "锻铁匠", ARM: "铸甲匠", GSM: "雕金匠", LTW: "制革匠",
    WVR: "裁衣匠", ALC: "炼金术师", CUL: "烹调师", MIN: "采矿工", BTN: "园艺工",
    FSH: "捕鱼人",
  };

  const ROLE_NAMES = { Tank: "坦克", Healer: "治疗", DPS: "输出" };
  const JOB_ROLES = {
    GLA: "Tank", MRD: "Tank", PLD: "Tank", WAR: "Tank", DRK: "Tank", GNB: "Tank",
    CNJ: "Healer", WHM: "Healer", SCH: "Healer", AST: "Healer", SGE: "Healer",
    PGL: "DPS", LNC: "DPS", ARC: "DPS", THM: "DPS", ACN: "DPS", ROG: "DPS",
    MNK: "DPS", DRG: "DPS", BRD: "DPS", BLM: "DPS", SMN: "DPS", NIN: "DPS",
    MCH: "DPS", SAM: "DPS", RDM: "DPS", BLU: "DPS", DNC: "DPS", RPR: "DPS",
    VPR: "DPS", PCT: "DPS", BST: "DPS",
  };
  const DETAIL_LABELS = {
    objective: {
      NONE: "无特别目的",
      DUTY_COMPLETION: "完成任务",
      PRACTICE: "练习",
      LOOT: "获取战利品",
      "0x8": "其他目的",
    },
    conditions: {
      NONE: "无",
      DUTY_COMPLETE: "已完成任务",
      DUTY_INCOMPLETE: "未完成任务",
      DUTY_COMPLETE_WEEKLY_REWARD_UNCLAIMED: "已完成且本周奖励未领取",
    },
    lootRules: {
      NONE: "无",
      GREED_ONLY: "仅限贪婪",
      LOOTMASTER: "队长分配",
    },
    dutyType: {
      Other: "其他",
      Roulette: "随机任务",
      Normal: "普通",
    },
  };
  const DETAIL_FALLBACKS = {
    objective: "其他目的",
    conditions: "其他条件",
    lootRules: "其他规则",
    dutyType: "其他类型",
  };

  function categoryLabel(value) {
    const raw = String(value || "").trim();
    return raw ? (CATEGORY_NAMES[raw] || "其他分类") : "";
  }

  function detailLabel(kind, value) {
    const raw = cleanText(value, 200);
    if (!raw) return "";
    const labels = DETAIL_LABELS[kind] || {};
    if (labels[raw]) return labels[raw];
    const parts = raw.split(/\s*\|\s*/).filter(Boolean);
    if (parts.length > 1 && parts.every((part) => labels[part])) {
      return parts.map((part) => labels[part]).join(" / ");
    }
    return DETAIL_FALLBACKS[kind] || "其他";
  }

  function normalizeDatacenter(value) {
    const raw = String(value || "").trim();
    for (const datacenter of DATACENTER_OPTIONS) {
      if (datacenter.variants.includes(raw)) return datacenter.key;
    }
    return raw;
  }

  function datacenterVariants(key) {
    if (!key) return [];
    const found = DATACENTER_OPTIONS.find((datacenter) => datacenter.key === key);
    return found ? found.variants.slice() : [String(key)];
  }

  function buildListUrl(params) {
    const query = new URLSearchParams();
    const requestedPage = Math.min(MAX_API_PAGES, Math.max(1, Number(params?.page) || 1));
    const requestedPageSize = Math.min(API_PAGE_SIZE, Math.max(1, Number(params?.perPage) || API_PAGE_SIZE));
    query.set("page", String(Math.trunc(requestedPage)));
    query.set("per_page", String(Math.trunc(requestedPageSize)));
    if (params && params.category) query.set("category", String(params.category));
    if (params && params.datacenter) query.set("datacenter", String(params.datacenter));
    if (params && params.search) query.set("search", String(params.search).slice(0, MAX_SEARCH_LENGTH));
    return `${API_BASE}/api/listings?${query.toString()}`;
  }

  function buildDetailUrl(id) {
    return `${API_BASE}/api/listing/${encodeURIComponent(id)}`;
  }

  function isCnWorldId(worldId) {
    const id = Number(worldId);
    return Number.isFinite(id) && id >= 1000 && id <= 1999;
  }

  function cleanText(value, maxLength) {
    return String(value === null || value === undefined ? "" : value)
      .trim()
      .slice(0, maxLength);
  }

  function normalizeListing(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = Number(raw.id);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    const world = cleanText(raw.created_world, 100);
    const homeWorld = cleanText(raw.home_world, 100);
    const category = cleanText(raw.category, 100);
    return {
      id,
      name: cleanText(raw.name || "匿名", MAX_NAME_LENGTH),
      description: cleanText(raw.description, MAX_DESCRIPTION_LENGTH),
      datacenter: normalizeDatacenter(cleanText(raw.datacenter, 100)),
      world,
      homeWorld: homeWorld && homeWorld !== world ? homeWorld : "",
      createdWorldId: Number(raw.created_world_id) || 0,
      category,
      categoryZh: categoryLabel(category),
      duty: cleanText(raw.duty, 300),
      minItemLevel: Number(raw.min_item_level) || 0,
      slotsFilled: Number(raw.slots_filled) || 0,
      slotsAvailable: Number(raw.slots_available) || 0,
      timeLeftSeconds: Number(raw.time_left) || 0,
      updatedAt: String(raw.updated_at || ""),
      isCrossWorld: Boolean(raw.is_cross_world),
    };
  }

  function collectListings(rawItems) {
    const byId = new Map();
    for (const raw of Array.isArray(rawItems) ? rawItems : []) {
      const listing = normalizeListing(raw);
      if (!listing || !isCnWorldId(listing.createdWorldId)) continue;
      const key = String(listing.id);
      const previous = byId.get(key);
      if (!previous || String(listing.updatedAt).localeCompare(String(previous.updatedAt)) > 0) {
        byId.set(key, listing);
      }
    }
    return Array.from(byId.values())
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  }

  function mergeRefreshListings(previousItems, freshItems, replacePrevious) {
    const fresh = Array.isArray(freshItems) ? freshItems : [];
    if (replacePrevious || !Array.isArray(previousItems)) return fresh.slice();
    const byId = new Map();
    for (const listing of fresh) {
      if (listing && listing.id !== null && listing.id !== undefined) {
        byId.set(String(listing.id), listing);
      }
    }
    for (const listing of previousItems) {
      if (listing && listing.id !== null && listing.id !== undefined && !byId.has(String(listing.id))) {
        byId.set(String(listing.id), listing);
      }
    }
    return Array.from(byId.values())
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  }

  function selectRefreshPage(requestedPage, currentPage, hasCommittedProgress, preserveCurrent) {
    return preserveCurrent || hasCommittedProgress ? currentPage : requestedPage;
  }

  function focusedListingPage(focusKey, items, fallbackPage, pageSize) {
    if (!focusKey || focusKey.type !== "listing" || !Array.isArray(items)) return fallbackPage;
    const index = items.findIndex((item) => item && String(item.id) === focusKey.value);
    if (index < 0) return fallbackPage;
    return Math.floor(index / Math.max(1, Number(pageSize) || DISPLAY_PAGE_SIZE)) + 1;
  }

  function shouldResumeProgressiveLoad(state) {
    return Boolean(
      state
      && state.allItems !== null
      && (state.needsReload || state.loadProgress)
    );
  }

  function captureListFocus(activeElement, listElement, paginationElement) {
    if (!activeElement) return null;
    if (listElement && listElement.contains(activeElement)) {
      const card = activeElement.closest ? activeElement.closest("[data-pf-id]") : null;
      const id = card && card.getAttribute("data-pf-id");
      if (id) return { type: "listing", value: id };
    }
    if (paginationElement && paginationElement.contains(activeElement)) {
      const button = activeElement.closest ? activeElement.closest("[data-pf-action]") : null;
      const action = button && button.getAttribute("data-pf-action");
      if (action) return { type: "pagination", value: action };
    }
    return null;
  }

  function restoreListFocus(focusKey, listElement, paginationElement, fallbackElement) {
    if (!focusKey) return false;
    const container = focusKey.type === "listing" ? listElement : paginationElement;
    const attribute = focusKey.type === "listing" ? "data-pf-id" : "data-pf-action";
    const candidates = container
      ? Array.from(container.querySelectorAll(`[${attribute}]`))
      : [];
    const target = candidates.find((element) => element.getAttribute(attribute) === focusKey.value);
    if (target && !target.disabled) {
      target.focus();
      return true;
    }
    if (fallbackElement && typeof fallbackElement.focus === "function") fallbackElement.focus();
    return false;
  }

  function runAutoRefresh(state, refresh) {
    if (!state || !state.open || state.loading || typeof refresh !== "function") return false;
    refresh(state.page, { preserveCurrent: true, silent: true, preserveScroll: true });
    return true;
  }

  function formatTimeLeft(seconds) {
    const numeric = Number(seconds);
    if (!Number.isFinite(numeric)) return "";
    const total = Math.max(0, Math.floor(numeric));
    if (total <= 0) return "已过期";
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remainingSeconds = total % 60;
    if (hours > 0) return `剩 ${hours} 小时 ${minutes} 分`;
    if (minutes > 0) return `剩 ${minutes} 分 ${remainingSeconds} 秒`;
    return `剩 ${remainingSeconds} 秒`;
  }

  function formatRelativeTime(iso, now) {
    const timestamp = Date.parse(iso);
    if (!Number.isFinite(timestamp)) return "";
    const elapsed = Math.max(0, (now || Date.now()) - timestamp);
    const seconds = Math.floor(elapsed / 1000);
    if (seconds < 10) return "刚刚";
    if (seconds < 60) return `${seconds} 秒前`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    return `${Math.floor(hours / 24)} 天前`;
  }

  function parseSlotJobList(jobText) {
    return String(jobText || "")
      .slice(0, 500)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 50)
      .map((abbr) => ({ abbr, name: JOB_NAMES[abbr] || `未知职业（${abbr}）` }));
  }

  function slotRoleLabel(slot) {
    const inferredRoles = Array.from(new Set(
      parseSlotJobList(slot && slot.job)
        .map((job) => JOB_ROLES[job.abbr])
        .filter(Boolean)
    ));
    if (inferredRoles.length >= 3) return "任意职责";
    if (inferredRoles.length > 0) {
      return inferredRoles.map((role) => ROLE_NAMES[role]).join(" / ");
    }
    const sourceRole = String(slot && slot.role ? slot.role : "").trim();
    return sourceRole ? (ROLE_NAMES[sourceRole] || "其他职责") : "";
  }

  function buildDetailFacts(raw) {
    const listing = normalizeListing(raw);
    if (!listing) return [];
    return [
      ["目的", detailLabel("objective", raw.objective)],
      ["条件", detailLabel("conditions", raw.conditions)],
      ["战利品规则", detailLabel("lootRules", raw.loot_rules)],
      ["类型", detailLabel("dutyType", raw.duty_type)],
      ["最低装等", listing.minItemLevel > 0 ? String(listing.minItemLevel) : ""],
      ["新手欢迎", raw.beginners_welcome ? "是" : "否"],
    ].filter(([, value]) => value !== "");
  }

  function createRequestCoordinator() {
    let version = 0;
    let activeController = null;
    return {
      begin() {
        version += 1;
        if (activeController) activeController.abort();
        activeController = new AbortController();
        const requestVersion = version;
        const controller = activeController;
        return {
          signal: controller.signal,
          isCurrent: () => requestVersion === version && !controller.signal.aborted,
        };
      },
      cancel() {
        version += 1;
        if (activeController) activeController.abort();
        activeController = null;
      },
    };
  }

  function isAbortError(error) {
    return Boolean(error && error.name === "AbortError");
  }

  function normalizePagination(raw) {
    if (!raw || typeof raw !== "object") return null;
    const total = Number(raw.total);
    const page = Number(raw.page);
    const perPage = Number(raw.per_page);
    const totalPages = Number(raw.total_pages);
    const isEmptyPage = total === 0 && page === 1 && totalPages === 0;
    if (
      !Number.isInteger(total) || total < 0 || total > MAX_API_LISTINGS
      || !Number.isInteger(page) || page < 1
      || !Number.isInteger(perPage) || perPage < 1 || perPage > API_PAGE_SIZE
      || !Number.isInteger(totalPages) || totalPages < 0 || totalPages > MAX_API_PAGES
      || (!isEmptyPage && (total === 0 || totalPages < 1 || page > totalPages))
    ) {
      return null;
    }
    return { total, page, perPage, totalPages };
  }

  function createApiClient(fetchImpl, options) {
    const doFetch = fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    if (!doFetch) throw new Error("party-finder needs a fetch implementation");
    const timeoutMs = Number(options && options.timeoutMs) || REQUEST_TIMEOUT_MS;

    async function getJson(url, externalSignal) {
      const controller = new AbortController();
      let timedOut = false;
      const relayAbort = () => controller.abort();
      if (externalSignal) {
        if (externalSignal.aborted) controller.abort();
        else externalSignal.addEventListener("abort", relayAbort, { once: true });
      }
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      try {
        const response = await doFetch(url, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        let body = null;
        let invalidJson = false;
        try {
          body = await response.json();
        } catch {
          invalidJson = true;
        }
        if (!response.ok) {
          const error = new Error((body && body.error) || `HTTP ${response.status}`);
          error.status = response.status;
          throw error;
        }
        if (invalidJson) {
          const error = new Error("接口返回格式无效");
          error.code = "INVALID_RESPONSE";
          throw error;
        }
        return body;
      } catch (error) {
        if (controller.signal.aborted) {
          const abortError = new Error(timedOut ? "请求超时" : "请求已取消");
          abortError.name = timedOut ? "TimeoutError" : "AbortError";
          throw abortError;
        }
        throw error;
      } finally {
        clearTimeout(timer);
        if (externalSignal) externalSignal.removeEventListener("abort", relayAbort);
      }
    }

    return {
      async fetchList(params, requestOptions) {
        const body = await getJson(buildListUrl(params), requestOptions && requestOptions.signal);
        const pagination = normalizePagination(body && body.pagination);
        const listings = Array.isArray(body?.data)
          ? body.data
          : (Array.isArray(body?.listings) ? body.listings : null);
        const requestedPage = Math.min(MAX_API_PAGES, Math.max(1, Math.trunc(Number(params?.page) || 1)));
        if (
          !body
          || typeof body !== "object"
          || !listings
          || !pagination
          || pagination.page !== requestedPage
          || listings.length > pagination.perPage
          || listings.length > pagination.total
          || (pagination.total === 0 && listings.length !== 0)
        ) {
          const error = new Error("接口返回格式无效");
          error.code = "INVALID_RESPONSE";
          throw error;
        }
        return {
          data: listings,
          pagination,
        };
      },
      async fetchDetail(id, requestOptions) {
        let body;
        try {
          body = await getJson(buildDetailUrl(id), requestOptions && requestOptions.signal);
        } catch (error) {
          if (error && (error.status === 404 || /未找到/.test(String(error.message)))) {
            error.expired = true;
          }
          throw error;
        }
        if (body && body.error) {
          const error = new Error(body.error);
          error.expired = true;
          throw error;
        }
        const detail = body?.listing && typeof body.listing === "object"
          ? body.listing
          : (body?.data && typeof body.data === "object" ? body.data : body);
        if (
          !detail
          || typeof detail !== "object"
          || Array.isArray(detail)
          || !Number.isSafeInteger(Number(detail.id))
          || Number(detail.id) <= 0
          || String(detail.id) !== String(id)
        ) {
          const error = new Error("接口返回格式无效");
          error.code = "INVALID_RESPONSE";
          throw error;
        }
        return detail;
      },
    };
  }

  async function fetchAllListings(client, filters, options) {
    const signal = options && options.signal;
    const onProgress = options && typeof options.onProgress === "function"
      ? options.onProgress
      : null;
    const datacenter = filters && filters.datacenter
      ? datacenterVariants(filters.datacenter).join(",")
      : undefined;
    const baseParams = {
      perPage: API_PAGE_SIZE,
      category: filters && filters.category ? filters.category : undefined,
      datacenter,
      search: filters && filters.search ? filters.search : undefined,
    };
    const first = await client.fetchList({ ...baseParams, page: 1 }, { signal });
    const pages = [first.data];
    const failedPages = [];

    function progress(done, settledPages) {
      return {
        items: collectListings(pages.flat()),
        failedPages: failedPages.slice(),
        expectedTotal: first.pagination.total,
        totalPages: first.pagination.totalPages,
        settledPages,
        done,
      };
    }

    const firstSettledPage = first.pagination.totalPages === 0 ? 0 : 1;
    if (onProgress) onProgress(progress(first.pagination.totalPages <= 1, firstSettledPage));

    for (let start = 2; start <= first.pagination.totalPages; start += PAGE_BATCH_SIZE) {
      const pageNumbers = [];
      for (let page = start; page < start + PAGE_BATCH_SIZE && page <= first.pagination.totalPages; page += 1) {
        pageNumbers.push(page);
      }
      const settled = await Promise.allSettled(
        pageNumbers.map((page) => client.fetchList({ ...baseParams, page }, { signal }))
      );
      if (signal && signal.aborted) {
        const error = new Error("请求已取消");
        error.name = "AbortError";
        throw error;
      }
      settled.forEach((result, index) => {
        if (result.status === "fulfilled") pages.push(result.value.data);
        else failedPages.push(pageNumbers[index]);
      });
      if (onProgress) {
        const settledPages = Math.min(first.pagination.totalPages, start + pageNumbers.length - 1);
        onProgress(progress(settledPages >= first.pagination.totalPages, settledPages));
      }
    }

    return progress(true, first.pagination.totalPages);
  }

  function esc(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function initUi(options) {
    if (typeof document === "undefined") return false;
    const doc = options && options.document ? options.document : document;
    const entryButton = doc.getElementById("pf-entry-button");
    const view = doc.getElementById("pf-view");
    if (!entryButton || !view) return false;
    if (view.dataset.pfInitialized === "true") return true;
    view.dataset.pfInitialized = "true";

    const client = (options && options.client) || createApiClient();
    const autoRefreshMs = Number(options && options.autoRefreshMs) || AUTO_REFRESH_MS;
    const listRequests = createRequestCoordinator();
    const detailRequests = createRequestCoordinator();
    const state = {
      open: false,
      page: 1,
      search: "",
      datacenter: "",
      category: "",
      allItems: null,
      failedPages: [],
      backgroundError: "",
      loadProgress: null,
      needsReload: false,
      loading: false,
      lastUpdated: 0,
      autoTimer: null,
      detailId: "",
      backgroundAriaHidden: null,
    };

    view.innerHTML = [
      '<div class="pf-window" role="dialog" aria-modal="true" aria-labelledby="pf-title">',
      '  <div class="pf-head">',
      '    <div class="pf-head__copy">',
      '      <h2 id="pf-title">国服招募查询</h2>',
      '      <p class="pf-head__meta">数据由 Remote Party Finder 国服服务实时汇总</p>',
      '    </div>',
      '    <div class="pf-head__actions">',
      '      <span class="pf-updated" id="pf-updated"></span>',
      '      <button type="button" class="pf-button pf-button--ghost" id="pf-refresh">刷新</button>',
      '      <button type="button" class="pf-button" id="pf-close">返回百科</button>',
      '    </div>',
      '  </div>',
      '  <div class="pf-filters">',
      '    <form class="pf-filters__form" id="pf-search-form">',
      `      <input id="pf-search" type="search" maxlength="${MAX_SEARCH_LENGTH}" placeholder="搜索名称或描述" autocomplete="off">`,
      '      <button type="submit" class="pf-button">搜索</button>',
      '    </form>',
      '    <select id="pf-datacenter" aria-label="大区筛选">',
      '      <option value="">全部大区</option>',
      DATACENTER_OPTIONS.map((item) => `<option value="${esc(item.key)}">${esc(item.key)}</option>`).join(""),
      '    </select>',
      '    <select id="pf-category" aria-label="分类筛选">',
      '      <option value="">全部分类</option>',
      CATEGORY_OPTIONS.map((item) => `<option value="${esc(item.value)}">${esc(item.zh)}</option>`).join(""),
      '    </select>',
      '  </div>',
      '  <div class="pf-status" id="pf-status" role="status" aria-live="polite"></div>',
      '  <div class="pf-list" id="pf-list"></div>',
      '  <div class="pf-pagination" id="pf-pagination"></div>',
      '  <div class="pf-detail hidden" id="pf-detail"></div>',
      '</div>',
    ].join("\n");

    const elements = {
      updated: doc.getElementById("pf-updated"),
      refresh: doc.getElementById("pf-refresh"),
      close: doc.getElementById("pf-close"),
      searchForm: doc.getElementById("pf-search-form"),
      search: doc.getElementById("pf-search"),
      datacenter: doc.getElementById("pf-datacenter"),
      category: doc.getElementById("pf-category"),
      status: doc.getElementById("pf-status"),
      list: doc.getElementById("pf-list"),
      pagination: doc.getElementById("pf-pagination"),
      detail: doc.getElementById("pf-detail"),
    };
    const appShell = doc.querySelector(".app-shell");
    const detailBackgroundElements = [
      doc.querySelector(".pf-head"),
      doc.querySelector(".pf-filters"),
      elements.status,
      elements.list,
      elements.pagination,
    ].filter(Boolean);

    function setStatus(message, tone) {
      elements.status.textContent = message || "";
      elements.status.className = message ? `pf-status is-${tone || "soft"}` : "pf-status";
    }

    function setLoading(loading) {
      state.loading = loading;
      elements.refresh.disabled = loading;
      view.setAttribute("aria-busy", loading ? "true" : "false");
    }

    function renderUpdated() {
      elements.updated.textContent = state.lastUpdated
        ? `更新于 ${formatRelativeTime(new Date(state.lastUpdated).toISOString())}`
        : "";
    }

    function setInert(element, inert) {
      if (!element) return;
      element.inert = inert;
      if (inert) element.setAttribute("inert", "");
      else element.removeAttribute("inert");
    }

    function setBackgroundBlocked(blocked) {
      if (!appShell) return;
      if (blocked) {
        state.backgroundAriaHidden = appShell.getAttribute("aria-hidden");
        appShell.setAttribute("aria-hidden", "true");
        setInert(appShell, true);
        return;
      }
      setInert(appShell, false);
      if (state.backgroundAriaHidden === null) appShell.removeAttribute("aria-hidden");
      else appShell.setAttribute("aria-hidden", state.backgroundAriaHidden);
      state.backgroundAriaHidden = null;
    }

    function setDetailMode(active) {
      for (const element of detailBackgroundElements) {
        setInert(element, active);
        if (active) element.setAttribute("aria-hidden", "true");
        else element.removeAttribute("aria-hidden");
      }
    }

    function renderListStatus() {
      const total = state.allItems ? state.allItems.length : 0;
      const totalPages = Math.max(1, Math.ceil(total / DISPLAY_PAGE_SIZE));
      if (state.backgroundError) {
        setStatus(`共 ${total} 条招募；刷新失败：${state.backgroundError}。已保留现有数据。`, "warning");
      } else if (state.loadProgress) {
        setStatus(
          `已显示 ${total} 条招募；已加载接口第 ${state.loadProgress.settledPages} / ${state.loadProgress.totalPages} 页，剩余页面正在后台补充…`,
          "soft"
        );
      } else if (state.failedPages.length > 0) {
        setStatus(`已加载 ${total} 条；接口第 ${state.failedPages.join("、")} 页失败，请刷新重试。`, "warning");
      } else if (total === 0) {
        setStatus("没有符合条件的招募。", "soft");
      } else {
        setStatus(`共 ${total} 条招募，第 ${state.page} / ${totalPages} 页`, "soft");
      }
    }

    function cancelDetail(cancelOptions) {
      const restoreStatus = !cancelOptions || cancelOptions.restoreStatus !== false;
      const restoreFocus = !cancelOptions || cancelOptions.restoreFocus !== false;
      const detailId = state.detailId;
      detailRequests.cancel();
      elements.detail.classList.add("hidden");
      setDetailMode(false);
      state.detailId = "";
      if (restoreStatus && state.allItems !== null) renderListStatus();
      if (restoreFocus && state.open) {
        const card = Array.from(elements.list.querySelectorAll("[data-pf-id]"))
          .find((item) => item.getAttribute("data-pf-id") === detailId);
        if (card) card.focus();
        else elements.search.focus();
      }
    }

    function invalidateList() {
      listRequests.cancel();
      state.allItems = null;
      state.failedPages = [];
      state.backgroundError = "";
      state.loadProgress = null;
      state.needsReload = false;
      elements.list.innerHTML = "";
      elements.pagination.innerHTML = "";
      cancelDetail({ restoreStatus: false, restoreFocus: false });
    }

    function listingCardHtml(listing) {
      const badges = [
        listing.categoryZh ? `<span class="pf-badge">${esc(listing.categoryZh)}</span>` : "",
        `<span class="pf-badge">${esc(listing.datacenter || "未知大区")}</span>`,
        listing.world ? `<span class="pf-badge">${esc(listing.world)}</span>` : "",
        listing.homeWorld ? `<span class="pf-badge pf-badge--soft">主世界 ${esc(listing.homeWorld)}</span>` : "",
        listing.isCrossWorld ? '<span class="pf-badge pf-badge--soft">跨服</span>' : "",
      ].filter(Boolean).join("");
      return [
        `<button type="button" class="pf-card" data-pf-id="${esc(listing.id)}">`,
        '  <span class="pf-card__top">',
        `    <strong class="pf-card__name">${esc(listing.name)}</strong>`,
        `    <span class="pf-card__count">${listing.slotsFilled}/${listing.slotsAvailable}</span>`,
        '  </span>',
        `  <span class="pf-card__duty">${esc(listing.duty || listing.categoryZh || "无任务")}</span>`,
        `  <span class="pf-card__desc">${esc(listing.description || "（无描述）")}</span>`,
        '  <span class="pf-card__meta">',
        `    <span class="pf-card__badges">${badges}</span>`,
        `    <span class="pf-card__time${listing.timeLeftSeconds > 0 && listing.timeLeftSeconds < 300 ? " is-urgent" : ""}">${esc(formatTimeLeft(listing.timeLeftSeconds))} · ${esc(formatRelativeTime(listing.updatedAt))}</span>`,
        '  </span>',
        '</button>',
      ].join("\n");
    }

    function renderPagination(total, totalPages) {
      if (totalPages <= 1) {
        elements.pagination.innerHTML = total > 0 ? `<span class="pf-pagination__info">共 ${total} 条</span>` : "";
        return;
      }
      const previous = Math.max(1, state.page - 1);
      const next = Math.min(totalPages, state.page + 1);
      elements.pagination.innerHTML = [
        `<button type="button" class="pf-button pf-button--small pf-button--ghost" data-pf-action="previous" data-pf-page="${previous}" ${state.page === 1 ? "disabled" : ""}>上一页</button>`,
        `<span class="pf-pagination__info">第 ${state.page} / ${totalPages} 页 · 共 ${total} 条</span>`,
        `<button type="button" class="pf-button pf-button--small pf-button--ghost" data-pf-action="next" data-pf-page="${next}" ${state.page === totalPages ? "disabled" : ""}>下一页</button>`,
      ].join("");
    }

    function renderCurrentPage(page, renderOptions) {
      const focusKey = captureListFocus(doc.activeElement, elements.list, elements.pagination);
      const scrollTop = renderOptions && renderOptions.preserveScroll
        ? elements.list.scrollTop
        : 0;
      const total = state.allItems ? state.allItems.length : 0;
      const totalPages = Math.max(1, Math.ceil(total / DISPLAY_PAGE_SIZE));
      const focusPage = focusedListingPage(focusKey, state.allItems, page, DISPLAY_PAGE_SIZE);
      state.page = Math.min(Math.max(1, Number(focusPage) || 1), totalPages);
      const start = (state.page - 1) * DISPLAY_PAGE_SIZE;
      const items = state.allItems ? state.allItems.slice(start, start + DISPLAY_PAGE_SIZE) : [];
      elements.list.innerHTML = items.map(listingCardHtml).join("");
      if (renderOptions && renderOptions.preserveScroll) elements.list.scrollTop = scrollTop;
      renderPagination(total, totalPages);
      renderUpdated();
      renderListStatus();
      restoreListFocus(focusKey, elements.list, elements.pagination, elements.search);
    }

    async function loadPage(page, loadOptions) {
      const force = Boolean(loadOptions && loadOptions.force);
      const preserveCurrent = Boolean(loadOptions && loadOptions.preserveCurrent);
      const silent = Boolean(loadOptions && loadOptions.silent);
      if (state.allItems !== null && !force) {
        renderCurrentPage(page);
        return;
      }
      const previousItems = state.allItems;
      const previousFailedPages = state.failedPages.slice();
      const requestedPage = Math.max(1, Number(page) || 1);
      let hasCommittedProgress = false;
      const request = listRequests.begin();
      const filters = {
        search: state.search,
        datacenter: state.datacenter,
        category: state.category,
      };
      setLoading(true);
      if (!silent) setStatus("正在加载招募数据…", "soft");

      function commitProgress(progress) {
        if (!request.isCurrent()) return;
        const replacePrevious = progress.done && progress.failedPages.length === 0;
        state.allItems = preserveCurrent
          ? mergeRefreshListings(previousItems, progress.items, replacePrevious)
          : progress.items;
        state.failedPages = progress.failedPages.slice();
        state.backgroundError = "";
        state.loadProgress = progress.done
          ? null
          : {
            settledPages: progress.settledPages,
            totalPages: progress.totalPages,
          };
        if (progress.done) {
          state.needsReload = false;
          state.lastUpdated = Date.now();
        }
        const renderPage = selectRefreshPage(
          requestedPage,
          state.page,
          hasCommittedProgress,
          preserveCurrent
        );
        hasCommittedProgress = true;
        renderCurrentPage(renderPage, {
          preserveScroll: Boolean(loadOptions && loadOptions.preserveScroll),
        });
      }

      try {
        const result = await fetchAllListings(client, filters, {
          signal: request.signal,
          onProgress: commitProgress,
        });
        if (!request.isCurrent()) return;
        if (!hasCommittedProgress) commitProgress(result);
      } catch (error) {
        if (!request.isCurrent() || isAbortError(error)) return;
        const message = error && error.message ? error.message : "网络错误";
        state.loadProgress = null;
        if (preserveCurrent && previousItems !== null) {
          state.allItems = previousItems;
          state.failedPages = previousFailedPages;
          state.backgroundError = message;
          renderUpdated();
          renderListStatus();
        } else {
          state.allItems = null;
          setStatus(`加载失败：${message}`, "danger");
        }
      } finally {
        if (request.isCurrent()) setLoading(false);
      }
    }

    function slotHtml(slot) {
      const jobs = parseSlotJobList(slot && slot.job);
      const role = slotRoleLabel(slot);
      const jobText = role === "任意职责" && jobs.length > 12
        ? "任意战斗职业"
        : (jobs.map((job) => job.name).join(" / ") || "自由职业");
      return [
        `<div class="pf-slot ${slot && slot.filled ? "is-filled" : "is-free"}">`,
        `  <span class="pf-slot__state">${slot && slot.filled ? "满" : "空"}</span>`,
        `  <span class="pf-slot__jobs" title="${esc(jobs.map((job) => job.abbr).join(" "))}">${esc(jobText)}</span>`,
        `  <span class="pf-slot__role">${esc(role)}</span>`,
        '</div>',
      ].join("\n");
    }

    function renderDetail(raw) {
      const listing = normalizeListing(raw);
      if (!listing) throw new Error("招募详情格式无效");
      const facts = buildDetailFacts(raw);
      const slots = Array.isArray(raw.slots) ? raw.slots.slice(0, 64) : [];
      elements.detail.innerHTML = [
        '<div class="pf-detail__panel">',
        '  <div class="pf-detail__head">',
        '    <div>',
        `      <h3>${esc(listing.name)}</h3>`,
        `      <p class="pf-detail__sub">${esc(listing.duty || listing.categoryZh || "无任务")} · ${esc(listing.datacenter)} ${esc(listing.world)}</p>`,
        '    </div>',
        '    <button type="button" class="pf-button" id="pf-detail-close">返回列表</button>',
        '  </div>',
        `  <div class="pf-detail__desc">${esc(listing.description || "（无描述）")}</div>`,
        '  <dl class="pf-detail__facts">',
        facts.map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join(""),
        '  </dl>',
        `  <div class="pf-detail__slots">${slots.map(slotHtml).join("")}</div>`,
        `  <p class="pf-detail__foot">${esc(formatTimeLeft(listing.timeLeftSeconds))} · 更新于 ${esc(formatRelativeTime(listing.updatedAt))}</p>`,
        '</div>',
      ].join("\n");
      elements.detail.classList.remove("hidden");
      const closeButton = doc.getElementById("pf-detail-close");
      if (closeButton) {
        closeButton.addEventListener("click", cancelDetail);
        closeButton.focus();
      }
      setDetailMode(true);
    }

    async function openDetail(id) {
      const request = detailRequests.begin();
      state.detailId = String(id);
      setStatus("正在加载招募详情…", "soft");
      try {
        const raw = await client.fetchDetail(id, { signal: request.signal });
        if (!request.isCurrent()) return;
        renderDetail(raw);
        setStatus("");
      } catch (error) {
        if (!request.isCurrent() || isAbortError(error)) return;
        setStatus(
          error && error.expired
            ? "该招募已结束或被刷新，请返回列表查看最新数据。"
            : `详情加载失败：${error && error.message ? error.message : "网络错误"}`,
          "danger"
        );
      }
    }

    function refresh(page, refreshOptions) {
      const preserveCurrent = Boolean(refreshOptions && refreshOptions.preserveCurrent);
      if (!preserveCurrent) invalidateList();
      return loadPage(page || 1, {
        force: preserveCurrent,
        preserveCurrent,
        silent: Boolean(refreshOptions && refreshOptions.silent),
        preserveScroll: Boolean(refreshOptions && refreshOptions.preserveScroll),
      });
    }

    function trapFocus(event) {
      const scope = elements.detail.classList.contains("hidden")
        ? view.querySelector(".pf-window")
        : elements.detail;
      if (!scope) return;
      const focusable = Array.from(scope.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((element) => !element.closest(".hidden") && !element.closest("[inert]"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = doc.activeElement;
      if (event.shiftKey && (active === first || !scope.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !scope.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    function open() {
      if (state.open) return;
      state.open = true;
      view.classList.remove("hidden");
      view.setAttribute("aria-hidden", "false");
      if (doc.body) doc.body.classList.add("pf-is-open");
      elements.search.focus();
      setBackgroundBlocked(true);
      if (state.allItems === null) void loadPage(1);
      else {
        const resumeInterruptedLoad = state.needsReload;
        renderCurrentPage(state.page);
        if (resumeInterruptedLoad) {
          void refresh(state.page, { preserveCurrent: true, preserveScroll: true });
        }
      }
      if (state.autoTimer) clearInterval(state.autoTimer);
      state.autoTimer = setInterval(() => {
        runAutoRefresh(state, refresh);
      }, autoRefreshMs);
    }

    function close() {
      state.open = false;
      view.classList.add("hidden");
      view.setAttribute("aria-hidden", "true");
      state.needsReload = shouldResumeProgressiveLoad(state);
      state.loadProgress = null;
      listRequests.cancel();
      cancelDetail({ restoreStatus: false, restoreFocus: false });
      setLoading(false);
      if (doc.body) doc.body.classList.remove("pf-is-open");
      setBackgroundBlocked(false);
      if (state.autoTimer) {
        clearInterval(state.autoTimer);
        state.autoTimer = null;
      }
      entryButton.focus();
    }

    entryButton.addEventListener("click", open);
    elements.close.addEventListener("click", close);
    elements.refresh.addEventListener("click", () => {
      void refresh(state.page, { preserveCurrent: true, preserveScroll: true });
    });
    elements.searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      state.search = elements.search.value.trim().slice(0, MAX_SEARCH_LENGTH);
      void refresh(1);
    });
    elements.datacenter.addEventListener("change", () => {
      state.datacenter = elements.datacenter.value;
      void refresh(1);
    });
    elements.category.addEventListener("change", () => {
      state.category = elements.category.value;
      void refresh(1);
    });
    elements.pagination.addEventListener("click", (event) => {
      const target = event.target && event.target.closest
        ? event.target.closest("[data-pf-page]")
        : null;
      if (!target || target.disabled) return;
      renderCurrentPage(Number(target.getAttribute("data-pf-page")) || 1);
    });
    elements.list.addEventListener("click", (event) => {
      const card = event.target && event.target.closest
        ? event.target.closest("[data-pf-id]")
        : null;
      if (card) void openDetail(card.getAttribute("data-pf-id"));
    });
    view.addEventListener("mousedown", (event) => {
      if (event.target === view) close();
    });
    doc.addEventListener("keydown", (event) => {
      if (!state.open) return;
      if (event.key === "Tab") {
        trapFocus(event);
        return;
      }
      if (event.key === "Escape") {
        if (!elements.detail.classList.contains("hidden")) cancelDetail();
        else close();
      }
    });

    return true;
  }

  return {
    API_BASE,
    CATEGORY_OPTIONS,
    DATACENTER_OPTIONS,
    JOB_NAMES,
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
    init: initUi,
  };
});
