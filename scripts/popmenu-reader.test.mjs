import assert from "node:assert/strict";
import test from "node:test";

import { extractPopmenuReaderItem } from "./pipeline/legacy-scrape-engine.mjs";

const restaurant = { id: "example", category: "Restaurant" };

test("extracts a Popmenu item description from a rendered heading", () => {
  const item = extractPopmenuReaderItem(
    `Title: Classic Cheese - Dining

URL Source: http://example.com/items/classic-cheese

Markdown Content:
[Back To Menu](https://example.com/menu)

# Classic Cheese

Mozzarella and crushed plum tomato sauce

Small$10 Large$16

## Have you tried this item?`,
    restaurant,
    "https://example.com/items/classic-cheese",
    "Classic Cheese",
  );

  assert.equal(item?.name, "Classic Cheese");
  assert.equal(item?.description, "Mozzarella and crushed plum tomato sauce");
  assert.equal(item?.sourceUrl, "https://example.com/items/classic-cheese");
});

test("extracts a Popmenu item description from a price-delimited item page", () => {
  const item = extractPopmenuReaderItem(
    `Title: The Gaithersburg - Brunch

URL Source: http://example.com/items/the-gaithersburg

Markdown Content:
[Back To Menu](https://example.com/menu)

BREAKFAST PIZZAS - Brunch

$22

Bacon, sausage, mushrooms, peppers, tomato sauce, flor di latte

[Order Online](https://example.com/order)`,
    restaurant,
    "https://example.com/items/the-gaithersburg",
    "The Gaithersburg",
  );

  assert.equal(item?.description, "Bacon, sausage, mushrooms, peppers, tomato sauce, flor di latte");
});

test("does not manufacture a description from Popmenu review controls", () => {
  const item = extractPopmenuReaderItem(
    `Title: 2 Eggs Meal - Breakfast

URL Source: http://example.com/items/two-eggs

Markdown Content:
[Back To Menu](https://example.com/menu)

# 2 Eggs Meal

$14.69

## Have you tried this item?

Which location did you visit?`,
    restaurant,
    "https://example.com/items/two-eggs",
    "2 Eggs Meal",
  );

  assert.equal(item, null);
});

test("does not mistake a Popmenu location selector for a description", () => {
  const item = extractPopmenuReaderItem(
    `Title: Chef Salad - Lunch & Dinner

URL Source: http://example.com/items/chef-salad

Markdown Content:
[Back To Menu](https://example.com/menu)

Soup & Salad - Lunch & Dinner

Crystal City

$10.99

Which location did you visit?

Crystal City

Add Your Review Here`,
    restaurant,
    "https://example.com/items/chef-salad",
    "Chef Salad",
  );

  assert.equal(item, null);
});
