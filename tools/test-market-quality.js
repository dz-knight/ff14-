const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8").replace(/\r\n/g, "\n");

function section(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, startMarker);
  return source.slice(start, end);
}

function createHarness() {
  const listeners = new Map();
  const context = {
    state: { selectedRegion: "全部", marketStatus: "ready", currentWorldRows: [],
      worldMap: new Map([[1001, { name: "测试服", region: "中国" }]]) },
    dom: { marketOverview: {}, priceTableBody: {}, itemOverview: {}, worldFilter: { value: "" } },
    document: { addEventListener: (type, callback) => listeners.set(type, callback) },
    Element: class {},
    ENCYCLOPEDIA_API: "https://example.invalid",
    getItemAliasMeta: () => null,
    fetchJson: async () => { throw new Error("百科接口离线"); },
    normalizeIconPath: (value) => value || "",
    getPreferredItemName: (item) => item.Name,
    escapeHtml: String,
    formatPrice: (value) => `price:${value}`,
    formatNumber: String,
    formatTime: () => "更新时间",
    wrapCard: (label, title, markup) => `${label}|${title}|${markup}`,
    renderOverviewIcon: () => "",
    renderExternalButton: () => "",
    renderWikiOpenButton: () => "",
    buildWikiSearchUrl: () => "",
  };
  vm.createContext(context);
  vm.runInContext([
    section("async function fetchItemWithFallback(", "async function getQuest("),
    section("function getAliasDisplayName(", "async function openWikiSearch("),
    section("function renderItemOverview(", "function renderQuestOverview("),
    source.slice(source.indexOf("function getActiveMarketQuality(")),
  ].join("\n"), context);
  context.clickQuality = (quality) => {
    const target = new context.Element();
    target.closest = () => target;
    target.getAttribute = () => quality;
    listeners.get("click")({ target, preventDefault() {} });
  };
  return context;
}

async function testMappedItems() {
  const context = createHarness();
  const entries = JSON.parse(fs.readFileSync(path.join(root, "data", "item_mapping.min.json"), "utf8")).Entries;
  assert.ok(entries.some((entry) => entry.ItemId === 36060 && entry.ZhName === "高山茶"));
  let requests = 0;
  context.fetchJson = async () => { requests += 1; throw new Error("百科接口离线"); };
  for (const entry of entries) {
    context.getItemAliasMeta = () => ({ name: entry.ZhName, englishName: entry.EnName, fast: true });
    const item = await context.fetchItemWithFallback(entry.ItemId);
    assert.equal(item.CanBeHq, null, `${entry.ZhName}: unknown quality must not become false`);
    assert.equal(context.getQualityOptions(item).map((option) => option.key).join(","), "all,hq,nq", entry.ZhName);
  }
  assert.equal(requests, 0, "fast mapping must not wait for encyclopedia requests");
  console.log(`Mapped item quality coverage: ${entries.length} entries`);
}

async function testMetadataStates() {
  const context = createHarness();
  for (const quality of [true, false, null, undefined]) {
    context.fetchJson = async () => ({ fields: { Name: "Test", CanBeHq: quality } });
    assert.equal((await context.fetchXivApiItem(36060)).CanBeHq, quality ?? null);
  }
  assert.equal(context.mergeItemPayload(null, null, 36060).CanBeHq, null);
  assert.equal(context.mergeItemPayload({}, { CanBeHq: true }, 36060).CanBeHq, true);
  assert.equal(context.mergeItemPayload({ CanBeHq: false }, { CanBeHq: true }, 36060).CanBeHq, false);
  assert.equal(context.getQualityOptions({ CanBeHq: false }).length, 1);
  context.getItemAliasMeta = () => ({ name: "高山茶", fast: false });
  context.fetchJson = async () => { throw new Error("百科接口离线"); };
  const fallback = await context.fetchItemWithFallback(36060);
  assert.equal(fallback.CanBeHq, null);
  assert.equal(context.getQualityOptions(fallback).length, 3);
  context.renderItemOverview(fallback);
  assert.match(context.dom.itemOverview.innerHTML, /品质信息待确认/);
  assert.doesNotMatch(context.dom.itemOverview.innerHTML, /普通品质/);
}

function testQualityRenderingAndSwitching() {
  const context = createHarness();
  const item = { ID: 36060, Name: "高山茶", CanBeHq: null };
  const dataCenter = { name: "陆行鸟", worlds: [1001] };
  const hq = { listingID: "hq", worldID: 1001, hq: true, pricePerUnit: 900, quantity: 3 };
  const nq = { listingID: "nq", worldID: 1001, hq: false, pricePerUnit: 200, quantity: 7 };
  const rows = context.buildWorldRowsFromPayload(dataCenter, { listings: [hq, nq, hq] });
  context.state.currentWorldRows = rows;
  context.state.currentEntity = { type: "item", data: item };
  context.renderMarketOverview(item, rows);
  assert.match(context.dom.marketOverview.innerHTML, /data-market-quality="hq"/);
  assert.match(context.dom.marketOverview.innerHTML, /aria-label="商品品质筛选"/);
  for (const [quality, price, count, units] of [["hq", 900, 1, 3], ["nq", 200, 1, 7], ["all", 200, 2, 10]]) {
    context.clickQuality(quality);
    assert.equal(context.getActiveMarketQuality(), quality, "render must not reset the quality filter");
    const stat = context.getSelectedQualityStat(rows[0]);
    assert.equal(stat.minPrice, price);
    assert.equal(stat.listingCount, count);
    assert.equal(stat.unitsForSale, units);
    assert.match(context.dom.marketOverview.innerHTML, new RegExp(`price:${price}`));
    assert.match(context.dom.marketOverview.innerHTML, new RegExp(`data-market-quality="${quality}" aria-pressed="true"`));
    assert.match(context.dom.priceTableBody.innerHTML, new RegExp(`price:${price}`));
    assert.match(context.dom.priceTableBody.innerHTML, new RegExp(`<td>${count}</td>\\s*<td>${units}</td>`));
  }
  const noHqRows = context.buildWorldRowsFromPayload(dataCenter, { listings: [nq] });
  context.state.currentWorldRows = noHqRows;
  context.clickQuality("hq");
  assert.equal(context.getActiveMarketQuality(), "hq");
  assert.match(context.dom.priceTableBody.innerHTML, /暂无上架/);
  assert.doesNotMatch(context.dom.priceTableBody.innerHTML, /price:200/);
  assert.equal(context.getQualityOptions({ CanBeHq: true }, noHqRows).length, 3);
  assert.equal(context.getQualityOptions(item, []).length, 3);
  context.state.marketStatus = "loading";
  context.state.currentWorldRows = [];
  context.clickQuality("hq");
  assert.equal(context.getActiveMarketQuality(), "hq");
  assert.match(context.dom.marketOverview.innerHTML, /读取中/);
  assert.match(context.dom.marketOverview.innerHTML, /data-market-quality="hq" aria-pressed="true"/);
  context.state.marketStatus = "ready";
  context.state.currentWorldRows = context.buildWorldRowsFromPayload(dataCenter, { listings: [] });
  context.clickQuality("hq");
  assert.equal(context.getActiveMarketQuality(), "hq");
  assert.match(context.dom.priceTableBody.innerHTML, /暂无上架/);
  const nqOnly = { Name: "仅普通品质", CanBeHq: false };
  context.renderMarketOverview(nqOnly, noHqRows);
  assert.equal(context.getActiveMarketQuality(), "all");
  assert.doesNotMatch(context.dom.marketOverview.innerHTML, /data-market-quality="hq"/);
  context.state.selectedRegion = "另一个大区";
  context.setActiveMarketQuality("hq");
  context.renderMarketOverview(nqOnly, rows);
  assert.equal(context.getActiveMarketQuality(), "hq", "HQ evidence overrides metadata regardless of selected region");
  assert.match(context.dom.marketOverview.innerHTML, /data-market-quality="hq"/);
  const [samePriceRow] = context.buildWorldRowsFromPayload(dataCenter, { listings: [
    { worldID: 1001, hq: false, pricePerUnit: 500, quantity: 1 },
    { worldID: 1001, hq: true, pricePerUnit: 500, quantity: 1 },
  ] });
  assert.equal(samePriceRow.qualityStats.all.listingCount, 2);
  assert.equal(samePriceRow.qualityStats.hq.listingCount, 1);
  assert.equal(samePriceRow.qualityStats.nq.listingCount, 1);
}

async function main() {
  await testMappedItems();
  await testMetadataStates();
  testQualityRenderingAndSwitching();
  console.log("test-market-quality.js: all assertions passed");
}

module.exports = main;

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
