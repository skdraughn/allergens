import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildRestaurantRepository } from "./build-repository.mjs";
import { publishRestaurantSnapshotFiles } from "./publish-snapshot.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const defaultOutputPath = path.join(
  projectRoot,
  "src/data/generated/restaurants.generated.json",
);
const defaultRunPath = path.join(projectRoot, "data/scraped/latest-run.json");

export async function runRestaurantScrapeCli(rawArgs = process.argv.slice(2)) {
  const args = parseArgs(rawArgs);
  const outputPath = path.resolve(args.output ?? defaultOutputPath);
  const runPath = path.resolve(args.runOutput ?? defaultRunPath);
  const chainFilter = String(args.chain ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const limit = args.limit ? Number(args.limit) : null;
  const { repository, run } = await buildRestaurantRepository({
    args,
    chainFilter,
    limit,
    previousPath: args.previous ?? outputPath,
  });

  await publishRestaurantSnapshotFiles({ outputPath, repository, run, runPath });

  console.log(`Wrote normalized restaurant data to ${outputPath}`);
  console.log(`Wrote run manifest to ${runPath}`);
}

function parseArgs(rawArgs) {
  const parsed = {};

  for (const arg of rawArgs) {
    if (!arg.startsWith("--")) {
      continue;
    }

    const [key, ...value] = arg.slice(2).split("=");
    parsed[key] = value.length > 0 ? value.join("=") : "true";
  }

  return parsed;
}
