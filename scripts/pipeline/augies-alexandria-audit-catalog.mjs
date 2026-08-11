import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAugiesAlexandria =
  "augie-s-mussel-house-and-beer-garden-alexandria-va-dc-metro";

export const sourceUrlsAugiesAlexandria = Object.freeze({
  ownerMenu: "https://www.eataugies.com/augies-alexandria-menu",
  toastMenu: "https://www.toasttab.com/local/order/augies-mussel-house-patio",
});

const repairRoot =
  `data/restaurant-verification/repairs/${restaurantIdAugiesAlexandria}`;
const manifestPath = `${repairRoot}/source-manifest.json`;
const ownerArtifactPath =
  `data/restaurant-verification/artifacts/${restaurantIdAugiesAlexandria}/alexandria-current-menu.html`;
const expectedOwnerArtifactHash =
  "0c7f553216680ff0f24b3717829a002ce4b6c6e9bbf1701879650c44abbb4a33";

const allergenOrder = [
  "egg",
  "fish",
  "gluten",
  "milk",
  "mustard",
  "peanut",
  "sesame",
  "shellfish",
  "soy",
  "tree-nut",
  "wheat",
];

export async function buildAugiesAlexandriaAuditSnapshot({
  retrievedAt = new Date().toISOString(),
} = {}) {
  const [manifest, ownerArtifact] = await Promise.all([
    readJson(manifestPath),
    readFile(ownerArtifactPath),
  ]);
  const ownerArtifactHash = createHash("sha256").update(ownerArtifact).digest("hex");
  if (ownerArtifactHash !== expectedOwnerArtifactHash) {
    throw new Error(
      `Augie's Alexandria owner artifact changed: expected ${expectedOwnerArtifactHash}, found ${ownerArtifactHash}.`,
    );
  }

  const items = manifest.sections.flatMap((section) =>
    section.items.map((item) => finalizeItem(item, section.category))
  );
  const categoryCounts = Object.fromEntries(
    manifest.sectionOrder.map((category) => [
      category,
      items.filter((item) => item.category === category).length,
    ]),
  );
  const sourceTypeCounts = countBy(items, "allergenSourceType");
  const itemNameFingerprint = createHash("sha256")
    .update(items.map((item) => normalize(item.name)).sort().join("\n"))
    .digest("hex");

  assertEqual(items.length, 122, "item count");
  assertEqual(new Set(items.map((item) => item.id)).size, 122, "unique item IDs");
  assertEqual(Object.keys(categoryCounts).length, 12, "category count");
  assertDeepEqual(categoryCounts, manifest.counts.categoryItems, "category counts");
  assertDeepEqual(sourceTypeCounts, {
    "official-ingredients": 68,
    "restaurant-linked-menu-ingredients": 5,
    "restaurant-linked-product-allergen-section": 7,
    "official-global-cross-contact-note": 14,
    unavailable: 28,
  }, "source type counts");
  if (items.some((item) => item.mayContain.length !== 1 || item.mayContain[0] !== "gluten")) {
    throw new Error("Every Augie's Alexandria row must preserve the owner-issued gluten cross-contact warning.");
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAugiesAlexandria,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAugiesAlexandria),
    sourceStats: {
      ownerArtifactPath,
      ownerArtifactHash,
      toastRetrieval: "rendered-current-menu",
      toastAddress: "1106 King Street, Alexandria, VA 22314",
    },
    sectionOrder: [...manifest.sectionOrder],
    categoryCounts,
    itemCount: items.length,
    itemNameFingerprint,
    sourceTypeCounts,
    sourceWarning:
      "Augie's restaurant-issued Alexandria menu supplies current formulations and a restaurant-wide gluten cross-contact warning. The linked Alexandria Toast catalog supplies the current orderable boundary and seven explicit positive allergen labels, but it is not a complete matrix. Toast evidence remains labeled restaurant-linked rather than official. Toast-only product identities without positive label or owner formulation support remain unavailable and use Ingredient Intelligence; missing terms and (GF) labels are not negative assurances. Optional sauces, proteins, and add-ons are not smeared onto base products, and the raw-food advisory is not converted into allergen or cross-contact data.",
    items,
  };
}

function finalizeItem(item, category) {
  const onlyToast = item.sourceKeys.length === 1 && item.sourceKeys[0] === "T";
  const allergens = orderedAllergens(item.allergens ?? []);
  const allergenSourceType = item.toastPositive
    ? "restaurant-linked-product-allergen-section"
    : onlyToast && allergens.length > 0
      ? "restaurant-linked-menu-ingredients"
      : onlyToast
        ? "unavailable"
        : item.allergenSourceType;
  const sourceUrls = unique([
    ...item.sourceKeys.map((key) => key === "O"
      ? sourceUrlsAugiesAlexandria.ownerMenu
      : sourceUrlsAugiesAlexandria.toastMenu),
    sourceUrlsAugiesAlexandria.ownerMenu,
  ]);
  const evidence = [
    ...(item.evidence ?? []),
    ...item.sourceKeys
      .filter((key) => !item.evidence?.some((row) =>
        key === "O"
          ? row.sourceUrl === sourceUrlsAugiesAlexandria.ownerMenu
          : row.sourceUrl?.startsWith(sourceUrlsAugiesAlexandria.toastMenu)
      ))
      .map((key) => ({
        sourceKind: key === "O"
          ? "restaurant-issued-menu-text"
          : "restaurant-linked-vendor-menu-text",
        sourceUrl: key === "O"
          ? sourceUrlsAugiesAlexandria.ownerMenu
          : sourceUrlsAugiesAlexandria.toastMenu,
        text: item.description ?? item.name,
      })),
    {
      sourceKind: "restaurant-issued-global-cross-contact-note",
      sourceUrl: sourceUrlsAugiesAlexandria.ownerMenu,
      text: "Augie's is not a gluten free kitchen. Please let your server know of any allergies before consumption.",
    },
  ];

  return {
    id: item.id,
    name: item.name,
    category,
    description: item.description ?? null,
    ingredientsText: item.description ?? null,
    isConfigurable: Boolean(item.isConfigurable),
    aliases: item.aliases ?? [],
    presentations: item.presentations ?? [],
    allergenSourceType,
    allergens,
    mayContain: ["gluten"],
    sourceType: item.toastPositive
      ? "restaurant-linked-ordering-vendor-allergen-label"
      : onlyToast
        ? "restaurant-linked-ordering-vendor-menu"
        : item.sourceKeys.includes("T")
          ? "restaurant-issued-and-linked-ordering-menu"
          : "restaurant-issued-menu",
    sourceUrls,
    sourceSummary: sourceSummary(allergenSourceType),
    evidence,
  };
}

function sourceSummary(allergenSourceType) {
  if (allergenSourceType === "restaurant-linked-product-allergen-section") {
    return "A positive allergen label from the restaurant-linked Alexandria Toast product is combined with any direct restaurant-issued formulation terms. Toast is restaurant-linked vendor evidence, not a complete restaurant-issued matrix. The owner-issued kitchen-wide gluten cross-contact warning also applies.";
  }
  if (allergenSourceType === "restaurant-linked-menu-ingredients") {
    return "The unavoidable allergen identity comes from the current restaurant-linked Alexandria Toast product name. It is vendor menu evidence, not a restaurant-issued allergen matrix. The owner-issued kitchen-wide gluten cross-contact warning also applies.";
  }
  if (allergenSourceType === "official-ingredients") {
    return "Direct fixed ingredient or product-identity terms from the current restaurant-issued Alexandria menu support these positive signals. The menu is not a complete allergen matrix, and its kitchen-wide gluten cross-contact warning also applies.";
  }
  if (allergenSourceType === "official-global-cross-contact-note") {
    return "No fixed major-allergen signal is established for this product; only the restaurant-issued kitchen-wide gluten cross-contact warning is represented. This is not a negative assurance for other allergens.";
  }
  return "No restaurant-issued or explicit restaurant-linked item-level allergen disclosure was found. The owner-issued kitchen-wide gluten cross-contact warning is preserved, while product-name Ingredient Intelligence remains separate.";
}

function orderedAllergens(values) {
  const found = new Set(values);
  return allergenOrder.filter((allergen) => found.has(allergen));
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1;
  return counts;
}

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values)];
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`Augie's Alexandria ${label}: expected ${expected}, found ${actual}.`);
}

function assertDeepEqual(actual, expected, label) {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(
      `Augie's Alexandria ${label} changed: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}.`,
    );
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = await buildAugiesAlexandriaAuditSnapshot();
  await mkdir(repairRoot, { recursive: true });
  await writeFile(`${repairRoot}/corrected-menu.json`, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    itemNameFingerprint: snapshot.itemNameFingerprint,
    categoryCounts: snapshot.categoryCounts,
    sourceTypeCounts: snapshot.sourceTypeCounts,
  }, null, 2));
}
