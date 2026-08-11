import { restaurantSources } from "./restaurant-sources.mjs";
import {
  casualDiningMinItemCount,
  sharedParserTypes,
} from "./restaurant-adapters/shared-parser-types.mjs";
import { modularAdapterOverridesById } from "./restaurant-adapters/index.mjs";
import { classifyRestaurantSource } from "./restaurant-source-classification.mjs";

export const coverageStatuses = {
  blocked: "blocked",
  complete: "complete",
  keptPrevious: "kept-previous",
};

export const snapshotVersion = 1;

function menuIntelligenceFallbackAdapterDefaults(source) {
  if (source.allowUnavailableAllergenFallback !== true) {
    return {};
  }

  return {
    allowGenericDomMenu: true,
    minOfficialItemCount: 1,
    parserTypes: [
      sharedParserTypes.genericHtmlMenu,
      sharedParserTypes.htmlIngredients,
      sharedParserTypes.productPage,
    ],
    regionalScope:
      source.type === "local"
        ? "local-menu-with-intelligence-fallback"
        : "chain-menu-with-intelligence-fallback",
  };
}

const adapterOverrides = {
  applebees: {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.htmlMatrix, sharedParserTypes.productPage],
  },
  "auntie-annes": {
    minOfficialItemCount: 20,
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.pdfIngredients],
  },
  arbys: {
    parserTypes: [sharedParserTypes.pdfIngredients, sharedParserTypes.productPage],
  },
  "bjs-restaurant": {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.htmlMatrix],
  },
  bojangles: {
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.pdfIngredients],
  },
  "buffalo-wild-wings": {
    minOfficialItemCount: 50,
    parserTypes: [sharedParserTypes.htmlMatrix, sharedParserTypes.productPage],
  },
  "burger-king": {
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  "chick-fil-a": {
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  chipotle: {
    parserTypes: [sharedParserTypes.officialApi],
  },
  "carls-jr": {
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.pdfIngredients],
  },
  chilis: {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.productPage],
  },
  "churchs-texas-chicken": {
    minOfficialItemCount: 20,
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.pdfMatrix],
  },
  cava: {
    minOfficialItemCount: 20,
    parserTypes: [sharedParserTypes.pdfMatrix],
  },
  cheddars: {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.pdfMatrix],
  },
  "baskin-robbins": {
    parserTypes: [sharedParserTypes.productPage],
  },
  benihana: {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.productPage],
  },
  "blaze-pizza": {
    parserTypes: [sharedParserTypes.productPage],
  },
  "corner-bakery-cafe": {
    minOfficialItemCount: 20,
    parserTypes: [sharedParserTypes.productPage],
  },
  "chicken-salad-chick": {
    parserTypes: [sharedParserTypes.productPage],
  },
  "einstein-bros": {
    minOfficialItemCount: 20,
    parserTypes: [sharedParserTypes.productPage],
  },
  "krispy-kreme": {
    parserTypes: [sharedParserTypes.productPage],
  },
  "mod-pizza": {
    parserTypes: [sharedParserTypes.productPage],
  },
  "moes-southwest-grill": {
    parserTypes: [sharedParserTypes.productPage],
  },
  "noodles-company": {
    parserTypes: [sharedParserTypes.productPage],
  },
  "smoothie-king": {
    parserTypes: [sharedParserTypes.productPage],
  },
  "cheesecake-factory": {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.htmlMatrix, sharedParserTypes.productPage],
  },
  "cracker-barrel": {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.htmlMatrix, sharedParserTypes.productPage],
  },
  crumbl: {
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  culvers: {
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.htmlMatrix],
  },
  "dairy-queen": {
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  dennys: {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.productPage],
  },
  "del-taco": {
    minOfficialItemCount: 20,
    parserTypes: [sharedParserTypes.pdfMatrix],
  },
  dominos: {
    parserTypes: [sharedParserTypes.htmlMatrix, sharedParserTypes.productPage],
  },
  "dutch-bros": {
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.pdfIngredients],
  },
  dunkin: {
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.pdfIngredients],
  },
  "el-pollo-loco": {
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.pdfIngredients],
  },
  "five-guys": {
    parserTypes: [sharedParserTypes.pdfIngredients, sharedParserTypes.productPage],
  },
  "first-watch": {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.htmlMatrix],
  },
  "flemings-prime-steakhouse-tysons-va": {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.productPage],
  },
  "firehouse-subs": {
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.pdfIngredients],
  },
  freddys: {
    minOfficialItemCount: 20,
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.htmlMatrix],
  },
  "golden-corral": {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.htmlMatrix, sharedParserTypes.officialApi],
  },
  hardees: {
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.pdfIngredients],
  },
  "jack-in-the-box": {
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.pdfIngredients],
  },
  ihop: {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.productPage],
  },
  "jimmy-johns": {
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  kfc: {
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  "little-caesars": {
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.htmlMatrix],
  },
  "marcos-pizza": {
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  "mcalisters-deli": {
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  "longhorn-steakhouse": {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.productPage],
  },
  mcdonalds: {
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  "olive-garden": {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.productPage],
  },
  "nothing-bundt-cakes": {
    minOfficialItemCount: 15,
    parserTypes: [sharedParserTypes.htmlIngredients],
  },
  "outback-steakhouse": {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.htmlMatrix, sharedParserTypes.productPage],
  },
  "panda-express": {
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  panera: {
    parserTypes: [sharedParserTypes.pdfIngredients, sharedParserTypes.productPage],
  },
  "papa-johns": {
    parserTypes: [sharedParserTypes.htmlMatrix],
  },
  "pf-changs": {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.htmlMatrix],
  },
  "red-lobster": {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.htmlMatrix, sharedParserTypes.productPage],
  },
  "red-robin": {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  qdoba: {
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.pdfIngredients],
  },
  "pizza-hut": {
    parserTypes: [sharedParserTypes.htmlMatrix, sharedParserTypes.productPage],
  },
  popeyes: {
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  "raising-canes": {
    parserTypes: [sharedParserTypes.htmlMatrix, sharedParserTypes.productPage],
  },
  "ruths-chris": {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  sonic: {
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.pdfIngredients],
  },
  starbucks: {
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  "shake-shack": {
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  subway: {
    parserTypes: [sharedParserTypes.pdfMatrix],
  },
  "tropical-smoothie-cafe": {
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.htmlMatrix, sharedParserTypes.pdfMatrix],
  },
  "texas-roadhouse": {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.htmlMatrix, sharedParserTypes.productPage],
  },
  "taco-bell": {
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  "tim-hortons": {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.pdfMatrix],
  },
  wendys: {
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  whataburger: {
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  "waffle-house": {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.pdfMatrix],
  },
  wingstop: {
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  "yard-house": {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.pdfMatrix],
  },
  zaxbys: {
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.pdfIngredients],
  },
  "jersey-mikes": {
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  "in-n-out": {
    parserTypes: [sharedParserTypes.htmlMatrix, sharedParserTypes.productPage],
  },
};

export const brandAdapters = restaurantSources.map((source) => {
  const sourceClassification = classifyRestaurantSource(source);
  const parserTypes = [
    ...(sourceClassification.parserTypes ?? []),
    ...(menuIntelligenceFallbackAdapterDefaults(source).parserTypes ?? []),
    ...(adapterOverrides[source.id]?.parserTypes ?? []),
    ...(modularAdapterOverridesById[source.id]?.parserTypes ?? []),
  ];

  return {
    id: source.id,
    allowGenericDomMenu: false,
    coverageRequiredPercent: 100,
    regionalScope: "us-national-plus-official-regional",
    snapshotVersion,
    ...sourceClassification,
    ...menuIntelligenceFallbackAdapterDefaults(source),
    ...adapterOverrides[source.id],
    ...modularAdapterOverridesById[source.id],
    parserTypes: [...new Set(parserTypes)],
  };
});

export const brandAdapterById = new Map(brandAdapters.map((adapter) => [adapter.id, adapter]));
const dynamicBrandAdapterById = new Map();

export function createBrandAdapterForSource(source) {
  const sourceClassification = classifyRestaurantSource(source);
  const parserTypes = [
    ...(sourceClassification.parserTypes ?? []),
    ...(menuIntelligenceFallbackAdapterDefaults(source).parserTypes ?? []),
    ...(adapterOverrides[source.id]?.parserTypes ?? []),
    ...(modularAdapterOverridesById[source.id]?.parserTypes ?? []),
  ];

  return {
    id: source.id,
    allowGenericDomMenu: false,
    coverageRequiredPercent: 100,
    regionalScope: "us-national-plus-official-regional",
    snapshotVersion,
    ...sourceClassification,
    ...menuIntelligenceFallbackAdapterDefaults(source),
    ...adapterOverrides[source.id],
    ...modularAdapterOverridesById[source.id],
    parserTypes: [...new Set(parserTypes)],
  };
}

export function registerBrandAdapterSource(source) {
  if (!source?.id || brandAdapterById.has(source.id)) {
    return brandAdapterById.get(source?.id);
  }

  const adapter = createBrandAdapterForSource(source);
  dynamicBrandAdapterById.set(source.id, adapter);
  return adapter;
}

export function getBrandAdapter(restaurantId) {
  const adapter = brandAdapterById.get(restaurantId) ?? dynamicBrandAdapterById.get(restaurantId);

  if (!adapter) {
    throw new Error(`Missing BrandAdapter for ${restaurantId}`);
  }

  return adapter;
}
