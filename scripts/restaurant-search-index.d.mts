export const nationalLocationId: string;
export const restaurantSearchIndexVersion: number;

export function buildRestaurantSearchIndexRows(repository: unknown): Record<string, any>[];

export function compatibilitySummaryForRestaurant(restaurant: unknown): Record<string, any>;

export function encodeGeohash(latitude: number, longitude: number, precision?: number): string;

export function normalizeSearchText(value: unknown): string;

export function searchTokensForRestaurant(restaurant: unknown): string[];
