import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { gunzipSync } from "node:zlib";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const repositoryPath = path.join(root, "src/data/generated/restaurants.generated.json");
const descriptionsOnly = process.argv.includes("--descriptions-only");
const ledgerPath = path.join(root, "data/restaurant-verification/ledger.jsonl");
const repository = JSON.parse(fs.readFileSync(repositoryPath, "utf8"));
const ledger = fs.readFileSync(ledgerPath, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
const ledgerById = new Map(ledger.map((row) => [row.restaurantId, row]));

const zeroCatalogPolicies = {
  "haikan-dc": ["closed", "This location is permanently closed; no current menu catalog is published."],
  "gravitas-dc": ["closed", "This restaurant is closed; no current menu catalog is published."],
  "shilling-canning-company-dc": ["closed", "No current operating catalog is available for this closed restaurant."],
  "replacement-union-kitchen-3rd-washington-dc": ["closed", "No current official catalog exists for the former 3rd Street location."],
  "electric-bull-vienna-va": ["pre-opening", "This restaurant is pre-opening and has not published a current menu catalog."],
  "mr-henry-s-restaurant-washington-dc-dc-metro": ["catalog-unavailable", "The restaurant identity is verified, but no current public itemized catalog was available during verification."],
};

repository.restaurants = repository.restaurants.filter((restaurant) =>
  restaurant && typeof restaurant.id === "string" && restaurant.id.length > 0 && ledgerById.has(restaurant.id));

const seen = new Set();
repository.restaurants = repository.restaurants.filter((restaurant) => {
  if (seen.has(restaurant.id)) return false;
  seen.add(restaurant.id);
  return true;
});

let canonicalProjectionCount = 0;
let canonicalProjectedItemCount = 0;
for (let index = 0; index < repository.restaurants.length; index += 1) {
  let restaurant = repository.restaurants[index];
  const row = ledgerById.get(restaurant.id);
  restaurant.name ||= row.name;
  restaurant.rank = Number.isFinite(restaurant.rank) ? restaurant.rank : row.rank;
  restaurant.brandKey ||= restaurant.id;
  restaurant.sourceFamily ||= row.baseline?.sourceFamily || "verified-catalog";
  restaurant.parserProfile ||= row.baseline?.parserProfile || restaurant.sourceFamily;
  restaurant.officialAllergenStatus ||= row.baseline?.officialAllergenStatus === "extracted"
    ? "extracted"
    : "accurately_unavailable";
  restaurant.coverageStatus ||= "complete";
  restaurant.type ||= row.locationId ? "local" : "chain";
  restaurant.items ||= [];

  const dossierPath = path.join(
    root,
    "data/restaurant-verification/restaurants",
    `${restaurant.id}.json`,
  );
  const evidencePath = path.join(
    root,
    "data/restaurant-verification/evidence",
    `${restaurant.id}.json`,
  );
  if (!descriptionsOnly && fs.existsSync(dossierPath)) {
    const dossier = JSON.parse(fs.readFileSync(dossierPath, "utf8"));
    const canonicalProducts = dossier.currentCatalog?.products;
    if (Array.isArray(canonicalProducts)) {
      const evidence = fs.existsSync(evidencePath)
        ? JSON.parse(fs.readFileSync(evidencePath, "utf8"))
        : { sources: [] };
      const evidenceById = new Map(
        (evidence.sources ?? []).map((source) => [source.id, source]),
      );
      const priorByKey = new Map(
        restaurant.items.flatMap((item) => {
          const keys = unique([
            item.currentProductKey,
            item.id,
            normalize(item.name),
          ]);
          return keys.map((key) => [key, item]);
        }),
      );
      const items = canonicalProducts.map((product) => {
        const old =
          priorByKey.get(product.currentProductKey) ??
          priorByKey.get(normalize(product.name)) ??
          {};
        const sourceEvidenceIds = unique(product.sourceEvidenceIds);
        const allergenSourceEvidenceIds = unique(product.allergenSourceEvidenceIds);
        const sourceUrls = unique([
          ...(old.sourceUrls ?? []),
          ...sourceEvidenceIds.map((id) => evidenceById.get(id)?.url),
          ...allergenSourceEvidenceIds.map((id) => evidenceById.get(id)?.url),
        ]);
        return {
          ...old,
          id: product.currentProductKey,
          currentProductKey: product.currentProductKey,
          name: product.name,
          category: product.category ?? old.category ?? "Menu",
          variantGroup: product.variantGroup ?? old.variantGroup,
          isConfigurable: product.isConfigurable ?? old.isConfigurable ?? false,
          description: product.description ?? old.description ?? null,
          ingredientsText: product.ingredientsText ?? old.ingredientsText ?? null,
          allergens: unique(product.containsAllergens),
          mayContain: unique(product.mayContainAllergens),
          mayContainAllergens: unique(product.mayContainAllergens),
          allergenSourceType: product.allergenSourceType ?? "unavailable",
          allergenAuthorityTier: product.allergenAuthorityTier ?? null,
          allergenSourceEvidenceIds,
          sourceEvidenceIds,
          sourceUrls,
          matchedBaselineAuditItemKeys: unique(product.matchedBaselineAuditItemKeys),
          officialAllergenProfileId: product.officialAllergenProfileId ?? null,
          inferredAllergenSignals: [],
          inferredIngredients: [],
          inferredQuestions: [],
        };
      });
      restaurant = {
        ...restaurant,
        items,
        officialAllergenProfiles:
          dossier.currentCatalog?.officialAllergenProfiles ??
          restaurant.officialAllergenProfiles ??
          {},
        itemCount: items.length,
        menuItemCount: items.length,
        totalItemCount: items.length,
      };
      repository.restaurants[index] = restaurant;
      canonicalProjectionCount += 1;
      canonicalProjectedItemCount += items.length;
    }
  }
  if (!restaurant.logoUrl && !restaurant.logoSvgUrl && !restaurant.logoMonogram) {
    restaurant.logoMonogram = restaurant.name.split(/\s+/).filter(Boolean).slice(0, 2)
      .map((part) => part[0]).join("").toUpperCase();
  }

  if (restaurant.items.length === 0 && !restaurant.allergyAccommodationPolicy) {
    const [status, summary] = zeroCatalogPolicies[restaurant.id] || [
      "catalog-unavailable",
      "No current itemized menu catalog is available; contact the restaurant directly before relying on allergy accommodations.",
    ];
    restaurant.allergyAccommodationPolicy = {
      status,
      scope: "restaurant",
      summary,
      advanceNotice: null,
      notes: ["An empty catalog is not evidence that any food is allergen-safe."],
      sourceLabel: "SafePlate verified catalog closeout",
      sourceType: "verification-ledger",
      sourceUrl: row.baseline?.guideUrl || restaurant.sourceUrls?.[0] || null,
      sourceRetrievedAt: row.completedAt?.slice(0, 10) || null,
    };
  }
}

let descriptionRecoveryRestored = 0;
const descriptionRecoveryDirectory = path.join(root, "data/restaurant-verification/description-recovery");
const descriptionRecoveryManifestPath = path.join(descriptionRecoveryDirectory, "manifest.json");
const descriptionRecoveryManifest = fs.existsSync(descriptionRecoveryManifestPath)
  ? JSON.parse(fs.readFileSync(descriptionRecoveryManifestPath, "utf8"))
  : null;
if (!repository.metadata?.descriptionRecovery && descriptionRecoveryManifest?.activeOverlay) {
  repository.metadata ||= {};
  repository.metadata.descriptionRecovery = {
    schemaVersion: descriptionRecoveryManifest.schemaVersion,
    appliedAt: descriptionRecoveryManifest.generatedAt,
    planSha256: descriptionRecoveryManifest.planSha256,
    overlayPath: path.posix.join("data/restaurant-verification/description-recovery", descriptionRecoveryManifest.activeOverlay),
    recoveryCount: descriptionRecoveryManifest.recoveryCount,
    exactIdCount: descriptionRecoveryManifest.exactIdCount,
    exactNameCount: descriptionRecoveryManifest.exactNameCount,
    conflictCountSkipped: descriptionRecoveryManifest.conflictCountSkipped,
    fuzzyOrSemanticMatching: false,
  };
}
const descriptionRecovery = repository.metadata?.descriptionRecovery;
if (descriptionRecovery?.overlayPath && descriptionRecovery?.planSha256) {
  const overlayPath = path.join(root, descriptionRecovery.overlayPath);
  const overlayBytes = fs.readFileSync(overlayPath);
  const overlaySha256 = crypto.createHash("sha256").update(overlayBytes).digest("hex");
  if (overlaySha256 !== descriptionRecovery.planSha256) {
    throw new Error(`Description recovery overlay hash mismatch: ${overlaySha256}`);
  }
  const overlay = JSON.parse(gunzipSync(overlayBytes).toString("utf8"));
  const restaurantsById = new Map(repository.restaurants.map((restaurant) => [restaurant.id, restaurant]));
  for (const recovery of overlay.records || []) {
    const candidates = restaurantsById.get(recovery.restaurantId)?.items || [];
    const idMatches = candidates.filter(
      (candidate) => String(candidate.id || candidate.itemId || "") === recovery.itemId,
    );
    const baselineMatches = candidates.filter((candidate) =>
      (candidate.matchedBaselineAuditItemKeys ?? []).some(
        (key) => String(key).split(":").slice(1).join(":") === recovery.itemId,
      ),
    );
    const matches = idMatches.length > 0
      ? idMatches
      : baselineMatches.length > 0
        ? baselineMatches
        : candidates.filter(
          (candidate) => normalize(candidate.name) === normalize(recovery.itemName),
        );
    const item = matches.length === 1 ? matches[0] : null;
    const matchedByCanonicalBaseline =
      idMatches.length === 0 && baselineMatches.length === 1;
    if (!item) continue;
    if (
      !matchedByCanonicalBaseline &&
      normalize(item.name) !== normalize(recovery.itemName)
    ) continue;
    if (item.description === recovery.description) continue;
    item.description = recovery.description;
    descriptionRecoveryRestored += 1;
  }
}

repository.generatedAt = new Date().toISOString();
repository.snapshotVersion = 1;
repository.restaurantCount = repository.restaurants.length;
repository.itemCount = repository.restaurants.reduce((sum, restaurant) => sum + restaurant.items.length, 0);

fs.writeFileSync(repositoryPath, `${JSON.stringify(repository)}\n`);
console.log(JSON.stringify({
  generatedAt: repository.generatedAt,
  restaurantCount: repository.restaurantCount,
  itemCount: repository.itemCount,
  zeroCatalogCount: repository.restaurants.filter((restaurant) => restaurant.items.length === 0).length,
  descriptionRecoveryRestored,
  canonicalProjectionCount,
  canonicalProjectedItemCount,
  intentionallyUnprojectedLedgerCount: ledger.length - repository.restaurantCount,
}, null, 2));

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[’'`]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}
