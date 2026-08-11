const everyBiteAllergenMap = new Map([
  ["1", ["egg"]],
  ["eggs", ["egg"]],
  ["2", ["fish"]],
  ["fish", ["fish"]],
  ["3", ["milk"]],
  ["milk", ["milk"]],
  ["4", ["peanut"]],
  ["peanuts", ["peanut"]],
  ["5", ["shellfish"]],
  ["crustacean/shellfish", ["shellfish"]],
  ["crustacean / shellfish", ["shellfish"]],
  ["6", ["soy"]],
  ["soybeans", ["soy"]],
  ["soy", ["soy"]],
  ["7", ["tree-nut"]],
  ["tree nuts", ["tree-nut"]],
  ["tree nut", ["tree-nut"]],
  ["8", ["gluten", "wheat"]],
  ["wheat", ["gluten", "wheat"]],
  ["10", ["sesame"]],
  ["sesame", ["sesame"]],
]);

export function extractEveryBiteWidgetRows(widgetData, { sourceUrl, widgetUrl } = {}) {
  const rows = Array.isArray(widgetData?.rows) ? widgetData.rows : [];

  return rows
    .map((dish) => normalizeEveryBiteDish(dish, { sourceUrl, widgetUrl }))
    .filter((row) => row.name);
}

export function normalizeEveryBiteDish(dish, { sourceUrl, widgetUrl } = {}) {
  const directAllergens = new Set();
  const mayContain = new Set();

  for (const allergen of dish?.allergens ?? []) {
    const mapped = mapEveryBiteAllergen(allergen);
    const target = /may|cross|trace/i.test(String(allergen?.type ?? "")) ? mayContain : directAllergens;
    for (const appAllergen of mapped) {
      target.add(appAllergen);
    }
  }

  const ingredients = (dish?.ingredients ?? [])
    .filter((ingredient) => ingredient?.isIncluded !== false)
    .map((ingredient) => cleanEveryBiteIngredientName(ingredient?.name))
    .filter(Boolean);

  return {
    id: dish?.id,
    name: cleanText(dish?.name),
    category: cleanText(dish?.category?.name) || "Menu",
    description: cleanText(dish?.description) || undefined,
    ingredients,
    allergens: Array.from(directAllergens).sort(),
    mayContain: Array.from(mayContain).sort(),
    everyBiteAllergens: (dish?.allergens ?? []).map((allergen) => ({
      id: String(allergen?.id ?? ""),
      name: cleanText(allergen?.name),
      type: cleanText(allergen?.type),
    })),
    sourceUrl,
    widgetUrl,
  };
}

export function mapEveryBiteAllergen(allergen) {
  const id = String(allergen?.id ?? "").trim().toLowerCase();
  const name = String(allergen?.name ?? "").trim().toLowerCase();
  return everyBiteAllergenMap.get(id) ?? everyBiteAllergenMap.get(name) ?? [];
}

function cleanEveryBiteIngredientName(name) {
  return cleanText(name).replace(/\s+-\s+DUPLICATE IMPORT\s+\([^)]*\)$/i, "");
}

function cleanText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}
