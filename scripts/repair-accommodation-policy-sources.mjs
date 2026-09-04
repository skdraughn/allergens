#!/usr/bin/env node

import fs from "node:fs";

const apply = process.argv.includes("--apply");
const repositoryPath = "src/data/generated/restaurants.generated.json";
const summaryPath = "src/data/generated/restaurants.summary.generated.json";
const repository = readJson(repositoryPath);
const summary = readJson(summaryPath);

const officialPolicies = {
  "sushi-nakazawa-dc": {
    status: "partial-accommodation",
    scope: "experience",
    summary:
      "Sushi Nakazawa says it can accept most dietary restrictions, but it cannot accommodate vegetarian, no-rice, no-soy, or no-raw-food requests.",
    advanceNotice: "Share restrictions before booking",
    notSupported: ["Vegetarian", "No rice", "No soy", "No raw food"],
    sourceLabel: "Official restaurant menu",
    sourceType: "official-site",
    sourceUrl:
      "https://www.sushinakazawa.com/washington-dc/omakase-and-menu/omakase",
    sourceRetrievedAt: "2026-08-31",
  },
  "mita-dc": {
    status: "partial-accommodation",
    scope: "restaurant",
    summary:
      "MITA asks guests to share allergies or restrictions in advance. It says accommodations depend on the current menu and may not be possible when shared upon arrival.",
    advanceNotice: "Before the visit",
    supported: ["Plant-based menu modifications by request"],
    sourceLabel: "Official restaurant menu",
    sourceType: "official-site",
    sourceUrl: "https://www.mitadc.com/menu",
    sourceRetrievedAt: "2026-08-31",
  },
  "omakase-at-barracks-row-dc": {
    status: "partial-accommodation",
    scope: "experience",
    summary:
      "The restaurant asks guests to share dietary considerations ahead of time. Seafood, soy, and cooked alcohol are integral to the experience and cannot be omitted.",
    advanceNotice: "Before the reservation",
    notSupported: ["Vegetarian or vegan", "Seafood-free", "Soy-free"],
    sourceLabel: "Official restaurant FAQ",
    sourceType: "official-site",
    sourceUrl: "https://omakasedc.com/faq",
    sourceRetrievedAt: "2026-08-31",
  },
};

const repaired = [];
for (const collection of [repository.restaurants, summary.restaurants]) {
  for (const restaurant of collection) {
    if (restaurant.id === "imperfecto-dc") {
      delete restaurant.allergyAccommodationPolicy;
      restaurant.guideLabel = "Official menu source";
      restaurant.guideUrl = "https://www.sevenreasonsgroup.com/imperfecto";
      restaurant.sourceStatus = {
        ...(restaurant.sourceStatus ?? {}),
        accommodationOnly: false,
      };
      repaired.push(restaurant.id);
      continue;
    }

    const policy = officialPolicies[restaurant.id];
    if (!policy) continue;

    restaurant.allergyAccommodationPolicy = policy;
    restaurant.guideLabel = "Official accommodation source";
    restaurant.guideUrl = policy.sourceUrl;
    restaurant.sourceUrls = uniqueStrings([
      ...(restaurant.sourceUrls ?? []),
      policy.sourceUrl,
    ]);
    restaurant.sourceStatus = {
      ...(restaurant.sourceStatus ?? {}),
      reviewedAccommodationPolicy: {
        reviewedAt: policy.sourceRetrievedAt,
        sourceUrl: policy.sourceUrl,
        status: policy.status,
      },
    };
    repaired.push(restaurant.id);
  }
}

const exposedOpenTablePolicies = repository.restaurants.filter((restaurant) =>
  isOpenTableUrl(restaurant.allergyAccommodationPolicy?.sourceUrl),
);
if (exposedOpenTablePolicies.length > 0) {
  throw new Error(
    `Customer-facing accommodation policies still use OpenTable: ${exposedOpenTablePolicies
      .map((restaurant) => restaurant.id)
      .join(", ")}`,
  );
}

if (apply) {
  writeJson(repositoryPath, repository);
  writeJson(summaryPath, summary);
}

console.log(
  JSON.stringify(
    {
      apply,
      repairedRestaurantIds: [...new Set(repaired)].sort(),
      exposedOpenTablePolicyCount: exposedOpenTablePolicies.length,
    },
    null,
    2,
  ),
);

function isOpenTableUrl(value) {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "opentable.com" || hostname.endsWith(".opentable.com");
  } catch {
    return false;
  }
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`);
}
