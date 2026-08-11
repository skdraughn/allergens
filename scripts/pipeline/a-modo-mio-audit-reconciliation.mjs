import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "osm-a-modo-mio-207944730";
const evidenceIds = ["official-home", "official-menu", "third-party-toast-render-proxy"];
const artifactIds = new Set([
  "call-us-at-703-532-0990-or-book-a-table-through-resy",
  "yelp",
  "pizze-bianche-no-tomato-sauce",
  "pizze-rosse-tomato-sauce",
  "salad-and-soup",
  "braised-beef-ravioli-for-1",
]);

const aliases = new Map([
  ["caprese salad", "caprese"],
  ["pompei salad", "pompei"],
  ["house salad", "house"],
  ["kids pasta", "pasta penne or spaghetti"],
  ["kids grilled chicken and fries", "grilled chicken and fries"],
  ["kids meatballs and fries", "meatballs and fries"],
  ["polpo alla griglia", "polipo alla griglia"],
  ["polpette al sugo 2 pc", "polpette al sugo"],
  ["pollo alla milanese", "pollo milanese"],
  ["ferrarelle sparkling", "ferrarelle sparkling 750 ml"],
  ["ferrarelle still water", "ferrarelle still water 750 ml"],
  ["margherita personal 12", "margherita"],
  ["diavola personal 12", "diavola"],
  ["capricciosa personal 12", "capricciosa"],
  ["sicilia 12", "sicilia"],
  ["sicilia 16", "sicilia"],
  ["cotto e funghi personal 12", "cotto e funghi"],
  ["a modo mio personal 12", "a modo mio"],
  ["casertana personal 12", "casertana"],
  ["arlington personal 12", "arlington"],
  ["beef pepperoni personal 12", "pepperoni beef"],
  ["beef pepperoni family 16", "pepperoni beef"],
  ["meat lover personal 12", "meat lover"],
  ["pork pepperoni personal 12", "pepperoni pork"],
  ["pork pepperoni family 16", "pepperoni pork"],
  ["meats family 16", "meat lover"],
  ["4 formaggi personal 12", "4 formaggi"],
  ["vegetariana personal 12", "vegetariana"],
  ["porchetta personal 12", "porchetta"],
  ["alpina 12", "alpina"],
  ["gnocchi ai 4 formaggi for 1", "gnocchi 4 formaggi"],
  ["gnocchi sorrentina for 1", "gnocchi sorrentina"],
  ["paccheri alla bolognese for 1", "paccheri bolognese"],
  ["spaghetti al pomodoro for 1", "spaghetti al pomodoro"],
  ["spaghetti del mare for 1", "spaghetti del mare"],
]);

export function reconcileAModoMioBaselineItems(baselineChecks, snapshot) {
  const itemChecks = (baselineChecks ?? []).map((check) => {
    const baseline = check.baseline;
    if (artifactIds.has(baseline.itemId)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: evidenceIds,
        notes: baseline.itemId === "braised-beef-ravioli-for-1"
          ? "The current Toast row duplicates Braised Beef Ravioli but its title conflicts with a Paccheri, pesto, and stracciatella description; it is not safe to retain as a distinct verified product."
          : "The frozen row is a navigation prompt or category heading, not a standalone menu item.",
      };
    }

    const current = findCurrentItem(baseline, snapshot.items ?? []);
    if (!current) {
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: evidenceIds,
        notes: "The frozen item could not be matched to the current public or restaurant-linked ordering menus.",
      };
    }

    const baselineAllergens = sorted(baseline.allergens);
    const currentAllergens = sorted(current.allergens);
    const baselineMayContain = sorted(baseline.mayContain);
    const currentMayContain = sorted(current.mayContain);
    const sameSignals = arraysEqual(baselineAllergens, currentAllergens) &&
      arraysEqual(baselineMayContain, currentMayContain);
    const exact = normalize(baseline.name) === normalize(current.name);

    return {
      ...check,
      disposition: exact ? "exact_match" : "variant_match",
      allergenVerdict: sameSignals ? "verified" : "mismatch",
      sourceEvidenceIds: evidenceIds,
      notes: [
        `Current match: ${current.name} (${current.category}).`,
        `Baseline contains: ${list(baselineAllergens)}; current contains: ${list(currentAllergens)}.`,
        `Baseline may contain: ${list(baselineMayContain)}; current may contain: ${list(currentMayContain)}.`,
      ].join(" "),
    };
  });

  return {
    restaurantId,
    itemChecks,
    counts: {
      dispositions: countBy(itemChecks, "disposition"),
      allergens: countBy(itemChecks, "allergenVerdict"),
    },
  };
}

function findCurrentItem(baseline, currentItems) {
  const baselineName = normalize(baseline.name);
  const targetName = aliases.get(baselineName) ?? baselineName;
  const exactCandidates = currentItems.filter((item) => normalize(item.name) === targetName);
  if (exactCandidates.length > 0) return bestCandidate(baseline, exactCandidates);

  const targetSemantic = semanticName(targetName);
  const semanticCandidates = currentItems.filter((item) => semanticName(item.name) === targetSemantic);
  return semanticCandidates.length > 0 ? bestCandidate(baseline, semanticCandidates) : null;
}

function bestCandidate(baseline, candidates) {
  return [...candidates].sort((left, right) => scoreCandidate(baseline, right) - scoreCandidate(baseline, left))[0];
}

function scoreCandidate(baseline, candidate) {
  const category = candidate.category.toLowerCase();
  const variant = String(baseline.variantGroup ?? "").toLowerCase();
  let score = 0;
  if (variant.includes("catering") && category.startsWith("catering")) score += 12;
  if (variant.includes("lunch") && category.startsWith("lunch")) score += 12;
  if (variant.includes("dinner") && category.startsWith("dinner")) score += 12;
  if (variant.includes("dessert") && category.startsWith("dessert")) score += 12;
  if (baseline.category === "italian" && category.startsWith("online takeout")) score += 8;
  if (normalize(baseline.category) && normalize(candidate.category).includes(normalize(baseline.category))) score += 20;
  if (/\bsalad\b/i.test(baseline.name) && /salad/i.test(candidate.category)) score += 15;
  if (/\bpizz|\bpizze/i.test(baseline.category) && /pizz|pizze/i.test(candidate.category)) score += 8;
  if (/personal\s*-?\s*12/i.test(baseline.name) && category.startsWith("dinner") && /pizz|pizze/i.test(category)) score += 25;
  if (candidate.sourceType === "restaurant-issued-structured-menu") score += 1;
  return score;
}

function semanticName(value) {
  return normalize(value)
    .replace(/^lunch /, "")
    .replace(/^kids /, "")
    .replace(/ pizza family 16$/, "")
    .replace(/ family 16$/, "")
    .replace(/ personal 12$/, "")
    .replace(/ for 1$/, "")
    .replace(/ salad$/, "")
    .replace(/^polpo /, "polipo ")
    .replace(/ alla milanese$/, " milanese")
    .replace(/ alla bolognese$/, " bolognese")
    .trim();
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/\((?:gf|df|gluten free)\)/gi, " ")
    .replace(/&/g, " and ").replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}

function sorted(values) {
  return [...(values ?? [])].sort();
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function list(values) {
  return values.length > 0 ? values.join(", ") : "none";
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1;
  return counts;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const baselinePath = path.resolve(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`);
  const snapshotPath = path.resolve(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`);
  const [baselineText, snapshotText] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(snapshotPath, "utf8"),
  ]);
  const baselineChecks = baselineText.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const result = reconcileAModoMioBaselineItems(baselineChecks, JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
