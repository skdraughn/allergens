import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "ambar-restaurant-clarendon-arlington-va-dc-metro";

const evidenceByUrl = new Map([
  ["https://ambarrestaurant.com/menu/ambarclarendon", "official-online-menu"],
  ["https://static-content.owner.com/document/f413c88a-091a-47c8-b839-f244ff229ab1.pdf", "official-a-la-carte-pdf"],
  ["https://static-content.owner.com/document/a51f9ef3-91c0-4f7e-9672-b9dbe484c13b.pdf", "official-unlimited-brunch-pdf"],
  ["https://static-content.owner.com/document/352c4c7a-7a85-4e3d-9e2a-be45f0b5c92c.pdf", "official-unlimited-lunch-pdf"],
  ["https://static-content.owner.com/document/9c0e51c8-4d7e-4201-a89d-c4c122344e47.pdf", "official-unlimited-dinner-pdf"],
  ["https://static-content.owner.com/document/76160707-5a2f-4b0c-a194-694550cea79e.pdf", "official-desserts-pdf"],
  ["https://static-content.owner.com/document/f35d26c5-87b2-4d35-a5bf-6f4f86960cab.pdf", "official-drinks-pdf"],
  ["https://static-content.owner.com/document/030e19b3-3601-410c-a33c-a90b9fc90453.pdf", "official-happy-hour-pdf"],
]);

const staleFrozenRows = new Map([
  [normalize("Mixed Meat"), stale("artifact", "The frozen parser emitted a descriptionless Mixed Meat child as a standalone item. The current ordering surface publishes Meat From the Grill as the configurable parent and no standalone Mixed Meat formulation.")],
  [normalize("Krempita"), stale("stale_extra", "Krempita is absent from the current May 2026 dessert PDF and the current Clarendon ordering menu, whose current desserts are Raspberry Cake, Baklava, Chocolate Cake, and Sorbet Duo.")],
  [normalize("Slow Cooked Pork Shoulder"), stale("stale_extra", "No standalone Slow Cooked Pork Shoulder appears in the current June 2026 Clarendon menus. Slow Cooked remains a configurable two-person ordering package, not the frozen standalone entree.")],
  [normalize("Coke (Can"), stale("stale_extra", "The current Clarendon drink and ordering menus list Mexican Coke/Mexican Coca Cola and Diet Coke but no standalone Coke can. The separate frozen Mexican Coke Bottle row maps to the current Mexican Coke formulation.")],
  [normalize("Balkan Style Rice"), stale("stale_extra", "No standalone Balkan Style Rice appears in the current Clarendon dine-in PDFs or ordering menu; the current rice formulation is Mushroom Pilaf.")],
  [normalize("Lamb Pizza"), stale("stale_extra", "The current Clarendon menus publish White, Mushroom, and Sujuk Flatbreads but no Lamb Pizza or Lamb Flatbread.")],
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
  [normalize("Steak Frites"), mapping("NY Strip Steak", "variant_match")],
  [normalize("Stuffed Cabbage"), mapping("Pork Belly Stuffed Cabbage", "normalized_match")],
  [normalize("Diet Coke (Can"), mapping("Diet Coke", "normalized_match")],
  [normalize("Mexican Coke Bottle"), mapping("Mexican Coke", "normalized_match")],
  [normalize("Sprite (Can"), mapping("Mexican Sprite", "variant_match")],
  [normalize("Brussel Sprouts"), mapping("Brussels Sprouts", "normalized_match")],
  [normalize("4 oz Hanger Steak"), mapping("Hanger Steak", "normalized_match")],
  [normalize("Mushroom Pizza"), mapping("Mushroom Flatbread", "normalized_match")],
  [normalize("Sujuk Pizza"), mapping("Sujuk Flatbread", "normalized_match")],
  [normalize("White Pizza"), mapping("White Flatbread", "normalized_match")],
]);

export function reconcileAmbarClarendonBaselineItems(checks, snapshot) {
  const matchedCurrentNames = new Set();
  const itemChecks = checks.map((check) => {
    const staleRow = staleFrozenRows.get(normalize(check.baseline.name));
    if (staleRow) {
      return {
        ...check,
        disposition: staleRow.disposition,
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["official-menu-index", "official-online-menu", "official-a-la-carte-pdf", "official-unlimited-brunch-pdf", "official-desserts-pdf"],
        notes: staleRow.note,
      };
    }

    const match = findCurrentItem(snapshot.items, check.baseline.name);
    if (!match) throw new Error(`Unadjudicated AMBAR Clarendon frozen row: ${check.baseline.name}`);
    matchedCurrentNames.add(match.item.name);
    const same = signature(match.item) === signature(check.baseline);
    const allergenVerdict = same
      ? match.item.allergens.length === 0 && match.item.mayContain.length === 0
        ? "accurately_unavailable"
        : "verified"
      : "mismatch";
    const labelNote = match.item.officialAllergenCodes?.length
      ? ` Clarendon's current D/G/N/SF/E/S codes are direct item allergen labels; an asterisk means the labeled allergen can be modified and therefore remains present in the default formulation.`
      : "";
    const coverageNote = ` The six-code legend does not cover fish, mustard, soy, peanuts, or sulfites; those signals were added only from direct current item identity or wording, and no item-level may-contain claim was invented.`;
    const surfaceNote = match.item.presentations.length > 1 ? " Current service-surface presentations remain separately recorded." : "";

    return {
      ...check,
      disposition: match.kind,
      allergenVerdict,
      sourceEvidenceIds: evidenceIds(match.item),
      notes: `Current formulation: ${match.item.name} (${describe(match.item)}). Frozen: ${describe(check.baseline)}.${match.kind !== "exact_match" ? ` The current published display name is ${match.item.name}.` : ""}${labelNote}${coverageNote}${surfaceNote}`,
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
  if (!item) throw new Error(`AMBAR Clarendon mapping target missing: ${mapped.currentName}`);
  return { item, kind: mapped.kind };
}

function stale(disposition, note) { return { disposition, note }; }
function mapping(currentName, kind) { return { currentName, kind }; }
function evidenceIds(item) { return [...new Set((item.sourceUrls ?? []).map((url) => evidenceByUrl.get(url)).filter(Boolean))]; }

function mismatchKinds(checks, currentItems) {
  const counts = {};
  for (const check of checks.filter((candidate) => candidate.allergenVerdict === "mismatch")) {
    const match = findCurrentItem(currentItems, check.baseline.name);
    if (!match) throw new Error(`Cannot classify AMBAR Clarendon mismatch for ${check.baseline.name}.`);
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
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function signature(item) { return `${[...(item.allergens ?? [])].sort().join(",")}|${[...(item.mayContain ?? [])].sort().join(",")}`; }
function describe(item) { return `contains ${(item.allergens ?? []).length ? item.allergens.join(", ") : "no supported fixed allergen signal"}; may contain ${(item.mayContain ?? []).length ? item.mayContain.join(", ") : "no published item-level cross-contact signal"}`; }
function countBy(rows, key) { const counts = {}; for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1; return counts; }

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const baselinePath = path.resolve(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`);
  const snapshotPath = path.resolve(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`);
  const [baselineText, snapshotText] = await Promise.all([readFile(baselinePath, "utf8"), readFile(snapshotPath, "utf8")]);
  const result = reconcileAmbarClarendonBaselineItems(baselineText.trim().split(/\r?\n/).map(JSON.parse), JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
