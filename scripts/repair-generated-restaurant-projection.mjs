import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const repositoryPath = path.join(root, "src/data/generated/restaurants.generated.json");
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

for (const restaurant of repository.restaurants) {
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

repository.generatedAt = new Date().toISOString();
repository.snapshotVersion = 1;
repository.restaurantCount = repository.restaurants.length;
repository.itemCount = repository.restaurants.reduce((sum, restaurant) => sum + restaurant.items.length, 0);

if (repository.restaurantCount !== ledger.length) {
  throw new Error(`Projection contains ${repository.restaurantCount} restaurants but ledger contains ${ledger.length}.`);
}
fs.writeFileSync(repositoryPath, `${JSON.stringify(repository)}\n`);
console.log(JSON.stringify({
  generatedAt: repository.generatedAt,
  restaurantCount: repository.restaurantCount,
  itemCount: repository.itemCount,
  zeroCatalogCount: repository.restaurants.filter((restaurant) => restaurant.items.length === 0).length,
}, null, 2));
