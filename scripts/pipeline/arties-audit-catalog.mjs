import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdArties = "artie-s-fairfax-va-dc-metro";

const menuIndexUrl = "https://www.artiesva.com/";
const glutenCrossContactWarning =
  "During normal operations involving shared cooking and preparation areas the possibility exists for food items containing gluten to come into contact with other food products. We are unable to guarantee that any menu items can be completely gluten free.";
const allergenOrder = [
  "milk", "egg", "wheat", "gluten", "soy", "peanut", "tree-nut",
  "fish", "shellfish", "sesame", "mustard",
];

const sourceContracts = {
  site: {
    label: "Artie's owner website",
    sourceUrl: menuIndexUrl,
    artifactPath: "data/restaurant-verification/artifacts/artie-s-fairfax-va-dc-metro/official-arties-site.html",
    sha256: "f347c09ec5061322abceaa3384161ef624a92c018a3949b44f8d697c161be4a2",
  },
  lunch: {
    label: "Lunch menu",
    sourceUrl: "https://cdn.prod.website-files.com/6585dbab03230e9476d4f9a0/67648c9961e50cf94b668940_f24eba07d0f8243c62e2cbebf6f48b17_05%20Lunch.pdf",
    artifactPath: "data/restaurant-verification/artifacts/artie-s-fairfax-va-dc-metro/official-arties-lunch.pdf",
    sha256: "ac1f80cb26c4c53ce18c94db5c4dc20a5388ec47f59017041b8d9a4260741bf3",
    expectedPresentationCount: 53,
  },
  dinner: {
    label: "Dinner menu",
    sourceUrl: "https://cdn.prod.website-files.com/6585dbab03230e9476d4f9a0/67648c999470968fecc4b993_f37ea9b95a635f4c0073136cb15d0885_05%20Dinner.pdf",
    artifactPath: "data/restaurant-verification/artifacts/artie-s-fairfax-va-dc-metro/official-arties-dinner.pdf",
    sha256: "938d118a6dcb48290f48e2faf88971b220bf4ed77cccc0ab262e3b7aa56862cc",
    expectedPresentationCount: 52,
  },
  gsLunch: {
    label: "Gluten-sensitive lunch menu",
    sourceUrl: "https://cdn.prod.website-files.com/6585dbab03230e9476d4f9a0/67648c9fe44da5e18e8a973a_12c9acb4ee90e68fcdf3e4dae8fa13f9_05%20GS%20Lunch.pdf",
    artifactPath: "data/restaurant-verification/artifacts/artie-s-fairfax-va-dc-metro/official-arties-gluten-sensitive-lunch.pdf",
    sha256: "36c8e7454137382ce9fff931efc8e8be2fef71f659abc9558c01ab8fdd83293d",
    expectedPresentationCount: 32,
  },
  gsDinner: {
    label: "Gluten-sensitive dinner menu",
    sourceUrl: "https://cdn.prod.website-files.com/6585dbab03230e9476d4f9a0/67648c9f30151e5a9962af86_fda4cd5bbbac0554cf2353e9b455ac41_05%20GS%20Dinner.pdf",
    artifactPath: "data/restaurant-verification/artifacts/artie-s-fairfax-va-dc-metro/official-arties-gluten-sensitive-dinner.pdf",
    sha256: "bffa280405f37b4a015afc442edd8db47f4310bfe04839cac73d1699e60ef8e2",
    expectedPresentationCount: 33,
  },
};

const both = ["lunch", "dinner"];
const bothGs = ["gsLunch", "gsDinner"];

const menuRows = [
  row("Firecracker Shrimp", "Starters", "Crumb-fried shrimp tossed with thin beans and spicy pepper jelly.", ["wheat", "gluten", "shellfish"], both),
  row("Tex Mex Egg Rolls", "Starters", "Egg rolls filled with smoked chicken, corn, black beans, onions, peppers, and jalapeño jack cheese; served with avocado dipping sauce.", ["milk", "wheat", "gluten"], both),
  row("Hot Spinach & Artichoke Dip", "Starters", "Spinach and artichoke dip with Reggiano parmesan, jack cheese, and warm corn tortilla chips.", ["milk"], both),
  row("Blue Crab & Shrimp Fritters", "Starters", "Blue crab and shrimp fritters with roast corn salsa and lobster ginger sauce.", ["shellfish"], both),
  row("Crispy Fried Point Judith Calamari", "Starters", "Crispy fried calamari with onion straws and lobster ginger sauce.", ["shellfish"], both),
  row("Lobster Bisque", "Starters", "Lobster bisque.", ["shellfish"], both),
  row("Crab & Corn Chowder", "Starters", "Crab and corn chowder.", ["shellfish"], both),
  row("Community Bread Basket", "Starters", "Choice of Ozzie rolls, Best Buns bread, or an assortment, served with honey butter.", ["milk", "wheat", "gluten"], both, { configurable: true }),

  row("Field Greens", "Salads", "Field greens with red grape tomatoes, dates, sun-dried cranberries, croutons, and champagne vinaigrette; blue cheese or goat cheese may be added.", ["milk", "wheat", "gluten"], both, { configurable: true, gs: bothGs, gsNote: "The gluten-sensitive presentation omits croutons." }),
  row("Traditional Caesar", "Salads", "Romaine and baby greens with croutons and Reggiano parmesan.", ["milk", "wheat", "gluten"], both, { gs: bothGs, gsNote: "The gluten-sensitive presentation omits croutons." }),
  row("Iceberg Wedge", "Salads", "Iceberg wedge with bacon, tomatoes, onion, and blue cheese dressing.", ["milk"], both, { gs: bothGs }),
  row("Chopped Salad", "Salads", "Mixed greens, fresh corn, tomatoes, scallions, Tillamook white cheddar, garlic croutons, and buttermilk herb dressing.", ["milk", "wheat", "gluten"], both, { configurable: true, gs: bothGs, gsNote: "The gluten-sensitive presentation omits croutons and offers bacon as an add-on." }),
  row("Warm Goat Cheese & Spiced Pecan Salad", "Salads", "Field greens, warm goat cheese, spiced pecans, sun-dried cranberries, dates, tomatoes, garlic croutons, and champagne vinaigrette.", ["milk", "wheat", "gluten", "tree-nut"], both, { gs: bothGs, gsNote: "The gluten-sensitive menu calls this Goat Cheese & Spiced Pecan Salad and omits croutons." }),
  row("Mango Chicken & Spiced Pecans", "Salads", "Chicken, mixed greens, red grapes, mint, sun-dried cranberries, spiced pecans, and toasted almonds with ginger vinaigrette.", ["tree-nut"], both, { gs: bothGs }),
  row("Roasted Chicken", "Salads", "Roasted chicken with field greens, corn, sun-dried cranberries, grape tomatoes, pine nuts, dates, croutons, goat cheese, and champagne vinaigrette.", ["milk", "wheat", "gluten", "tree-nut"], both, { gs: bothGs, gsNote: "The gluten-sensitive presentation omits croutons." }),
  row("Blackened Chicken Caesar Salad", "Salads", "Blackened chicken with Reggiano parmesan and fresh garlic croutons.", ["milk", "wheat", "gluten"], ["lunch"], { gs: ["gsLunch"], gsNote: "The gluten-sensitive presentation omits croutons." }),
  row("Short Smoked Salmon Salad", "Salads", "Short-smoked salmon with jumbo asparagus, grape tomatoes, garlic croutons, field greens, and champagne vinaigrette; goat cheese may be added.", ["milk", "wheat", "gluten", "fish"], both, { configurable: true }),
  row("Grilled Tuna & Field Greens", "Salads", "Sesame-crusted tuna with cilantro ginger sauce, field greens, tomatoes, sun-dried cranberries, dates, new potatoes, pine nuts, garlic croutons, and champagne vinaigrette.", ["wheat", "gluten", "tree-nut", "fish", "sesame"], both, { gs: bothGs, gsNote: "The gluten-sensitive presentation omits croutons." }),
  row("Waldorf Steak Salad", "Salads", "Grilled filet tips, blue cheese, walnuts, apples, celery, dried cranberries, field greens, and champagne vinaigrette.", ["milk", "tree-nut"], both, { gs: bothGs }),

  row("Buttermilk Fried Chicken Sandwich", "Sandwiches", "Buttermilk-fried chicken sandwich with lettuce, mayonnaise, pickles, mustard, and fries.", ["milk", "egg", "wheat", "gluten", "mustard"], ["lunch"]),
  row("Grilled Chicken & Havarti Cheese", "Sandwiches", "Grilled chicken, Havarti, arugula, roasted peppers, and mustard mayonnaise on grilled icebox bread with fries.", ["milk", "egg", "wheat", "gluten", "mustard"], both, { configurable: true, gs: bothGs, gsNote: "The gluten-sensitive menu offers this naked or with gluten-free bread." }),
  row("Cheddar Cheeseburger", "Sandwiches", "Certified Angus Beef, Tillamook cheddar, mustard mayonnaise, ketchup, and pickle with fries.", ["milk", "egg", "wheat", "gluten", "mustard"], both, { configurable: true, gs: bothGs, gsNote: "The gluten-sensitive menu offers this naked or with gluten-free bread." }),
  row("Hickory BBQ Burger", "Sandwiches", "Certified Angus Beef, Tillamook cheddar, Havarti, hickory sauce, and fries.", ["milk", "wheat", "gluten"], both, { configurable: true, gs: bothGs, gsNote: "The gluten-sensitive menu offers this naked or with gluten-free bread." }),
  row("Bacon Cheeseburger", "Sandwiches", "Certified Angus Beef, applewood-smoked bacon, American cheese, wicked sauce, and fries.", ["milk", "wheat", "gluten"], both, { configurable: true, gs: bothGs, gsNote: "The gluten-sensitive menu offers this naked or with gluten-free bread." }),
  row("Brunch Burger", "Sandwiches", "Certified Angus Beef, applewood-smoked bacon, American cheese, wicked sauce, a fried egg, and fries.", ["milk", "egg", "wheat", "gluten"], ["lunch"], { configurable: true, gs: ["gsLunch"], gsNote: "The gluten-sensitive menu offers this naked or with gluten-free bread." }),
  row("Jumbo Lump Crab Cake", "Sandwiches", "Jumbo lump crab cake with remoulade sauce on a brioche bun and fries.", ["wheat", "gluten", "shellfish"], ["lunch"]),

  row("Pasta & Red Sauce", "Kids Under 12", "Pasta and red sauce with a choice of fries, unsweetened applesauce, or carrots; kids meals include a choice of milk, fountain soda, juice, or lemonade.", ["milk", "wheat", "gluten"], both, { configurable: true }),
  row("Cheeseburger", "Kids Under 12", "Kids cheeseburger with a choice of fries, unsweetened applesauce, or carrots; kids meals include a choice of milk, fountain soda, juice, or lemonade.", ["milk", "wheat", "gluten"], both, { configurable: true, gs: bothGs, gsNote: "A gluten-free bun is available on the gluten-sensitive menu." }),
  row("Chicken Fingers", "Kids Under 12", "Chicken fingers with a choice of fries, unsweetened applesauce, or carrots; kids meals include a choice of milk, fountain soda, juice, or lemonade.", ["milk", "wheat", "gluten"], both, { configurable: true }),
  row("Grilled Short Smoked Salmon", "Kids Under 12", "Grilled short-smoked salmon with a choice of fries, applesauce, or carrots; kids meals include a choice of milk, fountain soda, juice, or lemonade.", ["milk", "fish"], both, { configurable: true }),
  row("Gluten Free Penne Pasta & Red Sauce", "Kids Under 12", "Gluten-free penne pasta and red sauce with a choice of fries, unsweetened applesauce, or carrots; kids meals include a choice of milk, fountain soda, juice, or lemonade.", ["milk"], [], { configurable: true, gs: bothGs }),

  row("Simply Grilled, Absolutely Fresh Fish", "Fresh Seafood, Chicken & Pasta", "The best available fish, hand-filleted in house daily.", ["fish"], both, { gs: bothGs, gsNote: "The gluten-sensitive presentation includes jumbo asparagus and mashed potatoes." }),
  row("Sauteed Jumbo Lump Crab Cakes", "Fresh Seafood, Chicken & Pasta", "Jumbo lump crab cakes with remoulade sauce, fries, and cole slaw.", ["shellfish"], both),
  row("Crispy Chicken Tenders", "Fresh Seafood, Chicken & Pasta", "Crispy chicken tenders with shoestring fries, creamy cole slaw, and honey mustard dipping sauce.", ["wheat", "gluten", "mustard"], both),
  row("Penne Primavera", "Fresh Seafood, Chicken & Pasta", "Penne with broccolini, mushrooms, asparagus, tomatoes, baby kale, basil, garlic, olive oil, and Reggiano parmesan; chicken, shrimp, or both may be added.", ["milk", "wheat", "gluten", "shellfish"], both, { configurable: true, gs: bothGs, gsNote: "The gluten-sensitive presentation uses gluten-free penne." }),
  row("Hickory Grilled Chicken Breast", "Fresh Seafood, Chicken & Pasta", "Hickory-grilled chicken breast with thin green beans, roasted cremini mushrooms, and brown butter sauce on angel hair pasta.", ["milk", "wheat", "gluten"], both),
  row("Louisiana Pasta", "Fresh Seafood, Chicken & Pasta", "Chicken, andouille sausage, tomato, scallions, and penne in spicy Creole cream sauce; shrimp may be added.", ["milk", "wheat", "gluten", "shellfish"], ["lunch"], { configurable: true, gs: ["gsLunch"], gsNote: "The gluten-sensitive presentation uses gluten-free penne." }),
  row("Jambalaya Pasta", "Fresh Seafood, Chicken & Pasta", "Sauteed shrimp, chicken, andouille sausage, tomato, scallions, and penne in spicy Creole cream sauce.", ["milk", "wheat", "gluten", "shellfish"], ["dinner"], { gs: ["gsDinner"], gsNote: "The gluten-sensitive presentation uses gluten-free penne." }),
  row("Short Smoked Salmon Filet", "Fresh Seafood, Chicken & Pasta", "Marinated, smoked, and hickory-grilled salmon with Dijon cream, jumbo asparagus, and mashed potatoes.", ["milk", "fish", "mustard"], both),
  row("Pecan Crusted Trout", "Fresh Seafood, Chicken & Pasta", "Pecan-crusted trout with Chardonnay citrus sauce and grilled broccolini.", ["tree-nut", "fish"], both),
  row("Crab Cake & Filet Mignon", "Fresh Seafood, Chicken & Pasta", "Crab cake and filet mignon with bearnaise and mashed potatoes.", ["shellfish"], ["dinner"]),

  row("BBQ Baby Back Ribs", "Hickory Grilled Beef, Ribs & More", "BBQ baby back ribs with fries and cole slaw.", [], both, { gs: bothGs }),
  row("Wood Grilled Filet Mignon", "Hickory Grilled Beef, Ribs & More", "Wood-grilled filet mignon with mashed potatoes.", [], ["lunch"], { configurable: true, gs: ["gsLunch"] }),
  row("Drunken Rib Eye", "Hickory Grilled Beef, Ribs & More", "Rib eye marinated in Great American Pale Ale; the lunch presentation includes cremini mushrooms, mashed potatoes, and Brussels sprouts with bacon and spiced pecans, while dinner includes mushrooms, a loaded baked potato, and a field greens salad.", ["wheat", "gluten", "tree-nut"], both, { configurable: true }),
  row("Low Country Beef Back Ribs", "Hickory Grilled Beef, Ribs & More", "Tuesday-and-Wednesday beef back ribs with hickory smoke, mustard barbecue sauce, fries, and cole slaw.", ["mustard"], ["dinner"], { gs: ["gsDinner"] }),
  row("Filet Mignon & Bearnaise", "Hickory Grilled Beef, Ribs & More", "Filet mignon with bearnaise, a loaded baked potato, and a field greens salad.", [], ["dinner"], { configurable: true, gs: ["gsDinner"] }),
  row("Blackened Prime Rib", "Hickory Grilled Beef, Ribs & More", "Thursday-through-Saturday blackened prime rib served on the bone with a loaded baked potato.", [], ["dinner"], { gs: ["gsDinner"] }),

  row("Mashed Potatoes", "Sides", "Mashed potatoes.", [], both, { gs: bothGs }),
  row("Great American Shoestring Fries", "Sides", "Great American shoestring fries.", [], ["lunch"], { gs: bothGs }),
  row("Sauteed Spinach", "Sides", "Sauteed spinach.", [], both, { gs: bothGs }),
  row("Sweet Potato Fries", "Sides", "Sweet potato fries.", [], both, { gs: bothGs }),
  row("Grilled Broccolini", "Sides", "Grilled broccolini.", [], both, { gs: bothGs }),
  row("Jumbo Asparagus", "Sides", "Jumbo asparagus.", [], both, { gs: bothGs }),
  row("Loaded Baked Potato", "Sides", "Loaded baked potato.", [], ["dinner"], { gs: ["gsDinner"] }),
  row("Crispy Brussels Sprouts with Bacon & Spiced Pecans", "Sides", "Crispy Brussels sprouts with bacon and spiced pecans.", ["tree-nut"], both, { gs: bothGs }),

  row("Warm White Chocolate Bread Pudding", "Desserts", "Warm white chocolate bread pudding with vanilla ice cream and caramel.", ["milk", "wheat", "gluten"], both),
  row("Deep Dish Apple Pecan Pie", "Desserts", "Deep-dish apple pecan pie with homemade vanilla ice cream.", ["milk", "wheat", "gluten", "tree-nut"], both),
  row("Warm Flourless Chocolate Waffle", "Desserts", "Warm flourless chocolate waffle with homemade vanilla ice cream and an almond cookie.", ["milk", "wheat", "gluten", "tree-nut"], both, { gs: bothGs }),
  row("Hot Fudge Sundae", "Desserts", "Hot fudge sundae with homemade vanilla ice cream and candied pecans.", ["milk", "tree-nut"], both, { gs: bothGs }),
  row("Billy's Homemade Ice Cream", "Desserts", "Billy's homemade ice cream.", ["milk"], both, { gs: bothGs }),
];

export async function buildArtiesAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const sourceStats = [];
  for (const [key, contract] of Object.entries(sourceContracts)) {
    const buffer = await readFile(path.resolve(contract.artifactPath));
    const actualSha256 = createHash("sha256").update(buffer).digest("hex");
    if (actualSha256 !== contract.sha256) {
      throw new Error(`${contract.label} artifact hash changed: expected ${contract.sha256}, got ${actualSha256}.`);
    }
    const presentationCount = menuRows.filter((item) =>
      item.surfaces.includes(key) || item.gs.includes(key)
    ).length;
    if (contract.expectedPresentationCount != null && presentationCount !== contract.expectedPresentationCount) {
      throw new Error(`${contract.label} boundary changed: expected ${contract.expectedPresentationCount}, got ${presentationCount}.`);
    }
    sourceStats.push({ key, ...contract, actualSha256, presentationCount });
  }

  const items = menuRows.map(canonicalItem);
  if (items.length !== 60 || new Set(items.map((item) => item.id)).size !== 60) {
    throw new Error(`Artie's canonical catalog changed: expected 60 unique products, got ${items.length}.`);
  }
  return {
    schemaVersion: 1,
    restaurantId: restaurantIdArties,
    retrievedAt,
    sourceUrls: Object.values(sourceContracts).map((source) => source.sourceUrl),
    sourceStats: sourceStats.map(({ expectedPresentationCount, ...source }) => source),
    itemCount: items.length,
    presentationCount: sourceStats.reduce((sum, source) => sum + source.presentationCount, 0),
    categoryCount: new Set(items.map((item) => item.category)).size,
    officialIngredientCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    glutenCrossContactOnlyCount: items.filter((item) => item.allergenSourceType === "official-global-cross-contact-note").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    glutenCrossContactItemCount: items.filter((item) => item.mayContain.includes("gluten")).length,
    items,
  };
}

function row(name, category, description, allergens, surfaces, options = {}) {
  return {
    name,
    category,
    description,
    allergens,
    surfaces,
    configurable: Boolean(options.configurable),
    gs: options.gs ?? [],
    gsNote: options.gsNote ?? null,
  };
}

function canonicalItem(item) {
  const allergens = sortAllergens(item.allergens);
  const hasGlutenCrossContact = item.gs.length > 0;
  const sourceKeys = [...new Set([...item.surfaces, ...item.gs])];
  const sourceUrls = sourceKeys.map((key) => sourceContracts[key].sourceUrl);
  const ingredientsText = [item.description, item.gsNote].filter(Boolean).join(" ");
  const allergenSourceType = allergens.length > 0
    ? "official-ingredients"
    : hasGlutenCrossContact
      ? "official-global-cross-contact-note"
      : "unavailable";
  const sourceSummary = allergens.length > 0
    ? `Artie's restaurant-issued menu text directly names ingredients or formulation terms supporting the positive signals shown. ${hasGlutenCrossContact ? "The separate gluten-sensitive menu also applies a gluten cross-contact warning to its documented modified presentation; it is not a full allergen matrix and does not establish absence." : "No restaurant-issued cross-contact statement was found for this regular-menu-only product."}`
    : hasGlutenCrossContact
      ? "Artie's publishes this offering on a gluten-sensitive menu with an explicit gluten cross-contact warning, but publishes no item-level positive major-allergen term for the formulation represented here. Menu silence is not treated as absence."
      : "Artie's current regular menu publishes no item-level positive major-allergen term or product-scoped cross-contact disclosure for this offering. Allergen data is unavailable; menu silence is not treated as absence.";
  return {
    id: slugify(item.name),
    name: item.name,
    category: item.category,
    description: item.description,
    ingredientsText,
    imageUrl: null,
    isConfigurable: item.configurable,
    allergenSourceType,
    allergens,
    mayContain: hasGlutenCrossContact ? ["gluten"] : [],
    sourceType: hasGlutenCrossContact
      ? "restaurant-issued-menu-text-and-gluten-cross-contact-warning"
      : "restaurant-issued-menu-text",
    sourceUrls,
    sourceSummary,
    evidence: [
      ...item.surfaces.map((key) => ({
        sourceKind: "restaurant-issued-menu-text",
        sourceUrl: sourceContracts[key].sourceUrl,
        text: `${item.name}. ${item.description}`,
      })),
      ...(hasGlutenCrossContact ? [{
        sourceKind: "restaurant-issued-gluten-cross-contact-warning",
        sourceUrl: sourceContracts[item.gs[0]].sourceUrl,
        text: glutenCrossContactWarning,
      }] : []),
    ],
    variantGroup: item.category,
  };
}

function sortAllergens(values) {
  return [...new Set(values)].sort((a, b) => allergenOrder.indexOf(a) - allergenOrder.indexOf(b));
}

function slugify(value) {
  return value.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const outputPath = path.resolve(`data/restaurant-verification/repairs/${restaurantIdArties}/corrected-menu.json`);
  const snapshot = await buildArtiesAuditSnapshot({ retrievedAt: "2026-07-15T12:11:20.000Z" });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    outputPath,
    itemCount: snapshot.itemCount,
    presentationCount: snapshot.presentationCount,
    officialIngredientCount: snapshot.officialIngredientCount,
    glutenCrossContactOnlyCount: snapshot.glutenCrossContactOnlyCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
