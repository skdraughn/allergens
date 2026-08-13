#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const repositoryPath = process.argv[2] ?? "src/data/generated/restaurants.generated.json";
const repository = JSON.parse(await readFile(repositoryPath, "utf8"));
let changed = 0;

for (const restaurant of repository.restaurants ?? []) {
  const city = normalizeCityForRegion(restaurant.city, restaurant.region);

  if (city && city !== restaurant.city) {
    restaurant.city = city;
    changed += 1;
  }
}

if (changed > 0) {
  repository.generatedAt = new Date().toISOString();
  await writeFile(repositoryPath, `${JSON.stringify(repository)}\n`);
}

console.log(JSON.stringify({ changed, repositoryPath }, null, 2));

function normalizeCityForRegion(city, region) {
  if (typeof city !== "string" || typeof region !== "string") return city;
  const escapedRegion = region.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return city.replace(new RegExp(`,\\s*${escapedRegion}$`, "i"), "").trim();
}
