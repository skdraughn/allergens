import { sharedParserTypes } from "./shared-parser-types.mjs";

export const genericHtmlAdapter = {
  id: "generic-html",
  parserTypes: [
    sharedParserTypes.genericHtmlMenu,
    sharedParserTypes.htmlIngredients,
    sharedParserTypes.productPage,
  ],
};
