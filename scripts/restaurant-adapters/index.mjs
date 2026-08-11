import { burgerKingAdapter } from "./burger-king.mjs";
import { foundingFarmersAdapter } from "./founding-farmers.mjs";
import { genericHtmlAdapter } from "./generic-html.mjs";
import { genericPdfMatrixAdapter } from "./generic-pdf-matrix.mjs";
import { mcdonaldsAdapter } from "./mcdonalds.mjs";

export const modularAdapterOverrides = [
  burgerKingAdapter,
  foundingFarmersAdapter,
  mcdonaldsAdapter,
];

export const genericAdapters = [
  genericHtmlAdapter,
  genericPdfMatrixAdapter,
];

export const modularAdapterOverridesById = Object.fromEntries(
  modularAdapterOverrides.map((adapter) => [adapter.id, adapter]),
);
