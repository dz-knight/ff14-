const assert = require("node:assert/strict");
const {
  buildSalesRanking,
  calculateRecipeProfit,
} = require("../market-calculations.js");

function fakeAggregated(itemId, worldQuantity, dcQuantity, price, avgPrice) {
  return {
    itemId,
    nq: {
      minListing: {
        world: { price, worldId: 1001 },
        dc: { price: price + 1000, worldId: 1002 },
      },
      averageSalePrice: {
        world: { price: avgPrice },
        dc: { price: avgPrice + 1000 },
      },
      dailySaleVelocity: {
        world: { quantity: worldQuantity },
        dc: { quantity: dcQuantity },
      },
      recentPurchase: {
        world: { price: avgPrice, timestamp: 1779900000000, worldId: 1001 },
        dc: { price: avgPrice + 1000, timestamp: 1779910000000, worldId: 1002 },
      },
    },
    hq: {
      minListing: {},
      averageSalePrice: {},
      dailySaleVelocity: {},
      recentPurchase: {},
    },
    worldUploadTimes: [{ worldId: 1001, timestamp: 1779920000000 }],
  };
}

const itemLookup = new Map();
for (let id = 1; id <= 40; id += 1) {
  itemLookup.set(id, { name: `测试物品 ${id}`, icon: `icon-${id}.png` });
}

const rankingInput = Array.from({ length: 32 }, (_, index) => {
  const itemId = index + 1;
  return fakeAggregated(itemId, itemId, itemId * 10, 100 + itemId, 200 + itemId);
});
rankingInput.push(fakeAggregated(99, 2, 2, 99999, 100));
itemLookup.set(99, { name: "高价物品", icon: "expensive.png" });

const worldRanking = buildSalesRanking(rankingInput, itemLookup, {
  limit: 30,
  scopeLevel: "world",
  scopeType: "world",
  scopeName: "测试服务器",
  scopeWorldId: 1001,
});
assert.equal(worldRanking.byPrice.length, 30, "price ranking keeps the top 30 rows");
assert.equal(worldRanking.byPrice[0].itemId, 99, "price ranking sorts by current listing price");
assert.equal(worldRanking.byQuantity[0].itemId, 32, "quantity ranking sorts by selected world sales quantity");
assert.equal(worldRanking.highestPriceItem.itemId, 99, "highest price item uses current listing price");
assert.equal(worldRanking.byQuantity[0].saleQuantity, 32, "world scope does not use dc quantity");

const dcRanking = buildSalesRanking(rankingInput, itemLookup, {
  limit: 30,
  scopeLevel: "dc",
  scopeType: "dc",
  scopeName: "测试区服",
});
assert.equal(dcRanking.byQuantity[0].saleQuantity, 320, "dc scope uses dc quantity");

const profit = calculateRecipeProfit({
  amountResult: 2,
  resultUnitPrice: 1000,
  taxRate: 0.05,
  ingredients: [
    { itemId: 1, name: "材料 A", amount: 3, unitPrice: 100 },
    { itemId: 2, name: "材料 B", amount: 2, unitPrice: 200 },
  ],
});
assert.equal(profit.totalCost, 700, "total cost sums material price times amount");
assert.equal(profit.grossRevenue, 2000, "gross revenue includes result amount");
assert.equal(profit.estimatedTax, 100, "tax is estimated from gross revenue");
assert.equal(profit.netProfit, 1200, "net profit subtracts cost and tax");
assert.equal(profit.canCalculateProfit, true, "complete prices can calculate profit");

const missing = calculateRecipeProfit({
  amountResult: 1,
  resultUnitPrice: 1000,
  ingredients: [
    { itemId: 1, name: "材料 A", amount: 1, unitPrice: null },
  ],
});
assert.equal(missing.totalCost, null, "missing material price blocks total cost");
assert.equal(missing.netProfit, null, "missing material price blocks profit");
assert.equal(missing.canCalculateProfit, false, "missing material price is explicit");

console.log("market calculation tests passed");
