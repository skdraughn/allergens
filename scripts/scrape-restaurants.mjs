import path from "node:path";
import { fileURLToPath } from "node:url";

export {
  buildRestaurantRepository,
  filterMenuCatalogRecords,
  isProbablyMenuCatalogRecord,
} from "./pipeline/build-repository.mjs";

import { runRestaurantScrapeCli } from "./pipeline/cli.mjs";

if (isCliEntry()) {
  try {
    await runRestaurantScrapeCli();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

function isCliEntry() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
