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
  const REQUEST_TIMEOUT_MS = 10000;
  const AUTO_REFRESH_MS = 60000;
  const PAGE_BATCH_SIZE = 5;

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
    const raw = String(value === null || value === undefined ? "" : value).trim();
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
    query.set("page", String(params && params.page ? params.page : 1));
    query.set("per_page", String(params && params.perPage ? params.perPage : API_PAGE_SIZE));
    if (params && params.category) query.set("category", String(params.category));
    if (params && params.datacenter) query.set("datacenter", String(params.datacenter));
    if (params && params.search) query.set("search", String(params.search));
    return `${API_BASE}/api/listings?${query.toString()}`;
  }

  function buildDetailUrl(id) {
    return `${API_BASE}/api/listing/${encodeURIComponent(id)}`;
  }

  function isCnWorldId(worldId) {
    const id = Number(worldId);
    return Number.isFinite(id) && id >= 1000 && id <= 1999;
  }

  function normalizeListing(raw) {
    if (!raw || typeof raw !== "object" || raw.id === null || raw.id === undefined) return null;
    const world = String(raw.created_world || "");
    const homeWorld = String(raw.home_world || "");
    const category = String(raw.category || "");
    return {
      id: raw.id,
      name: String(raw.name || "匿名"),
      description: String(raw.description || ""),
      datacenter: normalizeDatacenter(raw.datacenter),
      world,
      homeWorld: homeWorld && homeWorld !== world ? homeWorld : "",
      createdWorldId: Number(raw.created_world_id) || 0,
      category,
      categoryZh: categoryLabel(category),
      duty: String(raw.duty || ""),
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
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((abbr) => ({ abbr, name: JOB_NAMES[abbr] || `未知职业（${abbr}）` }));
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
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          const error = new Error((body && body.error) || `HTTP ${response.status}`);
          error.status = response.status;
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
        return {
          data: Array.isArray(body && body.data) ? body.data : [],
          pagination: body && body.pagination
            ? {
              total: Number(body.pagination.total) || 0,
              page: Number(body.pagination.page) || 1,
              perPage: Number(body.pagination.per_page) || API_PAGE_SIZE,
              totalPages: Math.max(1, Number(body.pagination.total_pages) || 1),
            }
            : { total: 0, page: 1, perPage: API_PAGE_SIZE, totalPages: 1 },
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
        return body;
      },
    };
  }

  async function fetchAllListings(client, filters, options) {
    const signal = options && options.signal;
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
    }

    return {
      items: collectListings(pages.flat()),
      failedPages,
      expectedTotal: first.pagination.total,
      totalPages: first.pagination.totalPages,
    };
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
      loading: false,
      lastUpdated: 0,
      autoTimer: null,
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
      '      <input id="pf-search" type="search" placeholder="搜索名称或描述" autocomplete="off">',
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

    function cancelDetail() {
      detailRequests.cancel();
      elements.detail.classList.add("hidden");
    }

    function invalidateList() {
      listRequests.cancel();
      state.allItems = null;
      state.failedPages = [];
      elements.list.innerHTML = "";
      elements.pagination.innerHTML = "";
      cancelDetail();
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
        `<button type="button" class="pf-button pf-button--small pf-button--ghost" data-pf-page="${previous}" ${state.page === 1 ? "disabled" : ""}>上一页</button>`,
        `<span class="pf-pagination__info">第 ${state.page} / ${totalPages} 页 · 共 ${total} 条</span>`,
        `<button type="button" class="pf-button pf-button--small pf-button--ghost" data-pf-page="${next}" ${state.page === totalPages ? "disabled" : ""}>下一页</button>`,
      ].join("");
    }

    function renderCurrentPage(page) {
      const total = state.allItems ? state.allItems.length : 0;
      const totalPages = Math.max(1, Math.ceil(total / DISPLAY_PAGE_SIZE));
      state.page = Math.min(Math.max(1, Number(page) || 1), totalPages);
      const start = (state.page - 1) * DISPLAY_PAGE_SIZE;
      const items = state.allItems ? state.allItems.slice(start, start + DISPLAY_PAGE_SIZE) : [];
      elements.list.innerHTML = items.map(listingCardHtml).join("");
      renderPagination(total, totalPages);
      renderUpdated();
      if (state.failedPages.length > 0) {
        setStatus(`已加载 ${total} 条；接口第 ${state.failedPages.join("、")} 页失败，请刷新重试。`, "warning");
      } else if (total === 0) {
        setStatus("没有符合条件的招募。", "soft");
      } else {
        setStatus(`共 ${total} 条招募，第 ${state.page} / ${totalPages} 页`, "soft");
      }
    }

    async function loadPage(page) {
      if (state.allItems !== null) {
        renderCurrentPage(page);
        return;
      }
      const request = listRequests.begin();
      const filters = {
        search: state.search,
        datacenter: state.datacenter,
        category: state.category,
      };
      setLoading(true);
      setStatus("正在加载招募数据…", "soft");
      try {
        const result = await fetchAllListings(client, filters, { signal: request.signal });
        if (!request.isCurrent()) return;
        state.allItems = result.items;
        state.failedPages = result.failedPages;
        state.lastUpdated = Date.now();
        renderCurrentPage(page);
      } catch (error) {
        if (!request.isCurrent() || isAbortError(error)) return;
        state.allItems = null;
        setStatus(`加载失败：${error && error.message ? error.message : "网络错误"}`, "danger");
      } finally {
        if (request.isCurrent()) setLoading(false);
      }
    }

    function slotHtml(slot) {
      const jobs = parseSlotJobList(slot && slot.job);
      const jobText = jobs.map((job) => job.name).join(" / ") || "自由职业";
      const role = slot && slot.role ? (ROLE_NAMES[slot.role] || "其他职责") : "";
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
      const slots = Array.isArray(raw.slots) ? raw.slots : [];
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
    }

    async function openDetail(id) {
      const request = detailRequests.begin();
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

    function refresh(page) {
      invalidateList();
      loadPage(page || 1);
    }

    function open() {
      state.open = true;
      view.classList.remove("hidden");
      view.setAttribute("aria-hidden", "false");
      if (doc.body) doc.body.classList.add("pf-is-open");
      if (state.allItems === null) loadPage(1);
      else renderCurrentPage(state.page);
      if (state.autoTimer) clearInterval(state.autoTimer);
      state.autoTimer = setInterval(() => refresh(state.page), AUTO_REFRESH_MS);
      setTimeout(() => elements.search.focus(), 0);
    }

    function close() {
      state.open = false;
      view.classList.add("hidden");
      view.setAttribute("aria-hidden", "true");
      listRequests.cancel();
      cancelDetail();
      setLoading(false);
      if (doc.body) doc.body.classList.remove("pf-is-open");
      if (state.autoTimer) {
        clearInterval(state.autoTimer);
        state.autoTimer = null;
      }
      entryButton.focus();
    }

    entryButton.addEventListener("click", open);
    elements.close.addEventListener("click", close);
    elements.refresh.addEventListener("click", () => refresh(state.page));
    elements.searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      state.search = elements.search.value.trim();
      refresh(1);
    });
    elements.datacenter.addEventListener("change", () => {
      state.datacenter = elements.datacenter.value;
      refresh(1);
    });
    elements.category.addEventListener("change", () => {
      state.category = elements.category.value;
      refresh(1);
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
      if (card) openDetail(card.getAttribute("data-pf-id"));
    });
    view.addEventListener("mousedown", (event) => {
      if (event.target === view) close();
    });
    doc.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !state.open) return;
      if (!elements.detail.classList.contains("hidden")) cancelDetail();
      else close();
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
    formatTimeLeft,
    formatRelativeTime,
    parseSlotJobList,
    buildDetailFacts,
    createRequestCoordinator,
    createApiClient,
    fetchAllListings,
    init: initUi,
  };
});
