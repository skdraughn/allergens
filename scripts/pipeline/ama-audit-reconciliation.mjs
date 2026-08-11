import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "ama-dc";
const evidenceByUrl = new Map([
  ["https://www.amarestaurant.bar/caffe-menu", "official-caffe-menu"],
  ["https://www.amarestaurant.bar/lunchanddinner", "official-lunch-dinner-menu"],
  ["https://www.amarestaurant.bar/ama-brunch", "official-brunch-menu"],
]);

const staleFrozenRows = new Set([normalize("Pesto"), normalize("Rice Bowl")]);

const frozenMappings = new Map([
  [normalize("Ama’s Signature Bone Broth (16oz Glass Jar)"), mapping("Ama's Signature Bone Broth", "normalized_match")],
  [normalize("Borage Lasagna Verdi con Ragù alla Bolognese"), mapping("Borage Lasagna con Ragù alla Bolognese", "normalized_match")],
  [normalize("Caffe Focaccia Classico"), mapping("Fügassa", "variant_match", ["wheat", "gluten"])],
  [normalize("Caffe Focaccia Pizzata"), mapping("Fügassa", "variant_match", ["milk", "wheat", "gluten"])],
  [normalize("Classico Fugassa"), mapping("Fügassa", "variant_match", ["wheat", "gluten"])],
  [normalize("Cotto, Crucolo, Onion Sandwich"), mapping("Prosciutto Cotto", "normalized_match")],
  [normalize("Mortadella Sandwich"), mapping("Mortadella", "normalized_match")],
  [normalize("Mortadella, Stracchino, Pesto Sandwich"), mapping("Mortadella", "normalized_match")],
  [normalize("Mozzarella, Basil, Semi Secchi Tomatos"), mapping("Buffalo Mozzarella", "normalized_match")],
  [normalize("Onion Fugassa"), mapping("Fügassa", "variant_match", ["wheat", "gluten"])],
  [normalize("Pizzata Fugassa"), mapping("Fügassa", "variant_match", ["milk", "wheat", "gluten"])],
  [normalize("Pollo Arrosto"), mapping("Pollo Arrosto al Forno", "normalized_match")],
  [normalize("Polpette Mondeghili"), mapping("Mondeghili Polpette", "normalized_match")],
  [normalize("Prosciutto, Parmigiano, Arugula Sandwich"), mapping("Prosciutto San Daniele", "normalized_match")],
  [normalize("Rosti Add On"), mapping("Rösti (Brunch)", "variant_match")],
  [normalize("Sbriciolona, Alta Badia, Tomato Sandwich"), mapping("Sbriciolona", "normalized_match")],
  [normalize("Trenette Pesto"), mapping("Trenette con Pesto Genovese", "normalized_match")],
  [normalize("Trofie Con Pesto"), mapping("Trofie di Castagne al Pesto", "normalized_match")],
  [normalize("Vitello Milanese"), mapping("Vitello alla Milanese", "normalized_match")],
]);

export function reconcileAmaBaselineItems(checks, snapshot) {
  const matchedCurrentNames = new Set();
  const itemChecks = checks.map((check) => {
    const baselineKey = normalize(check.baseline.name);
    if (staleFrozenRows.has(baselineKey)) {
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["official-caffe-menu", "official-lunch-dinner-menu", "official-brunch-menu"],
        notes: `The frozen restaurant-linked Toast catalog published ${check.baseline.name} as a standalone row. Ama's complete current Caffè, Lunch & Dinner, and Brunch pages do not publish that standalone formulation; ingredient mentions elsewhere are not converted into a menu item.`,
      };
    }

    const match = findCurrentItem(snapshot.items, check.baseline.name);
    if (!match) throw new Error(`Unadjudicated Ama frozen row: ${check.baseline.name}`);
    matchedCurrentNames.add(match.item.name);
    const expectedAllergens = match.allergens ?? match.item.allergens;
    const expectedMayContain = match.mayContain ?? match.item.mayContain;
    const same = signatureParts(expectedAllergens, expectedMayContain) === signature(check.baseline);
    const expectedDescription = describeSignals(expectedAllergens, expectedMayContain);
    const variantNote = match.allergens
      ? " The frozen row is a selectable Fügassa flavor, so its flavor-specific fixed ingredients are checked against that published variant while the corrected catalog keeps the parent Fügassa formulation configurable."
      : match.kind === "variant_match"
        ? " The frozen ordering row maps to a currently published service variant."
        : match.kind === "normalized_match"
          ? ` The current restaurant-issued display name is ${match.item.name}.`
          : "";

    return {
      ...check,
      disposition: match.kind,
      allergenVerdict: same
        ? expectedAllergens.length === 0 && expectedMayContain.length === 0
          ? "accurately_unavailable"
          : "verified"
        : "mismatch",
      sourceEvidenceIds: evidenceIds(match.item),
      notes: `Current formulation: ${match.item.name} (${expectedDescription}). Frozen: ${describeSignals(check.baseline.allergens, check.baseline.mayContain)}.${variantNote}`,
    };
  });

  const omittedCurrentItems = snapshot.items.filter((item) => !matchedCurrentNames.has(item.name));
  return {
    restaurantId,
    itemChecks,
    omittedCurrentItems: omittedCurrentItems.map((item) => item.name),
    counts: {
      dispositions: countBy(itemChecks, "disposition"),
      allergens: countBy(itemChecks, "allergenVerdict"),
      mismatchKinds: mismatchKinds(itemChecks, snapshot.items),
      matchedCurrentFormulations: matchedCurrentNames.size,
      omittedCurrentFormulations: omittedCurrentItems.length,
    },
  };
}

function findCurrentItem(items, baselineName) {
  const key = normalize(baselineName);
  const direct = items.find((item) => normalize(item.name) === key);
  if (direct) return { item: direct, kind: "exact_match" };
  const mapped = frozenMappings.get(key);
  if (!mapped) return null;
  const item = items.find((candidate) => candidate.name === mapped.currentName);
  if (!item) throw new Error(`Ama mapping target missing: ${mapped.currentName}`);
  return { item, kind: mapped.kind, allergens: mapped.allergens, mayContain: mapped.mayContain };
}

function mapping(currentName, kind, allergens, mayContain = []) {
  return { currentName, kind, allergens, mayContain };
}

function evidenceIds(item) {
  return [...new Set((item.sourceUrls ?? []).map((url) => evidenceByUrl.get(url)).filter(Boolean))];
}

function mismatchKinds(checks, currentItems) {
  const counts = {};
  for (const check of checks.filter((candidate) => candidate.allergenVerdict === "mismatch")) {
    const match = findCurrentItem(currentItems, check.baseline.name);
    if (!match) throw new Error(`Cannot classify mismatch for ${check.baseline.name}.`);
    const before = new Set([...(check.baseline.allergens ?? []), ...(check.baseline.mayContain ?? [])]);
    const after = new Set([...(match.allergens ?? match.item.allergens ?? []), ...(match.mayContain ?? match.item.mayContain ?? [])]);
    const omitted = [...after].some((value) => !before.has(value));
    const invented = [...before].some((value) => !after.has(value));
    const kind = omitted && invented ? "mixed" : omitted ? "underreported" : "overreported";
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function signature(item) {
  return signatureParts(item.allergens, item.mayContain);
}

function signatureParts(allergens = [], mayContain = []) {
  return `${[...allergens].sort().join(",")}|${[...mayContain].sort().join(",")}`;
}

function describeSignals(allergens = [], mayContain = []) {
  return `contains ${allergens.length ? allergens.join(", ") : "no supported fixed allergen signal"}; may contain ${mayContain.length ? mayContain.join(", ") : "no published item-level cross-contact signal"}`;
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
  const [baselineText, snapshotText] = await Promise.all([readFile(baselinePath, "utf8"), readFile(snapshotPath, "utf8")]);
  const result = reconcileAmaBaselineItems(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
