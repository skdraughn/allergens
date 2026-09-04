import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryPath = path.join(root, "src/data/generated/restaurants.generated.json");
const dossierDirectory = path.join(root, "data/restaurant-verification/restaurants");
const apply = process.argv.includes("--apply");
const repository = JSON.parse(fs.readFileSync(repositoryPath, "utf8"));

const closedIds = new Set();
for (const fileName of fs.readdirSync(dossierDirectory)) {
  if (!fileName.endsWith(".json")) continue;
  const dossier = JSON.parse(fs.readFileSync(path.join(dossierDirectory, fileName), "utf8"));
  if (isClosed(dossier)) closedIds.add(dossier.restaurantId);
}

const projectedClosedIds = (repository.restaurants ?? [])
  .filter((restaurant) => closedIds.has(restaurant.id))
  .map((restaurant) => restaurant.id);

if (apply && projectedClosedIds.length > 0) {
  repository.restaurants = repository.restaurants.filter((restaurant) => !closedIds.has(restaurant.id));
  repository.restaurantCount = repository.restaurants.length;
  repository.itemCount = repository.restaurants.reduce((sum, restaurant) => sum + (restaurant.items?.length ?? 0), 0);
  fs.writeFileSync(repositoryPath, `${JSON.stringify(repository, null, 2)}\n`);
}

console.log(JSON.stringify({ apply, canonicalClosedIds: [...closedIds].sort(), projectedClosedIds }, null, 2));
if (!apply && projectedClosedIds.length > 0) process.exitCode = 1;

function isClosed(dossier) {
  return /(?:historical_)?closed|defunct|permanently_closed/i.test(
    `${dossier.status ?? ""} ${dossier.identity?.verdict ?? ""} ${dossier.currentCatalog?.status ?? ""}`,
  );
}
