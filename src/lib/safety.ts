import { getAllergyLabels } from "@/constants/allergies";
import type { MenuItem, Restaurant } from "@/data/restaurants";

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

export function getMenuItemSafety(item: MenuItem, selectedAllergyIds: string[]) {
  const selectedAllergenSet = expandSelectedAllergyIds(selectedAllergyIds);
  const officialAllergenDataUnavailable =
    item.allergenSourceType === "unavailable" ||
    (!item.allergenSourceType && item.allergens.length === 0 && (item.mayContain ?? []).length === 0);
  const directMatches = getMatchingAllergens(item.allergens, selectedAllergenSet);
  const cautionMatches = getMatchingAllergens(item.mayContain ?? [], selectedAllergenSet);

  let status: SafetyStatus = "ok";

  if (selectedAllergyIds.length === 0 || officialAllergenDataUnavailable) {
    status = "unknown";
  } else if (directMatches.length > 0) {
    status = "avoid";
  } else if (cautionMatches.length > 0) {
    status = "caution";
  }

  return {
    cautionMatches,
    directMatches,
    matchedLabels: getAllergyLabels([...directMatches, ...cautionMatches]),
    status,
  };
}

export function getRestaurantSafety(restaurant: Restaurant, selectedAllergyIds: string[]) {
  const selectedAllergenSet = expandSelectedAllergyIds(selectedAllergyIds);
  const itemResults = restaurant.items.map((item) => getMenuItemSafety(item, selectedAllergyIds));
  const avoidCount = itemResults.filter((result) => result.status === "avoid").length;
  const cautionCount = itemResults.filter((result) => result.status === "caution").length;
  const okCount = itemResults.filter((result) => result.status === "ok").length;
  const unknownCount = itemResults.filter((result) => result.status === "unknown").length;
  const matchedAllergenIds = Array.from(
    new Set(
      restaurant.items.flatMap((item) => [
        ...getMatchingAllergens(item.allergens, selectedAllergenSet),
        ...getMatchingAllergens(item.mayContain ?? [], selectedAllergenSet),
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
