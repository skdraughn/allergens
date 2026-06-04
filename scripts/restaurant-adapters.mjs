import { restaurantSources } from "./restaurant-sources.mjs";

export const coverageStatuses = {
  blocked: "blocked",
  complete: "complete",
  keptPrevious: "kept-previous",
};

export const snapshotVersion = 1;

const sharedParserTypes = {
  htmlMatrix: "html-allergen-matrix",
  htmlIngredients: "html-ingredients",
  officialApi: "official-api",
  pdfIngredients: "pdf-ingredients",
  pdfMatrix: "pdf-matrix",
  productPage: "product-page",
};

const casualDiningMinItemCount = 25;

const adapterOverrides = {
  applebees: {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.htmlMatrix, sharedParserTypes.productPage],
  },
  "auntie-annes": {
    minOfficialItemCount: 20,
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.htmlMatrix],
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
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  cava: {
    minOfficialItemCount: 20,
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  cheddars: {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
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
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
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
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.htmlMatrix],
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
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
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
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.pdfMatrix],
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

export const brandAdapters = restaurantSources.map((source) => ({
  id: source.id,
  allowGenericDomMenu: false,
  coverageRequiredPercent: 100,
  regionalScope: "us-national-plus-official-regional",
  snapshotVersion,
  ...adapterOverrides[source.id],
}));

export const brandAdapterById = new Map(brandAdapters.map((adapter) => [adapter.id, adapter]));

export function getBrandAdapter(restaurantId) {
  const adapter = brandAdapterById.get(restaurantId);

  if (!adapter) {
    throw new Error(`Missing BrandAdapter for ${restaurantId}`);
  }

  return adapter;
}
