#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const options = parseArguments(process.argv.slice(2));
const restaurantId = requiredOption(options, "id");
const evidenceId = requiredOption(options, "evidence-id");
const missingDisposition = options["missing-disposition"] ?? "missing_from_source";
if (!new Set(["missing_from_source", "stale_extra"]).has(missingDisposition)) {
  throw new Error("--missing-disposition must be missing_from_source or stale_extra.");
}
const outputPath = path.resolve(requiredOption(options, "output"));
const verificationRoot = path.resolve(options.root ?? "data/restaurant-verification");
const repositoryPath = path.resolve(options.repository ?? "src/data/generated/restaurants.generated.json");
const ledgerRows = readJsonLines(await readFile(path.join(verificationRoot, "ledger.jsonl"), "utf8"));
const ledgerRow = ledgerRows.find((row) => row.restaurantId === restaurantId);
if (!ledgerRow) throw new Error(`Unknown ledger restaurant: ${restaurantId}`);

const frozenChecks = readJsonLines(
  await readFile(path.join(verificationRoot, ledgerRow.paths.itemChecks), "utf8"),
);
const repository = JSON.parse(await readFile(repositoryPath, "utf8"));
const restaurant = repository.restaurants?.find((entry) => entry.id === restaurantId);
if (!restaurant) throw new Error(`Restaurant is missing from generated repository: ${restaurantId}`);

const currentById = new Map();
for (const item of restaurant.items ?? []) {
  if (currentById.has(item.id)) throw new Error(`Duplicate current item id: ${item.id}`);
  currentById.set(item.id, item);
}

const itemChecks = frozenChecks.map((frozen) => {
  const current = currentById.get(frozen.baseline.itemId);
  if (!current) {
    return {
      auditItemKey: frozen.auditItemKey,
      disposition: missingDisposition,
      allergenVerdict: missingDisposition === "stale_extra" ? "not_applicable" : "mismatch",
      sourceEvidenceIds: [evidenceId],
      notes: missingDisposition === "stale_extra"
        ? "Frozen rotating item is absent from the current source and was removed by the verified repair."
        : "Frozen item is absent from the repaired generated restaurant and requires coordinator review.",
    };
  }
  const disposition = current.name === frozen.baseline.name
    ? "exact_match"
    : normalize(current.name) === normalize(frozen.baseline.name)
      ? "normalized_match"
      : "variant_match";
  const hasSignals = (current.allergens?.length ?? 0) > 0 || (current.mayContain?.length ?? 0) > 0;
  const accuratelyUnavailable = current.allergenSourceType === "unavailable" && !hasSignals;

  return {
    auditItemKey: frozen.auditItemKey,
    disposition,
    allergenVerdict: accuratelyUnavailable ? "accurately_unavailable" : "verified",
    sourceEvidenceIds: [evidenceId],
    notes: accuratelyUnavailable
      ? "Rechecked after scoped repair; the restaurant source does not publish a supported allergen signal for this item."
      : "Rechecked after scoped repair; retained signals are directly supported by restaurant-authored item text.",
  };
});

if (itemChecks.length !== ledgerRow.baseline.itemCount) {
  throw new Error(`Recheck produced ${itemChecks.length} items; expected ${ledgerRow.baseline.itemCount}.`);
}

const packet = {
  itemChecks,
  notes: [
    `Generated recheck packet from ${path.relative(process.cwd(), repositoryPath)} after the scoped restaurant repair.`,
  ],
};
await writeJsonAtomic(outputPath, packet);
console.log(JSON.stringify({ restaurantId, outputPath, itemCount: itemChecks.length }, null, 2));

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function readJsonLines(value) {
  return value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function parseArguments(tokens) {
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const equals = token.indexOf("=");
    if (equals >= 0) options[token.slice(2, equals)] = token.slice(equals + 1);
    else if (tokens[index + 1] && !tokens[index + 1].startsWith("--")) options[token.slice(2)] = tokens[++index];
    else options[token.slice(2)] = true;
  }
  return options;
}

function requiredOption(options, name) {
  const value = options[name];
  if (typeof value !== "string" || !value) throw new Error(`--${name}=... is required.`);
  return value;
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}
