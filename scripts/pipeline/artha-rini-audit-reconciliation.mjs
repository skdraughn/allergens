import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "osm-artha-rini-45808686";
const evidenceIds = [
  "official-artha-rini-menu-index",
  "official-artha-rini-main-menu-2026",
  "official-artha-rini-liwetan-2025",
  "official-artha-rini-gudeg-2025",
  "official-artha-rini-rijsttafel-2024",
  "official-artha-rini-foodstall-2024",
  "official-artha-rini-ricebox",
  "official-artha-rini-tumpeng",
  "official-artha-rini-jajanan-pasar-2026",
];

const artifacts = new Map([
  [5, "Ordering instruction from the Liwetan menu, not a product."],
  [12, "Food-stall Soup (16oz) section heading, not a product."],
  [21, "Main-menu Beverages/Desserts section heading, not a product."],
  [23, "Description fragment duplicated from the separately frozen Rawon row, not a second product."],
  [30, "Restaurant masthead text, not a product."],
  [38, "Description fragment duplicated from the separately frozen Aji Tea row, not a second product."],
  [43, "Main-menu Regular Menu/Entrees section heading, not a product."],
  [44, "Main-menu Rice Platters section heading, not a product."],
  [51, "Main-menu Soups section heading, not a product."],
  [52, "Price-prefix fragment from the configurable Rice Platter Padang Style, not a product."],
  [53, "Shrimp substitution modifier, not a product."],
  [56, "Without-rice modifier, not a product."],
]);

const mappings = new Map([
  [0, ["main:Pempek Adaan", "normalized_match"]],
  [1, ["main:Pempek Kapal Selam", "normalized_match"]],
  [2, ["foodstall:Gado-Gado", "normalized_match"]],
  [3, ["main:Gado-Gado", "normalized_match"]],
  [4, ["main:Mendoan", "normalized_match"]],
  [6, ["ricebox:Nasi Gudeg", "exact_match"]],
  [7, ["ricebox:Paket Nasi Pare", "exact_match"]],
  [8, ["foodstall:Pecel", "exact_match"]],
  [9, ["foodstall:Sate Ayam", "exact_match"]],
  [10, ["foodstall:Sate Kambing", "exact_match"]],
  [11, ["foodstall:Sate Maranggi", "exact_match"]],
  [13, ["foodstall:Steam Siomay", "exact_match"]],
  [14, ["main:Internet (Indomie Telur Kornet)", "normalized_match"]],
  [15, ["main:Nasi Kuning", "normalized_match"]],
  [16, ["main:Aji Tea", "exact_match"]],
  [17, ["main:Jus Alpukat", "normalized_match"]],
  [18, ["main:Bandeng Asap Goreng", "exact_match"]],
  [19, ["main:Soto Mie", "normalized_match"]],
  [20, ["main:Sate Padang", "normalized_match"]],
  [22, ["main:Gulai Kikil", "normalized_match"]],
  [24, ["main:Es Campur", "exact_match"]],
  [25, ["main:Nasi Uduk", "normalized_match"]],
  [26, ["main:Nasi Kuning", "normalized_match"]],
  [27, ["main:Ikan Bakar Sambal Mangga", "normalized_match"]],
  [28, ["main:Es Cendol", "normalized_match"]],
  [29, ["main:Mie Ayam", "normalized_match"]],
  [31, ["main:Mie Goreng Vegetarian", "normalized_match"]],
  [32, ["main:Nasi Goreng Vegetarian", "normalized_match"]],
  [33, ["main:Gulai Nangka", "normalized_match"]],
  [34, ["main:Tengkleng", "normalized_match"]],
  [35, ["main:Mie Baso", "normalized_match"]],
  [36, ["main:Mie Goreng Ayam", "exact_match"]],
  [37, ["main:Mie Goreng Udang", "exact_match"]],
  [39, ["main:Nasi Goreng Ayam", "exact_match"]],
  [40, ["main:Nasi Goreng Udang", "exact_match"]],
  [41, ["main:Paket Nasi Sayur Asem", "exact_match"]],
  [42, ["main:Rawon", "exact_match"]],
  [45, ["main:Salmon Kuah Kuning", "exact_match"]],
  [46, ["main:Sekuteng", "exact_match"]],
  [47, ["main:Udang Saus Padang", "normalized_match"]],
  [48, ["main:Udang Balado Pete", "normalized_match"]],
  [49, ["main:Soda / Water / Tea", "normalized_match"]],
  [50, ["main:Soto Betawi", "exact_match"]],
  [54, ["main:Tilapia Saus Padang", "normalized_match"]],
  [55, ["main:Tilapia Saus Asam Manis", "normalized_match"]],
  [57, ["main:Emping", "exact_match"]],
  [58, ["main:Rempeyek / Peyek", "normalized_match"]],
  [59, ["main:Rengginang", "normalized_match"]],
  [60, ["main:Kerupuk Udang", "normalized_match"]],
  [61, ["main:Steamed Rice", "exact_match"]],
]);

export function reconcileArthaRiniBaselineItems(checks, snapshot) {
  if (snapshot.restaurantId !== restaurantId || snapshot.itemCount !== 160) {
    throw new Error("Artha Rini snapshot does not satisfy the 160-product contract.");
  }
  if (checks.length !== 62) throw new Error(`Expected 62 frozen Artha Rini rows, got ${checks.length}.`);

  const currentById = new Map(snapshot.items.map((item) => [item.id, item]));
  const matchedCurrentIds = new Set();
  const itemChecks = checks.map((check) => {
    const index = check.baselineIndex;
    if (artifacts.has(index)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: evidenceIds,
        notes: artifacts.get(index),
      };
    }

    const mapping = mappings.get(index);
    if (!mapping) throw new Error(`No Artha Rini reconciliation mapping for frozen index ${index}.`);
    const [target, disposition] = mapping;
    const separator = target.indexOf(":");
    const sourceKey = target.slice(0, separator);
    const name = target.slice(separator + 1);
    const targetId = slugify(`${name}-${sourceKey}`);
    const current = currentById.get(targetId);
    if (!current) throw new Error(`Missing current Artha Rini target ${targetId} for frozen index ${index}.`);
    matchedCurrentIds.add(current.id);

    const baselineAllergens = uniqueSorted(check.baseline?.allergens ?? []);
    const currentAllergens = uniqueSorted(current.allergens ?? []);
    const baselineMayContain = uniqueSorted(check.baseline?.mayContain ?? []);
    const currentMayContain = uniqueSorted(current.mayContain ?? []);
    const mismatch =
      JSON.stringify(baselineAllergens) !== JSON.stringify(currentAllergens) ||
      JSON.stringify(baselineMayContain) !== JSON.stringify(currentMayContain) ||
      check.baseline?.allergenSourceType !== current.allergenSourceType;

    return {
      ...check,
      disposition,
      allergenVerdict: mismatch ? "mismatch" : "verified",
      sourceEvidenceIds: evidenceIds,
      notes: `${disposition === "exact_match" ? "Current product match" : "Malformed or incomplete frozen label normalized"}: ${current.name} [${current.variantGroup}]. Frozen fixed allergens: ${formatAllergens(baselineAllergens)}; current fixed allergens: ${formatAllergens(currentAllergens)}. Frozen cross-contact: ${formatAllergens(baselineMayContain)}; current restaurant-issued global cross-contact warning: ${formatAllergens(currentMayContain)}.`,
    };
  });

  const missingCurrentItems = snapshot.items.filter((item) => !matchedCurrentIds.has(item.id));
  return {
    restaurantId,
    itemChecks,
    missingCurrentItems,
    counts: {
      dispositions: countBy(itemChecks, (row) => row.disposition),
      allergens: countBy(itemChecks, (row) => row.allergenVerdict),
      current: {
        itemCount: snapshot.itemCount,
        matchedItemCount: matchedCurrentIds.size,
        missingItemCount: missingCurrentItems.length,
        missingItemIds: missingCurrentItems.map((item) => item.id),
      },
      mismatchKinds: {
        artifact: itemChecks.filter((row) => row.disposition === "artifact").length,
        malformed_or_incomplete_label: itemChecks.filter((row) => row.disposition === "normalized_match").length,
        global_cross_contact_omitted: itemChecks.filter((row) => row.allergenVerdict === "mismatch").length,
      },
    },
  };
}

function slugify(value) {
  return value.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function countBy(values, keyForValue) {
  const result = {};
  for (const value of values) {
    const key = keyForValue(value);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function formatAllergens(allergens) {
  return allergens.length > 0 ? allergens.join(", ") : "none";
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const baselinePath = path.resolve(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`);
  const snapshotPath = path.resolve(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`);
  const [baselineText, snapshotText] = await Promise.all([readFile(baselinePath, "utf8"), readFile(snapshotPath, "utf8")]);
  const result = reconcileArthaRiniBaselineItems(baselineText.trim().split(/\r?\n/).map(JSON.parse), JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
