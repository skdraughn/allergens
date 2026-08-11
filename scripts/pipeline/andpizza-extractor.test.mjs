import assert from "node:assert/strict";
import test from "node:test";

import { extractHtmlItems } from "./legacy-scrape-engine.mjs";

const restaurant = {
  id: "andpizza-dc",
  name: "&pizza",
  category: "Pizza",
  includeNonAlcoholicBeverages: true,
  profileMenuIsCanonical: true,
};

test("&pizza menu profile extracts public menu cards with their section categories", () => {
  const html = `
    <main>
      <div class="category_row"><h2>Pies</h2></div>
      <div class="menu_item_category_content">
        <div class="dipi_price_list_item_wrapper">
          <h3 class="dipi_price_list_title">American Honey</h3>
          <div class="dipi_price_list_content">Pepperoni, hot honey, and arugula.</div>
        </div>
        <div class="dipi_price_list_item_wrapper">
          <h3 class="dipi_price_list_title">@ME DON’T SUB ME</h3>
          <div class="dipi_price_list_content">A named pie.</div>
        </div>
      </div>
      <div class="category_row"><h2>BEVERAGES</h2></div>
      <div class="menu_item_category_content">
        <div class="dipi_price_list_item_wrapper">
          <h3 class="dipi_price_list_title">Spring Water</h3>
        </div>
      </div>
      <div class="category_row"><h2>High Protein</h2></div>
      <div class="menu_item_category_content">
        <div class="dipi_price_list_item_wrapper">
          <h3 class="dipi_price_list_title">American Honey</h3>
        </div>
      </div>
      <article><h2>Trebletree Dev Team</h2><p>Page furniture that generic extraction must ignore.</p></article>
    </main>
  `;

  const result = extractHtmlItems(html, restaurant, "https://andpizza.com/menu-listing/", "menu");

  assert.deepEqual(
    result.items.map((item) => ({ category: item.category, description: item.description, name: item.name })),
    [
      {
        category: "Pies",
        description: "Pepperoni, hot honey, and arugula.",
        name: "American Honey",
      },
      { category: "Pies", description: "A named pie.", name: "@ME DON’T SUB ME" },
      { category: "Beverages", description: null, name: "Spring Water" },
    ],
  );
});

test("&pizza allergen profile retains official negative and component rows while excluding page noise", () => {
  const html = `
    <main>
      <div class="et_pb_text"><h2>CHEESE</h2></div>
      <div class="dipi_table_maker"><div class="allergen_table"><table>
        <tr><th>Ingredient</th><th>Milk</th><th>Soy</th></tr>
        <tr><td>Vegan Mozzarella</td><td></td><td>R</td></tr>
      </table></div></div>
      <div class="et_pb_text"><h2>PIES</h2></div>
      <div class="dipi_table_maker"><div class="allergen_table"><table>
        <tr><th>Ingredient</th><th>Egg</th><th>Milk</th><th>Soy</th></tr>
        <tr><td>American Honey</td><td></td><td>R</td><td></td></tr>
        <tr><td>Zero Signal Pie</td><td></td><td></td><td></td></tr>
      </table></div></div>
      <article><h2>Pizza Allergen Information</h2></article>
      <article><h2>Check Before You Eat</h2><p>Egg milk soy.</p></article>
    </main>
  `;

  const result = extractHtmlItems(
    html,
    restaurant,
    "https://andpizza.com/allergen-guide/",
    "allergen",
  );

  assert.deepEqual(
    result.items.map((item) => ({ allergens: item.allergens, category: item.category, name: item.name })),
    [
      { allergens: ["soy"], category: "Cheese", name: "Vegan Mozzarella" },
      { allergens: ["milk"], category: "Pies", name: "American Honey" },
      { allergens: [], category: "Pies", name: "Zero Signal Pie" },
    ],
  );
  assert.ok(result.items.every((item) => item.allergenSourceType === "official-allergen-menu"));
});
