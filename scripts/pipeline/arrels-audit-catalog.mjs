import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdArrels = "arrels-dc";

export function buildArrelsAuditSnapshot({
  retrievedAt = "2026-07-15T11:15:59.291Z",
} = {}) {
  return {
    schemaVersion: 1,
    restaurantId: restaurantIdArrels,
    retrievedAt,
    sourceUrls: [
      "https://arlohotels.com/washingtondc/eat-and-drink/restaurant/",
      "https://arlohotels.com/washingtondc/wp-content/uploads/sites/11/2026/03/Altair-Breakfast-Menu-3.19.26.pdf",
      "https://www.arrels-dc.com/menu",
      "https://dc.eater.com/dc-restaurant-closings/166869/dc-restaurants-closed-february-2026",
      "https://wtop.com/food-restaurant/2026/05/restaurant-closures-struggles-downtown-dc/",
    ],
    presentationCount: 0,
    itemCount: 0,
    categoryCount: 0,
    ingredientSignalCount: 0,
    crossContactOnlyCount: 0,
    unavailableAllergenCount: 0,
    locationStatus: "permanently_closed",
    replacementStatus: "transitional_breakfast_service",
    sourceWarning:
      "Arrels permanently closed in late March 2026. Arlo Hotels' current first-party page no longer identifies the space as Arrels and instead announces a forthcoming dining experience while operating breakfast under the generic Arlo DC Restaurant label. Its linked March 2026 breakfast PDF is named Altair Breakfast Menu and belongs to that transitional replacement service, not Arrels. The still-readable standalone Arrels menu is stale, and the frozen Restaurant Week dinner PDF is an older third-party special menu. No current Arrels menu or restaurant-issued allergen disclosure remains publishable.",
    items: [],
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = buildArrelsAuditSnapshot();
  const outputDir = path.resolve(
    `data/restaurant-verification/repairs/${restaurantIdArrels}`,
  );
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "corrected-menu.json"),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );
  console.log(
    JSON.stringify(
      {
        itemCount: snapshot.itemCount,
        locationStatus: snapshot.locationStatus,
        replacementStatus: snapshot.replacementStatus,
      },
      null,
      2,
    ),
  );
}
