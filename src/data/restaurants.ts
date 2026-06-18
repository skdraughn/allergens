import type { AllergyOption } from "@/constants/allergies";
import generatedRestaurantRepository from "@/data/generated/restaurants.generated.json";

export type AllergenId = AllergyOption["id"];

export type MenuItem = {
  id: string;
  name: string;
  category: string;
  description: string;
  imageUrl?: string | null;
  ingredientsText?: string | null;
  allergenSourceType?:
    | "official-allergen-menu"
    | "official-ingredients"
    | "official-product-allergen-section"
    | "unavailable";
  evidence?: Array<{
    sourceKind?: string;
    sourceUrl?: string;
    text?: string | null;
  }>;
  allergens: AllergenId[];
  isConfigurable?: boolean;
  mayContain?: AllergenId[];
  notes?: string;
  sourceType?: string;
  sourceUrls?: string[];
  variantGroup?: string | null;
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
  updated: string;
  coveragePercent?: number;
  coverageStatus?: "complete" | "blocked" | "kept-previous";
  lastKnownGoodAt?: string | null;
  regionalScope?: string;
  sourceUpdatedAt?: string;
  sourceStatus?: {
    failed: number;
    ok: number;
    total: number;
  };
  allergenDataStatus?: {
    officialItemCount: number;
  };
  sourceUrls?: string[];
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

const starterRestaurants: Restaurant[] = [
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
  restaurants?: Array<{
    category?: string;
    guideLabel?: string;
    guideUrl?: string;
    id: string;
    items?: Array<{
      allergens?: string[];
      category?: string;
      description?: string;
      id?: string;
      imageUrl?: string | null;
      ingredientsText?: string | null;
      allergenSourceType?: MenuItem["allergenSourceType"];
      evidence?: MenuItem["evidence"];
      isConfigurable?: boolean;
      mayContain?: string[];
      name?: string;
      sourceType?: string;
      sourceUrls?: string[];
      variantGroup?: string | null;
    }>;
    name: string;
    rank: number;
    sourceStatus?: Restaurant["sourceStatus"];
    coveragePercent?: Restaurant["coveragePercent"];
    coverageStatus?: Restaurant["coverageStatus"];
    lastKnownGoodAt?: Restaurant["lastKnownGoodAt"];
    regionalScope?: Restaurant["regionalScope"];
    sourceUpdatedAt?: Restaurant["sourceUpdatedAt"];
    allergenDataStatus?: Restaurant["allergenDataStatus"];
    sourceUrls?: string[];
    updated?: string;
  }>;
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
        isPublishableCoverageStatus(restaurant.coverageStatus) &&
        restaurant.items &&
        restaurant.items.length > 0,
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
            isConfigurable: item.isConfigurable,
            mayContain: (item.mayContain ?? []) as AllergenId[],
            name: item.name ?? "Menu item",
            sourceType: item.sourceType,
            sourceUrls: item.sourceUrls,
            variantGroup: item.variantGroup,
          })),
        name: restaurant.name,
        rank: restaurant.rank,
        coveragePercent: restaurant.coveragePercent,
        coverageStatus: restaurant.coverageStatus,
        lastKnownGoodAt: restaurant.lastKnownGoodAt,
        regionalScope: restaurant.regionalScope,
        sourceUpdatedAt: restaurant.sourceUpdatedAt,
        sourceStatus: restaurant.sourceStatus,
        allergenDataStatus: restaurant.allergenDataStatus
          ? { officialItemCount: restaurant.allergenDataStatus.officialItemCount }
          : undefined,
        sourceUrls: restaurant.sourceUrls,
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
  restaurants.reduce((count, restaurant) => count + restaurant.items.length, 0),
].join(":");

export function getRestaurantById(id: string) {
  return restaurants.find((restaurant) => restaurant.id === id);
}
