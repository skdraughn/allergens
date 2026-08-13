import { readFile, writeFile, mkdir } from "node:fs/promises";
import { Buffer } from "node:buffer";
import path from "node:path";

const inputPath = process.argv[2] ?? "src/data/generated/restaurants.generated.json";
const outputPath = process.argv[3] ?? "src/data/generated/restaurants.summary.generated.json";

const repository = JSON.parse(await readFile(inputPath, "utf8"));
const summary = {
  generatedAt: repository.generatedAt,
  itemCount: repository.itemCount,
  restaurantCount: repository.restaurantCount,
  snapshotVersion: repository.snapshotVersion,
  restaurants: (repository.restaurants ?? []).map((restaurant) => ({
    address: restaurant.address,
    addressLine1: restaurant.addressLine1,
    addressLine2: restaurant.addressLine2,
    allergenDataStatus: restaurant.allergenDataStatus,
    allergyAccommodationPolicy: restaurant.allergyAccommodationPolicy,
    brandKey: restaurant.brandKey,
    category: restaurant.category,
    city: normalizeCityForRegion(restaurant.city, restaurant.region),
    country: restaurant.country,
    coveragePercent: restaurant.coveragePercent,
    coverageStatus: restaurant.coverageStatus,
    displayAddress: restaurant.displayAddress,
    domain: restaurant.domain,
    guideLabel: restaurant.guideLabel,
    guideUrl: restaurant.guideUrl,
    id: restaurant.id,
    lastKnownGoodAt: restaurant.lastKnownGoodAt,
    lat: restaurant.lat,
    lng: restaurant.lng,
    locationId: restaurant.locationId,
    logoAspectRatio: restaurant.logoAspectRatio,
    logoMonogram: restaurant.logoMonogram,
    logoSvgUrl: restaurant.logoSvgUrl,
    logoUrl: restaurant.logoUrl,
    name: restaurant.name,
    officialAllergenStatus: restaurant.officialAllergenStatus,
    parserProfile: restaurant.parserProfile,
    postalCode: restaurant.postalCode,
    rank: restaurant.rank,
    region: restaurant.region,
    regionalScope: restaurant.regionalScope,
    snapshotPath: restaurant.snapshotPath ?? `restaurant-data/restaurants/${restaurant.id}/latest.json`,
    sourceFamily: restaurant.sourceFamily,
    sourceStatus: restaurant.sourceStatus,
    sourceUpdatedAt: restaurant.sourceUpdatedAt,
    sourceUrls: restaurant.sourceUrls,
    totalItemCount: restaurant.items?.length ?? restaurant.totalItemCount ?? 0,
    type: restaurant.type,
    updated: restaurant.updated,
  })),
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(summary)}\n`);

console.log(
  JSON.stringify(
    {
      inputPath,
      outputPath,
      restaurants: summary.restaurants.length,
      bytes: Buffer.byteLength(JSON.stringify(summary)),
    },
    null,
    2,
  ),
);

function normalizeCityForRegion(city, region) {
  if (typeof city !== "string" || typeof region !== "string") return city;
  const escapedRegion = region.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return city.replace(new RegExp(`,\\s*${escapedRegion}$`, "i"), "").trim();
}
