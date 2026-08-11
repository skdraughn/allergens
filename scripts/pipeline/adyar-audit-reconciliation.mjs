import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "osm-adyar-ananda-bhavan-638589103";
const officialEvidence = ["official-menu", "official-home"];
const currentEvidence = [...officialEvidence, "third-party-toast-render-proxy"];

const artifactItemIds = new Set([
  "accompaniments",
  "big-fluffy-deep-fried-indian-bread-served-with-punjabi-style-spicy-chick-peas-masala",
  "chaat",
  "chinese",
  "chunks-of-soft-cottage-cheese-simmered-in-a-spiced-spinach-puree-garnished-with-cream",
  "cottage-cheese-and-green-peas-cooked-in-a-flavorful-onion-and-tomato-sauce",
  "cubes-of-fried-potato-and-green-peas-sauteed-in-a-flavorful-indian-sauce",
  "deep-fried-snack-seasoned-with-mixed-vegetables-served-with-chutney",
  "deep-fried-sweet-dumplings-stewed-in-sugar-syrup",
  "dosai-corner",
  "fluffy-deep-fried-indian-bread-served-with-seasoned-potato-masala",
  "mixed-vegetables-cooked-in-coconut-based-curry-with-traditional-south-indian-spices",
  "mixed-vegetables-cooked-in-special-spice-blend-and-served-with-bread-shallow-fried-in-butter",
  "mushroom-and-green-peas-cooked-with-khoa-and-traditional-spices",
  "mushroom-curry-made-in-kerala-style-coconut-based-preparation",
  "north-indian",
  "punjabi-style-nutritious-spinach-and-lentil-recipe-cooked-with-traditional-indian-spices",
  "riceand-noodles",
  "seasoned-potato-dumpling-coated-with-besan-flour-and-deep-fried",
  "shallow-fried-shredded-cottage-cheese-dumplings-cooked-in-a-rich-smooth-gravy",
  "south-indian-soft-pancake-made-of-rice-and-lentil-topped-with-gun-powder-milagaipodi",
  "traditional-south-indian-lunch-box-rice-recipes",
  "yummy-deep-fried-potato-fingers-tossed-with-salt-and-pepper-to-taste",
]);

const staleItemIds = new Set(["badhusha"]);

const aliases = new Map([
  ["adai-aviyal", "ADAI AVIYAL (Only for Dinner)"],
  ["aloo-bonda", "ALOO BONDA (Dinner Only)"],
  ["athirasam", "ADHIRASAM"],
  ["bajji", "BAJJI – Dinner Only (Choose from PLAINTAIN / CHILLI / POTATO / ONION)"],
  ["cashewnut-halwa", "CASHEW HALWA"],
  ["choice-of-65s", "CHOICE OF 65’s (Choose from CAULIFLOWER / PANEER / MUSHROOM)"],
  ["choice-of-chilli-fries", "CHOICE OF CHILLI FRIES (Choose from PANEER / MUSHROOM / CAULIFLOWER / BABYCORN)"],
  ["choice-of-fried-rice", "CHOICE OF FRIED RICE – (Choose from VEGETABLE / SZECHWAN / PANEER / MUSHROOM)"],
  ["choice-of-noodles", "CHOICE OF NOODLES – (Choose from VEGETABLE / SZECHWAN )"],
  ["choice-of-pepper-fries", "CHOICE OF PEPPER FRIES (Choose from PANEER / MUSHROOM / BABYCORN)"],
  ["choice-of-pulaos", "CHOICE OF PULAO’s – (Choose from VEGETABLE / PEAS / PANEER / MUSHROOM / KASHMIRI)"],
  ["chole-bhature", "CHOLE BHATURE (Only for Dinner)"],
  ["curd-rice", "VARIETY RICE (Choose from Bisi-bele-bhath / Tamarind Rice / Lemon Rice / Curd Rice)"],
  ["idiyappam-friday-saturday-and-sunday-only", "IDIYAPPAM (For Dinner Only)"],
  ["kaju-kathali", "KAJU KATHLI"],
  ["lemon-rice", "VARIETY RICE (Choose from Bisi-bele-bhath / Tamarind Rice / Lemon Rice / Curd Rice)"],
  ["payasam", "PAYASAM OF THE DAY"],
  ["plain-naan", "NAAN"],
  ["set-dosai-vadacurry", "SET DOSAI VADACURRY (Only for Dinner)"],
  ["spl-masore-pauk", "SPECIAL MYSORE PAUK"],
  ["tamarind-rice", "VARIETY RICE (Choose from Bisi-bele-bhath / Tamarind Rice / Lemon Rice / Curd Rice)"],
  ["tandoor-roti", "ROTI"],
]);

export function reconcileAdyarBaselineItems(baselineChecks, snapshot) {
  const itemChecks = (baselineChecks ?? []).map((check) => {
    const baseline = check.baseline;
    if (artifactItemIds.has(baseline.itemId)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: officialEvidence,
        notes: "The frozen row is a section heading or a menu description extracted as a standalone product; its text belongs to a real current item or category.",
      };
    }
    if (staleItemIds.has(baseline.itemId)) {
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: currentEvidence,
        notes: "Badhusha is absent from the current official menu and marked out of stock on the captured current ordering surface.",
      };
    }

    const current = findCurrentItem(baseline, snapshot.items ?? []);
    if (!current) throw new Error(`No current Adyar match for frozen row: ${baseline.name}`);
    const baselineAllergens = sorted(baseline.allergens);
    const currentAllergens = sorted(current.allergens);
    const baselineMayContain = sorted(baseline.mayContain);
    const currentMayContain = sorted(current.mayContain);
    const sameSignals = arraysEqual(baselineAllergens, currentAllergens) && arraysEqual(baselineMayContain, currentMayContain);
    const literalMatch = baseline.name === current.name;
    const normalizedMatch = normalize(baseline.name) === normalize(current.name);
    const unavailable = current.allergenSourceType === "unavailable";
    return {
      ...check,
      disposition: literalMatch ? "exact_match" : normalizedMatch ? "normalized_match" : "variant_match",
      allergenVerdict: sameSignals ? unavailable ? "accurately_unavailable" : "verified" : "mismatch",
      sourceEvidenceIds: current.sourceType.includes("restaurant-linked") ? currentEvidence : officialEvidence,
      notes: [
        `Current match: ${current.name} (${current.category}).`,
        `Frozen contains: ${list(baselineAllergens)}; current published contains: ${list(currentAllergens)}.`,
        `Frozen may contain: ${list(baselineMayContain)}; current published may contain: ${list(currentMayContain)}.`,
      ].join(" "),
    };
  });

  return {
    restaurantId,
    itemChecks,
    counts: {
      dispositions: countBy(itemChecks, "disposition"),
      allergens: countBy(itemChecks, "allergenVerdict"),
      mismatchKinds: countMismatchKinds(itemChecks, snapshot.items ?? []),
    },
  };
}

function findCurrentItem(baseline, currentItems) {
  const alias = aliases.get(baseline.itemId);
  if (alias) return currentItems.find((item) => item.name === alias) ?? null;
  const baselineName = normalize(baseline.name);
  return currentItems.find((item) => normalize(item.name) === baselineName) ?? null;
}

function countMismatchKinds(itemChecks, currentItems) {
  const counts = {};
  for (const check of itemChecks) {
    if (check.allergenVerdict !== "mismatch") continue;
    const current = findCurrentItem(check.baseline, currentItems);
    const baselineFixed = new Set(check.baseline.allergens ?? []);
    const baselineMay = new Set(check.baseline.mayContain ?? []);
    const currentFixed = new Set(current?.allergens ?? []);
    const currentMay = new Set(current?.mayContain ?? []);
    const baselineCombined = new Set([...baselineFixed, ...baselineMay]);
    const currentCombined = new Set([...currentFixed, ...currentMay]);
    const combinedSame = setsEqual(baselineCombined, currentCombined);
    let kind;
    if (combinedSame && !setsEqual(baselineFixed, currentFixed)) {
      kind = "fixed_to_may_contain";
    } else {
      const omitted = [...currentCombined].some((allergen) => !baselineCombined.has(allergen));
      const invented = [...baselineCombined].some((allergen) => !currentCombined.has(allergen));
      kind = omitted && invented ? "mixed" : omitted ? "underreported" : "overreported";
    }
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/&/g, " and ").replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}

function sorted(values) {
  return [...(values ?? [])].sort();
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function setsEqual(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
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
  const [baselineText, snapshotText] = await Promise.all([readFile(baselinePath, "utf8"), readFile(snapshotPath, "utf8")]);
  const baselineChecks = baselineText.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const result = reconcileAdyarBaselineItems(baselineChecks, JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
