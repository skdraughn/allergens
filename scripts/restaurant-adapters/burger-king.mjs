import { sharedParserTypes } from "./shared-parser-types.mjs";

export const burgerKingAdapter = {
  id: "burger-king",
  parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
};
