import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryPath = path.join(root, "src/data/generated/restaurants.generated.json");
const apply = process.argv.includes("--apply");
const repository = JSON.parse(fs.readFileSync(repositoryPath, "utf8"));

const findings = [];
for (const restaurant of repository.restaurants ?? []) {
  const itemCount = restaurant.items?.length ?? 0;
  if (itemCount === 0) continue;

  const invalid =
    restaurant.sourceStatus?.accommodationOnly === true ||
    restaurant.parserProfile === "accommodation-policy-shell";
  if (!invalid) continue;

  const before = {
    parserProfile: restaurant.parserProfile,
    sourceFamily: restaurant.sourceFamily,
    sourceProfile: restaurant.sourceProfile,
    accommodationOnly: restaurant.sourceStatus?.accommodationOnly,
  };
  const inferred = inferMenuProvenance(restaurant);
  findings.push({ restaurantId: restaurant.id, itemCount, before, after: inferred });

  if (!apply) continue;
  restaurant.parserProfile = inferred.parserProfile;
  restaurant.sourceFamily = inferred.sourceFamily;
  restaurant.sourceProfile = inferred.sourceProfile;
  restaurant.sourceStatus = {
    ...(restaurant.sourceStatus ?? {}),
    accommodationOnly: false,
    extractedFoodItemCount: itemCount,
  };
}

if (apply) {
  fs.writeFileSync(repositoryPath, `${JSON.stringify(repository, null, 2)}\n`);
}

const remaining = (repository.restaurants ?? []).filter(
  (restaurant) =>
    (restaurant.items?.length ?? 0) > 0 &&
    (restaurant.sourceStatus?.accommodationOnly === true ||
      restaurant.parserProfile === "accommodation-policy-shell"),
);

console.log(JSON.stringify({ apply, repairedCount: findings.length, findings, remaining: remaining.map(({ id }) => id) }, null, 2));
if (apply && remaining.length > 0) process.exitCode = 1;

function inferMenuProvenance(restaurant) {
  if (restaurant.parserProfile !== "accommodation-policy-shell") {
    return {
      parserProfile: restaurant.parserProfile,
      sourceFamily: restaurant.sourceFamily,
      sourceProfile: restaurant.sourceProfile,
      accommodationOnly: false,
    };
  }

  const itemTypes = new Set((restaurant.items ?? []).map((item) => item.sourceType).filter(Boolean));
  if (itemTypes.has("pdf-menu") || (restaurant.sourceUrls ?? []).some((url) => /\.pdf(?:$|[?#])/i.test(url))) {
    return {
      parserProfile: "pdf-menu",
      sourceFamily: "generic-website",
      sourceProfile: "generic-website:pdf-menu",
      accommodationOnly: false,
    };
  }
  if (itemTypes.has("json-structured")) {
    return {
      parserProfile: "structured-menu",
      sourceFamily: "generic-website",
      sourceProfile: "generic-website:structured-menu",
      accommodationOnly: false,
    };
  }
  if ([...itemTypes].some((type) => /^html-|toast|official/.test(type))) {
    return {
      parserProfile: "generic-website",
      sourceFamily: "generic-website",
      sourceProfile: "generic-website:generic-website",
      accommodationOnly: false,
    };
  }
  return {
    parserProfile: "manual-current-menu",
    sourceFamily: "manual-review",
    sourceProfile: "manual-review:current-menu",
    accommodationOnly: false,
  };
}
