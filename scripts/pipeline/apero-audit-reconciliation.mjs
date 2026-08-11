import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { restaurantIdApero as restaurantId } from "./apero-audit-catalog.mjs";

const evidenceIds = Object.freeze([
  "official-apero-home",
  "official-apero-brunch-june-2026",
  "official-apero-lunch-june-2026",
  "official-apero-dinner-june-2026",
  "official-apero-caviar-hour",
  "apero-toast-readable-proxy",
  "nutella-official-product-label",
]);

const aliases = new Map([
  ["apero bistro salad", "Apéro Bistro Salad"],
  ["bistro salad", "Apéro Bistro Salad"],
  ["black river imperial", "Osetra — Black River Imperial"],
  ["black river royale", "Osetra — Black River Royale"],
  ["black truffle gougeres", "Gougères"],
  ["charcuterie", "Charcuterie Board"],
  ["chips and dip", "Potato Chips"],
  ["croissant eggs benedict add caviar 35", "Croissant Eggs Benedict"],
  ["deviled eggs bacon and chives add caviar 35", "Deviled Eggs"],
  ["escargot tartine", "Escargot Tartine"],
  ["fresh oysters hibiscus citrus honey foam add caviar 35", "Fresh Oysters"],
  ["fresh oysters hibiscus honey citrus foam add caviar dollar35", "Fresh Oysters"],
  ["giaveri classic", "Osetra — Giaveri Classic"],
  ["gougeres black truffle and gruyere cheese", "Gougères"],
  ["gougeres black truffle gruyere cheese", "Gougères"],
  ["lyna polska classic", "Osetra — Lyna Polska Classic"],
  ["mushroom cigarettes parmesan creme", "Mushroom Cigarettes"],
  ["mushroom cigerettes", "Mushroom Cigarettes"],
  ["pan seared scallops add caviar dollar35", "Pan Seared Scallops"],
  ["pate mousseline", "Pâté Mousseline"],
  ["petrossian royal daurenki", "Kaluga Hybrid — Petrossian Royal Daurenki"],
  ["platinum imperial", "Osetra — Platinum Imperial"],
  ["royal", "Osetra — Royal Belgium"],
]);

const artifactRows = new Map([
  ["10g dollar82", "This is a detached caviar price fragment created by two-column PDF extraction, not a menu item."],
  ["beluga hybrid", "This is a caviar species heading. The two actual Beluga Hybrid selections beneath it are retained separately."],
  ["osetra", "This is a caviar species heading. The eight actual Osetra selections beneath it are retained separately."],
  ["siberian sturgeon", "This is a caviar species heading. The three actual Siberian Sturgeon selections beneath it are retained separately."],
  ["white sturgeon", "This is a caviar species heading. Classic Italian is the actual selection beneath it."],
]);

const staleRows = new Map([
  ["absinthe service", "This is alcoholic beverage service, not a food or non-alcoholic menu item; its frozen description also swallowed the separate Petit-Déjeuner Français block."],
  ["crab benedict", "This older Toast presentation is absent from the current owner PDFs and current linked ordering menu."],
  ["insulated caviar to go bag", "This is retail merchandise, not food."],
  ["mother of pearl caviar spoons set of 2", "This is retail merchandise, not food."],
  ["side one over easy egg", "This older POS side is absent from the current owner PDFs and current linked ordering menu."],
  ["side salad", "This older POS side is absent from the current owner PDFs and current linked ordering menu."],
  ["side toast", "This older POS side is absent from the current owner PDFs and current linked ordering menu."],
]);

export function enrichAperoChecksFromFrozenRestaurant(checks, restaurant) {
  return checks.map((check) => {
    const frozenItem = (restaurant?.items ?? []).length === 49
      ? restaurant.items[check.baselineIndex]
      : null;
    if (frozenItem && frozenItem.id !== check.baseline.itemId) {
      throw new Error(
        `Apéro frozen baseline index ${check.baselineIndex} no longer matches ${check.baseline.itemId}.`,
      );
    }
    return {
      ...check,
      frozenDescription: check.frozenDescription ?? frozenItem?.description ?? null,
    };
  });
}

export function reconcileAperoBaselineItems(checks, snapshot) {
  if (checks.length !== 49) {
    throw new Error(`Apéro reconciliation expected 49 frozen rows, found ${checks.length}.`);
  }
  if (snapshot.items?.length !== 53) {
    throw new Error(`Apéro reconciliation expected 53 current rows, found ${snapshot.items?.length ?? 0}.`);
  }

  const currentByName = new Map(snapshot.items.map((entry) => [normalize(entry.name), entry]));
  const matchedCurrentIds = new Set();
  const itemChecks = checks.map((check) => {
    const baselineName = clean(check.baseline?.name);
    const key = normalize(baselineName);
    const artifactReason = artifactRows.get(key);
    if (artifactReason) {
      return terminalNonMatch(check, "artifact", artifactReason);
    }
    const staleReason = staleRows.get(key);
    if (staleReason) {
      return terminalNonMatch(check, "stale_extra", staleReason);
    }

    const aliasName = aliases.get(key);
    const current = currentByName.get(normalize(aliasName ?? baselineName));
    if (!current) {
      return terminalNonMatch(
        check,
        "missing_from_source",
        "No reviewed current Apéro item reconciles with this frozen row.",
      );
    }

    matchedCurrentIds.add(current.id);
    const allergenVerdict = equalSignals(check.baseline?.allergens, current.allergens) &&
      equalSignals(check.baseline?.mayContain, current.mayContain)
      ? "verified"
      : "mismatch";
    const descriptionMatches = normalize(check.frozenDescription) === normalize(current.description);
    const categoryMatches = normalize(check.baseline?.category) === normalize(current.category);
    const menuContentVerdict = descriptionMatches && categoryMatches ? "verified" : "mismatch";
    const notes = [];
    if (aliasName) notes.push(`The frozen presentation reconciles with current “${current.name}”.`);
    if (menuContentVerdict === "mismatch") {
      notes.push("The frozen category or description differs from the reviewed current menu presentation; several frozen descriptions swallowed adjacent PDF rows.");
    }
    if (allergenVerdict === "mismatch") {
      notes.push(
        `Frozen signals [${sorted(check.baseline?.allergens).join(", ") || "none"}] differ from supported current signals [${sorted(current.allergens).join(", ") || "none"}].`,
      );
    }
    if (notes.length === 0) {
      notes.push("The frozen item, menu content, and supported positive signals reconcile with current evidence.");
    }
    return {
      ...check,
      disposition: aliasName
        ? "variant_match"
        : baselineName === current.name
          ? "exact_match"
          : "normalized_match",
      allergenVerdict,
      menuContentVerdict,
      sourceEvidenceIds: [...evidenceIds],
      currentItemIds: [current.id],
      notes: notes.join(" "),
    };
  });

  const omittedCurrentItems = snapshot.items.filter((entry) => !matchedCurrentIds.has(entry.id));
  return {
    restaurantId,
    itemChecks,
    omittedCurrentItems,
    counts: {
      dispositions: countValues(itemChecks, "disposition", [
        "exact_match",
        "normalized_match",
        "variant_match",
        "stale_extra",
        "artifact",
        "missing_from_source",
      ]),
      allergens: countValues(itemChecks, "allergenVerdict", ["verified", "mismatch", "not_applicable"]),
      menuContent: countValues(itemChecks, "menuContentVerdict", ["verified", "mismatch", "not_applicable"]),
      matchedBaselineItemCount: itemChecks.filter((entry) =>
        ["exact_match", "normalized_match", "variant_match"].includes(entry.disposition)
      ).length,
      matchedCurrentItemCount: matchedCurrentIds.size,
      omittedCurrentItemCount: omittedCurrentItems.length,
    },
  };
}

function terminalNonMatch(check, disposition, reason) {
  return {
    ...check,
    disposition,
    allergenVerdict: "not_applicable",
    menuContentVerdict: "not_applicable",
    sourceEvidenceIds: [...evidenceIds],
    currentItemIds: [],
    notes: reason,
  };
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/\$/g, " dollar")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function sorted(values) {
  return [...(values ?? [])].sort();
}

function equalSignals(left, right) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function countValues(rows, field, values) {
  return Object.fromEntries(
    values.map((value) => [value, rows.filter((entry) => entry[field] === value).length])
      .filter(([, count]) => count > 0),
  );
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const checkPath = path.resolve(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`);
  const [checkText, snapshotText, liveText] = await Promise.all([
    readFile(checkPath, "utf8"),
    readFile(path.resolve(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`), "utf8"),
    readFile(path.resolve("src/data/generated/restaurants.generated.json"), "utf8"),
  ]);
  const liveData = JSON.parse(liveText);
  const liveRestaurant = (Array.isArray(liveData) ? liveData : liveData.restaurants)
    .find((entry) => entry.id === restaurantId);
  const checks = enrichAperoChecksFromFrozenRestaurant(
    checkText.trim().split(/\r?\n/).map(JSON.parse),
    liveRestaurant,
  );
  const result = reconcileAperoBaselineItems(checks, JSON.parse(snapshotText));
  await writeFile(checkPath, `${result.itemChecks.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  console.log(JSON.stringify({
    ...result.counts,
    omittedCurrentItems: result.omittedCurrentItems.map((entry) => entry.name),
  }, null, 2));
}
