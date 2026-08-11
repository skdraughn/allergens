import type { AllergyOption } from "@/constants/allergies";
import generatedRestaurantRepository from "@/data/generated/restaurants.summary.generated.json";

export type AllergenId = AllergyOption["id"];

export type InferredAllergenSignal = {
  id: AllergenId;
  c: "low" | "medium" | "high";
  e: string[];
};

export type ExtractedIngredientMention = {
  ingredientId: string;
  label: string;
  sourceField: string;
  text: string;
};

export type MenuItem = {
  id: string;
  name: string;
  category: string;
  description: string;
  imageUrl?: string | null;
  ingredientsText?: string | null;
  nutritionFacts?: Record<string, string | number | null>;
  allergenSourceType?:
    | "official-allergen-menu"
    | "official-ingredients"
    | "official-product-allergen-section"
    | "official-global-cross-contact-note"
    | "restaurant-linked-menu-ingredients"
    | "restaurant-linked-product-allergen-section"
    | "unavailable";
  evidence?: {
    sourceKind?: string;
    sourceUrl?: string;
    text?: string | null;
  }[];
  extractedIngredientMentions?: ExtractedIngredientMention[];
  inferredAllergenSignals?: InferredAllergenSignal[];
  inferredIngredients?: string[];
  inferenceQuestions?: string[];
  inferenceSummary?: string;
  inferenceVersion?: string;
  allergens: AllergenId[];
  isConfigurable?: boolean;
  mayContain?: AllergenId[];
  notes?: string;
  sourceType?: string;
  sourceUrls?: string[];
  variantGroup?: string | null;
};

export type AllergyAccommodationPolicy = {
  status:
    | "can-accommodate"
    | "partial-accommodation"
    | "cannot-accommodate"
    | "unknown";
  scope?: "restaurant" | "experience" | "menu" | "location";
  summary: string;
  advanceNotice?: string | null;
  supported?: string[];
  notSupported?: string[];
  notes?: string[];
  sourceLabel: string;
  sourceType: "official-site" | "official-booking" | "third-party-community" | "manual-review";
  sourceUrl: string;
  sourceRetrievedAt: string;
};

export type Restaurant = {
  id: string;
  rank: number;
  name: string;
  category: string;
  address?: {
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    country?: string | null;
    displayAddress?: string | null;
    postalCode?: string | null;
    region?: string | null;
  } | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  country?: string | null;
  displayAddress?: string | null;
  guideUrl: string;
  guideLabel: string;
  lat?: number | null;
  lng?: number | null;
  locationId?: string | null;
  postalCode?: string | null;
  region?: string | null;
  type?: string;
  updated: string;
  coveragePercent?: number;
  coverageStatus?: "complete" | "blocked" | "kept-previous";
  brandKey?: string | null;
  domain?: string | null;
  lastKnownGoodAt?: string | null;
  logoAspectRatio?: number | null;
  logoMonogram?: string | null;
  logoSvgUrl?: string | null;
  logoUrl?: string | null;
  regionalScope?: string;
  sourceUpdatedAt?: string;
  sourceStatus?: {
    failed: number;
    ok: number;
    total: number;
  };
  snapshotPath?: string | null;
  allergyAccommodationPolicy?: AllergyAccommodationPolicy;
  allergenDataStatus?: {
    officialItemCount: number;
  };
  sourceUrls?: string[];
  totalItemCount?: number;
  items: MenuItem[];
};

const burgerItems: MenuItem[] = [
  {
    id: "cheeseburger",
    name: "Cheeseburger",
    category: "Burgers",
    description: "A beef patty on a bun with cheese and standard burger toppings.",
    allergens: ["wheat", "milk", "sesame", "soy"],
  },
  {
    id: "crispy-chicken-sandwich",
    name: "Crispy Chicken Sandwich",
    category: "Chicken",
    description: "Breaded chicken filet served on a bun with sauce or pickles.",
    allergens: ["wheat", "egg", "milk", "soy", "sesame"],
  },
  {
    id: "fries",
    name: "French Fries",
    category: "Sides",
    description: "Fried potato side; oil, seasoning, and fryer sharing vary by chain.",
    allergens: [],
    mayContain: ["wheat", "milk", "soy"],
    notes: "Shared fryer or seasoning risk varies by chain and location.",
  },
  {
    id: "shake",
    name: "Vanilla Shake",
    category: "Desserts",
    description: "Vanilla frozen dairy drink served from dessert equipment.",
    allergens: ["milk"],
  },
];

const chickenItems: MenuItem[] = [
  {
    id: "chicken-sandwich",
    name: "Chicken Sandwich",
    category: "Chicken",
    description: "Seasoned chicken filet served on a bun with toppings or sauce.",
    allergens: ["wheat", "egg", "milk", "soy", "sesame"],
  },
  {
    id: "nuggets",
    name: "Chicken Nuggets",
    category: "Chicken",
    description: "Bite-sized breaded chicken pieces, typically fried in shared oil.",
    allergens: ["wheat", "egg", "soy"],
  },
  {
    id: "fries",
    name: "Fries",
    category: "Sides",
    description: "Fried potato side with possible fryer or seasoning cross-contact.",
    allergens: [],
    mayContain: ["wheat", "soy"],
  },
  {
    id: "mac-cheese",
    name: "Mac & Cheese",
    category: "Sides",
    description: "Pasta in a creamy cheese sauce.",
    allergens: ["milk", "wheat", "egg"],
  },
];

const pizzaItems: MenuItem[] = [
  {
    id: "cheese-pizza",
    name: "Cheese Pizza",
    category: "Pizza",
    description: "Pizza dough topped with tomato sauce and cheese.",
    allergens: ["wheat", "milk", "soy"],
  },
  {
    id: "pepperoni-pizza",
    name: "Pepperoni Pizza",
    category: "Pizza",
    description: "Cheese pizza topped with pepperoni slices.",
    allergens: ["wheat", "milk", "soy"],
  },
  {
    id: "breadsticks",
    name: "Breadsticks",
    category: "Sides",
    description: "Baked bread side, often finished with oil, seasoning, or cheese.",
    allergens: ["wheat", "milk", "soy"],
  },
  {
    id: "wings",
    name: "Wings",
    category: "Chicken",
    description: "Chicken wings with sauce or seasoning; preparation varies by location.",
    allergens: [],
    mayContain: ["milk", "soy", "wheat"],
  },
];

const sandwichItems: MenuItem[] = [
  {
    id: "turkey-sub",
    name: "Turkey Sandwich",
    category: "Sandwiches",
    description: "Sliced turkey served on bread with optional cheese, vegetables, and sauces.",
    allergens: ["wheat", "soy"],
    mayContain: ["sesame"],
  },
  {
    id: "italian-sub",
    name: "Italian Sandwich",
    category: "Sandwiches",
    description: "Deli meats on bread with cheese, vegetables, oil, or dressing.",
    allergens: ["wheat", "milk", "soy"],
    mayContain: ["sesame"],
  },
  {
    id: "club-sandwich",
    name: "Club Sandwich",
    category: "Sandwiches",
    description: "Layered sandwich with deli meat, bacon, vegetables, and sauce.",
    allergens: ["wheat", "egg", "soy"],
    mayContain: ["sesame"],
  },
  {
    id: "cookie",
    name: "Chocolate Chip Cookie",
    category: "Desserts",
    description: "Baked chocolate chip cookie from the dessert or bakery case.",
    allergens: ["wheat", "egg", "milk", "soy"],
    mayContain: ["tree-nut", "peanut"],
  },
];

const bowlItems: MenuItem[] = [
  {
    id: "burrito",
    name: "Burrito",
    category: "Entrees",
    description: "Flour tortilla wrapped around protein, rice, beans, dairy, or sauces.",
    allergens: ["wheat", "milk", "soy"],
  },
  {
    id: "bowl",
    name: "Protein Bowl",
    category: "Entrees",
    description: "Bowl-style entree with protein, base, vegetables, sauces, or toppings.",
    allergens: [],
    mayContain: ["milk", "soy"],
  },
  {
    id: "quesadilla",
    name: "Quesadilla",
    category: "Entrees",
    description: "Folded tortilla with melted cheese and optional protein.",
    allergens: ["wheat", "milk"],
  },
  {
    id: "sauce",
    name: "Signature Sauce",
    category: "Sauces",
    description: "House sauce or dressing used as a dip, spread, or topping.",
    allergens: ["egg", "soy"],
    mayContain: ["mustard"],
  },
];

const snackItems: MenuItem[] = [
  {
    id: "latte",
    name: "Latte",
    category: "Drinks",
    description: "Espresso drink made with steamed milk or a selected milk alternative.",
    allergens: ["milk"],
  },
  {
    id: "breakfast-sandwich",
    name: "Breakfast Sandwich",
    category: "Breakfast",
    description: "Breakfast bread with egg, cheese, and meat or plant-based filling.",
    allergens: ["wheat", "egg", "milk", "soy"],
  },
  {
    id: "donut",
    name: "Glazed Donut",
    category: "Bakery",
    description: "Sweet fried or baked pastry with glaze.",
    allergens: ["wheat", "egg", "milk", "soy"],
  },
  {
    id: "muffin",
    name: "Bakery Muffin",
    category: "Bakery",
    description: "Soft bakery muffin with batter-based allergen and topping risks.",
    allergens: ["wheat", "egg", "milk", "soy"],
    mayContain: ["tree-nut"],
  },
];

const byCategory: Record<string, MenuItem[]> = {
  Burger: burgerItems,
  Chinese: bowlItems,
  Chicken: chickenItems,
  "Mexican Grill": bowlItems,
  Pizza: pizzaItems,
  Sandwich: sandwichItems,
  Snack: snackItems,
  "Tex-Mex": bowlItems,
};

function itemForRestaurant(item: MenuItem, restaurantId: string): MenuItem {
  return {
    ...item,
    id: `${restaurantId}-${item.id}`,
  };
}

function menuFor(category: string, restaurantId: string, extras: MenuItem[] = []) {
  return [...(byCategory[category] ?? bowlItems), ...extras].map((item) =>
    itemForRestaurant(item, restaurantId),
  );
}

const allergyAccommodationPolicies = {
  "minibar-dc": {
    status: "partial-accommodation",
    scope: "experience",
    summary:
      "All allergies and dietary restrictions should be emailed as early as possible so the team can discuss specifics; some restrictions may have limited accommodation without enough notice.",
    advanceNotice: "As early as possible",
    supported: ["Dairy-conscious", "Gluten-free", "Vegetarian", "Nut-free", "Alcohol-free"],
    notes: [
      "This is a multi-course tasting menu served as a complete experience, not an a la carte menu.",
    ],
    sourceLabel: "Official restaurant FAQ",
    sourceType: "official-site",
    sourceUrl: "https://www.minibarbyjoseandres.com/faq-minibar/",
    sourceRetrievedAt: "2026-07-01",
  },
  "barmini-dc": {
    status: "partial-accommodation",
    scope: "experience",
    summary:
      "The cocktail flight cannot be made non-alcoholic, but other allergies or considerations can be discussed with the team in advance.",
    advanceNotice: "Earliest convenience",
    notSupported: ["Non-alcoholic cocktail flight"],
    notes: [
      "Barmini also serves a la carte snacks, so guests should confirm food allergy needs directly.",
    ],
    sourceLabel: "Official restaurant FAQ",
    sourceType: "official-site",
    sourceUrl: "https://www.minibarbyjoseandres.com/faq-barmini/",
    sourceRetrievedAt: "2026-07-01",
  },
  "pineapple-and-pearls-dc": {
    status: "can-accommodate",
    scope: "restaurant",
    summary:
      "The restaurant says it can accommodate almost all allergies and dietary restrictions with advance notice and can customize a menu.",
    advanceNotice: "Advance notice",
    notes: ["Email the restaurant before the reservation so the menu can be customized."],
    sourceLabel: "Official restaurant FAQ",
    sourceType: "official-site",
    sourceUrl: "https://www.pineappleandpearls.com/team-member/dietary-restrictions/",
    sourceRetrievedAt: "2026-07-01",
  },
  "little-pearl-dc": {
    status: "can-accommodate",
    scope: "restaurant",
    summary:
      "Little Pearl says it can accommodate almost all dietary preferences or restrictions, including vegetarian, vegan, gluten-free, dairy-free, and pregnancy restrictions, when guests let the team know in advance.",
    advanceNotice: "Advance notice",
    supported: ["Vegetarian", "Vegan", "Gluten-free", "Dairy-free", "Pregnancy restrictions"],
    notes: [
      "This is a prix-fixe dining experience, so guests should disclose allergy needs before the visit.",
    ],
    sourceLabel: "Official restaurant FAQ",
    sourceType: "official-site",
    sourceUrl: "https://www.littlepearldc.com/faq/",
    sourceRetrievedAt: "2026-07-02",
  },
  "jont-dc": {
    status: "partial-accommodation",
    scope: "experience",
    summary:
      "Jont can typically alter for most allergies and restrictions with 7 days notice, but cannot fully avoid soy products, mushrooms, cooked allium, butter, cooked alcohol, vegan, or Celiac-safe needs.",
    advanceNotice: "7 days",
    notSupported: [
      "Celiac-safe experience",
      "Vegan menu",
      "Soy-free",
      "Mushroom-free",
      "Cooked allium-free",
      "Butter-free",
      "Cooked alcohol-free",
    ],
    notes: ["Contact the restaurant before booking if any listed limitation matters."],
    sourceLabel: "Official restaurant menu",
    sourceType: "official-site",
    sourceUrl: "https://www.jontdc.com/menu/",
    sourceRetrievedAt: "2026-07-01",
  },
  "inn-at-little-washington-va": {
    status: "partial-accommodation",
    scope: "experience",
    summary:
      "The Inn says it accommodates shellfish, pork, nuts, gluten, and dairy restrictions, but does not make further alterations beyond those and its vegetarian menu.",
    advanceNotice: "Before booking",
    supported: ["Shellfish", "Pork", "Nuts", "Gluten", "Dairy", "Vegetarian menu"],
    notSupported: ["Further tasting-menu alterations beyond listed categories"],
    notes: ["This is a destination restaurant outside DC proper but important for the DC metro audience."],
    sourceLabel: "Official dining room page",
    sourceType: "official-site",
    sourceUrl: "https://www.theinnatlittlewashington.com/michelin-starred-dining-room",
    sourceRetrievedAt: "2026-07-01",
  },
  "xiquet-dc": {
    status: "can-accommodate",
    scope: "experience",
    summary:
      "Xiquet says allergies and restrictions must be presented 72 hours before the reservation so the kitchen can prepare; after that, the tasting menu is served as-is.",
    advanceNotice: "72 hours",
    notes: ["This is a tasting-menu policy, not item-level allergen data."],
    sourceLabel: "Official restaurant menu",
    sourceType: "official-site",
    sourceUrl: "https://www.xiquetdl.com/menus",
    sourceRetrievedAt: "2026-07-01",
  },
  "el-taller-del-xiquet-dc": {
    status: "can-accommodate",
    scope: "restaurant",
    summary:
      "El Taller asks guests to present allergies and restrictions 72 hours before the reservation so the kitchen can prepare.",
    advanceNotice: "72 hours",
    notes: ["The same FAQ says the building does not have an elevator; this is separate from food allergy handling."],
    sourceLabel: "Official restaurant FAQ",
    sourceType: "official-site",
    sourceUrl: "https://www.eltallerdelxiquet.com/faq",
    sourceRetrievedAt: "2026-07-01",
  },
  "bresca-dc": {
    status: "partial-accommodation",
    scope: "menu",
    summary:
      "Bresca says the current menu may not accommodate some allergies or dietary restrictions and asks guests to inquire in advance.",
    advanceNotice: "Inquire in advance",
    notes: ["Use this as a cautionary planning signal for its current menu."],
    sourceLabel: "Official restaurant menu",
    sourceType: "official-site",
    sourceUrl: "https://www.brescadc.com/menus/",
    sourceRetrievedAt: "2026-07-01",
  },
  "gravitas-dc": {
    status: "unknown",
    scope: "restaurant",
    summary:
      "No explicit current allergy accommodation policy was found in this pass, though Gravitas is a tasting-menu restaurant where guests should ask before booking.",
    advanceNotice: null,
    notes: ["The public Tock page currently describes the restaurant but does not expose a clear allergy policy."],
    sourceLabel: "Official booking page",
    sourceType: "official-booking",
    sourceUrl: "https://www.exploretock.com/gravitasdc/faq",
    sourceRetrievedAt: "2026-07-01",
  },
  "elcielo-dc": {
    status: "partial-accommodation",
    scope: "experience",
    summary:
      "Elcielo says its Experience menu can be adapted to vegetarian, but garlic, onion, and tomato cannot be removed; other restrictions should be discussed directly before the reservation.",
    advanceNotice: "Before reservation",
    supported: ["Vegetarian adaptation"],
    notSupported: ["Garlic-free", "Onion-free", "Tomato-free"],
    notes: ["OpenTable also describes allergy adjustments, but the restaurant website lists explicit limits."],
    sourceLabel: "Official restaurant experience page",
    sourceType: "official-site",
    sourceUrl: "https://elcielo.com.co/washington/the-experience/",
    sourceRetrievedAt: "2026-07-01",
  },
  "sushi-taro-dc": {
    status: "partial-accommodation",
    scope: "experience",
    summary:
      "Sushi Taro's omakase counter cannot accommodate vegan, non-seafood diners, or gluten intolerance that requires avoiding regular soy sauce in cooking; it says it will try for other restrictions.",
    advanceNotice: "Before booking",
    notSupported: ["Vegan omakase", "Non-seafood omakase", "No regular soy sauce in cooking"],
    notes: ["This applies to the omakase counter experience."],
    sourceLabel: "Official omakase page",
    sourceType: "official-site",
    sourceUrl: "https://www.sushitaro.com/location/omakase-counter/",
    sourceRetrievedAt: "2026-07-01",
  },
  "kappo-dc": {
    status: "partial-accommodation",
    scope: "experience",
    summary:
      "Kappo says its wagyu tasting menu contains wagyu beef, seafood, gluten, soy, and allium, and asks guests with dietary restrictions to email so the team can plan.",
    advanceNotice: "Before booking",
    notSupported: ["Beef-free tasting menu likely limited", "Seafood-free tasting menu likely limited"],
    notes: ["Confirm directly because the core tasting menu has several built-in allergen and preference constraints."],
    sourceLabel: "Official reservations page",
    sourceType: "official-site",
    sourceUrl: "https://kappodc.com/reservations",
    sourceRetrievedAt: "2026-07-01",
  },
  "lavant-garde-dc": {
    status: "can-accommodate",
    scope: "menu",
    summary:
      "L'Avant-Garde explicitly presents itself as gluten-free friendly, with many naturally or adapted gluten-free dishes and gluten-free bread on request.",
    advanceNotice: "Ask when ordering",
    supported: ["Gluten-free options", "Gluten-free bread by request"],
    notes: ["This is specifically gluten-focused; other allergies still need direct confirmation."],
    sourceLabel: "Official restaurant menu",
    sourceType: "official-site",
    sourceUrl: "https://www.lavantgardedc.com/menus",
    sourceRetrievedAt: "2026-07-01",
  },
  "pascual-dc": {
    status: "partial-accommodation",
    scope: "restaurant",
    summary:
      "Pascual asks guests to note allergies and restrictions, and says some may be accommodated only with 72 hours prior notice.",
    advanceNotice: "72 hours",
    notes: ["This restaurant already has menu data; the policy adds planning context."],
    sourceLabel: "Official restaurant FAQ",
    sourceType: "official-site",
    sourceUrl: "https://www.pascualdc.com/faqs",
    sourceRetrievedAt: "2026-07-01",
  },
  "elizabeths-gone-raw-dc": {
    status: "partial-accommodation",
    scope: "restaurant",
    summary:
      "Elizabeth's says menu items can be gluten free and asks guests to contact before booking about allergies; nut, lentil, and oat allergies require at least 48 hours notice.",
    advanceNotice: "48 hours",
    supported: ["Gluten-free menu items"],
    notSupported: ["Some current seasonal-menu allergies may not be accommodated"],
    notes: ["The restaurant describes itself as vegan fine dining, but allergies still require direct notice."],
    sourceLabel: "Official restaurant menu",
    sourceType: "official-site",
    sourceUrl: "https://www.elizabethsgoneraw.com/menu",
    sourceRetrievedAt: "2026-07-01",
  },
  "rye-bunny-dc": {
    status: "unknown",
    scope: "restaurant",
    summary:
      "No explicit official allergy accommodation policy was found in this pass, but this Tail Up Goat successor is a DC staple candidate and should have a shell for future enrichment.",
    advanceNotice: null,
    notes: [
      "The official FAQ lists contact information; allergy-sensitive guests should email before visiting.",
    ],
    sourceLabel: "Official restaurant FAQ",
    sourceType: "official-site",
    sourceUrl: "https://www.ryebunny.com/faq-1",
    sourceRetrievedAt: "2026-07-01",
  },
  "imperfecto-dc": {
    status: "cannot-accommodate",
    scope: "experience",
    summary:
      "The chef's table experience is described as a preset menu that cannot accommodate allergies.",
    advanceNotice: null,
    notSupported: ["Chef's Table allergy substitutions"],
    notes: [
      "Treat this as experience-specific. A la carte dining may have different handling and should be confirmed directly.",
    ],
    sourceLabel: "Official booking policy",
    sourceType: "official-booking",
    sourceUrl: "https://www.opentable.com/r/imperfecto-the-chefs-table-washington",
    sourceRetrievedAt: "2026-07-01",
  },
  "sushi-nakazawa-dc": {
    status: "partial-accommodation",
    scope: "experience",
    summary:
      "The omakase experience may be able to handle some restrictions with advance notice, but guests should confirm before booking.",
    advanceNotice: "Contact before booking",
    notes: [
      "Omakase menus are seafood- and soy-forward, so this is a planning signal rather than item-level allergen data.",
    ],
    sourceLabel: "Official booking policy",
    sourceType: "official-booking",
    sourceUrl: "https://www.opentable.com/r/sushi-nakazawa-washington-dc",
    sourceRetrievedAt: "2026-07-01",
  },
  "kyojin-dc": {
    status: "cannot-accommodate",
    scope: "experience",
    summary: "The omakase experience says it cannot accommodate allergies or dietary restrictions.",
    advanceNotice: null,
    notSupported: ["Omakase allergy substitutions", "Omakase dietary restrictions"],
    notes: ["This is specific to omakase. Confirm directly for regular dining."],
    sourceLabel: "Official booking policy",
    sourceType: "official-booking",
    sourceUrl: "https://www.exploretock.com/kyojin",
    sourceRetrievedAt: "2026-07-01",
  },
  "reverie-dc": {
    status: "unknown",
    scope: "restaurant",
    summary: "No explicit official allergy accommodation policy was found in this pass.",
    advanceNotice: null,
    notes: [
      "Because this is a destination-style restaurant, guests with allergies should contact the restaurant before booking.",
    ],
    sourceLabel: "Official restaurant website",
    sourceType: "official-site",
    sourceUrl: "https://www.reveriedc.com/",
    sourceRetrievedAt: "2026-07-01",
  },
  "cranes-dc": {
    status: "unknown",
    scope: "restaurant",
    summary: "No explicit official allergy accommodation policy was found in this pass.",
    advanceNotice: null,
    notes: [
      "The menu is chef-driven and seasonal, so allergy-sensitive guests should contact the restaurant before booking.",
    ],
    sourceLabel: "Official restaurant website",
    sourceType: "official-site",
    sourceUrl: "https://www.cranes-dc.com/",
    sourceRetrievedAt: "2026-07-01",
  },
  "kinship-dc": {
    status: "unknown",
    scope: "restaurant",
    summary: "No explicit official allergy accommodation policy was found in this pass.",
    advanceNotice: null,
    notes: [
      "This is a fine-dining restaurant with changing menus. Confirm restrictions directly before booking.",
    ],
    sourceLabel: "Official restaurant website",
    sourceType: "official-site",
    sourceUrl: "https://www.kinshipdc.com/",
    sourceRetrievedAt: "2026-07-01",
  },
  "metier-dc": {
    status: "unknown",
    scope: "restaurant",
    summary: "No explicit current official allergy accommodation policy was found in this pass.",
    advanceNotice: null,
    notes: ["Verify current operating status and accommodation terms before publishing a stronger claim."],
    sourceLabel: "Official restaurant website",
    sourceType: "official-site",
    sourceUrl: "https://www.metierdc.com/",
    sourceRetrievedAt: "2026-07-01",
  },
  "marcels-dc": {
    status: "unknown",
    scope: "restaurant",
    summary: "No explicit official allergy accommodation policy was found in this pass.",
    advanceNotice: null,
    notes: [
      "Classic fine-dining menus may be adaptable, but the app should not claim accommodation without a direct statement.",
    ],
    sourceLabel: "Official restaurant website",
    sourceType: "official-site",
    sourceUrl: "https://www.marcelsdc.com/",
    sourceRetrievedAt: "2026-07-01",
  },
  "shoto-dc": {
    status: "unknown",
    scope: "restaurant",
    summary: "No explicit official allergy accommodation policy was found in this pass.",
    advanceNotice: null,
    notes: [
      "The restaurant is high-end Japanese dining. Confirm seafood, soy, sesame, and gluten constraints directly.",
    ],
    sourceLabel: "Official restaurant website",
    sourceType: "official-site",
    sourceUrl: "https://www.shotodc.com/",
    sourceRetrievedAt: "2026-07-01",
  },
  "maiz64-dc": {
    status: "unknown",
    scope: "restaurant",
    summary: "No explicit official allergy accommodation policy was found in this pass.",
    advanceNotice: null,
    notes: [
      "The menu is corn- and masa-centered, but that does not remove cross-contact or ingredient risks. Confirm directly.",
    ],
    sourceLabel: "Official restaurant website",
    sourceType: "official-site",
    sourceUrl: "https://www.maiz64.com/",
    sourceRetrievedAt: "2026-07-01",
  },
  "mita-dc": {
    status: "can-accommodate",
    scope: "restaurant",
    summary:
      "The restaurant asks guests to note restrictions and allergies in advance so the team can plan the experience.",
    advanceNotice: "48 hours",
    supported: ["Plant-based menu modifications by request"],
    notes: [
      "The menu is plant-based, but allergy-sensitive guests should still confirm soy, nuts, gluten, sesame, and cross-contact.",
    ],
    sourceLabel: "Official booking policy",
    sourceType: "official-booking",
    sourceUrl: "https://www.opentable.com/r/mita-washington",
    sourceRetrievedAt: "2026-07-01",
  },
  "omakase-at-barracks-row-dc": {
    status: "partial-accommodation",
    scope: "experience",
    summary:
      "The restaurant asks guests to call ahead about allergies or dietary restrictions before booking the omakase experience.",
    advanceNotice: "Call ahead",
    notes: ["Omakase is seafood-forward and may have limited substitutions."],
    sourceLabel: "Official booking policy",
    sourceType: "official-booking",
    sourceUrl: "https://www.opentable.com/r/omakase-at-barracks-row-washington",
    sourceRetrievedAt: "2026-07-01",
  },
} satisfies Record<string, AllergyAccommodationPolicy>;

function policyRestaurant({
  category,
  city = "Washington",
  domain,
  guideUrl,
  id,
  name,
  rank,
  region = "DC",
}: {
  category: string;
  city?: string;
  domain: string;
  guideUrl: string;
  id: keyof typeof allergyAccommodationPolicies;
  name: string;
  rank: number;
  region?: string;
}): Restaurant {
  return {
    allergyAccommodationPolicy: allergyAccommodationPolicies[id],
    brandKey: id.replace(/-dc$/, ""),
    category,
    city,
    domain,
    guideLabel: "Official accommodation source",
    guideUrl,
    id,
    items: [],
    name,
    rank,
    region,
    type: "local",
    updated: "2026-07",
  };
}

const starterRestaurants: Restaurant[] = [
  policyRestaurant({
    category: "Tasting Menu",
    domain: "minibarbyjoseandres.com",
    guideUrl: "https://www.minibarbyjoseandres.com/faq-minibar/",
    id: "minibar-dc",
    name: "minibar by Jose Andres",
    rank: 43,
  }),
  policyRestaurant({
    category: "Cocktail Bar",
    domain: "minibarbyjoseandres.com",
    guideUrl: "https://www.minibarbyjoseandres.com/faq-barmini/",
    id: "barmini-dc",
    name: "barmini by Jose Andres",
    rank: 44,
  }),
  policyRestaurant({
    category: "Tasting Menu",
    domain: "pineappleandpearls.com",
    guideUrl: "https://www.pineappleandpearls.com/team-member/dietary-restrictions/",
    id: "pineapple-and-pearls-dc",
    name: "Pineapple & Pearls",
    rank: 45,
  }),
  policyRestaurant({
    category: "Tasting Menu",
    domain: "jontdc.com",
    guideUrl: "https://www.jontdc.com/menu/",
    id: "jont-dc",
    name: "Jont",
    rank: 46,
  }),
  policyRestaurant({
    category: "Fine Dining",
    domain: "littlepearldc.com",
    guideUrl: "https://www.littlepearldc.com/faq/",
    id: "little-pearl-dc",
    name: "Little Pearl",
    rank: 46.5,
  }),
  policyRestaurant({
    category: "Fine Dining",
    city: "Washington",
    domain: "theinnatlittlewashington.com",
    guideUrl: "https://www.theinnatlittlewashington.com/michelin-starred-dining-room",
    id: "inn-at-little-washington-va",
    name: "The Inn at Little Washington",
    rank: 47,
    region: "VA",
  }),
  policyRestaurant({
    category: "Spanish",
    domain: "xiquetdl.com",
    guideUrl: "https://www.xiquetdl.com/menus",
    id: "xiquet-dc",
    name: "Xiquet by Danny Lledo",
    rank: 48,
  }),
  policyRestaurant({
    category: "Spanish",
    domain: "eltallerdelxiquet.com",
    guideUrl: "https://www.eltallerdelxiquet.com/faq",
    id: "el-taller-del-xiquet-dc",
    name: "El Taller del Xiquet",
    rank: 49,
  }),
  policyRestaurant({
    category: "Fine Dining",
    domain: "brescadc.com",
    guideUrl: "https://www.brescadc.com/menus/",
    id: "bresca-dc",
    name: "Bresca",
    rank: 50,
  }),
  policyRestaurant({
    category: "Tasting Menu",
    domain: "gravitasdc.com",
    guideUrl: "https://www.exploretock.com/gravitasdc/faq",
    id: "gravitas-dc",
    name: "Gravitas",
    rank: 51,
  }),
  policyRestaurant({
    category: "Colombian",
    domain: "elcielo.com.co",
    guideUrl: "https://elcielo.com.co/washington/the-experience/",
    id: "elcielo-dc",
    name: "Elcielo Washington",
    rank: 52,
  }),
  policyRestaurant({
    category: "Omakase",
    domain: "sushitaro.com",
    guideUrl: "https://www.sushitaro.com/location/omakase-counter/",
    id: "sushi-taro-dc",
    name: "Sushi Taro",
    rank: 53,
  }),
  policyRestaurant({
    category: "Japanese",
    domain: "kappodc.com",
    guideUrl: "https://kappodc.com/reservations",
    id: "kappo-dc",
    name: "Kappo DC",
    rank: 54,
  }),
  policyRestaurant({
    category: "French",
    domain: "lavantgardedc.com",
    guideUrl: "https://www.lavantgardedc.com/menus",
    id: "lavant-garde-dc",
    name: "L'Avant-Garde",
    rank: 55,
  }),
  policyRestaurant({
    category: "Vegan",
    domain: "elizabethsgoneraw.com",
    guideUrl: "https://www.elizabethsgoneraw.com/menu",
    id: "elizabeths-gone-raw-dc",
    name: "Elizabeth's Gone Raw",
    rank: 56,
  }),
  policyRestaurant({
    category: "New American",
    domain: "ryebunny.com",
    guideUrl: "https://www.ryebunny.com/faq-1",
    id: "rye-bunny-dc",
    name: "Rye Bunny",
    rank: 57,
  }),
  policyRestaurant({
    category: "Fine Dining",
    domain: "imperfectodc.com",
    guideUrl: "https://www.opentable.com/r/imperfecto-the-chefs-table-washington",
    id: "imperfecto-dc",
    name: "Imperfecto",
    rank: 31,
  }),
  policyRestaurant({
    category: "Omakase",
    domain: "sushinakazawa.com",
    guideUrl: "https://www.opentable.com/r/sushi-nakazawa-washington-dc",
    id: "sushi-nakazawa-dc",
    name: "Sushi Nakazawa",
    rank: 32,
  }),
  policyRestaurant({
    category: "Japanese",
    domain: "kyojindc.com",
    guideUrl: "https://www.exploretock.com/kyojin",
    id: "kyojin-dc",
    name: "Kyojin",
    rank: 33,
  }),
  policyRestaurant({
    category: "Fine Dining",
    domain: "reveriedc.com",
    guideUrl: "https://www.reveriedc.com/",
    id: "reverie-dc",
    name: "Reverie",
    rank: 34,
  }),
  policyRestaurant({
    category: "Spanish Japanese",
    domain: "cranes-dc.com",
    guideUrl: "https://www.cranes-dc.com/",
    id: "cranes-dc",
    name: "Cranes",
    rank: 35,
  }),
  policyRestaurant({
    category: "Fine Dining",
    domain: "kinshipdc.com",
    guideUrl: "https://www.kinshipdc.com/",
    id: "kinship-dc",
    name: "Kinship",
    rank: 36,
  }),
  policyRestaurant({
    category: "Tasting Menu",
    domain: "metierdc.com",
    guideUrl: "https://www.metierdc.com/",
    id: "metier-dc",
    name: "Metier",
    rank: 37,
  }),
  policyRestaurant({
    category: "French",
    domain: "marcelsdc.com",
    guideUrl: "https://www.marcelsdc.com/",
    id: "marcels-dc",
    name: "Marcel's by Robert Wiedmaier",
    rank: 38,
  }),
  policyRestaurant({
    category: "Japanese",
    domain: "shotodc.com",
    guideUrl: "https://www.shotodc.com/",
    id: "shoto-dc",
    name: "Shoto",
    rank: 39,
  }),
  policyRestaurant({
    category: "Mexican",
    domain: "maiz64.com",
    guideUrl: "https://www.maiz64.com/",
    id: "maiz64-dc",
    name: "Maiz64",
    rank: 40,
  }),
  policyRestaurant({
    category: "Plant-Based",
    domain: "mitadc.com",
    guideUrl: "https://www.opentable.com/r/mita-washington",
    id: "mita-dc",
    name: "MITA",
    rank: 41,
  }),
  policyRestaurant({
    category: "Omakase",
    domain: "omakasebarracksrow.com",
    guideUrl: "https://www.opentable.com/r/omakase-at-barracks-row-washington",
    id: "omakase-at-barracks-row-dc",
    name: "Omakase at Barracks Row",
    rank: 42,
  }),
  {
    id: "mcdonalds",
    rank: 1,
    name: "McDonald's",
    category: "Burger",
    guideUrl: "https://www.mcdonalds.com/us/en-us/about-our-food/nutrition-calculator.html",
    guideLabel: "McDonald's nutrition calculator",
    updated: "2026-05",
    items: menuFor("Burger", "mcdonalds", [
      {
        id: "filet-o-fish",
        name: "Filet-O-Fish",
        category: "Fish",
        description: "Breaded fish filet sandwich with cheese and tartar-style sauce.",
        allergens: ["fish", "wheat", "milk", "egg", "soy"],
      },
    ]),
  },
  {
    id: "starbucks",
    rank: 2,
    name: "Starbucks",
    category: "Snack",
    guideUrl: "https://www.starbucks.com/menu/nutrition/",
    guideLabel: "Starbucks menu nutrition",
    updated: "2026-05",
    items: menuFor("Snack", "starbucks", [
      {
        id: "banana-nut-loaf",
        name: "Banana Nut Loaf",
        category: "Bakery",
        description: "Sweet banana bakery slice made with tree nuts.",
        allergens: ["wheat", "egg", "milk", "tree-nut"],
      },
    ]),
  },
  {
    id: "chick-fil-a",
    rank: 3,
    name: "Chick-fil-A",
    category: "Chicken",
    guideUrl: "https://www.chick-fil-a.com/nutrition-allergens",
    guideLabel: "Chick-fil-A nutrition and allergens",
    updated: "2026-05",
    items: menuFor("Chicken", "chick-fil-a"),
  },
  {
    id: "taco-bell",
    rank: 4,
    name: "Taco Bell",
    category: "Tex-Mex",
    guideUrl: "https://www.tacobell.com/nutrition/allergen-info",
    guideLabel: "Taco Bell allergen info",
    updated: "2026-05",
    items: menuFor("Tex-Mex", "taco-bell"),
  },
  {
    id: "wendys",
    rank: 5,
    name: "Wendy's",
    category: "Burger",
    guideUrl: "https://www.wendys.com/nutrition-allergens",
    guideLabel: "Wendy's nutrition and allergens",
    updated: "2026-05",
    items: menuFor("Burger", "wendys"),
  },
  {
    id: "dunkin",
    rank: 6,
    name: "Dunkin'",
    category: "Snack",
    guideUrl: "https://www.dunkindonuts.com/en/menu/nutrition",
    guideLabel: "Dunkin' nutrition",
    updated: "2026-05",
    items: menuFor("Snack", "dunkin"),
  },
  {
    id: "chipotle",
    rank: 7,
    name: "Chipotle",
    category: "Mexican Grill",
    guideUrl: "https://www.chipotle.com/allergens",
    guideLabel: "Chipotle allergens",
    updated: "2026-05",
    items: menuFor("Mexican Grill", "chipotle", [
      {
        id: "sofritas",
        name: "Sofritas",
        category: "Protein",
        description: "Braised plant-based protein with seasoning and sauce.",
        allergens: ["soy"],
      },
      {
        id: "flour-tortilla",
        name: "Flour Tortilla",
        category: "Tortillas",
        description: "Soft flour tortilla used for burritos and quesadillas.",
        allergens: ["wheat"],
      },
    ]),
  },
  {
    id: "burger-king",
    rank: 8,
    name: "Burger King",
    category: "Burger",
    guideUrl: "https://www.bk.com/nutrition-explorer",
    guideLabel: "Burger King nutrition explorer",
    updated: "2026-05",
    items: menuFor("Burger", "burger-king"),
  },
  {
    id: "subway",
    rank: 9,
    name: "Subway",
    category: "Sandwich",
    guideUrl: "https://www.subway.com/en-us/menunutrition/nutrition",
    guideLabel: "Subway nutrition",
    updated: "2026-05",
    items: menuFor("Sandwich", "subway"),
  },
  {
    id: "dominos",
    rank: 10,
    name: "Domino's",
    category: "Pizza",
    guideUrl: "https://www.dominos.com/en/pages/content/nutritional/allergen-info",
    guideLabel: "Domino's allergen info",
    updated: "2026-05",
    items: menuFor("Pizza", "dominos"),
  },
  {
    id: "panda-express",
    rank: 11,
    name: "Panda Express",
    category: "Chinese",
    guideUrl: "https://www.pandaexpress.com/nutritioninformation",
    guideLabel: "Panda Express nutrition information",
    updated: "2026-05",
    items: menuFor("Chinese", "panda-express", [
      {
        id: "orange-chicken",
        name: "Orange Chicken",
        category: "Entrees",
        description: "Crispy chicken entree tossed in a sweet citrus-style sauce.",
        allergens: ["wheat", "soy", "egg"],
      },
    ]),
  },
  {
    id: "panera",
    rank: 12,
    name: "Panera",
    category: "Sandwich",
    guideUrl: "https://www.panerabread.com/en-us/menu/nutritious-eating/allergen-and-nutrition-information.html",
    guideLabel: "Panera nutrition",
    updated: "2026-05",
    items: menuFor("Sandwich", "panera"),
  },
  {
    id: "popeyes",
    rank: 13,
    name: "Popeyes",
    category: "Chicken",
    guideUrl: "https://www.popeyes.com/nutrition",
    guideLabel: "Popeyes nutrition",
    updated: "2026-05",
    items: menuFor("Chicken", "popeyes"),
  },
  {
    id: "pizza-hut",
    rank: 14,
    name: "Pizza Hut",
    category: "Pizza",
    guideUrl: "https://www.pizzahut.com/c/content/nutrition",
    guideLabel: "Pizza Hut allergen information",
    updated: "2026-05",
    items: menuFor("Pizza", "pizza-hut"),
  },
  {
    id: "sonic",
    rank: 15,
    name: "Sonic Drive-In",
    category: "Burger",
    guideUrl: "https://www.sonicdrivein.com/nutrition-allergen/",
    guideLabel: "Sonic nutrition and allergen guide",
    updated: "2026-05",
    items: menuFor("Burger", "sonic"),
  },
  {
    id: "raising-canes",
    rank: 16,
    name: "Raising Cane's",
    category: "Chicken",
    guideUrl: "https://raisingcanes.com/menu",
    guideLabel: "Raising Cane's allergens",
    updated: "2026-05",
    items: menuFor("Chicken", "raising-canes"),
  },
  {
    id: "dairy-queen",
    rank: 17,
    name: "Dairy Queen",
    category: "Burger",
    guideUrl: "https://www.dairyqueen.com/en-us/us-en/Company/Nutrition/",
    guideLabel: "Dairy Queen nutrition",
    updated: "2026-05",
    items: menuFor("Burger", "dairy-queen"),
  },
  {
    id: "kfc",
    rank: 18,
    name: "KFC",
    category: "Chicken",
    guideUrl: "https://www.kfc.com/nutrition",
    guideLabel: "KFC nutrition",
    updated: "2026-05",
    items: menuFor("Chicken", "kfc"),
  },
  {
    id: "wingstop",
    rank: 19,
    name: "Wingstop",
    category: "Chicken",
    guideUrl: "https://www.wingstop.com/nutrition",
    guideLabel: "Wingstop nutrition",
    updated: "2026-05",
    items: menuFor("Chicken", "wingstop"),
  },
  {
    id: "jack-in-the-box",
    rank: 20,
    name: "Jack in the Box",
    category: "Burger",
    guideUrl: "https://static.jackinthebox.com/pdfs/allergens_reference_guide.pdf",
    guideLabel: "Jack in the Box nutrition",
    updated: "2026-05",
    items: menuFor("Burger", "jack-in-the-box"),
  },
  {
    id: "arbys",
    rank: 21,
    name: "Arby's",
    category: "Sandwich",
    guideUrl: "https://www.arbys.com/nutrition/",
    guideLabel: "Arby's nutrition",
    updated: "2026-05",
    items: menuFor("Sandwich", "arbys"),
  },
  {
    id: "whataburger",
    rank: 22,
    name: "Whataburger",
    category: "Burger",
    guideUrl: "https://whataburger.com/nutrition",
    guideLabel: "Whataburger nutrition",
    updated: "2026-05",
    items: menuFor("Burger", "whataburger"),
  },
  {
    id: "papa-johns",
    rank: 23,
    name: "Papa Johns",
    category: "Pizza",
    guideUrl: "https://www.papajohns.com/company/nutritional-details.html",
    guideLabel: "Papa Johns nutritional details",
    updated: "2026-05",
    items: menuFor("Pizza", "papa-johns"),
  },
  {
    id: "jersey-mikes",
    rank: 24,
    name: "Jersey Mike's",
    category: "Sandwich",
    guideUrl: "https://www.jerseymikes.com/menu/nutrition",
    guideLabel: "Jersey Mike's nutrition",
    updated: "2026-05",
    items: menuFor("Sandwich", "jersey-mikes"),
  },
  {
    id: "culvers",
    rank: 25,
    name: "Culver's",
    category: "Burger",
    guideUrl: "https://www.culvers.com/menu-and-nutrition",
    guideLabel: "Culver's menu and nutrition",
    updated: "2026-05",
    items: menuFor("Burger", "culvers"),
  },
  {
    id: "little-caesars",
    rank: 26,
    name: "Little Caesars",
    category: "Pizza",
    guideUrl: "https://littlecaesars.com/en-us/nutrition/",
    guideLabel: "Little Caesars nutrition",
    updated: "2026-05",
    items: menuFor("Pizza", "little-caesars"),
  },
  {
    id: "zaxbys",
    rank: 27,
    name: "Zaxbys",
    category: "Chicken",
    guideUrl: "https://www.zaxbys.com/uploads/2024_P2_Zaxbys_NAI_Guide_Digital_580d59c863.pdf",
    guideLabel: "Zaxbys nutrition",
    updated: "2026-05",
    items: menuFor("Chicken", "zaxbys"),
  },
  {
    id: "jimmy-johns",
    rank: 28,
    name: "Jimmy John's",
    category: "Sandwich",
    guideUrl: "https://www.jimmyjohns.com/menu/nutrition/",
    guideLabel: "Jimmy John's nutrition",
    updated: "2026-05",
    items: menuFor("Sandwich", "jimmy-johns"),
  },
  {
    id: "five-guys",
    rank: 29,
    name: "Five Guys",
    category: "Burger",
    guideUrl: "https://www.fiveguys.com/-/media/public-site/files/allergen-ingredients-and-nutrition-info/five-guys-us-nutrition--allergen-guide-english.pdf",
    guideLabel: "Five Guys nutrition and allergens",
    updated: "2026-05",
    items: menuFor("Burger", "five-guys", [
      {
        id: "peanuts",
        name: "In-store Peanuts",
        category: "Sides",
        description: "Bulk peanuts available in restaurant dining areas.",
        allergens: ["peanut"],
      },
    ]),
  },
  {
    id: "in-n-out",
    rank: 30,
    name: "In-N-Out Burger",
    category: "Burger",
    guideUrl: "https://www.in-n-out.com/menu/nutrition-info",
    guideLabel: "In-N-Out nutrition info",
    updated: "2026-05",
    items: menuFor("Burger", "in-n-out"),
  },
];

type GeneratedRepository = {
  generatedAt?: string;
  restaurants?: {
    category?: string;
    guideLabel?: string;
    guideUrl?: string;
    id: string;
    items?: {
      allergens?: string[];
      category?: string;
      description?: string;
      id?: string;
      imageUrl?: string | null;
      ingredientsText?: string | null;
      allergenSourceType?: MenuItem["allergenSourceType"];
      evidence?: MenuItem["evidence"];
      extractedIngredientMentions?: MenuItem["extractedIngredientMentions"];
      inferredAllergenSignals?: MenuItem["inferredAllergenSignals"];
      inferredIngredients?: string[];
      inferenceQuestions?: string[];
      inferenceSummary?: string;
      inferenceVersion?: string;
      isConfigurable?: boolean;
      mayContain?: string[];
      name?: string;
      sourceType?: string;
      sourceUrls?: string[];
      variantGroup?: string | null;
    }[];
    name: string;
    rank: number;
    sourceStatus?: Restaurant["sourceStatus"];
    snapshotPath?: string | null;
    allergyAccommodationPolicy?: Restaurant["allergyAccommodationPolicy"];
    address?: Restaurant["address"];
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    country?: string | null;
    displayAddress?: string | null;
    brandKey?: Restaurant["brandKey"];
    coveragePercent?: Restaurant["coveragePercent"];
    coverageStatus?: Restaurant["coverageStatus"];
    domain?: Restaurant["domain"];
    lat?: number | null;
    lng?: number | null;
    locationId?: string | null;
    logoAspectRatio?: Restaurant["logoAspectRatio"];
    logoMonogram?: Restaurant["logoMonogram"];
    logoSvgUrl?: Restaurant["logoSvgUrl"];
    logoUrl?: Restaurant["logoUrl"];
    postalCode?: string | null;
    region?: string | null;
    type?: string;
    lastKnownGoodAt?: Restaurant["lastKnownGoodAt"];
    regionalScope?: Restaurant["regionalScope"];
    sourceUpdatedAt?: Restaurant["sourceUpdatedAt"];
    allergenDataStatus?: Restaurant["allergenDataStatus"];
    sourceUrls?: string[];
    totalItemCount?: number;
    updated?: string;
  }[];
};

const generatedRestaurants = (generatedRestaurantRepository as GeneratedRepository).restaurants ?? [];
const generatedStatusById = new Map(
  generatedRestaurants.map((restaurant) => [restaurant.id, restaurant.coverageStatus]),
);
const isPublishableCoverageStatus = (status?: Restaurant["coverageStatus"]) =>
  !status || status === "complete" || status === "kept-previous";
const generatedById = new Map(
  generatedRestaurants
    .filter(
      (restaurant) =>
        isPublishableCoverageStatus(restaurant.coverageStatus),
    )
    .map((restaurant) => [
      restaurant.id,
      {
        category: restaurant.category ?? "Menu",
        guideLabel: restaurant.guideLabel ?? "Official menu and allergen sources",
        guideUrl: restaurant.guideUrl ?? restaurant.sourceUrls?.[0] ?? "",
        id: restaurant.id,
        items: (restaurant.items ?? [])
          .filter((item) => Boolean(item.name))
          .map((item) => ({
            allergens: (item.allergens ?? []) as AllergenId[],
            category: item.category ?? "Menu",
            description:
              item.description ??
              `${item.name} from the restaurant's official menu or allergen source.`,
            id:
              item.id ??
              `${restaurant.id}-${(item.name ?? "menu-item").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            imageUrl: item.imageUrl,
            ingredientsText: item.ingredientsText,
            allergenSourceType: item.allergenSourceType,
            evidence: item.evidence,
            extractedIngredientMentions: item.extractedIngredientMentions,
            inferredAllergenSignals: item.inferredAllergenSignals,
            inferredIngredients: item.inferredIngredients,
            inferenceQuestions: item.inferenceQuestions,
            inferenceSummary: item.inferenceSummary,
            inferenceVersion: item.inferenceVersion,
            isConfigurable: item.isConfigurable,
            mayContain: (item.mayContain ?? []) as AllergenId[],
            name: item.name ?? "Menu item",
            sourceType: item.sourceType,
            sourceUrls: item.sourceUrls,
            variantGroup: item.variantGroup,
          })),
        name: restaurant.name,
        rank: restaurant.rank,
        address: restaurant.address,
        addressLine1: restaurant.addressLine1,
        addressLine2: restaurant.addressLine2,
        city: restaurant.city,
        country: restaurant.country,
        displayAddress: restaurant.displayAddress,
        brandKey: restaurant.brandKey,
        coveragePercent: restaurant.coveragePercent,
        coverageStatus: restaurant.coverageStatus,
        domain: restaurant.domain,
        lat: restaurant.lat,
        lng: restaurant.lng,
        locationId: restaurant.locationId,
        logoAspectRatio: restaurant.logoAspectRatio,
        logoMonogram: restaurant.logoMonogram,
        logoSvgUrl: restaurant.logoSvgUrl,
        logoUrl: restaurant.logoUrl,
        postalCode: restaurant.postalCode,
        region: restaurant.region,
        lastKnownGoodAt: restaurant.lastKnownGoodAt,
        regionalScope: restaurant.regionalScope,
        sourceUpdatedAt: restaurant.sourceUpdatedAt,
        sourceStatus: restaurant.sourceStatus,
        snapshotPath:
          restaurant.snapshotPath ?? `restaurant-data/restaurants/${restaurant.id}/latest.json`,
        allergyAccommodationPolicy:
          restaurant.allergyAccommodationPolicy ??
          allergyAccommodationPolicies[restaurant.id as keyof typeof allergyAccommodationPolicies],
        allergenDataStatus: restaurant.allergenDataStatus
          ? { officialItemCount: restaurant.allergenDataStatus.officialItemCount }
          : undefined,
        sourceUrls: restaurant.sourceUrls,
        totalItemCount: restaurant.totalItemCount ?? restaurant.items?.length ?? 0,
        type: restaurant.type,
        updated: restaurant.updated ?? "scraped",
      } satisfies Restaurant,
    ]),
);

export const restaurants: Restaurant[] = [
  ...starterRestaurants
    .filter((restaurant) => isPublishableCoverageStatus(generatedStatusById.get(restaurant.id)))
    .map((restaurant) => generatedById.get(restaurant.id) ?? restaurant),
  ...Array.from(generatedById.values()).filter(
    (restaurant) => !starterRestaurants.some((starter) => starter.id === restaurant.id),
  ),
];

export const restaurantDataGeneratedAt =
  (generatedRestaurantRepository as GeneratedRepository).generatedAt ?? "bundled";

export const restaurantDataCacheVersion = [
  restaurantDataGeneratedAt,
  restaurants.length,
  restaurants.reduce(
    (count, restaurant) => count + (restaurant.totalItemCount ?? restaurant.items.length),
    0,
  ),
].join(":");

export function getRestaurantById(id: string) {
  return restaurants.find((restaurant) => restaurant.id === id);
}
