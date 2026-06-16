export type RestaurantBrand = {
  color: string;
  description: string;
  domain: string;
  logoAspectRatio?: number;
  logoMonogram?: string;
  logoSvgUrl?: string;
  logoUrl: string;
};

type RestaurantBrandAsset = Omit<RestaurantBrand, "logoUrl"> & {
  logoUrl?: string;
};

const favicon = (domain: string) =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

const brandAssets: Record<string, RestaurantBrandAsset> = {
  mcdonalds: {
    color: "#FFC72C",
    description: "Burgers, breakfast, fries, chicken sandwiches, desserts, and McCafe drinks.",
    domain: "mcdonalds.com",
  },
  starbucks: {
    color: "#00754A",
    description: "Coffee, espresso drinks, breakfast sandwiches, bakery items, and snacks.",
    domain: "starbucks.com",
  },
  "chick-fil-a": {
    color: "#DD0031",
    description: "Chicken sandwiches, nuggets, breakfast, salads, sides, sauces, and desserts.",
    domain: "chick-fil-a.com",
  },
  "taco-bell": {
    color: "#702082",
    description: "Tacos, burritos, quesadillas, bowls, nachos, sauces, and sweets.",
    domain: "tacobell.com",
  },
  wendys: {
    color: "#E2203D",
    description: "Burgers, chicken sandwiches, fries, chili, salads, breakfast, and Frosty desserts.",
    domain: "wendys.com",
  },
  dunkin: {
    color: "#F58220",
    description: "Coffee, espresso drinks, donuts, bakery items, breakfast sandwiches, and snacks.",
    domain: "dunkindonuts.com",
  },
  chipotle: {
    color: "#A81612",
    description: "Burritos, bowls, tacos, salads, tortillas, proteins, salsas, and toppings.",
    domain: "chipotle.com",
  },
  "burger-king": {
    color: "#D62300",
    description: "Flame-grilled burgers, chicken sandwiches, fries, breakfast, sides, and desserts.",
    domain: "bk.com",
  },
  subway: {
    color: "#008938",
    description: "Made-to-order sandwiches, wraps, bowls, salads, breads, cookies, and sauces.",
    domain: "subway.com",
  },
  dominos: {
    color: "#006491",
    description: "Pizza, breads, wings, pasta, sandwiches, sauces, and desserts.",
    domain: "dominos.com",
  },
  "panda-express": {
    color: "#D71920",
    description: "American Chinese entrees, rice, noodles, vegetables, appetizers, and sauces.",
    domain: "pandaexpress.com",
  },
  panera: {
    color: "#5C3A21",
    description: "Sandwiches, soups, salads, bakery items, breakfast, bowls, and beverages.",
    domain: "panerabread.com",
  },
  popeyes: {
    color: "#FF7A00",
    description: "Fried chicken, chicken sandwiches, seafood, biscuits, sides, sauces, and desserts.",
    domain: "popeyes.com",
  },
  "pizza-hut": {
    color: "#EE3124",
    description: "Pizza, melts, wings, pasta, breadsticks, sauces, and desserts.",
    domain: "pizzahut.com",
  },
  sonic: {
    color: "#0054A6",
    description: "Burgers, chicken, hot dogs, fries, tots, drinks, slushes, shakes, and desserts.",
    domain: "sonicdrivein.com",
  },
  "raising-canes": {
    color: "#C8102E",
    description: "Chicken fingers, crinkle-cut fries, toast, slaw, sauces, and drinks.",
    domain: "raisingcanes.com",
  },
  "dairy-queen": {
    color: "#E21B2D",
    description: "Blizzard treats, cones, shakes, burgers, chicken baskets, fries, and cakes.",
    domain: "dairyqueen.com",
  },
  kfc: {
    color: "#E4002B",
    description: "Fried chicken, sandwiches, nuggets, biscuits, bowls, sides, sauces, and desserts.",
    domain: "kfc.com",
  },
  wingstop: {
    color: "#006B3F",
    description: "Chicken wings, tenders, fries, dips, sides, sauces, and seasonings.",
    domain: "wingstop.com",
  },
  "jack-in-the-box": {
    color: "#E31837",
    description: "Burgers, tacos, chicken, breakfast, fries, shakes, sides, and late-night items.",
    domain: "jackinthebox.com",
  },
  arbys: {
    color: "#9D2235",
    description: "Roast beef sandwiches, market-fresh sandwiches, chicken, fries, sauces, and shakes.",
    domain: "arbys.com",
  },
  whataburger: {
    color: "#FF7700",
    description: "Burgers, chicken sandwiches, breakfast, fries, shakes, sauces, and sides.",
    domain: "whataburger.com",
  },
  "papa-johns": {
    color: "#006B3F",
    description: "Pizza, Papadias, wings, breadsticks, sauces, desserts, and sides.",
    domain: "papajohns.com",
  },
  "jersey-mikes": {
    color: "#003DA5",
    description: "Cold subs, hot subs, wraps, bowls, breads, cheeses, cookies, and chips.",
    domain: "jerseymikes.com",
  },
  culvers: {
    color: "#005BAB",
    description: "ButterBurgers, frozen custard, chicken, fish, fries, curds, sides, and shakes.",
    domain: "culvers.com",
  },
  "little-caesars": {
    color: "#F58220",
    description: "Pizza, Crazy Bread, wings, sauces, stuffed crust items, and desserts.",
    domain: "littlecaesars.com",
  },
  zaxbys: {
    color: "#D71920",
    description: "Chicken fingers, wings, sandwiches, salads, fries, toast, sauces, and drinks.",
    domain: "zaxbys.com",
  },
  "jimmy-johns": {
    color: "#231F20",
    description: "Cold sandwiches, wraps, bread, meats, cheese, chips, cookies, and condiments.",
    domain: "jimmyjohns.com",
  },
  "five-guys": {
    color: "#D71920",
    description: "Burgers, hot dogs, fries, peanuts, milkshakes, toppings, and sandwiches.",
    domain: "fiveguys.com",
  },
  "in-n-out": {
    color: "#C8102E",
    description: "Burgers, fries, shakes, fountain drinks, and limited core menu items.",
    domain: "in-n-out.com",
  },
  "texas-roadhouse": {
    color: "#A32622",
    description: "Steaks, ribs, chicken, seafood, salads, sides, rolls, and desserts.",
    domain: "texasroadhouse.com",
  },
  chilis: {
    color: "#C8102E",
    description: "Burgers, ribs, fajitas, chicken, salads, appetizers, and desserts.",
    domain: "chilis.com",
  },
  "olive-garden": {
    color: "#5A7F2B",
    description: "Pastas, soups, salads, breadsticks, chicken, seafood, and desserts.",
    domain: "olivegarden.com",
    logoMonogram: "OG",
  },
  applebees: {
    color: "#C41230",
    description: "Burgers, chicken, ribs, salads, pasta, appetizers, and desserts.",
    domain: "applebees.com",
  },
  ihop: {
    color: "#005DAA",
    description: "Pancakes, breakfast plates, omelets, burgers, sandwiches, and sides.",
    domain: "ihop.com",
  },
  "outback-steakhouse": {
    color: "#7A1F1D",
    description: "Steaks, chicken, seafood, ribs, salads, sides, and desserts.",
    domain: "outback.com",
  },
  "longhorn-steakhouse": {
    color: "#7A3E1D",
    description: "Steaks, ribs, chicken, seafood, salads, sides, and desserts.",
    domain: "longhornsteakhouse.com",
  },
  dennys: {
    color: "#F5A800",
    description: "Breakfast plates, pancakes, burgers, sandwiches, dinners, and desserts.",
    domain: "dennys.com",
  },
  "cracker-barrel": {
    color: "#6B3F21",
    description: "Breakfast, homestyle dinners, chicken, sides, biscuits, and desserts.",
    domain: "crackerbarrel.com",
  },
  "buffalo-wild-wings": {
    color: "#FDB515",
    description: "Wings, tenders, burgers, sandwiches, sauces, sides, and appetizers.",
    domain: "buffalowildwings.com",
  },
  "red-lobster": {
    color: "#D71920",
    description: "Seafood, shrimp, lobster, fish, biscuits, sides, and desserts.",
    domain: "redlobster.com",
  },
  "cheesecake-factory": {
    color: "#8A6F3D",
    description: "Pastas, burgers, salads, seafood, steaks, appetizers, and cheesecakes.",
    domain: "thecheesecakefactory.com",
  },
  "waffle-house": {
    color: "#F6C300",
    description: "Waffles, breakfast plates, hashbrowns, sandwiches, burgers, and sides.",
    domain: "wafflehouse.com",
  },
  "first-watch": {
    color: "#F58220",
    description: "Breakfast, brunch, eggs, pancakes, sandwiches, salads, and juices.",
    domain: "firstwatch.com",
  },
  "red-robin": {
    color: "#C8102E",
    description: "Burgers, chicken sandwiches, salads, fries, appetizers, and shakes.",
    domain: "redrobin.com",
  },
  bojangles: {
    color: "#F58220",
    description: "Chicken, biscuits, breakfast, sandwiches, sides, sauces, and sweets.",
    domain: "bojangles.com",
  },
  hardees: {
    color: "#D71920",
    description: "Burgers, chicken, breakfast biscuits, fries, sides, and desserts.",
    domain: "hardees.com",
  },
  "dutch-bros": {
    color: "#005DAA",
    description: "Coffee, espresso drinks, teas, energy drinks, smoothies, and snacks.",
    domain: "dutchbros.com",
  },
  "golden-corral": {
    color: "#C69214",
    description: "Buffet entrees, breakfast, meats, sides, salads, desserts, and drinks.",
    domain: "goldencorral.com",
  },
  "carls-jr": {
    color: "#D71920",
    description: "Burgers, chicken sandwiches, breakfast, fries, sides, and shakes.",
    domain: "carlsjr.com",
  },
  "tropical-smoothie-cafe": {
    color: "#78BE20",
    description: "Smoothies, wraps, flatbreads, bowls, sandwiches, salads, and sides.",
    domain: "tropicalsmoothiecafe.com",
  },
  "bjs-restaurant": {
    color: "#7A263A",
    description: "Pizza, burgers, pasta, entrees, salads, appetizers, and Pizookies.",
    domain: "bjsrestaurants.com",
  },
  "shake-shack": {
    color: "#6CB33F",
    description: "Burgers, chicken, fries, shakes, frozen custard, and drinks.",
    domain: "shakeshack.com",
  },
  crumbl: {
    color: "#F4A6C1",
    description: "Cookies, desserts, rotating bakery items, frostings, and drinks.",
    domain: "crumblcookies.com",
  },
  qdoba: {
    color: "#F58220",
    description: "Burritos, bowls, tacos, quesadillas, proteins, salsas, and toppings.",
    domain: "qdoba.com",
  },
  "firehouse-subs": {
    color: "#D71920",
    description: "Hot subs, cold subs, salads, breads, meats, cheeses, and sides.",
    domain: "firehousesubs.com",
  },
  "el-pollo-loco": {
    color: "#FDB515",
    description: "Fire-grilled chicken, bowls, burritos, tacos, salads, sides, and salsas.",
    domain: "elpolloloco.com",
  },
  "marcos-pizza": {
    color: "#C8102E",
    description: "Pizza, subs, wings, salads, breads, sauces, and desserts.",
    domain: "marcos.com",
  },
  "mcalisters-deli": {
    color: "#006B3F",
    description: "Sandwiches, soups, salads, spuds, teas, sides, and desserts.",
    domain: "mcalistersdeli.com",
  },
  freddys: {
    color: "#D71920",
    description: "Steakburgers, hot dogs, fries, frozen custard, sandwiches, and sides.",
    domain: "freddys.com",
  },
  "pf-changs": {
    color: "#B31B1B",
    description: "Asian entrees, noodles, rice, appetizers, soups, salads, and desserts.",
    domain: "pfchangs.com",
  },
  "del-taco": {
    color: "#E31837",
    description: "Tacos, burritos, burgers, fries, quesadillas, sides, and desserts.",
    domain: "deltaco.com",
  },
  cava: {
    color: "#1D4F3A",
    description: "Mediterranean bowls, pitas, greens, grains, proteins, dips, and toppings.",
    domain: "cava.com",
  },
  "nothing-bundt-cakes": {
    color: "#1D4494",
    description: "Bundt cakes, frostings, seasonal cakes, party cakes, and bakery treats.",
    domain: "nothingbundtcakes.com",
  },
  "yard-house": {
    color: "#111111",
    description: "Burgers, tacos, seafood, steaks, salads, appetizers, and desserts.",
    domain: "yardhouse.com",
  },
  "churchs-texas-chicken": {
    color: "#F58220",
    description: "Fried chicken, tenders, sandwiches, biscuits, sides, sauces, and desserts.",
    domain: "churchs.com",
  },
  "ruths-chris": {
    color: "#7A1F1D",
    description: "Steaks, seafood, chicken, salads, sides, appetizers, and desserts.",
    domain: "ruthschris.com",
  },
  "auntie-annes": {
    color: "#005DAA",
    description: "Pretzels, dips, nuggets, sweet pretzels, drinks, and snacks.",
    domain: "auntieannes.com",
  },
  "tim-hortons": {
    color: "#C8102E",
    description: "Coffee, donuts, breakfast sandwiches, wraps, soups, and baked goods.",
    domain: "timhortons.com",
  },
  cheddars: {
    color: "#7A4A20",
    description: "Chicken, steaks, ribs, seafood, salads, sandwiches, sides, and desserts.",
    domain: "cheddars.com",
  },
};

export function getRestaurantBrand(id: string): RestaurantBrand {
  const asset =
    brandAssets[id] ??
    ({
      color: "#007AFF",
      description: "Restaurant menu items, allergen sources, and community notes.",
      domain: "example.com",
    } satisfies RestaurantBrandAsset);

  return {
    ...asset,
    logoUrl: asset.logoUrl ?? favicon(asset.domain),
  };
}
