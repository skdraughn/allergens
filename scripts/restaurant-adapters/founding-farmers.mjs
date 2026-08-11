import { sharedParserTypes } from "./shared-parser-types.mjs";

export const foundingFarmersAdapter = {
  id: "founding-farmers-dc",
  allowGenericDomMenu: true,
  brandKey: "founding-farmers",
  minOfficialItemCount: 1,
  parserProfile: sharedParserTypes.foundingFarmersPdfMenu,
  parserTypes: [sharedParserTypes.genericHtmlMenu, sharedParserTypes.foundingFarmersPdfMenu],
  regionalScope: "local-menu-with-intelligence-fallback",
};
