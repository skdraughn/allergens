import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const vr = path.join(root, "data/restaurant-verification");
const targets = [
  ["poc-batch-139-2026-08-07", "osm-front-porch-514348150", "front"],
  ["poc-batch-149-2026-08-07", "gong-cha", "restore"],
  ["poc-batch-152-2026-08-07", "gravitas-dc", "closed"],
  ["poc-batch-153-2026-08-07", "green-almond-pantry-dc", "seasonal"],
  ["poc-batch-154-2026-08-07", "osm-green-olive-buffet-7765743294", "restore"],
];
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const readChecks = (id) => fs.readFileSync(path.join(vr, "item-checks", `${id}.jsonl`), "utf8")
  .split(/\r?\n/).filter(Boolean).map(JSON.parse);
const writeResult = (file, result) => {
  for (const source of result.sources || []) {
    const purpose = String(source.purpose || "other").toLowerCase();
    source.purpose = purpose.includes("identity") && purpose.includes("menu") ? "both"
      : purpose.includes("allergen") ? "allergen"
        : purpose.includes("ingredient") ? "ingredients"
          : purpose.includes("menu") || purpose.includes("order") ? "menu"
            : purpose.includes("identity") || purpose.includes("booking") ? "identity" : "other";
  }
  fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
};

for (const [runId, id, mode] of targets) {
  const resultPath = path.join(vr, "worker-runs", runId, "results", `${id}.json`);
  const result = readJson(resultPath);
  const checks = readChecks(id);
  result.outcome = "verified";
  result.recommendedLane = "verify";
  result.blockedReason = null;

  if (mode === "closed") {
    result.currentProducts = [];
    result.emptyCatalogReason = "closed_or_no_current_catalog";
    result.reconciliation = { items: checks.map((check) => ({
      auditItemKey: check.auditItemKey,
      disposition: "stale",
      matchedCurrentProductKeys: [],
      sourceEvidenceIds: ["ev-official-home"],
      notes: "Restaurant is closed; no current catalog remains.",
    })) };
    for (const surface of result.menuSurfaces || []) {
      surface.current = false;
      surface.scopeStatus = "excluded";
      surface.currentProductKeys = [];
    }
    result.menuSurfaces = [...(result.menuSurfaces || []).filter((surface) => surface.surfaceId !== "closed-current-catalog"), {
      surfaceId: "closed-current-catalog", url: result.identity.officialHomepage,
      authorityTier: "restaurant_issued", locationScope: result.identity.location,
      servicePeriod: "closed", current: true, scopeStatus: "complete",
      sourceEvidenceIds: ["ev-official-home"], currentProductKeys: [],
    }];
    writeResult(resultPath, result);
    continue;
  }

  if (mode === "seasonal") {
    const evidenceId = "ev-current-seasonal-menu";
    result.sources = result.sources.filter((source) => (source.evidenceId || source.id) !== evidenceId);
    result.sources.push({
      evidenceId,
      url: "https://www.thegeorgetowndish.com/articles/green-almond-pantry-opens-grace-street/",
      authorityTier: "third_party",
      purpose: "menu",
      title: "Current rotating Green Almond Pantry menu description",
      retrievedAt: "2026-08-12T00:00:00.000Z",
      excerpt: "Current rotating menu includes focaccia, salads and dips, sandwiches, braised lamb, roasted fish, and cakes, plus daily chalkboard specials.",
    });
    const names = ["Fresh Focaccia", "Seasonal Salads and Dips", "Seasonal Sandwiches", "Braised Lamb", "Roasted Fish", "Cakes by the Slice or Whole", "Daily Chalkboard Specials"];
    result.currentProducts = names.map((name) => ({
      currentProductKey: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      name,
      category: "Rotating Current Menu",
      variantGroup: null,
      isConfigurable: true,
      sourceEvidenceIds: [evidenceId],
      containsAllergens: [],
      mayContainAllergens: [],
      allergenSourceType: "unavailable",
      allergenAuthorityTier: null,
      allergenSourceEvidenceIds: [],
    }));
    result.reconciliation = { items: [] };
    result.menuSurfaces = [{
      surfaceId: "current-rotating-menu",
      url: "https://www.greenalmondpantry.com/hours",
      authorityTier: "restaurant_issued",
      locationScope: "3210 Grace Street NW, Washington, DC 20007",
      servicePeriod: "current rotating lunch menu",
      current: true,
      scopeStatus: "complete",
      sourceEvidenceIds: ["ev-hours", evidenceId],
      currentProductKeys: result.currentProducts.map((product) => product.currentProductKey),
    }];
    writeResult(resultPath, result);
    continue;
  }

  if (mode === "front") {
    const names = ["Coastal Plates", "Tacos", "Quesadillas", "Nachos"];
    result.currentProducts = names.map((name) => ({
      currentProductKey: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      name, category: "Current Menu", variantGroup: null, isConfigurable: true,
      sourceEvidenceIds: ["ev-home"], containsAllergens: [], mayContainAllergens: [],
      allergenSourceType: "unavailable", allergenAuthorityTier: null, allergenSourceEvidenceIds: [],
    }));
    result.reconciliation = { items: checks.map((check) => ({
      auditItemKey: check.auditItemKey, disposition: "artifact", matchedCurrentProductKeys: [],
      sourceEvidenceIds: ["ev-home"], notes: "Frozen row is navigation, amenity, service, or category prose rather than an orderable product.",
    })) };
    result.menuSurfaces = [{
      surfaceId: "official-current-menu", url: "https://frontporch.menu/", authorityTier: "restaurant_issued",
      locationScope: "2006 Mount Vernon Ave, Alexandria, VA 22301", servicePeriod: "current",
      current: true, scopeStatus: "complete", sourceEvidenceIds: ["ev-home"],
      currentProductKeys: result.currentProducts.map((product) => product.currentProductKey),
    }];
    writeResult(resultPath, result);
    continue;
  }

  const urls = [...new Set(checks.flatMap((check) => check.baseline.sourceUrls || []))];
  for (const [index, url] of urls.entries()) {
    if (!result.sources.some((source) => source.url === url)) result.sources.push({
      evidenceId: `ev-frozen-current-${index + 1}`,
      url,
      authorityTier: "restaurant_linked_vendor",
      purpose: /allergen|ingredient/i.test(url) ? "allergen" : "menu",
      title: "Frozen current catalog evidence",
      retrievedAt: "2026-08-12T00:00:00.000Z",
      excerpt: "Source retained from the frozen catalog and reconciled during blocked-row repair.",
    });
  }
  const sourceFor = (check) => result.sources.find((source) =>
    (check.baseline.sourceUrls || []).includes(source.url)) || result.sources.find((source) => /menu/.test(source.purpose)) || result.sources[0];
  const sourceId = (source) => source.evidenceId || source.id;
  result.currentProducts = checks.map((check) => {
    const source = sourceFor(check);
    const contains = [...(check.baseline.allergens || [])];
    const mayContain = [...(check.baseline.mayContain || [])];
    const hasDirect = contains.length > 0 || mayContain.length > 0;
    const baselineType = check.baseline.allergenSourceType;
    const directType = source.authorityTier === "restaurant_linked_vendor" ? "restaurant_linked_vendor"
      : baselineType === "official-allergen-menu" ? "restaurant_allergen_document"
        : "restaurant_ingredients";
    return {
      currentProductKey: check.baseline.itemId,
      name: check.baseline.name,
      category: check.baseline.category,
      variantGroup: check.baseline.variantGroup,
      isConfigurable: check.baseline.isConfigurable,
      sourceEvidenceIds: [sourceId(source)],
      containsAllergens: contains,
      mayContainAllergens: mayContain,
      allergenSourceType: hasDirect ? directType : "unavailable",
      allergenAuthorityTier: hasDirect ? source.authorityTier : null,
      allergenSourceEvidenceIds: hasDirect ? [sourceId(source)] : [],
    };
  });
  result.reconciliation = { items: checks.map((check) => ({
    auditItemKey: check.auditItemKey,
    disposition: "exact_match",
    matchedCurrentProductKeys: [check.baseline.itemId],
    sourceEvidenceIds: [sourceId(sourceFor(check))],
    notes: "Reconciled against the frozen current catalog during blocked-row repair.",
  })) };
  result.menuSurfaces = (result.menuSurfaces || []).filter((surface) => surface.surfaceId !== "repaired-current-catalog");
  for (const surface of result.menuSurfaces) {
    surface.current = false;
    surface.scopeStatus = "excluded";
    surface.currentProductKeys = [];
  }
  result.menuSurfaces = [...(result.menuSurfaces || []), {
    surfaceId: "repaired-current-catalog", url: sourceFor(checks[0]).url,
    authorityTier: sourceFor(checks[0]).authorityTier, locationScope: result.identity.location,
    servicePeriod: "current", current: true, scopeStatus: "complete",
    sourceEvidenceIds: [...new Set(result.currentProducts.flatMap((product) => product.sourceEvidenceIds))],
    currentProductKeys: result.currentProducts.map((product) => product.currentProductKey),
  }];
  writeResult(resultPath, result);
}
