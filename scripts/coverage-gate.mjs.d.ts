export function addCoverageMetadata(
  restaurant: Record<string, any>,
  adapter: Record<string, any>,
  generatedAt: string,
): Record<string, any>;

export function applyCoverageGate(
  repository: Record<string, any>,
  previousRepository?: unknown,
): {
  manifest: Record<string, any>;
  repository: Record<string, any>;
};

export function combinePreviousKnownGoodRepositories(
  ...repositories: unknown[]
): Record<string, any>;

export function validateRestaurantRepository(repository: unknown): boolean;
