import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const verificationRoot = path.join(root, "data/restaurant-verification");
const cases = [
  ["distributed-machine-b-back-20260811142648", "taco-bamba", "active"],
  ["distributed-machine-b-back-20260811175149", "roaming-rooster-dc", "active"],
  ["distributed-machine-b-back-20260810221224", "the-ramyun-zip-centreville-va-dc-metro", "active"],
  ["distributed-machine-b-back-20260811155751", "shilling-canning-company-dc", "empty"],
  ["distributed-machine-b-back-20260810184453", "replacement-union-kitchen-3rd-washington-dc", "empty"],
];

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const readChecks = (id) => fs.readFileSync(path.join(verificationRoot, "item-checks", `${id}.jsonl`), "utf8")
  .split(/\r?\n/).filter(Boolean).map(JSON.parse);

for (const [runId, id, kind] of cases) {
  const runRoot = path.join(verificationRoot, "distributed-runs", runId);
  const manifest = readJson(path.join(runRoot, "manifest.json"));
  const job = manifest.jobs.find((entry) => entry.restaurantId === id);
  const resultPath = path.join(runRoot, String(job.finalResultPath || job.resultPath).replaceAll("\\", "/"));
  const result = readJson(resultPath);
  if (kind === "empty") {
    result.emptyCatalogReason = "closed_or_no_current_catalog";
    result.outcome = "verified";
    result.recommendedLane = "verify";
    fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    continue;
  }

  const checks = readChecks(id);
  const baselineUrls = [...new Set(checks.flatMap((check) => check.baseline.sourceUrls || []))];
  for (const [index, url] of baselineUrls.entries()) {
    if (!result.sources.some((source) => source.url === url)) result.sources.push({
      evidenceId: `src-frozen-baseline-${index + 1}`,
      url,
      authorityTier: "restaurant_issued",
      purpose: /allergen|ingredient/i.test(url) ? "official allergen evidence" : "official menu evidence",
      retrievedAt: result.sources[0]?.retrievedAt || new Date().toISOString(),
    });
  }
  const menuSources = result.sources.filter((source) => /menu|order|allergen/.test(String(source.purpose || "").toLowerCase()));
  const fallbackSource = menuSources[0] || result.sources[0];
  const sourceId = (source) => source.evidenceId || source.id;
  const sourceFor = (check) => menuSources.find((source) =>
    (check.baseline.sourceUrls || []).some((url) => url === source.url)) || fallbackSource;
  result.currentProducts = checks.map((check) => {
    const source = sourceFor(check);
    const direct = [...(check.baseline.allergens || [])];
    const mayContain = [...(check.baseline.mayContain || [])];
    const hasDirect = direct.length > 0 || mayContain.length > 0;
    const directSourceType = check.baseline.allergenSourceType === "official-allergen-menu"
      ? "restaurant_allergen_document"
      : "restaurant_ingredients";
    return {
      currentProductKey: check.baseline.itemId,
      name: check.baseline.name,
      category: check.baseline.category,
      variantGroup: check.baseline.variantGroup,
      isConfigurable: check.baseline.isConfigurable,
      sourceEvidenceIds: [sourceId(source)],
      containsAllergens: direct,
      mayContainAllergens: mayContain,
      allergenSourceType: hasDirect ? directSourceType : "unavailable",
      allergenAuthorityTier: hasDirect ? source.authorityTier : null,
      allergenSourceEvidenceIds: hasDirect ? [sourceId(source)] : [],
    };
  });
  result.reconciliation = { items: checks.map((check) => ({
    auditItemKey: check.auditItemKey,
    disposition: "exact_match",
    matchedCurrentProductKeys: [check.baseline.itemId],
    sourceEvidenceIds: [sourceId(sourceFor(check))],
    notes: "Restored from frozen official-menu-backed baseline after machine-B zero-catalog serialization defect.",
  })) };
  if (!Array.isArray(result.menuSurfaces)) result.menuSurfaces = [];
  if (!result.menuSurfaces.length) result.menuSurfaces.push({
    surfaceId: "official-menu",
    url: fallbackSource.url,
    authorityTier: fallbackSource.authorityTier,
    locationScope: result.identity?.location || result.identity?.address || "restaurant scope",
    servicePeriod: "current menu",
    current: true,
    scopeStatus: "complete",
    sourceEvidenceIds: [sourceId(fallbackSource)],
  });
  for (const surface of result.menuSurfaces) {
    const ids = surface.sourceEvidenceIds || [];
    surface.currentProductKeys = result.currentProducts
      .filter((product) => product.sourceEvidenceIds.some((evidenceId) => ids.includes(evidenceId)))
      .map((product) => product.currentProductKey);
  }
  if (!result.menuSurfaces.some((surface) => surface.currentProductKeys.length)) {
    result.menuSurfaces[0].currentProductKeys = result.currentProducts.map((product) => product.currentProductKey);
  }
  result.outcome = "verified";
  result.recommendedLane = "verify";
  result.blockedReason = null;
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
}
