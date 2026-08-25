const MAX_RECENT_STYLES = 4;

function normalizeRecentStyleIds(value, validIds) {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(validIds);
  const seen = new Set();
  return value.filter((id) => {
    if (typeof id !== "string" || !allowed.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, MAX_RECENT_STYLES);
}

function rememberStyle(recentIds, styleId, validIds) {
  if (typeof styleId !== "string") return normalizeRecentStyleIds(recentIds, validIds);
  return normalizeRecentStyleIds([styleId, ...recentIds.filter((id) => id !== styleId)], validIds);
}

function orderStylesByRecency(styles, recentIds) {
  const rank = new Map(recentIds.map((id, index) => [id, index]));
  return styles
    .map((style, index) => ({ style, index }))
    .sort((a, b) => {
      const aRank = rank.get(a.style.id);
      const bRank = rank.get(b.style.id);
      if (aRank !== undefined || bRank !== undefined) {
        if (aRank === undefined) return 1;
        if (bRank === undefined) return -1;
        return aRank - bRank;
      }
      return a.index - b.index;
    })
    .map(({ style }) => style);
}

export { MAX_RECENT_STYLES, normalizeRecentStyleIds, rememberStyle, orderStylesByRecency };
