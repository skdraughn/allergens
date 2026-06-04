export function buildRestaurantRepository(options?: {
  args?: Record<string, unknown>;
  chainFilter?: string[];
  limit?: number | null;
  previousPath?: string | null;
  previousRepository?: unknown;
}): Promise<{
  repository: Record<string, any>;
  run: Record<string, any>;
}>;
