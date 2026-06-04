export type RestaurantBrand = {
  color: string;
  description: string;
  domain: string;
  logoUrl: string;
};

const favicon = (domain: string) =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

const brandAssets: Record<string, Omit<RestaurantBrand, "logoUrl">> = {
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
};

export function getRestaurantBrand(id: string): RestaurantBrand {
  const asset =
    brandAssets[id] ??
    ({
      color: "#007AFF",
      description: "Restaurant menu items, allergen sources, and community notes.",
      domain: "example.com",
    } satisfies Omit<RestaurantBrand, "logoUrl">);

  return {
    ...asset,
    logoUrl: favicon(asset.domain),
  };
}
