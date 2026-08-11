import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { load } from "cheerio";

export const restaurantIdApplebees = "applebees";
export const retrievedAtApplebees = "2026-07-15T08:23:51.208Z";

export const sourceUrlsApplebees = Object.freeze({
  menu: "https://www.applebees.com/en/menu",
  nutrition: "https://www.applebees.com/en/nutrition",
  interactive: "https://www.applebees.com/en/nutrition/interactive-menu",
  nutritionixLanding: "https://restaurant.nutritionix.com/applebees/landing",
  nutritionixData:
    "https://nix-vue-inm.s3.amazonaws.com/restaurant/applebees/data/menu-latest.json.gz",
});

const trackedFields = Object.freeze([
  ["gluten", "gluten"],
  ["milk", "milk"],
  ["eggs", "egg"],
  ["fish", "fish"],
  ["shellfish", "shellfish"],
  ["treeNuts", "tree-nut"],
  ["peanuts", "peanut"],
  ["wheat", "wheat"],
  ["soy", "soy"],
  ["sesame", "sesame"],
]);

export const globalMayContainApplebees = Object.freeze([
  "egg",
  "fish",
  "milk",
  "peanut",
  "sesame",
  "shellfish",
  "soy",
  "tree-nut",
  "wheat",
  "gluten",
]);

export function buildApplebeesAuditSnapshot({
  menuHtml,
  nutritionText,
  interactiveText,
  nutritionixLandingHtml,
  nutritionixData,
  retrievedAt = retrievedAtApplebees,
} = {}) {
  assertOwnerSources({ menuHtml, nutritionText, interactiveText, nutritionixLandingHtml });
  assertNutritionixShape(nutritionixData);

  const itemById = new Map(nutritionixData.items.map((entry) => [entry.id, entry]));
  const consumerCategories = nutritionixData.categories.filter(
    (category) => category.previewOnly !== 1 && !/\bCatering\s*\(INM Only\)/i.test(category.name),
  );
  const items = consumerCategories.flatMap((category) => category.items.map((itemId) => {
    const sourceItem = itemById.get(itemId);
    if (!sourceItem) {
      throw new Error(`Applebee's Nutritionix category references missing item ${itemId}.`);
    }
    if (sourceItem.isActive !== 1 || sourceItem.categoryId !== category.id) {
      throw new Error(`Applebee's current item/category shape changed for ${sourceItem.name}.`);
    }
    const fieldValues = trackedFields.map(([field]) => sourceItem.allergens?.[field]?.presence);
    if (fieldValues.some((presence) => ![-1, 0, 1].includes(presence))) {
      throw new Error(`Applebee's allergen field shape changed for ${sourceItem.name}.`);
    }
    const hasItemMatrix = fieldValues.some((presence) => presence !== -1);
    const allergens = trackedFields
      .filter(([field]) => sourceItem.allergens[field].presence === 1)
      .map(([, allergyId]) => allergyId);
    const name = decodeHtml(sourceItem.name);
    return {
      auditItemKey: `${category.id}:${sourceItem.id}`,
      id: slugify(name),
      name,
      category: decodeHtml(category.name),
      description: null,
      ingredientsText: null,
      imageUrl: null,
      isConfigurable: true,
      allergens,
      mayContain: [...globalMayContainApplebees],
      allergenSourceType: hasItemMatrix
        ? "official-allergen-menu"
        : "official-global-cross-contact-note",
      sourceType: hasItemMatrix
        ? "restaurant-linked-nutritionix-official-allergen-menu-plus-official-global-cross-contact-note"
        : "official-global-cross-contact-note-with-configurable-linked-menu-shell",
      sourceUrls: [
        sourceUrlsApplebees.interactive,
        sourceUrlsApplebees.nutritionixLanding,
        sourceUrlsApplebees.nutritionixData,
        sourceUrlsApplebees.nutrition,
      ],
      sourceSummary: hasItemMatrix
        ? "Positive item signals come from Applebee's current linked Nutritionix allergen row. Applebee's official shared-prep/common-fryer notice applies separately to every item, so zero fields are not represented as allergen-free guarantees."
        : "This configurable category shell has no item-level allergen row. Applebee's official shared-prep/common-fryer notice still applies, and no absent signal is represented as an allergen-free guarantee.",
      evidence: [
        {
          sourceKind: "restaurant-linked-current-allergen-menu",
          sourceUrl: sourceUrlsApplebees.nutritionixData,
          text: `Nutritionix item ${sourceItem.id}: ${name}`,
        },
        {
          sourceKind: "restaurant-issued-global-cross-contact-note",
          sourceUrl: sourceUrlsApplebees.nutrition,
          text: "Applebee's cannot guarantee that any menu item is completely free of allergens or gluten-containing ingredients because of shared cooking and prep areas, including common fryer oil.",
        },
      ],
      nutritionixItemId: sourceItem.id,
      nutritionixCategoryId: category.id,
      nutritionixTemplateId: sourceItem.templateId,
      itemAllergenMatrixAvailable: hasItemMatrix,
    };
  }));

  const categoryNames = consumerCategories.map((category) => decodeHtml(category.name));
  if (consumerCategories.length !== 16 || categoryNames.at(-1) !== "Beverages") {
    throw new Error(`Applebee's expected 16 consumer categories with beverages last; found ${consumerCategories.length}.`);
  }
  if (items.length !== 130 || new Set(items.map((entry) => entry.id)).size !== 130) {
    throw new Error(`Applebee's expected 130 unique current items; found ${items.length}.`);
  }
  if (items.filter((entry) => entry.itemAllergenMatrixAvailable).length !== 119) {
    throw new Error("Applebee's expected 119 current item-level allergen rows.");
  }
  if (items.filter((entry) => !entry.itemAllergenMatrixAvailable).length !== 11) {
    throw new Error("Applebee's expected 11 configurable shells without item-level allergen rows.");
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdApplebees,
    retrievedAt,
    sourceGeneratedAt: nutritionixData.generatedAt,
    sourceUrls: Object.values(sourceUrlsApplebees),
    sourceCategoryCount: nutritionixData.categories.length,
    sourceItemCount: nutritionixData.items.length,
    sourceModifierCount: nutritionixData.modifiers.length,
    itemCount: items.length,
    categoryCount: consumerCategories.length,
    officialAllergenMenuCount: 119,
    globalCrossContactOnlyCount: 11,
    globalCrossContactAppliedCount: 130,
    excludedCateringItemCount: nutritionixData.categories.find((category) =>
      /Catering\s*\(INM Only\)/i.test(category.name)
    )?.items.length ?? 0,
    excludedPreviewOnlyItemCount: nutritionixData.categories.find((category) =>
      category.previewOnly === 1
    )?.items.length ?? 0,
    items,
  };
}

function assertOwnerSources({ menuHtml, nutritionText, interactiveText, nutritionixLandingHtml }) {
  const $ = load(String(menuHtml ?? ""));
  const nutritionLink = $("a").toArray().some((anchor) =>
    clean($(anchor).text()) === "Nutrition & Allergens" &&
    $(anchor).attr("href") === "/en/nutrition"
  );
  if (!nutritionLink || !String(menuHtml).includes("Applebee")) {
    throw new Error("Applebee's official menu page no longer exposes its Nutrition & Allergens route.");
  }
  const globalWarning = "unable to guarantee that any menu item can be completely free of allergens or gluten-containing ingredients";
  if (!String(nutritionText ?? "").includes(globalWarning)) {
    throw new Error("Applebee's official global allergen/gluten warning changed.");
  }
  for (const anchor of [
    "most current allergen information available from our food suppliers",
    "egg, fish, milk, peanuts, sesame, shellfish, soy, tree nuts, and wheat",
    "identify menu items with sulfites and gluten-containing ingredients",
  ]) {
    if (!String(interactiveText ?? "").includes(anchor)) {
      throw new Error(`Applebee's interactive nutrition disclosure changed: missing “${anchor}”.`);
    }
  }
  const landing = String(nutritionixLandingHtml ?? "");
  if (
    !landing.includes("/restaurant/' + slug + '/data/menu-latest") ||
    !landing.includes("Nutritionix.inm.load")
  ) {
    throw new Error("Applebee's linked Nutritionix landing no longer declares its current data route.");
  }
}

function assertNutritionixShape(data) {
  if (!data || data.generatedAt !== "2026-07-13T14:23:29+00:00") {
    throw new Error(`Applebee's Nutritionix generation changed: ${data?.generatedAt ?? "missing"}.`);
  }
  if (
    data.allergenIsSet !== 1 ||
    data.categories?.length !== 18 ||
    data.items?.length !== 513 ||
    data.modifiers?.length !== 741
  ) {
    throw new Error("Applebee's Nutritionix top-level source shape changed.");
  }
  for (const [field] of trackedFields) {
    if (data.availableAllergenFields?.[field] !== 1) {
      throw new Error(`Applebee's no longer marks ${field} as an available allergen field.`);
    }
  }
  if (data.availableAllergenFields?.crossContact !== 0) {
    throw new Error("Applebee's Nutritionix cross-contact field semantics changed.");
  }
}

function decodeHtml(value) {
  const $ = load(`<body>${String(value ?? "")}</body>`);
  return clean($("body").text());
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const artifactRoot = path.resolve(`data/restaurant-verification/artifacts/${restaurantIdApplebees}`);
  const [menuHtml, nutritionText, interactiveText, nutritionixLandingHtml, nutritionixDataText] =
    await Promise.all([
      readFile(path.join(artifactRoot, "official-applebees-menu.html"), "utf8"),
      readFile(path.join(artifactRoot, "applebees-nutrition-readable-proxy.txt"), "utf8"),
      readFile(path.join(artifactRoot, "applebees-interactive-nutrition-readable-proxy.txt"), "utf8"),
      readFile(path.join(artifactRoot, "applebees-linked-nutritionix-landing.html"), "utf8"),
      readFile(path.join(artifactRoot, "applebees-linked-nutritionix-menu.json"), "utf8"),
    ]);
  const snapshot = buildApplebeesAuditSnapshot({
    menuHtml,
    nutritionText,
    interactiveText,
    nutritionixLandingHtml,
    nutritionixData: JSON.parse(nutritionixDataText),
  });
  const outputDirectory = path.resolve(`data/restaurant-verification/repairs/${restaurantIdApplebees}`);
  const outputPath = path.join(outputDirectory, "corrected-menu.json");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    outputPath: path.relative(process.cwd(), outputPath),
    sourceGeneratedAt: snapshot.sourceGeneratedAt,
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    officialAllergenMenuCount: snapshot.officialAllergenMenuCount,
    globalCrossContactOnlyCount: snapshot.globalCrossContactOnlyCount,
  }, null, 2));
}
