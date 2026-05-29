(function attachMarketCalculations(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.FF14MarketCalculations = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : null, function createMarketCalculations() {
  const DEFAULT_RANKING_LIMIT = 30;
  const DEFAULT_MARKET_TAX_RATE = 0.05;
  const QUALITY_KEYS = ["nq", "hq"];

  function numberOrNull(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function positiveOrNull(value) {
    const numeric = numberOrNull(value);
    return numeric != null && numeric > 0 ? numeric : null;
  }

  function pickScopeMetric(bucket, scopeLevel) {
    if (!bucket || typeof bucket !== "object") {
      return null;
    }
    const metric = bucket[scopeLevel];
    return metric && typeof metric === "object" ? metric : null;
  }

  function maxTimestamp(values) {
    const timestamps = values
      .map(numberOrNull)
      .filter((value) => value != null && value > 0);
    return timestamps.length ? Math.max(...timestamps) : null;
  }

  function resolveItemMeta(itemLookup, itemId) {
    if (!itemLookup) {
      return null;
    }
    if (typeof itemLookup === "function") {
      return itemLookup(itemId) || null;
    }
    if (itemLookup instanceof Map) {
      return itemLookup.get(itemId) || null;
    }
    return itemLookup[itemId] || itemLookup[String(itemId)] || null;
  }

  function getMetaName(meta, itemId) {
    return String(
      meta?.preferredName
        || meta?.name
        || meta?.zhName
        || meta?.ZhName
        || meta?.enName
        || meta?.EnName
        || `Item #${itemId}`
    );
  }

  function getMetaIcon(meta) {
    return String(meta?.icon || meta?.iconUrl || meta?.IconUrl || meta?.iconPath || meta?.IconPath || "");
  }

  function getWorldName(options, worldId) {
    if (!worldId) {
      return "";
    }
    if (typeof options?.worldNameResolver === "function") {
      return String(options.worldNameResolver(worldId) || "");
    }
    return "";
  }

  function readQualitySummary(result, qualityKey, scopeLevel) {
    const quality = result?.[qualityKey] || {};
    const minListing = pickScopeMetric(quality.minListing, scopeLevel);
    const averageSalePrice = pickScopeMetric(quality.averageSalePrice, scopeLevel);
    const dailySaleVelocity = pickScopeMetric(quality.dailySaleVelocity, scopeLevel);
    const recentPurchase = pickScopeMetric(quality.recentPurchase, scopeLevel);
    const currentPrice = positiveOrNull(minListing?.price);
    const saleQuantity = positiveOrNull(dailySaleVelocity?.quantity) || 0;
    const avgSalePrice = positiveOrNull(averageSalePrice?.price);
    const recentPrice = positiveOrNull(recentPurchase?.price);
    const recentTimestamp = numberOrNull(recentPurchase?.timestamp);

    return {
      quality: qualityKey,
      currentPrice,
      currentPriceWorldId: numberOrNull(minListing?.worldId),
      saleQuantity,
      averageSalePrice: avgSalePrice,
      salesAmount: avgSalePrice != null ? avgSalePrice * saleQuantity : 0,
      recentPrice,
      recentPurchaseWorldId: numberOrNull(recentPurchase?.worldId),
      recentTimestamp,
    };
  }

  function combineAggregatedItem(result, itemLookup, options = {}) {
    const itemId = Number(result?.itemId || result?.itemID || 0);
    if (!itemId) {
      return null;
    }

    const scopeLevel = options.scopeLevel || "region";
    const qualitySummaries = QUALITY_KEYS.map((qualityKey) => readQualitySummary(result, qualityKey, scopeLevel));
    const pricedQuality = qualitySummaries
      .filter((entry) => entry.currentPrice != null)
      .sort((left, right) => left.currentPrice - right.currentPrice)[0] || null;
    const recentQuality = qualitySummaries
      .filter((entry) => entry.recentTimestamp != null)
      .sort((left, right) => right.recentTimestamp - left.recentTimestamp)[0] || null;
    const saleQuantity = qualitySummaries.reduce((sum, entry) => sum + entry.saleQuantity, 0);
    const salesAmount = qualitySummaries.reduce((sum, entry) => sum + entry.salesAmount, 0);
    const averageSalePrice = saleQuantity > 0 && salesAmount > 0 ? salesAmount / saleQuantity : null;
    const uploadTimes = Array.isArray(result?.worldUploadTimes) ? result.worldUploadTimes : [];
    const scopedUploadTimes = options.scopeWorldId
      ? uploadTimes.filter((entry) => Number(entry.worldId) === Number(options.scopeWorldId))
      : uploadTimes;
    const uploadTimestamp = maxTimestamp(scopedUploadTimes.map((entry) => entry.timestamp));
    const updatedAt = maxTimestamp([uploadTimestamp, recentQuality?.recentTimestamp]);
    const meta = resolveItemMeta(itemLookup, itemId);
    const worldId = pricedQuality?.currentPriceWorldId || recentQuality?.recentPurchaseWorldId || options.scopeWorldId || null;

    return {
      itemId,
      itemName: getMetaName(meta, itemId),
      icon: getMetaIcon(meta),
      currentPrice: pricedQuality?.currentPrice ?? null,
      currentPriceWorldId: pricedQuality?.currentPriceWorldId ?? null,
      saleQuantity,
      averageSalePrice,
      salesAmount,
      recentPrice: recentQuality?.recentPrice ?? null,
      recentPurchaseWorldId: recentQuality?.recentPurchaseWorldId ?? null,
      scopeType: options.scopeType || scopeLevel,
      scopeName: options.scopeName || "",
      worldId,
      worldName: getWorldName(options, worldId),
      updatedAt,
      qualities: qualitySummaries,
    };
  }

  function metricValue(row, metric) {
    if (metric === "quantity") {
      return row.saleQuantity;
    }
    if (metric === "price") {
      return row.currentPrice;
    }
    return row.salesAmount;
  }

  function hasMetric(row, metric) {
    const value = metricValue(row, metric);
    return value != null && Number.isFinite(Number(value)) && Number(value) > 0;
  }

  function sortRowsByMetric(rows, metric) {
    return [...rows].sort((left, right) => {
      const leftMissing = hasMetric(left, metric) ? 0 : 1;
      const rightMissing = hasMetric(right, metric) ? 0 : 1;
      if (leftMissing !== rightMissing) {
        return leftMissing - rightMissing;
      }

      const diff = Number(metricValue(right, metric) || 0) - Number(metricValue(left, metric) || 0);
      if (diff !== 0) {
        return diff;
      }

      const quantityDiff = Number(right.saleQuantity || 0) - Number(left.saleQuantity || 0);
      if (quantityDiff !== 0) {
        return quantityDiff;
      }

      const priceDiff = Number(right.currentPrice || 0) - Number(left.currentPrice || 0);
      if (priceDiff !== 0) {
        return priceDiff;
      }

      return String(left.itemName).localeCompare(String(right.itemName), "zh-CN");
    });
  }

  function buildSalesRanking(aggregatedResults, itemLookup, options = {}) {
    const limit = Math.max(1, Number(options.limit || DEFAULT_RANKING_LIMIT));
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
  }

  function calculateRecipeProfit(input = {}) {
    const ingredients = Array.isArray(input.ingredients) ? input.ingredients : [];
    const amountResult = Math.max(1, Number(input.amountResult ?? input.recipe?.AmountResult ?? 1) || 1);
    const taxRateRaw = Number(input.taxRate ?? DEFAULT_MARKET_TAX_RATE);
    const taxRate = Number.isFinite(taxRateRaw) && taxRateRaw >= 0 ? taxRateRaw : DEFAULT_MARKET_TAX_RATE;
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
    const profitRate = totalCost != null && totalCost > 0 && netProfit != null ? netProfit / totalCost : null;

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
      profitRate,
      canCalculateProfit: missingPriceCount === 0 && resultUnitPrice != null,
    };
  }

  return {
    DEFAULT_RANKING_LIMIT,
    DEFAULT_MARKET_TAX_RATE,
    buildSalesRanking,
    calculateRecipeProfit,
    combineAggregatedItem,
    sortRowsByMetric,
  };
});
