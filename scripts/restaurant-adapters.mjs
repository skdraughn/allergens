import { restaurantSources } from "./restaurant-sources.mjs";

export const coverageStatuses = {
  blocked: "blocked",
  complete: "complete",
  keptPrevious: "kept-previous",
};

export const snapshotVersion = 1;

const sharedParserTypes = {
  htmlMatrix: "html-allergen-matrix",
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
  arbys: {
    parserTypes: [sharedParserTypes.pdfIngredients, sharedParserTypes.productPage],
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
  chilis: {
    minOfficialItemCount: casualDiningMinItemCount,
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
  dominos: {
    parserTypes: [sharedParserTypes.htmlMatrix, sharedParserTypes.productPage],
  },
  dunkin: {
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.pdfIngredients],
  },
  "five-guys": {
    parserTypes: [sharedParserTypes.pdfIngredients, sharedParserTypes.productPage],
  },
  "first-watch": {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.htmlMatrix],
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
  "red-lobster": {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.htmlMatrix, sharedParserTypes.productPage],
  },
  "red-robin": {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
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
  sonic: {
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.pdfIngredients],
  },
  starbucks: {
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
  },
  subway: {
    parserTypes: [sharedParserTypes.pdfMatrix],
  },
  "texas-roadhouse": {
    minOfficialItemCount: casualDiningMinItemCount,
    parserTypes: [sharedParserTypes.htmlMatrix, sharedParserTypes.productPage],
  },
  "taco-bell": {
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
