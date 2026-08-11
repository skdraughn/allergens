import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function publishRestaurantSnapshotFiles({
  outputPath,
  repository,
  run,
  runPath,
}) {
  if (!outputPath || !runPath) {
    throw new Error("publishRestaurantSnapshotFiles requires outputPath and runPath.");
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(runPath), { recursive: true });
  await writeJson(outputPath, repository);
  await writeJson(runPath, run);
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
