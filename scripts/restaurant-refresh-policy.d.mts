export const refreshJobStatuses: Record<string, string>;
export const refreshTiers: Record<string, string>;

export function addDaysIso(value: unknown, days: number): string;

export function evaluateRestaurantRefresh(
  meta: Record<string, any>,
  nowIso?: string,
): {
  reason: string;
  shouldQueue: boolean;
  snapshotPath: string | null;
  stale: boolean;
};

export function nextRetryAt(attemptCount: number, nowIso?: string): string;

export function refreshMetadataForRestaurant(
  restaurant: Record<string, any>,
  generatedAt: string,
): Record<string, any>;

export function refreshTierForRestaurant(restaurant: Record<string, any>): string;
