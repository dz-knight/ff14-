(function attachPartyFinder(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.FF14PartyFinder = api;
  }
  // 浏览器环境自动初始化；node（module 存在）留给单测显式调用。
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

  const CATEGORY_OPTIONS = [
    { en: "DutyRoulette", zh: "随机任务" },
    { en: "Dungeons", zh: "迷宫挑战" },
    { en: "Guildhests", zh: "行会令" },
    { en: "Trials", zh: "讨伐歼灭战" },
    { en: "Raids", zh: "大型任务" },
    { en: "HighEndDuty", zh: "高难度任务" },
    { en: "Pvp", zh: "玩家对战" },
    { en: "GoldSaucer", zh: "金碟游乐场" },
    { en: "Fates", zh: "危命任务" },
    { en: "TreasureHunt", zh: "寻宝" },
    { en: "TheHunt", zh: "怪物狩猎" },
    { en: "GatheringForays", zh: "采集活动" },
    { en: "DeepDungeons", zh: "深层迷宫" },
    { en: "FieldOperations", zh: "特殊场景探索" },
    { en: "VariantAndCriterionDungeonFinder", zh: "特殊迷宫探索" },
    { en: "None", zh: "无分类" },
  ];
  const CATEGORY_ZH = Object.fromEntries(CATEGORY_OPTIONS.map((o) => [o.en, o.zh]));

  // 上报玩家客户端字形不同，同一大区在数据里存在简繁两种写法（实测 陆行鸟/陸行鳥 命中不同集合）。
  // 按大区筛选时需并发请求全部写法并在客户端合并。
  const DATACENTER_OPTIONS = [
    { key: "陆行鸟", variants: ["陆行鸟", "陸行鳥"] },
    { key: "猫小胖", variants: ["猫小胖", "貓小胖"] },
    { key: "莫古力", variants: ["莫古力"] },
    { key: "豆豆柴", variants: ["豆豆柴"] },
  ];

  const JOB_NAMES = {
    GLA: "剑术师", PGL: "格斗家", MRD: "斧术师", LNC: "枪术师", ARC: "弓箭手", ROG: "双剑士",
    CNL: "幻术师", THM: "咒术师", ACN: "秘术师", DRK: "暗黑骑士", MCH: "机工士", AST: "占星术士",
    SAM: "武士", RDM: "赤魔法师", BLU: "青魔法师", GNB: "绝枪战士", DNC: "舞者", RPR: "钐镰客",
    SGE: "贤者", VPR: "蛇剑士", PCT: "绘灵法师",
    CRP: "木匠", BSM: "锻铁匠", ARM: "铸甲匠", GSM: "雕金匠", LTW: "制革匠", WVR: "裁衣匠",
    ALC: "炼金术师", CUL: "烹调师", MIN: "采矿工", BTN: "园艺工", FSH: "捕鱼人",
  };
  const ROLE_NAMES = { Tank: "坦克", Healer: "治疗", DPS: "输出" };
  const DUTY_TYPE_NAMES = {
    Normal: "普通", DutyRoulette: "随机任务", Dungeon: "迷宫挑战", Trial: "讨伐歼灭战",
    Raid: "大型任务", HighEndDuty: "高难度任务", Pvp: "玩家对战", GoldSaucer: "金碟游乐场",
    Fates: "危命任务", TreasureHunt: "寻宝", TheHunt: "怪物狩猎", GatheringForays: "采集活动",
    DeepDungeons: "深层迷宫", FieldOperations: "特殊场景探索",
    VariantAndCriterionDungeonFinder: "特殊迷宫探索", Other: "其他", None: "无",
  };
  const OBJECTIVE_NAMES = {
    DUTY_COMPLETION: "以完成任务为目的", LOOT: "以获取战利品为目的", NONE: "无特别目的",
  };
  const CONDITION_NAMES = { NONE: "无", DUTY_COMPLETION: "需完成任务", LOOT: "战利品规则" };
  const LOOT_RULE_NAMES = { NONE: "无" };

  function labelFrom(map, value) {
    if (value === null || value === undefined || value === "") return "";
    return map[String(value)] || String(value);
  }

  function normalizeDatacenter(value) {
    const raw = String(value || "").trim();
    for (const dc of DATACENTER_OPTIONS) {
      if (dc.variants.includes(raw)) return dc.key;
    }
    return raw;
  }

  function datacenterVariants(key) {
    if (!key) return [null];
    const found = DATACENTER_OPTIONS.find((dc) => dc.key === key);
    return found ? found.variants : [key];
  }

  function buildListUrl(params) {
    const query = new URLSearchParams();
    if (params && params.page) query.set("page", String(params.page));
    query.set("per_page", String(params && params.perPage ? params.perPage : API_PAGE_SIZE));
    if (params && params.category) query.set("category", String(params.category));
    if (params && params.datacenter) query.set("datacenter", String(params.datacenter));
    if (params && params.search) query.set("search", String(params.search));
    return `${API_BASE}/api/listings?${query.toString()}`;
  }

  function buildDetailUrl(id) {
    return `${API_BASE}/api/listing/${encodeURIComponent(id)}`;
  }

  // 国服世界 id 区间为 1000-1999（服务端校验同款范围）；
  // 4000-4999 是日服世界（国际服玩家把数据上报到了国服服务器，被世界表挂在陆行鸟名下）。
  // 本模块面向国服用户，固定只保留国服四大区（服务端无法按大区排除，只能客户端过滤）。
  function isCnWorldId(worldId) {
    const id = Number(worldId);
    return Number.isFinite(id) && id >= 1000 && id <= 1999;
  }

  function collectListings(rawItems) {
    const list = (Array.isArray(rawItems) ? rawItems : [])
      .map(normalizeListing)
      .filter(Boolean)
      .filter((listing) => isCnWorldId(listing.createdWorldId));
    list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return list;
  }

  // API 的 time_left 单位是秒（= 游戏 seconds_remaining − 距上次上报的秒数，ushort 上限约 18.2 小时）
  function formatTimeLeft(seconds) {
    const s = Number(seconds);
    if (!Number.isFinite(s)) return "";
    const total = Math.max(0, Math.floor(s));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    if (total <= 0) return "已过期";
    if (h > 0) return `剩 ${h} 小时 ${m} 分`;
    if (m > 0) return `剩 ${m} 分 ${sec} 秒`;
    return `剩 ${sec} 秒`;
  }

  function formatRelativeTime(iso, now) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const diff = Math.max(0, (now || Date.now()) - t);
    const sec = Math.floor(diff / 1000);
    if (sec < 10) return "刚刚";
    if (sec < 60) return `${sec} 秒前`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} 分钟前`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} 小时前`;
    return `${Math.floor(hr / 24)} 天前`;
  }

  function normalizeListing(raw) {
    if (!raw || typeof raw !== "object") return null;
    const world = String(raw.created_world || "");
    const home = String(raw.home_world || "");
    const categoryEn = String(raw.category || "");
    return {
      id: raw.id,
      name: String(raw.name || "匿名"),
      description: String(raw.description || ""),
      datacenter: normalizeDatacenter(raw.datacenter),
      world,
      homeWorld: home && home !== world ? home : "",
      createdWorldId: Number(raw.created_world_id) || 0,
      categoryEn,
      categoryZh: labelFrom(CATEGORY_ZH, categoryEn),
      duty: String(raw.duty || ""),
      minItemLevel: Number(raw.min_item_level) || 0,
      slotsFilled: Number(raw.slots_filled) || 0,
      slotsAvailable: Number(raw.slots_available) || 0,
      timeLeftSeconds: Number(raw.time_left) || 0,
      updatedAt: String(raw.updated_at || ""),
      isCrossWorld: Boolean(raw.is_cross_world),
    };
  }

  function parseSlotJobList(jobText) {
    return String(jobText || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((abbr) => ({ abbr, name: JOB_NAMES[abbr] || abbr }));
  }

  function createApiClient(fetchImpl) {
    const doFetch = fetchImpl
      || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    if (!doFetch) {
      throw new Error("party-finder needs a fetch implementation");
    }

    async function getJson(url) {
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timer = controller
        ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
        : null;
      try {
        const response = await doFetch(url, {
          signal: controller ? controller.signal : undefined,
          headers: { Accept: "application/json" },
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          const error = new Error((body && body.error) || `HTTP ${response.status}`);
          error.status = response.status;
          throw error;
        }
        return body;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    return {
      async fetchList(params) {
        const body = await getJson(buildListUrl(params));
        return {
          data: Array.isArray(body && body.data) ? body.data : [],
          pagination: body && body.pagination
            ? {
              total: Number(body.pagination.total) || 0,
              page: Number(body.pagination.page) || 1,
              perPage: Number(body.pagination.per_page) || API_PAGE_SIZE,
              totalPages: Number(body.pagination.total_pages) || 1,
            }
            : { total: 0, page: 1, perPage: API_PAGE_SIZE, totalPages: 1 },
        };
      },
      async fetchDetail(id) {
        let body;
        try {
          body = await getJson(buildDetailUrl(id));
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

    const client = (options && options.client) || createApiClient();
    const state = {
      open: false,
      page: 1,
      search: "",
      datacenter: "",
      category: "",
      allItems: null,
      loading: false,
      lastUpdated: 0,
      autoTimer: null,
      detailAbort: null,
    };

    view.innerHTML = [
      '<div class="pf-window" role="dialog" aria-modal="true" aria-label="招募查询">',
      '  <div class="pf-head">',
      '    <div class="pf-head__copy">',
      "      <h2>招募队查询</h2>",
      '      <p class="pf-head__meta">招募数据来自 https://xivpf.ff14.xin/ ，由玩家游戏内插件实时上报</p>',
      "    </div>",
      '    <div class="pf-head__actions">',
      '      <span class="pf-updated" id="pf-updated"></span>',
      '      <button type="button" class="pf-button" id="pf-refresh">刷新</button>',
      '      <button type="button" class="pf-button pf-button--ghost" id="pf-close">返回百科</button>',
      "    </div>",
      "  </div>",
      '  <div class="pf-filters">',
      '    <form class="pf-filters__form" id="pf-search-form">',
      '      <input id="pf-search" type="search" placeholder="关键字搜索（名称 / 描述）" autocomplete="off">',
      '      <button type="submit" class="pf-button">搜索</button>',
      "    </form>",
      '    <select id="pf-datacenter" aria-label="大区筛选">',
      '      <option value="">全部大区</option>',
      DATACENTER_OPTIONS.map((dc) => `<option value="${esc(dc.key)}">${esc(dc.key)}</option>`).join(""),
      "    </select>",
      '    <select id="pf-category" aria-label="分类筛选">',
      '      <option value="">全部分类</option>',
      CATEGORY_OPTIONS.map((o) => `<option value="${esc(o.en)}">${esc(o.zh)}</option>`).join(""),
      "    </select>",
      "  </div>",
      '  <div class="pf-status" id="pf-status"></div>',
      '  <div class="pf-list" id="pf-list"></div>',
      '  <div class="pf-pagination" id="pf-pagination"></div>',
      '  <div class="pf-detail hidden" id="pf-detail"></div>',
      "</div>",
    ].join("\n");

    const els = {
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
      els.status.textContent = message || "";
      els.status.className = message ? `pf-status is-${tone || "soft"}` : "pf-status";
    }

    function renderUpdated() {
      if (!state.lastUpdated) {
        els.updated.textContent = "";
        return;
      }
      els.updated.textContent = `更新于 ${formatRelativeTime(new Date(state.lastUpdated).toISOString())}`;
    }

    function resetData() {
      state.allItems = null;
    }

    function currentVariants() {
      return datacenterVariants(state.datacenter);
    }

    async function fetchVariantList(variantValue, apiPage) {
      const params = {
        page: apiPage,
        perPage: API_PAGE_SIZE,
        category: state.category || undefined,
        datacenter: variantValue || undefined,
        search: state.search || undefined,
      };
      return client.fetchList(params);
    }

    // 日服世界挂在"陆行鸟"名下、服务端无法排除，只能全量拉取后客户端过滤；
    // 首页拿到 total_pages 后并发拉剩余页，单变体上限 10 页（1000 条）防御数据暴涨。
    const MAX_API_PAGES_PER_VARIANT = 10;

    async function fetchAllVariants() {
      const variants = currentVariants();
      const batches = await Promise.all(variants.map(async (variantValue) => {
        const first = await fetchVariantList(variantValue, 1);
        const pages = [first.data];
        const lastPage = Math.min(first.pagination.totalPages, MAX_API_PAGES_PER_VARIANT);
        const rest = [];
        for (let p = 2; p <= lastPage; p += 1) {
          rest.push(fetchVariantList(variantValue, p).then((r) => r.data).catch(() => null));
        }
        const restPages = await Promise.all(rest);
        for (const data of restPages) {
          if (Array.isArray(data)) pages.push(data);
        }
        return pages.flat();
      }));
      return batches.flat();
    }

    async function loadPage(page) {
      if (state.loading) return;
      state.loading = true;
      els.refresh.disabled = true;
      setStatus("正在加载招募数据…");
      try {
        if (state.allItems === null) {
          state.allItems = collectListings(await fetchAllVariants());
        }
        const total = state.allItems.length;
        const totalPages = Math.max(1, Math.ceil(total / DISPLAY_PAGE_SIZE));
        state.page = Math.min(Math.max(1, page), totalPages);
        const start = (state.page - 1) * DISPLAY_PAGE_SIZE;
        const items = state.allItems.slice(start, start + DISPLAY_PAGE_SIZE);
        state.lastUpdated = Date.now();
        renderList(items);
        renderPagination(total, totalPages);
        renderUpdated();
        if (total === 0) {
          setStatus("没有符合条件的招募，试试放宽筛选条件。", "soft");
        } else {
          setStatus(`共 ${total} 条招募，第 ${state.page} / ${totalPages} 页`, "soft");
        }
      } catch (error) {
        resetData();
        setStatus(`加载失败：${error && error.message ? error.message : "网络错误"}`, "danger");
      } finally {
        state.loading = false;
        els.refresh.disabled = false;
      }
    }

    function listingCardHtml(listing) {
      const badges = [
        `<span class="pf-badge">${esc(listing.datacenter || "未知大区")}</span>`,
        listing.world ? `<span class="pf-badge">${esc(listing.world)}</span>` : "",
        listing.homeWorld ? `<span class="pf-badge pf-badge--soft">主世界 ${esc(listing.homeWorld)}</span>` : "",
        listing.isCrossWorld ? '<span class="pf-badge pf-badge--soft">跨服</span>' : "",
      ].filter(Boolean).join("");
      return [
        `<button type="button" class="pf-card" data-pf-id="${esc(listing.id)}">`,
        '  <div class="pf-card__top">',
        `    <strong class="pf-card__name">${esc(listing.name)}</strong>`,
        `    <span class="pf-card__count">${listing.slotsFilled}/${listing.slotsAvailable}</span>`,
        "  </div>",
        `  <div class="pf-card__duty">${esc(listing.duty || listing.categoryZh || "无任务")}</div>`,
        `  <div class="pf-card__desc pf-gamefont">${esc(listing.description || "（无描述）")}</div>`,
        '  <div class="pf-card__meta">',
        `    <span class="pf-card__badges">${badges}</span>`,
        `    <span class="pf-card__time${listing.timeLeftSeconds > 0 && listing.timeLeftSeconds < 300 ? " is-urgent" : ""}">${esc(formatTimeLeft(listing.timeLeftSeconds))} · ${esc(formatRelativeTime(listing.updatedAt))}</span>`,
        "  </div>",
        "</button>",
      ].join("\n");
    }

    function renderList(items) {
      els.list.innerHTML = items.map(listingCardHtml).join("");
    }

    function renderPagination(total, totalPages) {
      if (totalPages <= 1) {
        els.pagination.innerHTML = total > 0 ? `<span class="pf-pagination__info">共 ${total} 条</span>` : "";
        return;
      }
      const prev = Math.max(1, state.page - 1);
      const next = Math.min(totalPages, state.page + 1);
      els.pagination.innerHTML = [
        `<button type="button" class="pf-button pf-button--small" data-pf-page="${prev}" ${state.page === 1 ? "disabled" : ""}>上一页</button>`,
        `<span class="pf-pagination__info">第 ${state.page} / ${totalPages} 页 · 共 ${total} 条</span>`,
        `<button type="button" class="pf-button pf-button--small" data-pf-page="${next}" ${state.page === totalPages ? "disabled" : ""}>下一页</button>`,
      ].join("");
    }

    function slotChipHtml(slot) {
      const jobs = parseSlotJobList(slot.job);
      const jobText = jobs.map((j) => j.name).join(" / ") || "自由";
      const role = slot.role ? labelFrom(ROLE_NAMES, slot.role) : "";
      return [
        `<div class="pf-slot ${slot.filled ? "is-filled" : "is-free"}">`,
        `  <span class="pf-slot__state">${slot.filled ? "满" : "空"}</span>`,
        `  <span class="pf-slot__jobs" title="${esc(jobs.map((j) => j.abbr).join(" "))}">${esc(jobText)}</span>`,
        `  <span class="pf-slot__role">${esc(role)}</span>`,
        "</div>",
      ].join("\n");
    }

    function renderDetail(raw) {
      const base = normalizeListing(raw);
      if (!base) return;
      const facts = [
        ["目的", labelFrom(OBJECTIVE_NAMES, raw.objective)],
        ["条件", labelFrom(CONDITION_NAMES, raw.conditions)],
        ["战利品规则", labelFrom(LOOT_RULE_NAMES, raw.loot_rules)],
        ["类型", labelFrom(DUTY_TYPE_NAMES, raw.duty_type)],
        ["最低装等", base.minItemLevel > 0 ? String(base.minItemLevel) : ""],
        ["新手欢迎", raw.beginners_welcome ? "是" : "否"],
      ].filter(([, v]) => v !== "");
      const slots = Array.isArray(raw.slots) ? raw.slots : [];
      els.detail.innerHTML = [
        '<div class="pf-detail__panel">',
        '  <div class="pf-detail__head">',
        "    <div>",
        `      <h3>${esc(base.name)}</h3>`,
        `      <p class="pf-detail__sub">${esc(base.duty || base.categoryZh)} · ${esc(base.datacenter)} ${esc(base.world)}</p>`,
        "    </div>",
        '    <button type="button" class="pf-button" id="pf-detail-close">返回列表</button>',
        "  </div>",
        `  <div class="pf-detail__desc pf-gamefont">${esc(base.description || "（无描述）")}</div>`,
        '  <dl class="pf-detail__facts">',
        facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join(""),
        "  </dl>",
        `  <div class="pf-detail__slots">${slots.map(slotChipHtml).join("")}</div>`,
        `  <p class="pf-detail__foot">${esc(formatTimeLeft(base.timeLeftSeconds))} · 更新于 ${esc(formatRelativeTime(base.updatedAt))}</p>`,
        "</div>",
      ].join("\n");
      els.detail.classList.remove("hidden");
      const close = doc.getElementById("pf-detail-close");
      if (close) close.addEventListener("click", () => els.detail.classList.add("hidden"));
    }

    async function openDetail(id) {
      setStatus("正在加载招募详情…");
      try {
        const raw = await client.fetchDetail(id);
        renderDetail(raw);
        setStatus("");
      } catch (error) {
        if (error && error.expired) {
          setStatus("该招募已结束或已被刷新，请返回列表查看最新数据。", "danger");
        } else {
          setStatus(`详情加载失败：${error && error.message ? error.message : "网络错误"}`, "danger");
        }
      }
    }

    function open() {
      state.open = true;
      view.classList.remove("hidden");
      view.setAttribute("aria-hidden", "false");
      if (state.allItems === null) {
        loadPage(1);
      } else {
        renderUpdated();
      }
      if (state.autoTimer) clearInterval(state.autoTimer);
      state.autoTimer = setInterval(() => {
        resetData();
        loadPage(state.page);
      }, AUTO_REFRESH_MS);
    }

    function close() {
      state.open = false;
      view.classList.add("hidden");
      view.setAttribute("aria-hidden", "true");
      els.detail.classList.add("hidden");
      if (state.autoTimer) {
        clearInterval(state.autoTimer);
        state.autoTimer = null;
      }
    }

    entryButton.addEventListener("click", open);
    els.close.addEventListener("click", close);
    els.refresh.addEventListener("click", () => {
      resetData();
      loadPage(state.page);
    });
    els.searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      state.search = els.search.value.trim();
      resetData();
      loadPage(1);
    });
    els.datacenter.addEventListener("change", () => {
      state.datacenter = els.datacenter.value;
      resetData();
      loadPage(1);
    });
    els.category.addEventListener("change", () => {
      state.category = els.category.value;
      resetData();
      loadPage(1);
    });
    els.pagination.addEventListener("click", (event) => {
      const target = event.target.closest("[data-pf-page]");
      if (!target || target.disabled) return;
      loadPage(Number(target.getAttribute("data-pf-page")) || 1);
    });
    els.list.addEventListener("click", (event) => {
      const card = event.target.closest("[data-pf-id]");
      if (!card) return;
      openDetail(card.getAttribute("data-pf-id"));
    });
    doc.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !state.open) return;
      if (!els.detail.classList.contains("hidden")) {
        els.detail.classList.add("hidden");
      } else {
        close();
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
    normalizeDatacenter,
    datacenterVariants,
    isCnWorldId,
    collectListings,
    formatTimeLeft,
    formatRelativeTime,
    normalizeListing,
    parseSlotJobList,
    createApiClient,
    init: initUi,
  };
});
