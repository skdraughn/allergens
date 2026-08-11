import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "ambar-restaurant-capitol-hill-washington-dc-dc-metro";

const evidenceByUrl = new Map([
  ["https://ambarrestaurant.com/menu/ambarcapitolhill", "official-online-menu"],
  ["https://static-content.owner.com/document/ce4e23cb-7561-4ca6-a7bb-00ffb7f3cb7a.pdf", "official-a-la-carte-pdf"],
  ["https://static-content.owner.com/document/5c7e4860-be01-4688-9511-ad8cff325558.pdf", "official-unlimited-brunch-pdf"],
  ["https://static-content.owner.com/document/35f00e6e-bc6b-464a-8516-46d2a2301d7b.pdf", "official-unlimited-lunch-pdf"],
  ["https://static-content.owner.com/document/f310d68a-0d69-4eed-8972-b11fda7109c3.pdf", "official-unlimited-dinner-pdf"],
  ["https://static-content.owner.com/document/7c7a73db-04b9-4365-a96a-34e97fe1172e.pdf", "official-desserts-pdf"],
  ["https://static-content.owner.com/document/51b50115-3222-4b21-a2c9-5a5265c32df9.pdf", "official-drinks-pdf"],
  ["https://static-content.owner.com/document/d08f7b55-de97-49f8-9b28-6ad12294df23.pdf", "official-happy-hour-pdf"],
  ["https://static-content.owner.com/document/0d384863-02d6-40ad-80dd-21e51c6e19c4.pdf", "official-allergy-lunch-dinner-pdf"],
  ["https://static-content.owner.com/document/a1627292-ab58-4e39-bce7-9f8f3af765cb.pdf", "official-allergy-brunch-pdf"],
]);

const staleFrozenRows = new Map([
  [normalize("Mixed Meat"), {
    disposition: "artifact",
    note: "The frozen generic JSON parser emitted a descriptionless Mixed Meat child as a standalone menu item. The current ordering surface publishes Meat From the Grill as the configurable parent and no standalone Mixed Meat formulation.",
  }],
  [normalize("Krempita"), {
    disposition: "stale_extra",
    note: "Krempita appears in the January 2026-modified allergy guide but not in AMBAR's current May 2026 dessert document or current ordering menu; the current desserts are Raspberry Cake, Baklava, Chocolate Cake, and Berries & Cream.",
  }],
  [normalize("Balkan Style Rice"), {
    disposition: "stale_extra",
    note: "No standalone Balkan Style Rice appears on the current May/June 2026 dine-in documents or current ordering menu; current rice formulations are Mushroom Pilaf and Shrimp Pilaf.",
  }],
  [normalize("Lamb Pizza"), {
    disposition: "stale_extra",
    note: "The current May/June 2026 menus publish White, Mushroom, and Sujuk Flatbreads but no Lamb Pizza or Lamb Flatbread.",
  }],
]);

const frozenMappings = new Map([
  [normalize("Grilled Mixed Meat Platter"), mapping("Meat From the Grill", "variant_match")],
  [normalize("Grilled Seafood Platter"), mapping("Seafood From the Grill", "variant_match")],
  [normalize("Slow-Cooked Meats"), mapping("Slow Cooked", "normalized_match")],
  [normalize("Pistachio Baklava"), mapping("Baklava", "normalized_match")],
  [normalize("Balkan Kebabs"), mapping("Balkan Kebab", "normalized_match")],
  [normalize("Branzino"), mapping("Grilled Branzino", "normalized_match")],
  [normalize("Fried Chicken Sliders"), mapping("Fried Chicken", "variant_match")],
  [normalize("Lamb Kefta"), mapping("Lamb Medallions", "normalized_match")],
  [normalize("Slow Cooked Pork Shoulder"), mapping("Slow Cooked Pork", "normalized_match")],
  [normalize("Steak Frites"), mapping("NY Strip Steak", "variant_match")],
  [normalize("Stuffed Cabbage"), mapping("Pork Belly Stuffed Cabbage", "normalized_match")],
  [normalize("Coke (Can"), mapping("Coke (Can 12oz)", "normalized_match")],
  [normalize("Diet Coke (Can"), mapping("Diet Coke (Can 12oz)", "normalized_match")],
  [normalize("Mexican Coke Bottle"), mapping("Mexican Coke", "normalized_match")],
  [normalize("Sprite (Can"), mapping("Mexican Sprite", "variant_match")],
  [normalize("Brussel Sprouts"), mapping("Brussels Sprouts", "normalized_match")],
  [normalize("4 oz Hanger Steak"), mapping("Hanger Steak", "normalized_match")],
  [normalize("Mushroom Pizza"), mapping("Mushroom Flatbread", "normalized_match")],
  [normalize("Sujuk Pizza"), mapping("Sujuk Flatbread", "normalized_match")],
  [normalize("White Pizza"), mapping("White Flatbread", "normalized_match")],
]);

export function reconcileAmbarCapitolHillBaselineItems(checks, snapshot) {
  const matchedCurrentNames = new Set();
  const itemChecks = checks.map((check) => {
    const key = normalize(check.baseline.name);
    const stale = staleFrozenRows.get(key);
    if (stale) {
      return {
        ...check,
        disposition: stale.disposition,
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["official-menu-index", "official-online-menu", "official-a-la-carte-pdf", "official-unlimited-brunch-pdf", "official-desserts-pdf"],
        notes: stale.note,
      };
    }

    const match = findCurrentItem(snapshot.items, check.baseline.name);
    if (!match) throw new Error(`Unadjudicated AMBAR frozen row: ${check.baseline.name}`);
    matchedCurrentNames.add(match.item.name);
    const same = signature(match.item) === signature(check.baseline);
    const allergenVerdict = same
      ? match.item.allergens.length === 0 && match.item.mayContain.length === 0
        ? "accurately_unavailable"
        : "verified"
      : "mismatch";
    const guideNote = match.item.sourceUrls.some((url) => /0d384863|a1627292/.test(url))
      ? " AMBAR's GF/DF/NF/SF symbols are free-from or accommodation states and underlining means modification is required; missing free-from symbols were not inverted into contains claims."
      : "";
    const surfaceNote = match.item.presentations.length > 1
      ? " Same-name service-surface formulations were consolidated conservatively, while their source presentations remain separately recorded."
      : "";

    return {
      ...check,
      disposition: match.kind,
      allergenVerdict,
      sourceEvidenceIds: evidenceIds(match.item),
      notes: `Current formulation: ${match.item.name} (${describe(match.item)}). Frozen: ${describe(check.baseline)}.${match.kind !== "exact_match" ? ` The current published display name is ${match.item.name}.` : ""}${guideNote}${surfaceNote}`,
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
  if (!item) throw new Error(`AMBAR mapping target missing: ${mapped.currentName}`);
  return { item, kind: mapped.kind };
}

function mapping(currentName, kind) {
  return { currentName, kind };
}

function evidenceIds(item) {
  return [...new Set((item.sourceUrls ?? []).map((url) => evidenceByUrl.get(url)).filter(Boolean))];
}

function mismatchKinds(checks, currentItems) {
  const counts = {};
  for (const check of checks.filter((candidate) => candidate.allergenVerdict === "mismatch")) {
    const match = findCurrentItem(currentItems, check.baseline.name);
    if (!match) throw new Error(`Cannot classify AMBAR mismatch for ${check.baseline.name}.`);
    const before = new Set([...(check.baseline.allergens ?? []), ...(check.baseline.mayContain ?? [])]);
    const after = new Set([...(match.item.allergens ?? []), ...(match.item.mayContain ?? [])]);
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
  return `${[...(item.allergens ?? [])].sort().join(",")}|${[...(item.mayContain ?? [])].sort().join(",")}`;
}

function describe(item) {
  return `contains ${(item.allergens ?? []).length ? item.allergens.join(", ") : "no supported fixed allergen signal"}; may contain ${(item.mayContain ?? []).length ? item.mayContain.join(", ") : "no published item-level cross-contact signal"}`;
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
  const result = reconcileAmbarCapitolHillBaselineItems(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
