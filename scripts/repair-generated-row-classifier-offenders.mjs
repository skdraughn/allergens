import fs from "node:fs";

import { classifyMenuItemRow, sanitizeMenuItemDisplayFields } from "./menu-item-quality.mjs";

const GENERATED_PATH = "src/data/generated/restaurants.generated.json";

const repository = JSON.parse(fs.readFileSync(GENERATED_PATH, "utf8"));
const removed = [];

for (const restaurant of repository.restaurants ?? []) {
  const nextItems = [];

  for (const item of restaurant.items ?? []) {
    const sanitized = sanitizeMenuItemDisplayFields(item);
    const classification = classifyMenuItemRow(sanitized);

    if (classification.kind === "menu-item") {
      nextItems.push(sanitized);
      continue;
    }

    removed.push({
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      itemId: sanitized.id,
      name: sanitized.name,
      kind: classification.kind,
      reasons: classification.reasons,
    });

    restaurant.sourceStatus = {
      ...(restaurant.sourceStatus ?? {}),
      discardedItemCount: (restaurant.sourceStatus?.discardedItemCount ?? 0) + 1,
      quarantinedItemExamples: [
        ...(restaurant.sourceStatus?.quarantinedItemExamples ?? []),
        {
          id: sanitized.id,
          kind: classification.kind,
          name: sanitized.name,
          reasons: classification.reasons,
        },
      ].slice(0, 12),
    };
  }

  restaurant.items = nextItems;
  restaurant.allergenDataStatus = {
    ...(restaurant.allergenDataStatus ?? {}),
    officialItemCount: nextItems.filter(
      (item) => item.allergenSourceType && item.allergenSourceType !== "unavailable",
    ).length,
  };
}

fs.writeFileSync(GENERATED_PATH, `${JSON.stringify(repository, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      removedRows: removed.length,
      examples: removed.slice(0, 25),
    },
    null,
    2,
  ),
);
