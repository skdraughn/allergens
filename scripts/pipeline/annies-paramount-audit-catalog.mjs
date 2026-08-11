import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAnniesParamount =
  "annie-s-paramount-steak-house-washington-dc-dc-metro";
export const retrievedAtAnniesParamount = "2026-07-15T06:28:14.628Z";
export const sourceUrlsAnniesParamount = Object.freeze({
  home: "https://www.anniesparamountdc.com/",
  menus: "https://www.anniesparamountdc.com/menus",
  dinner: "https://www.anniesparamountdc.com/s/Dinner-Menu-May-2026.pdf",
  lunch: "https://www.anniesparamountdc.com/s/Lunch-Menu-May-2026.pdf",
  brunch: "https://www.anniesparamountdc.com/s/Brunch-Menu-May-2026.pdf",
  happyHour: "https://www.anniesparamountdc.com/s/Happy-Hour-Menu-Spring-2025.pdf",
  drinks: "https://www.anniesparamountdc.com/s/drink-menu-2026-final-draft.pdf",
});

const periodUrls = Object.freeze({
  D: sourceUrlsAnniesParamount.dinner,
  L: sourceUrlsAnniesParamount.lunch,
  B: sourceUrlsAnniesParamount.brunch,
  H: sourceUrlsAnniesParamount.happyHour,
});

function rows(category, text) {
  return text.trim().split("\n").filter(Boolean).map((line) => {
    const [periods, name, description = ""] = line.split("\t");
    return {
      category,
      periods,
      name: clean(name),
      description: clean(description) || null,
    };
  });
}

// Reviewed transcription of the dated restaurant-issued PDFs. Repeated meal-period
// presentations are canonicalized to one product with every applicable PDF retained.
const menuRows = [
  ...rows("Starters", `
DLB\tBuffalo Wings\tJumbo wings, baked, blue cheese dressing.
DLB\tChicken Tenders\tFried, barbecue sauce.
DLB\tMac & Cheese Bites\tBaked and crispy, Gruyere and cheddar.
DLB\tFried Buffalo Mozzarella\tHand-breaded, marinara sauce.
DLB\tOnion Rings\tHerbed black pepper crispy crust.
DLB\tJalapeño Popper Dip\tCheddar, pepper jack and cream cheeses with jalapeños, served with homemade tortilla chips.
DLB\tCrab Cake Bites\tBroiled, Cajun tartar sauce.
DLBH\tFried Shrimp\tJumbo shrimp, tartar sauce.
DLB\tShrimp Cocktail\tEight chilled jumbo shrimp, cocktail sauce.
DLB\tFried Clams\tTender clams, tartar sauce.
  `),
  ...rows("Soup & Salads", `
DLB\tChicken Chili\tWhite meat, cheddar cheese.
DLB\tAvgolemono Soup\tGreek chicken soup with orzo, lemon and spinach.
DLB\tHouse Salad\tMixed baby greens, shredded carrots, cherry tomatoes, croutons, choice of dressing.
DLB\tCaesar Salad\tRomaine lettuce, grated Parmesan, croutons, Caesar dressing.
DLB\tIceberg Wedge\tChilled iceberg, bacon, Gorgonzola, blue cheese.
  `),
  ...rows("Omelets", `
BL\tWestern Omelet\tCountry ham, green peppers, onion, cheddar, home fries, whole wheat toast, fruit.
BL\tSwiss & Mushroom Omelet\tSwiss cheese, sautéed mushrooms, home fries, whole wheat toast, fruit.
BL\tAvocado Tomato Omelet\tAvocado, three eggs, diced tomatoes, sour cream, home fries, whole wheat toast, fruit.
BL\tFeta Bacon Omelet\tCrumbled feta cheese, crisp bacon, home fries, whole wheat toast, fruit.
  `),
  ...rows("Benedicts", `
B\tClassic Eggs Benedict\tCanadian bacon, poached eggs, English muffin, Hollandaise, home fries, fruit.
B\tMaryland Benedict\tSeasoned crab cakes, poached eggs, English muffin, Hollandaise, home fries, fruit.
B\tCalifornia Benedict\tAvocado, tomatoes, poached eggs, English muffin, Hollandaise, home fries, fruit.
B\tCorned Beef Hash Benedict\tCorned beef hash, bacon, poached eggs, Hollandaise, home fries, fruit.
  `),
  ...rows("Brunch Platters", `
BL\tAnnie's Breakfast\tThree eggs, bacon or sausage, whole wheat toast, home fries, fruit.
BL\tFrench Toast & Eggs\tFrench toast, three eggs, bacon or sausage, home fries, fruit.
BL\tChicken & French Toast\tFried breaded chicken breast, ciabatta French toast, home fries, fruit.
B\tPancakes & Eggs\tPancakes, three eggs, bacon or sausage, home fries, fruit.
B\tMarinated Tips & Eggs\tEight-ounce marinated sirloin tips, three eggs, toast.
BL\tPork Chop & Eggs\tCenter cut bone-in pork chop, three eggs, toast.
B\tChopped Steak & Eggs\tGround beef patty, three eggs, sliced tomatoes, whole wheat toast.
  `),
  ...rows("Steak & Eggs", `
BL\tSirloin & Eggs\tHand-cut sirloin, three eggs, sliced tomatoes, home fries, whole wheat toast, fruit.
B\tFilet & Eggs\tHand-cut filet, three eggs, sliced tomatoes, home fries, whole wheat toast, fruit.
B\t12oz New York Strip & Eggs\tHand-cut New York strip, three eggs, sliced tomatoes, home fries, whole wheat toast, fruit.
B\t18oz T-Bone Steak & Eggs\tHand-cut T-bone, three eggs, sliced tomatoes, home fries, whole wheat toast, fruit.
B\t12oz Ribeye Steak & Eggs\tHand-cut ribeye, three eggs, sliced tomatoes, home fries, whole wheat toast, fruit.
  `),
  ...rows("Brunch Bakery", `
B\tCinnamon Rolls\tHomemade cinnamon rolls with pecans and raisins.
  `),
  ...rows("Sandwiches", `
DLB\tPrime Rib French Dip\tSliced prime rib, au jus, French roll, horseradish cream sauce.
DLB\tChicken Avocado\tAvocado aioli, pepper jack, ciabatta roll, lettuce, tomato.
DLB\tSteak & Cheese Sandwich\tSliced strip loin, American cheese, French roll, lettuce, tomato.
DLB\tCalifornia Turkey Club\tHouse-roasted turkey, bacon, avocado aioli, Texas toast, lettuce, tomato.
DLB\tFried Chicken Sandwich\tBreaded breast, Kaiser roll, lettuce, tomato, pickles.
DLB\tBlackened Salmon Sandwich\tBaby field greens, ciabatta roll, tomato, pesto mayonnaise.
DLB\tFried Crab Cake Sandwich\tKaiser roll, lettuce, tomato, tartar sauce.
LB\tAnnie's Breakfast Sandwich\tBacon or sausage, two fried eggs, American cheese, tomato and lettuce on an English muffin.
DLB\tShrimp Salad\tMade-to-order, Kaiser roll, lettuce, tomato.
DLB\tShrimp Po' Boy Sandwich\tFried jumbo shrimp, shredded lettuce, tomato and remoulade on a hoagie roll.
L\tGrilled Cheese Sandwich\tMelted premium cheeses, grilled Texas toast.
  `),
  ...rows("Entrée Salads", `
DLB\tBlackened Salmon Salad\tBaby field greens, red onion, tomatoes, avocado, garlic herb croutons, Champagne vinaigrette.
DLB\tCountry Chicken Salad\tFried chicken tenders or grilled chicken, baby field greens, red onion, carrots, tomatoes, bacon, garlic herb croutons, cheddar cheese, ranch dressing.
DLB\tGrilled Chicken Caesar\tRomaine, avocado, tomatoes, onions, black olives, celery, grated Parmesan, croutons, Caesar dressing.
DLB\tAnnie's Cobb Salad\tMesclun, roasted turkey, tomatoes, hard-boiled egg, blue cheese crumbles, bacon, blue cheese dressing.
DLB\tSirloin Steak Salad\tMixed greens, red onion, tomatoes, carrots, celery, croutons, Parmesan, blue cheese dressing.
DLB\tPear Chicken Salad\tGrilled chicken, baby field greens, spiced walnuts, dried cranberries, sliced pears, Gorgonzola cheese, Champagne vinaigrette.
DLB\tSteakhouse Wedge\tSirloin, chilled iceberg wedge, crisp bacon, crumbled Gorgonzola, blue cheese dressing.
DLB\tGrilled Chicken Greek Salad\tMesclun, feta, red onion, pepperoncini, olives, tomatoes, croutons, Mediterranean vinaigrette.
  `),
  ...rows("Hamburgers", `
DLB\tCheeseburger\tHalf-pound burger, American cheese.
DLB\tAnnie's Burger\tBacon, American cheese.
DLB\tSwiss Burger\tSautéed mushrooms, Swiss cheese.
DLB\tWisconsin Burger\tBacon, cheddar cheese.
DLB\tBlue Collar Burger\tGorgonzola cheese, bacon.
DLB\tCalifornia Burger\tAvocado, pepper jack cheese.
DLB\tTexas Burger\tBarbecue sauce, pepper jack, bacon, grilled onion.
DLB\tGarden Burger\tBeyond Burger vegan and gluten-free patty, avocado, sautéed mushrooms.
  `),
  ...rows("Classic Steaks", `
DL\tSirloin Steak\tHand-cut sirloin; choice of two sides.
DL\tFilet Mignon\tHand-cut filet mignon; choice of two sides.
DL\tNew York Strip\tHand-cut New York strip; choice of two sides.
DL\tRibeye Steak\tSimply grilled or Cajun spice rub; choice of two sides.
DL\tT-Bone Steak\tHand-cut T-bone; choice of two sides.
DL\tLondon Broil\tServed sliced with mushrooms and gravy; choice of two sides.
  `),
  ...rows("Seafood", `
DLB\tFish & Chips\tBreaded Atlantic cod filets, French fries, coleslaw.
DLB\tMaryland Crab Cakes\tFried or broiled, choice of two sides.
DLB\tJumbo Shrimp\tLightly floured shrimp, French fries, coleslaw.
DLB\tGrilled Atlantic Salmon\tCajun or simply grilled, choice of two sides.
DL\tEastern Shore Seafood Platter\tFried jumbo shrimp, crab cake, clams, choice of two sides.
DL\tSteak & Seafood\tFried jumbo shrimp, crab cake, fried clams, choice of two sides.
  `),
  ...rows("House Specials", `
DLB\tBull in the Pan\tMarinated sirloin tips, roasted bell peppers, grilled onions, choice of two sides.
DLB\tSouthern Fried Chicken\tBoneless breasts, breaded and fried, gravy, choice of two sides.
DLB\tOpen-Faced Turkey Platter\tOven-roasted turkey, homemade gravy, cranberry compote, choice of two sides.
DLB\tBasil-Pine Nut Pesto Pasta\tPenne, mushroom, tomatoes, Parmesan cheese.
DL\tAthenian Chicken\tGreek-seasoned half roasted chicken, choice of two sides.
DLB\tHalf Rack Baby Back Ribs\tBarbecue pork ribs, French fries and coleslaw.
DL\tCenter Cut Pork Chop\tPan seared, oven roasted, choice of two sides.
DLB\tHomemade Pot Roast\tHomemade slow roasted, mashed potatoes and steamed butter carrots.
DL\tChicken Parmesan\tBreaded chicken breast, Parmesan cheese, mozzarella cheese, marinara sauce, penne pasta.
DL\tSouthwest Grilled Chicken\tPepper jack cheese, mushroom Cabernet sauce, choice of two sides.
DL\tChopped Steak Delight\tGround beef patty, American cheese, mushroom Cabernet sauce, choice of two sides.
  `),
  ...rows("Desserts", `
DLB\tKey Lime Pie
DLB\tPecan Pie
DLB\tCoconut Cream Pie
DLB\tCarrot Cake
DLB\tChocolate Cheesecake
DLB\tBerry Cake
DLB\tChocolate Cake
DLB\tScoop of Vanilla Ice Cream
DLB\tIce Cream Sundae
  `),
  ...rows("Sides", `
DLB\tColeslaw
DLB\tFrench Fries
DLB\tMashed Potatoes
DLB\tVegetable of the Day
DLB\tButtered Carrots
DLB\tSliced Tomatoes
DLB\tBaked Potato
DLB\tRice Pilaf
DLB\tLoaded Baked Potato
  `),
  ...rows("Happy Hour Snacks", `
H\tCheeseburger Slider
H\tFried Chicken Slider
H\tCrab Cake Slider
H\tSteak Fries
H\tFried Fish Bites with Cajun Tartar
H\tMozzarella
H\tBull on a Stick
H\tBuffalo Popcorn Chicken
  `),
];

export function buildAnniesParamountAuditSnapshot({
  retrievedAt = retrievedAtAnniesParamount,
} = {}) {
  const items = menuRows.map((row, index) => {
    const sourceUrls = unique([...row.periods].map((period) => periodUrls[period]));
    const allergens = directAllergensAnniesParamount(`${row.name} ${row.description ?? ""}`);
    return {
      auditItemKey: `${index + 1}:${slugify(row.name)}`,
      id: slugify(row.name),
      name: row.name,
      category: row.category,
      description: row.description,
      ingredientsText: row.description,
      isConfigurable: false,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length > 0 ? "official-ingredients" : "unavailable",
      sourceType: "restaurant-issued-pdf-menu",
      sourceUrls,
      sourceSummary: allergens.length > 0
        ? "Direct product and ingredient terms from Annie's current restaurant-issued food menus support these positive signals. The menus are not allergen matrices and provide no item-level negative or cross-contact assurance."
        : "Annie's current restaurant-issued food menus identify this product but do not publish enough item-level ingredient or allergen detail to support a positive or negative allergen claim.",
      evidence: sourceUrls.map((sourceUrl) => ({
        sourceKind: "restaurant-issued-pdf-menu-text",
        sourceUrl,
        text: clean([row.name, row.description].filter(Boolean).join(" — ")),
      })),
    };
  });

  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error("Annie's canonical menu contains duplicate product ids.");
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAnniesParamount,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAnniesParamount),
    menuDateLabel: "Dinner, lunch, and brunch: May 2026; happy hour: Spring 2025",
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    dinnerItemCount: items.filter((item) => item.sourceUrls.includes(sourceUrlsAnniesParamount.dinner)).length,
    lunchItemCount: items.filter((item) => item.sourceUrls.includes(sourceUrlsAnniesParamount.lunch)).length,
    brunchItemCount: items.filter((item) => item.sourceUrls.includes(sourceUrlsAnniesParamount.brunch)).length,
    happyHourItemCount: items.filter((item) => item.sourceUrls.includes(sourceUrlsAnniesParamount.happyHour)).length,
    officialIngredientCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    excludedAlcoholCount: 35,
    excludedNonFoodDrinkCount: 1,
    excludedDrinkPresentationCount: 36,
    sourceWarning:
      "The dated food PDFs contain item names and selected ingredient descriptions, not an allergen matrix. Positive signals are limited to explicit product or ingredient terms. The generic consumer advisory is not represented as item-level may-contain evidence, and absent terms never become negative assurances. Optional shrimp/salmon add-ons do not smear shellfish/fish onto the base salad or pasta. Coconut is not represented as a major tree nut. The separate drink PDF is alcohol-only apart from Heineken Zero and is excluded from the food catalog.",
    items,
  };
}

export function directAllergensAnniesParamount(value) {
  const text = normalize(value)
    .replace(/\b(?:with grilled shrimp|add grilled chicken or shrimp|with 8oz salmon|with grilled shrimp|with beef tips)\b/g, "")
    .replace(/\bcoconut\b/g, "");
  const allergens = [];
  const matches = [
    ["shellfish", /\b(?:shrimp|crab|clams?)\b/],
    ["milk", /\b(?:milk|cheese|cheddar|gruyere|mozzarella|swiss|feta|parmesan|gorgonzola|cream|sour cream|blue cheese|pepper jack|ranch|butter|buttered|ice cream|cheesecake|hollandaise)\b/],
    ["egg", /\b(?:egg|eggs|omelet|aioli|mayonnaise|tartar|remoulade|caesar dressing|hollandaise|avgolemono)\b/],
    ["fish", /\b(?:fish|cod|salmon)\b/],
    ["tree-nut", /\b(?:pine nut|pecan|pecans|walnut|walnuts)\b/],
  ];
  for (const [allergen, pattern] of matches) {
    if (pattern.test(text)) allergens.push(allergen);
  }
  if (/\b(?:breaded|hand breaded|floured|crispy crust|orzo|toast|french toast|pancakes|english muffin|ciabatta|kaiser roll|french roll|hoagie roll|croutons|penne|pasta|mac and cheese|cinnamon rolls?|slider|pie|cake)\b/.test(text)) {
    allergens.push("wheat", "gluten");
  }
  return unique(allergens);
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[’]/g, "'")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const outputPath = path.resolve(
    process.argv[2] ??
      `data/restaurant-verification/repairs/${restaurantIdAnniesParamount}/corrected-menu.json`,
  );
  const snapshot = buildAnniesParamountAuditSnapshot();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    outputPath,
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    dinnerItemCount: snapshot.dinnerItemCount,
    lunchItemCount: snapshot.lunchItemCount,
    brunchItemCount: snapshot.brunchItemCount,
    happyHourItemCount: snapshot.happyHourItemCount,
    officialIngredientCount: snapshot.officialIngredientCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
  }, null, 2));
}
