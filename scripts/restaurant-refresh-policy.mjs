export const refreshJobStatuses = {
  manualReview: "manual-review",
  queued: "queued",
  running: "running",
  skipped: "skipped",
  succeeded: "succeeded",
};

export const refreshTiers = {
  manual: "manual",
  userDemandLocal: "user-demand-local",
  weeklyChain: "weekly-chain",
};

const dayMs = 24 * 60 * 60 * 1000;
const localStaleMs = 30 * dayMs;
const retryBackoffDays = [1, 3, 7, 7];

export function refreshTierForRestaurant(restaurant) {
  if (restaurant?.refreshTier) {
    return restaurant.refreshTier;
  }

  return restaurant?.type === "local" ? refreshTiers.userDemandLocal : refreshTiers.manual;
}

export function refreshMetadataForRestaurant(restaurant, generatedAt) {
  const lastRefreshedAt = restaurant?.lastRefreshedAt ?? restaurant?.sourceUpdatedAt ?? generatedAt;
  const refreshTier = refreshTierForRestaurant(restaurant);

  return {
    lastOpenedAt: restaurant?.lastOpenedAt ?? null,
    lastRefreshedAt,
    nextEligibleRefreshAt:
      restaurant?.nextEligibleRefreshAt ??
      (refreshTier === refreshTiers.userDemandLocal ? addDaysIso(lastRefreshedAt, 30) : null),
    openedCount: Number.isFinite(restaurant?.openedCount) ? restaurant.openedCount : 0,
    refreshStatus: restaurant?.refreshStatus ?? refreshJobStatuses.succeeded,
    refreshTier,
  };
}

export function evaluateRestaurantRefresh(meta, nowIso = new Date().toISOString()) {
  const type = String(meta?.type ?? "chain");
  const refreshTier = String(meta?.refreshTier ?? (type === "local" ? refreshTiers.userDemandLocal : refreshTiers.manual));
  const snapshotPath = typeof meta?.snapshotPath === "string" ? meta.snapshotPath : null;

  if (type !== "local" || refreshTier !== refreshTiers.userDemandLocal) {
    return {
      reason: "not-user-demand-local",
      shouldQueue: false,
      snapshotPath,
      stale: false,
    };
  }

  const nowMs = Date.parse(nowIso);
  const lastRefreshedMs = Date.parse(String(meta?.lastRefreshedAt ?? ""));
  const nextEligibleMs = Date.parse(String(meta?.nextEligibleRefreshAt ?? ""));
  const lastFailedMs = Date.parse(String(meta?.lastFailedAt ?? ""));
  const attemptCount = Number.isFinite(meta?.attemptCount) ? Math.max(0, Number(meta.attemptCount)) : 0;
  const backoffMs = retryBackoffDays[Math.min(attemptCount, retryBackoffDays.length - 1)] * dayMs;
  const stale =
    !Number.isFinite(lastRefreshedMs) || Number.isNaN(lastRefreshedMs) || nowMs - lastRefreshedMs >= localStaleMs;
  const eligibleBySchedule = !Number.isFinite(nextEligibleMs) || Number.isNaN(nextEligibleMs) || nextEligibleMs <= nowMs;
  const eligibleByBackoff =
    !Number.isFinite(lastFailedMs) || Number.isNaN(lastFailedMs) || nowMs - lastFailedMs >= backoffMs;
  const hasSource = hasRefreshSource(meta);

  if (!stale) {
    return {
      reason: "fresh",
      shouldQueue: false,
      snapshotPath,
      stale: false,
    };
  }

  if (!eligibleBySchedule || !eligibleByBackoff) {
    return {
      reason: "backoff",
      shouldQueue: false,
      snapshotPath,
      stale: true,
    };
  }

  return {
    reason: hasSource ? "stale-local" : "needs-source",
    shouldQueue: true,
    snapshotPath,
    stale: true,
  };
}

export function nextRetryAt(attemptCount, nowIso = new Date().toISOString()) {
  const index = Math.min(Math.max(0, Number(attemptCount) || 0), retryBackoffDays.length - 1);
  return addDaysIso(nowIso, retryBackoffDays[index]);
}

export function addDaysIso(value, days) {
  const baseMs = Date.parse(String(value ?? ""));
  const safeBaseMs = Number.isFinite(baseMs) && !Number.isNaN(baseMs) ? baseMs : Date.now();
  return new Date(safeBaseMs + days * dayMs).toISOString();
}

function hasRefreshSource(meta) {
  const sourceUrls = Array.isArray(meta?.sourceUrls) ? meta.sourceUrls : [];
  return Boolean(meta?.guideUrl || sourceUrls.some((url) => typeof url === "string" && url.trim()));
}
