import { getAllergyLabels } from "@/constants/allergies";
import allergenSourceContract from "@/data/allergen-source-contract.json";
import type {
  AllergenId,
  MenuItem,
  OfficialAllergenProfiles,
  Restaurant,
} from "@/data/restaurants";

export type SafetyStatus = "unknown" | "ok" | "caution" | "avoid";

export type PublishedAllergenSourceAuthority = "official" | "linked";

export const inclusionByExclusionAllergenIds: readonly AllergenId[] = [
  "milk",
  "egg",
  "fish",
  "shellfish",
  "tree-nut",
  "peanut",
  "wheat",
  "soy",
  "sesame",
];

const exhaustiveOfficialSourceTypes = new Set<
  MenuItem["allergenSourceType"]
>(allergenSourceContract.exhaustiveOfficialSourceTypes as MenuItem["allergenSourceType"][]);
const positiveOnlyOfficialSourceTypes = new Set<
  MenuItem["allergenSourceType"]
>(allergenSourceContract.positiveOnlyOfficialSourceTypes as MenuItem["allergenSourceType"][]);
const ingredientIntelligenceSourceTypes = new Set<
  MenuItem["allergenSourceType"]
>(allergenSourceContract.ingredientIntelligenceSourceTypes as MenuItem["allergenSourceType"][]);
const linkedOfficialSourceTypes = new Set<MenuItem["allergenSourceType"]>(
  allergenSourceContract.linkedOfficialSourceTypes as MenuItem["allergenSourceType"][],
);

function expandSelectedAllergyIds(selectedAllergyIds: string[]) {
  const expanded = new Set(selectedAllergyIds);

  if (expanded.has("gluten")) {
    expanded.add("wheat");
  }

  return expanded;
}

function getMatchingAllergens(allergenIds: string[], selectedAllergyIds: Set<string>) {
  return allergenIds.filter((allergen) => selectedAllergyIds.has(allergen));
}

function getMatchingInferredAllergens(item: MenuItem, selectedAllergyIds: Set<string>) {
  return getIngredientIntelligenceSignals(item)
    .map((signal) => signal.id)
    .filter((allergen) => selectedAllergyIds.has(allergen));
}

export function hasIngredientIntelligence(item: MenuItem) {
  return Boolean(
    isIngredientIntelligenceSource(item) ||
      Boolean(item.ingredientIntelligenceBasis) ||
      item.ingredientIntelligenceReviewed ||
      (item.inferredAllergenSignals ?? []).length > 0 ||
      (item.inferenceSuppressions ?? []).length > 0,
  );
}

export function getPublishedAllergenSourceAuthority(
  item: MenuItem,
): PublishedAllergenSourceAuthority | null {
  if (
    !item.allergenSourceType ||
    item.allergenSourceType === "unavailable" ||
    ingredientIntelligenceSourceTypes.has(item.allergenSourceType) ||
    (!exhaustiveOfficialSourceTypes.has(item.allergenSourceType) &&
      !positiveOnlyOfficialSourceTypes.has(item.allergenSourceType))
  ) {
    return null;
  }

  if (
    item.allergenAuthorityTier === "restaurant_linked_vendor" ||
    item.allergenAuthorityTier === "third_party" ||
    linkedOfficialSourceTypes.has(item.allergenSourceType)
  ) {
    return "linked";
  }

  return "official";
}

export function getRestaurantAllergenSourceCounts(restaurant: Restaurant) {
  let officialItemCount = 0;
  let linkedItemCount = 0;

  for (const item of restaurant.items) {
    const authority = getPublishedAllergenSourceAuthority(item);

    if (authority === "official") {
      officialItemCount += 1;
    } else if (authority === "linked") {
      linkedItemCount += 1;
    }
  }

  return {
    officialItemCount,
    linkedItemCount,
  };
}

export function getPublishedAllergenCoveredIds(
  item: MenuItem,
  profiles?: OfficialAllergenProfiles,
) {
  if (getPublishedAllergenSourceAuthority(item) === null) {
    return new Set<AllergenId>();
  }

  const profileId = item.officialAllergenProfileId;
  const coveredIds = new Set<AllergenId>([
    ...item.allergens,
    ...(item.mayContain ?? []),
    ...(item.officialAllergenCoveredIds ?? []),
    ...(profileId ? profiles?.[profileId]?.coveredAllergenIds ?? [] : []),
  ]);

  // A restaurant-issued positive wheat disclosure is also authoritative for a
  // Gluten profile. This is one-way: an official "no wheat" result does not
  // establish that an item is free from gluten sources such as barley or rye.
  if (
    item.allergens.includes("wheat") ||
    (item.mayContain ?? []).includes("wheat")
  ) {
    coveredIds.add("gluten");
  }

  if (exhaustiveOfficialSourceTypes.has(item.allergenSourceType)) {
    for (const allergenId of inclusionByExclusionAllergenIds) {
      coveredIds.add(allergenId);
    }
  }

  return coveredIds;
}

export function getApplicableIngredientIntelligenceSignals(
  item: MenuItem,
  profiles?: OfficialAllergenProfiles,
) {
  const coveredIds = getPublishedAllergenCoveredIds(item, profiles);

  return getIngredientIntelligenceSignals(item).filter(
    (signal) => !coveredIds.has(signal.id),
  );
}

export function getIngredientIntelligenceBasis(
  item: MenuItem,
): "title-description" | "title" {
  if (item.ingredientIntelligenceBasis) return item.ingredientIntelligenceBasis;

  return [item.description, item.ingredientsText].some(
    (value) => typeof value === "string" && value.trim().length > 0,
  )
    ? "title-description"
    : "title";
}

export function getIngredientIntelligenceSignals(item: MenuItem) {
  // Published restaurant-issued allergen evidence owns the entire item lane.
  // This also prevents stale pre-reclassification inference (for example,
  // wheat -> gluten) from being presented as Ingredient Intelligence.
  if (getPublishedAllergenSourceAuthority(item) !== null) {
    return [];
  }

  const signals = new Map(
    (item.inferredAllergenSignals ?? []).map((signal) => [signal.id, signal]),
  );

  if (isIngredientIntelligenceSource(item)) {
    const basis = getIngredientIntelligenceBasis(item);

    for (const id of [...(item.allergens ?? []), ...(item.mayContain ?? [])]) {
      if (!signals.has(id)) {
        signals.set(id, {
          id,
          c: "high" as const,
          e: [`legacy-reclassified:${basis}`],
        });
      }
    }
  }

  return Array.from(signals.values());
}

export function isIngredientIntelligenceSource(item: MenuItem) {
  return Boolean(
    item.allergenSourceType &&
      ingredientIntelligenceSourceTypes.has(item.allergenSourceType),
  );
}

export function getApplicableIngredientIntelligenceSuppressions(
  item: MenuItem,
  profiles?: OfficialAllergenProfiles,
) {
  const coveredIds = getPublishedAllergenCoveredIds(item, profiles);

  return (item.inferenceSuppressions ?? []).filter(
    (suppression) => !coveredIds.has(suppression.id),
  );
}

export function hasApplicableIngredientIntelligence(
  item: MenuItem,
  profiles?: OfficialAllergenProfiles,
) {
  if (!hasIngredientIntelligence(item)) {
    return false;
  }

  if (getPublishedAllergenSourceAuthority(item) === null) {
    return true;
  }

  return Boolean(
    getApplicableIngredientIntelligenceSignals(item, profiles).length > 0 ||
      getApplicableIngredientIntelligenceSuppressions(item, profiles).length >
        0,
  );
}

export function isPublishedAllergenCovered(
  item: MenuItem,
  profiles: OfficialAllergenProfiles | undefined,
  allergenId: string,
) {
  return getPublishedAllergenCoveredIds(item, profiles).has(
    allergenId as AllergenId,
  );
}

export function getUncoveredOfficialAllergenIds(
  item: MenuItem,
  selectedAllergyIds: string[],
  profiles?: OfficialAllergenProfiles,
) {
  return Array.from(new Set(selectedAllergyIds)).filter(
    (allergenId) => !isPublishedAllergenCovered(item, profiles, allergenId),
  );
}

export function getMenuItemSafety(
  item: MenuItem,
  selectedAllergyIds: string[],
  profiles?: OfficialAllergenProfiles,
) {
  const selectedAllergenSet = expandSelectedAllergyIds(selectedAllergyIds);
  const uncoveredOfficialAllergenIds = getUncoveredOfficialAllergenIds(
    item,
    selectedAllergyIds,
    profiles,
  );
  const officialAllergenDataUnavailable = uncoveredOfficialAllergenIds.length > 0;
  const hasOfficialAllergenSource =
    getPublishedAllergenSourceAuthority(item) !== null;
  const directMatches = hasOfficialAllergenSource
    ? getMatchingAllergens(item.allergens, selectedAllergenSet)
    : [];
  const cautionMatches = hasOfficialAllergenSource
    ? getMatchingAllergens(item.mayContain ?? [], selectedAllergenSet)
    : [];
  const uncoveredExpandedIds = expandSelectedAllergyIds(uncoveredOfficialAllergenIds);
  const inferredMatches = getMatchingInferredAllergens(item, uncoveredExpandedIds);

  let status: SafetyStatus = "ok";

  if (selectedAllergyIds.length === 0) {
    status = "unknown";
  } else if (directMatches.length > 0) {
    status = "avoid";
  } else if (cautionMatches.length > 0) {
    status = "caution";
  } else if (inferredMatches.length > 0) {
    status = "avoid";
  } else if (officialAllergenDataUnavailable) {
    status = "caution";
  }

  return {
    cautionMatches,
    crossContactMatchLabels: getAllergyLabels(cautionMatches),
    directMatches,
    directMatchLabels: getAllergyLabels(directMatches),
    inferredMatchLabels: getAllergyLabels(inferredMatches),
    inferredMatches,
    matchedLabels: getAllergyLabels([...directMatches, ...cautionMatches, ...inferredMatches]),
    officialAllergenDataUnavailable,
    uncoveredOfficialAllergenIds,
    status,
  };
}

export function getRestaurantSafety(restaurant: Restaurant, selectedAllergyIds: string[]) {
  const selectedAllergenSet = expandSelectedAllergyIds(selectedAllergyIds);
  const itemResults = restaurant.items.map((item) =>
    getMenuItemSafety(item, selectedAllergyIds, restaurant.officialAllergenProfiles),
  );
  const avoidCount = itemResults.filter((result) => result.status === "avoid").length;
  const cautionCount = itemResults.filter((result) => result.status === "caution").length;
  const okCount = itemResults.filter((result) => result.status === "ok").length;
  const unknownCount = itemResults.filter((result) => result.status === "unknown").length;
  const matchedAllergenIds = Array.from(
    new Set(
      restaurant.items.flatMap((item) => [
        ...(getPublishedAllergenSourceAuthority(item)
          ? getMatchingAllergens(item.allergens, selectedAllergenSet)
          : []),
        ...(getPublishedAllergenSourceAuthority(item)
          ? getMatchingAllergens(item.mayContain ?? [], selectedAllergenSet)
          : []),
        ...getMatchingInferredAllergens(
          item,
          expandSelectedAllergyIds(
            getUncoveredOfficialAllergenIds(
              item,
              selectedAllergyIds,
              restaurant.officialAllergenProfiles,
            ),
          ),
        ),
      ]),
    ),
  );

  return {
    avoidCount,
    cautionCount,
    matchedAllergenLabels: getAllergyLabels(matchedAllergenIds),
    okCount,
    totalCount: restaurant.items.length,
    unknownCount,
  };
}

export function getRestaurantVerdict(restaurant: Restaurant, selectedAllergyIds: string[]) {
  const summary = getRestaurantSafety(restaurant, selectedAllergyIds);

  if (selectedAllergyIds.length === 0) {
    return "Set allergies to review";
  }

  if (summary.avoidCount > 0) {
    return `${summary.avoidCount} item${summary.avoidCount === 1 ? "" : "s"} to avoid`;
  }

  if (summary.cautionCount > 0) {
    return `${summary.cautionCount} item${summary.cautionCount === 1 ? "" : "s"} need review`;
  }

  if (summary.unknownCount > 0) {
    return `${summary.unknownCount} item${summary.unknownCount === 1 ? "" : "s"} missing official allergen data`;
  }

  return "No matching allergens";
}
