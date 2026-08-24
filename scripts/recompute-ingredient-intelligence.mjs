import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import fs from "node:fs/promises";

import {
  annotateRestaurantWithIngredientIntelligence,
  getDefaultIngredientIntelligenceManifest,
} from "./ingredient-intelligence.mjs";

const args = parseArgs(process.argv.slice(2));
const bucket = args.bucket ?? process.env.RESTAURANT_DATA_BUCKET_NAME;
const prefix = args.prefix ?? process.env.RESTAURANT_DATA_PREFIX ?? "restaurant-data";
const inputPath = args.input;
const outputPath = args.output ?? inputPath;
const restaurantIds = String(args.restaurants ?? args.restaurant ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);
const manifest = await getDefaultIngredientIntelligenceManifest();
const promoteOfficialDisclosures = args.promoteOfficialDisclosures !== "false";

if (inputPath) {
  const body = await fs.readFile(inputPath, "utf8");
  const parsed = JSON.parse(body);
  const restaurants = parsed.restaurants ?? [];
  const restaurantIdSet = new Set(restaurantIds);
  const annotatedRestaurants = await Promise.all(
    restaurants.map((restaurant) => {
      if (restaurantIdSet.size > 0 && !restaurantIdSet.has(restaurant.id)) {
        return restaurant;
      }

      return annotateRestaurantWithIngredientIntelligence(restaurant, {
        manifest,
        promoteOfficialDisclosures,
      });
    }),
  );
  const output = {
    ...parsed,
    inferenceVersion: manifest.version,
    restaurants: annotatedRestaurants,
  };

  await fs.writeFile(outputPath, `${JSON.stringify(output)}\n`);
  console.log(
    `Recomputed ${manifest.version} for ${
      restaurantIdSet.size > 0 ? `${restaurantIdSet.size} selected` : annotatedRestaurants.length
    } restaurants in ${outputPath}`,
  );
  process.exit(0);
}

if (!bucket) {
  throw new Error("Missing --bucket/RESTAURANT_DATA_BUCKET_NAME or --input.");
}

if (restaurantIds.length === 0) {
  throw new Error("Pass --restaurants restaurant-id[,restaurant-id].");
}

const s3 = new S3Client({});

for (const restaurantId of restaurantIds) {
  const key = `${prefix}/restaurants/${restaurantId}/latest.json`;
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await response.Body?.transformToString();

  if (!body) {
    throw new Error(`No body returned for ${key}.`);
  }

  const parsed = JSON.parse(body);
  const restaurant = parsed.restaurant ?? parsed;
  const annotated = await annotateRestaurantWithIngredientIntelligence(restaurant, {
    manifest,
    promoteOfficialDisclosures,
  });
  const output = parsed.restaurant ? { ...parsed, restaurant: annotated } : annotated;

  await s3.send(
    new PutObjectCommand({
      Body: `${JSON.stringify(output, null, 2)}\n`,
      Bucket: bucket,
      ContentType: "application/json",
      Key: key,
    }),
  );

  console.log(`Recomputed ${manifest.version} for ${key}`);
}

function parseArgs(values) {
  const parsed = {};

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (!value.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = value.slice(2).split("=");
    parsed[rawKey] = inlineValue ?? values[index + 1];

    if (inlineValue === undefined) {
      index += 1;
    }
  }

  return parsed;
}
