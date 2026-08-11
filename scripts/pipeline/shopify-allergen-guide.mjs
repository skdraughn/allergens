import * as cheerio from "cheerio";

const allergenMap = new Map([
  ["dairy", ["milk"]],
  ["eggs", ["egg"]],
  ["gluten", ["gluten"]],
  ["peanuts", ["peanut"]],
  ["sesame", ["sesame"]],
  ["soy", ["soy"]],
  ["tree nuts", ["tree-nut"]],
]);

export function extractShopifyAllergenGuideRows(html, { sourceUrl } = {}) {
  const $ = cheerio.load(html ?? "");
  const rows = [];

  $(".allergen-cat").each((_, section) => {
    const category = cleanText($(section).find(".allergen-cat__title").first().text());

    $(section)
      .find("article.allergen-item")
      .each((__, article) => {
        const item = $(article);
        const name = cleanText(
          item.find(".allergen-item__name").first().clone().children().remove().end().text(),
        );
        const description = cleanText(item.find(".allergen-item__desc").first().text());
        const containsText = cleanText(item.find(".allergen-contains").first().text()).replace(
          /^Contains:\s*/i,
          "",
        );

        if (!name) {
          return;
        }

        const allergens = mapGuideAllergens({ containsText, description, name });

        rows.push({
          name,
          category,
          description,
          containsText,
          allergens,
          sourceUrl,
        });
      });
  });

  return rows;
}

export function mapGuideAllergens({ containsText = "", description = "", name = "" } = {}) {
  const allergens = new Set();
  const lowerContains = String(containsText).toLowerCase();
  const sourceText = `${name} ${description}`.toLowerCase();

  for (const [sourceAllergen, appAllergens] of allergenMap) {
    if (lowerContains.split(",").map((part) => part.trim()).includes(sourceAllergen)) {
      for (const allergen of appAllergens) {
        allergens.add(allergen);
      }
    }
  }

  if (allergens.has("gluten") && /\b(?:wheat|flour|toast|bread|sourdough|rustico|noodles?|waffle|pb&j)\b/i.test(sourceText)) {
    allergens.add("wheat");
  }

  if (/\b(?:salmon|tuna|yellowfin|ahi|cod|halibut|branzino|sea bass|fish)\b/i.test(sourceText)) {
    allergens.add("fish");
  }

  if (/\b(?:crab|shrimp|lobster|oyster|clam|mussel|scallop)\b/i.test(sourceText)) {
    allergens.add("shellfish");
  }

  return Array.from(allergens).sort();
}

function cleanText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}
