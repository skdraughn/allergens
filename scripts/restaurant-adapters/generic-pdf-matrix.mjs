import { sharedParserTypes } from "./shared-parser-types.mjs";

export const genericPdfMatrixAdapter = {
  id: "generic-pdf-matrix",
  parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.pdfIngredients],
};
