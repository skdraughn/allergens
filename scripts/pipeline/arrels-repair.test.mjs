import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const restaurantId = "arrels-dc";

test("quarantines the permanently closed Arrels identity with no stale menu", async () => {
  const repository = JSON.parse(await readFile(
    new URL("../../src/data/generated/restaurants.generated.json", import.meta.url),
    "utf8",
  ));
  const restaurant = repository.restaurants.find((row) => row.id === restaurantId);

  assert.ok(restaurant);
  assert.deepEqual(restaurant.items, []);
  assert.equal(restaurant.itemCount, 0);
  assert.equal(restaurant.menuItemCount, 0);
  assert.equal(restaurant.totalItemCount, 0);
  assert.equal(restaurant.domain, "arlohotels.com");
  assert.equal(
    restaurant.guideUrl,
    "https://arlohotels.com/washingtondc/eat-and-drink/restaurant/",
  );
  assert.equal(restaurant.guideLabel, "Current first-party replacement notice");
  assert.equal(restaurant.coverageStatus, "blocked");
  assert.equal(restaurant.launchQualityStatus, "quarantined");
  assert.equal(restaurant.launchRemediationBucket, "no-menu-found");
  assert.equal(restaurant.sourceStatus.locationStatus, "permanently_closed");
  assert.equal(restaurant.sourceStatus.permanentlyClosed, true);
  assert.equal(
    restaurant.sourceStatus.replacementStatus,
    "transitional_breakfast_service",
  );
  assert.equal(restaurant.sourceStatus.discardedItemCount, 5);
  assert.equal(restaurant.officialAllergenStatus, "not-found");
  assert.equal(restaurant.allergenDataStatus.officialItemCount, 0);
  assert.equal(restaurant.allergenDataStatus.totalItemCount, 0);
  assert.ok(
    restaurant.sourceStatus.configuredUrlAudit.configuredUrlWarnings.includes(
      "transitional-breakfast-menu-belongs-to-replacement-identity-not-arrels",
    ),
  );
  assert.equal(
    restaurant.sourceStatus.reviewedMenuQualityRepairs.filter((repair) =>
      /Verified repair: removed all five stale Restaurant Week rows/.test(repair.note ?? "")
    ).length,
    1,
  );
});
