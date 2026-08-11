import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAmuse = "osm-amuse-3396064825";

export function buildAmuseAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAmuse,
    retrievedAt,
    sourceUrls: [
      "https://www.marriott.com/en-us/hotels/wasrl-le-meridien-arlington/dining/",
      "https://www.marriott.com/en-us/dining/restaurant-bar/wasrl-le-meridien-arlington/5979289-amuse.mi",
      "https://www.rosslynva.org/go/amuse",
    ],
    presentationCount: 0,
    itemCount: 0,
    categoryCount: 0,
    ingredientSignalCount: 0,
    crossContactOnlyCount: 0,
    unavailableAllergenCount: 0,
    locationStatus: "temporarily_closed_for_renovation",
    sourceWarning:
      "Marriott's current Le Méridien Arlington dining page states that its bar and restaurant are temporarily closed for renovation. The same page still renders old Amuse hours below that closure banner, and the prior Marriott Amuse detail route now displays a page-unavailable message with no menu URL in its embedded outlet record. No current operating menu or restaurant-issued allergen disclosure is published. The Rosslyn directory page establishes identity only and must not be parsed together with unrelated Rosslyn directory, feature, or restaurant pages.",
    items: [],
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = buildAmuseAuditSnapshot();
  const outputDir = path.resolve(
    `data/restaurant-verification/repairs/${restaurantIdAmuse}`,
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
      },
      null,
      2,
    ),
  );
}
