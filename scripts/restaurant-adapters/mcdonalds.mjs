import { sharedParserTypes } from "./shared-parser-types.mjs";

export const mcdonaldsAdapter = {
  id: "mcdonalds",
  parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
};
