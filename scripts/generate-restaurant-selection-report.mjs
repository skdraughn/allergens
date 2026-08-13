import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const repositoryPath = path.resolve(root, process.argv[2] || "src/data/generated/restaurants.generated.json");
const outputPath = path.resolve(root, process.argv[3] || "data/scraped/launch-coverage/final-1495-portfolio/selection-report.json");
const repository = JSON.parse(fs.readFileSync(repositoryPath, "utf8"));
const statusCounts = {};
let accommodationOnlyCount = 0;
let zeroCatalogCount = 0;
for (const restaurant of repository.restaurants || []) {
  const status = restaurant.officialAllergenStatus || "unknown";
  statusCounts[status] = (statusCounts[status] || 0) + 1;
  if ((restaurant.items?.length || 0) === 0) {
    zeroCatalogCount += 1;
    if (restaurant.allergyAccommodationPolicy) accommodationOnlyCount += 1;
  }
}
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  repositoryPath: path.relative(root, repositoryPath),
  snapshotGeneratedAt: repository.generatedAt,
  summary: {
    restaurantCount: repository.restaurants.length,
    itemCount: repository.restaurants.reduce((sum, restaurant) => sum + (restaurant.items?.length || 0), 0),
    officialStatusCounts: statusCounts,
    accommodationOnlyCount,
    zeroCatalogCount,
    missingRecordCount: 0,
    skippedCount: 0,
  },
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, ...report.summary }, null, 2));
