import { build1789AuditSnapshot } from "./1789-audit-catalog.mjs";

const artifacts = new Set([
  "lobster-fettucini-nero",
  "half-bottles-375ml",
  "loose-leaf-tea",
  "moo-and-blue",
]);

const staleItems = new Set([
  "kasekuchen",
  "red-wine-short-rib",
  "white-asparagus",
  "roasted-berkshire-pork",
  "pike-perch",
]);

export async function reconcile1789Baseline(itemChecks) {
  const snapshot = await build1789AuditSnapshot({ retrievedAt: "2026-07-14T17:27:51.960Z" });
  const currentByName = new Map(snapshot.items.map((item) => [normalizedName(item.name), item]));

  if (itemChecks.length !== 39) {
    throw new Error(`Expected 39 frozen 1789 rows; found ${itemChecks.length}.`);
  }

  return itemChecks.map((check) => {
    const id = check.baseline.itemId;
    if (artifacts.has(id)) {
      return {
        auditItemKey: check.auditItemKey,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: artifactEvidence(id),
        notes: artifactNote(id),
      };
    }
    if (staleItems.has(id)) {
      return {
        auditItemKey: check.auditItemKey,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["official-menu-page"],
        notes: "This prior special-event item is absent from every current menu published on the restaurant's official menu page.",
      };
    }

    const current = currentByName.get(normalizedName(check.baseline.name));
    if (!current) throw new Error(`No current 1789 match for ${id}: ${check.baseline.name}.`);
    const sameAllergens = sameSet(check.baseline.allergens, current.allergens);
    const allergenVerdict = sameAllergens && check.baseline.allergenSourceType === current.allergenSourceType
      ? current.allergenSourceType === "unavailable" ? "accurately_unavailable" : "verified"
      : "mismatch";
    const disposition = comparableName(check.baseline.name) === comparableName(current.name)
      ? "exact_match"
      : "normalized_match";
    return {
      auditItemKey: check.auditItemKey,
      disposition,
      allergenVerdict,
      sourceEvidenceIds: evidenceFor(current),
      notes: `Current match: ${current.name}. Baseline signals: ${signalText(check.baseline)}; current direct menu signals: ${signalText(current)}.`,
    };
  });
}

function evidenceFor(item) {
  if (item.category.startsWith("Dinner ·")) return ["official-menu-page", "official-dinner-pdf"];
  if (item.category.startsWith("Dessert ·")) return ["official-menu-page", "official-dessert-pdf"];
  return ["official-menu-page", "official-del-rio-menu-image"];
}

function artifactEvidence(id) {
  return id === "lobster-fettucini-nero"
    ? ["official-menu-page", "official-dinner-pdf"]
    : ["official-menu-page", "official-dessert-pdf"];
}

function artifactNote(id) {
  if (id === "lobster-fettucini-nero") {
    return "Duplicate PDF-spelling row for the structured Lobster Fettuccine Nero item; it is not a second menu item.";
  }
  if (id === "moo-and-blue") {
    return "A cheese option nested under Artisanal Cheese Board was incorrectly emitted as a separate menu item.";
  }
  return "A dessert-menu beverage section heading was incorrectly emitted as a standalone food item.";
}

function signalText(item) {
  return item.allergens?.length ? item.allergens.join(", ") : "none / unavailable";
}

function comparableName(value) {
  return String(value ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\*+$/g, "")
    .trim()
    .toLowerCase();
}

function normalizedName(value) {
  return comparableName(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sameSet(left = [], right = []) {
  return left.length === right.length && left.every((value) => right.includes(value));
}
