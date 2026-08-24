import { getAllergyLabels } from "@/constants/allergies";
import type {
  AllergenId,
  MenuItem,
  OfficialAllergenProfiles,
  Restaurant,
} from "@/data/restaurants";

export type SafetyStatus = "unknown" | "ok" | "caution" | "avoid";

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
  return (item.inferredAllergenSignals ?? [])
    .map((signal) => signal.id)
    .filter((allergen) => selectedAllergyIds.has(allergen));
}

export function hasIngredientIntelligence(item: MenuItem) {
  return Boolean(
    item.ingredientIntelligenceReviewed ||
      (item.inferredAllergenSignals ?? []).length > 0 ||
      (item.inferenceSuppressions ?? []).length > 0,
  );
}

function isCoveredByOfficialProfile(
  allergenId: string,
  item: MenuItem,
  profiles: OfficialAllergenProfiles | undefined,
) {
  if (item.allergenSourceType === "unavailable") {
    return false;
  }

  const itemCoveredIds = new Set(item.officialAllergenCoveredIds ?? []);

  if (
    itemCoveredIds.has(allergenId as AllergenId)
  ) {
    return true;
  }

  const profileId = item.officialAllergenProfileId;

  if (!profileId) {
    return false;
  }

  const coveredIds = new Set(profiles?.[profileId]?.coveredAllergenIds ?? []);

  return coveredIds.has(allergenId as AllergenId);
}

export function getUncoveredOfficialAllergenIds(
  item: MenuItem,
  selectedAllergyIds: string[],
  profiles?: OfficialAllergenProfiles,
) {
  return Array.from(new Set(selectedAllergyIds)).filter(
    (allergenId) => !isCoveredByOfficialProfile(allergenId, item, profiles),
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
  const hasOfficialAllergenSource = item.allergenSourceType !== "unavailable";
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
        ...(item.allergenSourceType !== "unavailable"
          ? getMatchingAllergens(item.allergens, selectedAllergenSet)
          : []),
        ...(item.allergenSourceType !== "unavailable"
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
