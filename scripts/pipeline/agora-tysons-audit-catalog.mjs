import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildAgoraAuditSnapshot, publishedSignalsAgora } from "./agora-audit-catalog.mjs";

export const restaurantIdAgoraTysons = "agora-tysons-va";
export const sourceUrlsAgoraTysons = Object.freeze({
  dinner: "https://www.agorarestaurants.net/wp-content/uploads/2026/06/MASTER-DINNER-MENU-TYSONS-JUNE-17.pdf",
  lunch: "https://www.agorarestaurants.net/wp-content/uploads/2026/07/MASTER-TYSONS-LUNCH-MENU-JULY-8.pdf",
  brunch: "https://www.agorarestaurants.net/wp-content/uploads/2025/11/MASTER-TYSONS-Bottomless-Brunch-1121.pdf",
});

export function buildAgoraTysonsAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const shared = buildAgoraAuditSnapshot({ retrievedAt });
  const items = shared.items.map((item, index) => {
    let name = item.name;
    let description = item.description;
    if (item.category === "Dinner — Flat Breads" && item.name === "MIXED CHEESE PIDE") {
      description = "Baked flatbread topped with goat cheese, mozzarella, cherry tomatoes, and dates";
    }
    if (item.category === "Brunch — Eggs & Proteins" && item.name === "LAMB SHOULDER & WHEAT RICE") {
      name = "LAMB SHOULDER";
    }
    if (item.category === "Brunch — Eggs & Proteins" && item.name === "ŞİŞ TAVUK") {
      name = "SIS TAVUK";
    }
    const sourceUrl = item.category.startsWith("Dinner")
      ? sourceUrlsAgoraTysons.dinner
      : item.category.startsWith("Lunch") ? sourceUrlsAgoraTysons.lunch : sourceUrlsAgoraTysons.brunch;
    const id = `${slugify(item.category)}-${slugify(name)}`;
    const allergens = publishedSignalsAgora({ name, description });
    return {
      ...item,
      auditItemKey: `${index + 1}:${id}`,
      id,
      name,
      description,
      ingredientsText: description,
      sourceUrls: [sourceUrl],
      allergens,
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
    };
  });
  if (items.length !== 83 || new Set(items.map((item) => item.id)).size !== 83) {
    throw new Error("Agora Tysons current presentation identities changed.");
  }
  return {
    ...shared,
    restaurantId: restaurantIdAgoraTysons,
    sourceUrls: Object.values(sourceUrlsAgoraTysons),
    ingredientSignalCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sourceWarning: "Agora Tysons publishes current meal-period menus, item descriptions, and GF/DF/NF dietary labels, but no complete allergen matrix, complete recipes, or cross-contact policy. The rendered Tysons layout was reviewed independently; shared DC formulations are reused only where the current pages match, while location-specific brunch names remain distinct.",
    items,
  };
}

function slugify(value) {
  return String(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = buildAgoraTysonsAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAgoraTysons}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ itemCount: snapshot.itemCount, categoryCount: snapshot.categoryCount, ingredientSignalCount: snapshot.ingredientSignalCount, unavailableAllergenCount: snapshot.unavailableAllergenCount }, null, 2));
}
