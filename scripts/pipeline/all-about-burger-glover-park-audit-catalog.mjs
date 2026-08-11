import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAllAboutBurgerGloverPark = "all-about-burger-glover-park-dc";

export function buildAllAboutBurgerGloverParkAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAllAboutBurgerGloverPark,
    retrievedAt,
    sourceUrls: [
      "https://www.aaburger.com/lunch-dinner-menu",
      "https://www.gloverparkdc.com/post/all-about-burger-closes",
      "https://www.joiaburgerdc.com/menu/",
    ],
    presentationCount: 0,
    itemCount: 0,
    categoryCount: 0,
    ingredientSignalCount: 0,
    crossContactOnlyCount: 0,
    unavailableAllergenCount: 0,
    locationStatus: "closed_and_replaced",
    sourceWarning: "All About Burger Glover Park is not a current restaurant. The chain's current restaurant-issued site omits Glover Park, a contemporaneous neighborhood report documents its closure, and Joia Burger's current official site identifies the exact former address as its Glover Park location. The surviving historical Toast menu must not be represented as current menu or allergen data.",
    items: [],
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = buildAllAboutBurgerGloverParkAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAllAboutBurgerGloverPark}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    locationStatus: snapshot.locationStatus,
  }, null, 2));
}
