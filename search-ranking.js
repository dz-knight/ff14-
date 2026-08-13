(function attachSearchRanking(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.FF14SearchRanking = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : null, function createSearchRanking() {
  const DEFAULT_LIMIT = 50;

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

  function scoreNormalizedName(normalizedName, normalizedKeyword, languagePriority) {
    if (!normalizedName || !normalizedKeyword) {
      return Number.NEGATIVE_INFINITY;
    }

    let score = Number.NEGATIVE_INFINITY;
    if (normalizedName === normalizedKeyword) {
      score = 100000;
    } else if (normalizedName.startsWith(normalizedKeyword)) {
      score = 80000;
    } else if (normalizedName.includes(normalizedKeyword)) {
      score = 60000;
    }

    if (!Number.isFinite(score)) {
      return score;
    }

    const extraLength = Math.max(0, normalizedName.length - normalizedKeyword.length);
    return score + languagePriority - Math.min(extraLength, 100) * 100;
  }

  function scoreName(name, normalizedKeyword, languagePriority) {
    return scoreNormalizedName(normalizeSearchKey(name), normalizedKeyword, languagePriority);
  }

  function scoreLocalItem(entry, normalizedKeyword) {
    return Math.max(
      scoreNormalizedName(entry?.zhKey || normalizeSearchKey(entry?.zhName), normalizedKeyword, 2000),
      scoreNormalizedName(entry?.enKey || normalizeSearchKey(entry?.enName), normalizedKeyword, 1000)
    );
  }

  function rankLocalItems(entries, keyword, limit = DEFAULT_LIMIT) {
    const normalizedKeyword = normalizeSearchKey(keyword);
    if (!normalizedKeyword || !Array.isArray(entries)) {
      return [];
    }

    return entries
      .map((entry, index) => ({
        entry,
        index,
        score: scoreLocalItem(entry, normalizedKeyword),
      }))
      .filter((candidate) => Number.isFinite(candidate.score))
      .sort((left, right) => {
        if (left.score !== right.score) {
          return right.score - left.score;
        }
        const leftName = String(left.entry?.zhName || left.entry?.enName || "");
        const rightName = String(right.entry?.zhName || right.entry?.enName || "");
        const nameOrder = leftName.localeCompare(rightName, "zh-CN");
        if (nameOrder !== 0) {
          return nameOrder;
        }
        const idOrder = Number(left.entry?.itemId || 0) - Number(right.entry?.itemId || 0);
        return idOrder || left.index - right.index;
      })
      .slice(0, Math.max(0, Number(limit) || DEFAULT_LIMIT))
      .map((candidate) => candidate.entry);
  }

  function scoreSearchResult(entry, keyword) {
    const normalizedKeyword = normalizeSearchKey(keyword);
    if (!normalizedKeyword) {
      return 0;
    }

    const names = [
      entry?.name,
      entry?.raw?.Name,
      entry?.raw?.Name_en,
      entry?.raw?.Name_ja,
    ];
    let best = Number.NEGATIVE_INFINITY;
    for (const name of names) {
      best = Math.max(best, scoreName(name, normalizedKeyword, 0));
    }

    if (!Number.isFinite(best)) {
      return 0;
    }
    return best + (entry?.type === "item" ? 500 : 0);
  }

  function rankSearchResults(results, keyword, limit = DEFAULT_LIMIT) {
    if (!Array.isArray(results)) {
      return [];
    }

    return results
      .map((entry, index) => ({ entry, index, score: scoreSearchResult(entry, keyword) }))
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, Math.max(0, Number(limit) || DEFAULT_LIMIT))
      .map((candidate) => candidate.entry);
  }

  return {
    normalizeSearchKey,
    rankLocalItems,
    rankSearchResults,
    scoreSearchResult,
  };
});
