import { readFileSync } from "node:fs";

import { suspiciousMenuRows } from "./launch-coverage-quality.mjs";
import { officialEvidenceClassification } from "./menu-item-quality.mjs";
import {
  officialAllergenDistributionSummary,
  officialAllergenStatuses,
  officialItemCountForRestaurant,
} from "./restaurant-source-classification.mjs";

const args = parseArgs(process.argv.slice(2));
const repositoryPath = args.input ?? args.repository ?? "src/data/generated/restaurants.generated.json";
const outputFormat = args.format ?? "json";
const repository = JSON.parse(readFileSync(repositoryPath, "utf8"));

const rows = (repository.restaurants ?? []).map((restaurant) => auditRestaurant(restaurant));
const flaggedRows = rows.filter((row) =>
  row.classifications.some((classification) => !classification.startsWith("supported-")),
);
const output = {
  repositoryPath,
  generatedAt: new Date().toISOString(),
  restaurantCount: rows.length,
  flaggedCount: flaggedRows.length,
  classifications: countClassifications(flaggedRows),
  rows,
};

if (outputFormat === "csv") {
  console.log(rowsToCsv(rows));
} else {
  console.log(JSON.stringify(output, null, 2));
}

function auditRestaurant(restaurant) {
  const totalItemCount = restaurant?.items?.length ?? 0;
  const officialItemCount = officialItemCountForRestaurant(restaurant);
  const officialCoverageRatio = totalItemCount > 0 ? officialItemCount / totalItemCount : 0;
  const distribution = officialAllergenDistributionSummary(restaurant);
  const officialEvidence =
    restaurant?.sourceStatus?.accommodationOnly || restaurant?.allergenDataStatus?.bucket === "accommodation-policy-only"
      ? {
          ...officialEvidenceClassification(restaurant),
          bucket: "accommodation-policy-only",
        }
      : officialEvidenceClassification(restaurant);
  const suspiciousRows = suspiciousMenuRows(restaurant?.items ?? []);
  const evidenceSnippets = evidenceSnippetsForRestaurant(restaurant);
  const reviewedPartialOfficial = isReviewedPartialOfficialEvidence(restaurant);
  const classifications = [];

  if (distribution.likelyDirectSmear) {
    classifications.push("likely-direct-smear");
  }

  if (distribution.supportedStrictDirectMatrix) {
    classifications.push("supported-strict-direct-matrix");
  }

  if (distribution.supportedBroadCrossContact) {
    classifications.push("supported-cross-contact");
  }

  if (distribution.suspiciousBroadCrossContact) {
    classifications.push("manual-review-needed");
  }

  if (
    restaurant?.officialAllergenStatus === officialAllergenStatuses.sourceFoundUnparsed ||
    restaurant?.officialAllergenStatus === "source-found-unparsed"
  ) {
    classifications.push("source-found-unparsed");
  }

  if (totalItemCount >= 20 && officialItemCount > 0 && officialCoverageRatio < 0.2 && !reviewedPartialOfficial) {
    classifications.push(`low-official-coverage:${officialEvidence.bucket}`);
  }

  if (suspiciousRows.length > 0) {
    classifications.push("parser-artifact");
  }

  return {
    id: restaurant?.id ?? "",
    name: restaurant?.name ?? "",
    officialAllergenStatus: restaurant?.officialAllergenStatus ?? "",
    sourceFamily: restaurant?.sourceFamily ?? "",
    parserProfile: restaurant?.parserProfile ?? "",
    totalItemCount,
    officialItemCount,
    officialCoverageRatio: round(officialCoverageRatio),
    directAllergenCountDistribution: distribution.direct.countHistogram,
    crossContactCountDistribution: distribution.crossContact.countHistogram,
    directAverageAllergenCount: round(distribution.direct.averageAllergenCount),
    crossContactAverageAllergenCount: round(distribution.crossContact.averageAllergenCount),
    directItemWithAnyCount: distribution.direct.itemWithAnyCount,
    directItemWithAnyRatio: round(distribution.direct.itemWithAnyRatio),
    crossContactItemWithAnyCount: distribution.crossContact.itemWithAnyCount,
    crossContactItemWithAnyRatio: round(distribution.crossContact.itemWithAnyRatio),
    officialEvidenceBucket: officialEvidence.bucket,
    officialFullMatrixOrApiCount: officialEvidence.officialFullMatrixOrApi,
    officialIngredientDisclosureCount: officialEvidence.officialIngredientDisclosure,
    officialProductSectionCount: officialEvidence.officialProductSection,
    officialGlobalCrossContactNoteCount: officialEvidence.globalCrossContactNote,
    suspiciousOfficialParserFragmentCount: officialEvidence.suspiciousOfficialParserFragments,
    dominantDirectAllergenSet: distribution.direct.dominantSet,
    dominantDirectAllergenSetCount: distribution.direct.dominantCount,
    dominantDirectAllergenSetRatio: round(distribution.direct.dominantRatio),
    dominantCrossContactSet: distribution.crossContact.dominantSet,
    dominantCrossContactSetCount: distribution.crossContact.dominantCount,
    dominantCrossContactSetRatio: round(distribution.crossContact.dominantRatio),
    sourceUrls: (restaurant?.sourceUrls ?? []).slice(0, 10),
    evidenceSnippets,
    suspiciousRowCount: suspiciousRows.length,
    suspiciousRowExamples: suspiciousRows.slice(0, 5),
    officialEvidenceReviewStatus: reviewedPartialOfficial ? "reviewed-partial-official-menu" : "",
    classifications: uniqueStrings(classifications),
    remediationBucket: remediationBucketForClassifications(classifications),
    reviewNote: reviewNoteForClassifications(classifications),
  };
}

function isReviewedPartialOfficialEvidence(restaurant) {
  const review = restaurant?.sourceStatus?.officialAllergenDistributionReview;
  const decision = String(review?.decision ?? "");
  const classification = String(review?.classification ?? "");

  return (
    Boolean(review?.reviewedAt || review?.reviewedItemCount || decision || classification) &&
    /preserved-reviewed-partial-official-menu-ingredient-evidence|official-partial-menu-ingredient-review/i.test(
      `${decision} ${classification}`,
    )
  );
}

function evidenceSnippetsForRestaurant(restaurant) {
  const snippets = [];

  for (const item of restaurant?.items ?? []) {
    for (const entry of item?.evidence ?? []) {
      const text = cleanSnippet(entry?.text);
      if (text) {
        snippets.push(text);
      }
    }

    if (snippets.length >= 8) {
      break;
    }
  }

  return uniqueStrings(snippets).slice(0, 5);
}

function rowsToCsv(rows) {
  const headers = [
    "id",
    "name",
    "officialAllergenStatus",
    "sourceFamily",
    "parserProfile",
    "totalItemCount",
    "officialItemCount",
    "officialCoverageRatio",
    "directAverageAllergenCount",
    "crossContactAverageAllergenCount",
    "directItemWithAnyCount",
    "directItemWithAnyRatio",
    "crossContactItemWithAnyCount",
    "crossContactItemWithAnyRatio",
    "officialEvidenceBucket",
    "officialFullMatrixOrApiCount",
    "officialIngredientDisclosureCount",
    "officialProductSectionCount",
    "officialGlobalCrossContactNoteCount",
    "suspiciousOfficialParserFragmentCount",
    "officialEvidenceReviewStatus",
    "dominantDirectAllergenSet",
    "dominantDirectAllergenSetCount",
    "dominantDirectAllergenSetRatio",
    "dominantCrossContactSet",
    "dominantCrossContactSetCount",
    "dominantCrossContactSetRatio",
    "suspiciousRowCount",
    "classifications",
    "remediationBucket",
    "reviewNote",
    "sourceUrls",
    "evidenceSnippets",
  ];

  return [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          if (Array.isArray(value)) {
            return csvCell(value.join(" | "));
          }
          return csvCell(value);
        })
        .join(","),
    ),
  ].join("\n");
}

function parseArgs(values) {
  const parsed = {};

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      continue;
    }
    const [key, inlineValue] = value.slice(2).split("=");
    parsed[key] = inlineValue ?? values[index + 1];
    if (inlineValue === undefined) {
      index += 1;
    }
  }

  return parsed;
}

function countClassifications(rows) {
  const counts = {};

  for (const row of rows) {
    for (const classification of row.classifications) {
      counts[classification] = (counts[classification] ?? 0) + 1;
    }
  }

  return counts;
}

function remediationBucketForClassifications(classifications) {
  if (classifications.includes("likely-direct-smear")) {
    return "likely-direct-smear";
  }

  if (classifications.includes("manual-review-needed")) {
    return "manual-review-needed";
  }

  if (classifications.includes("parser-artifact")) {
    return "parser-artifact";
  }

  if (classifications.includes("source-found-unparsed")) {
    return "source-found-unparsed";
  }

  const lowCoverageClassification = classifications.find((classification) =>
    classification.startsWith("low-official-coverage:"),
  );

  if (lowCoverageClassification) {
    return lowCoverageClassification;
  }

  if (classifications.includes("low-official-coverage")) {
    return "low-official-coverage";
  }

  if (classifications.includes("supported-strict-direct-matrix")) {
    return "supported-strict-direct-matrix";
  }

  if (classifications.includes("supported-cross-contact")) {
    return "supported-cross-contact";
  }

  return "none";
}

function reviewNoteForClassifications(classifications) {
  if (classifications.includes("likely-direct-smear")) {
    return "Weak direct allergen evidence covers most official items; strip or quarantine direct claims unless row-level evidence exists.";
  }

  if (classifications.includes("manual-review-needed")) {
    return "Broad cross-contact exists without source text proving shared prep/fryer/equipment evidence.";
  }

  if (classifications.includes("parser-artifact")) {
    return "Suspicious menu rows detected; inspect examples and remove only true headings, leaked asset IDs, or ingredient fragments.";
  }

  if (classifications.includes("source-found-unparsed")) {
    return "Official source was found but item-level allergen extraction is not reliable enough to publish as official data.";
  }

  const lowCoverageClassification = classifications.find((classification) =>
    classification.startsWith("low-official-coverage:"),
  );

  if (lowCoverageClassification) {
    const bucket = lowCoverageClassification.split(":")[1] ?? "unknown";
    if (bucket === "likely-official-parser-error") {
      return "Low official coverage includes suspicious official parser fragments; inspect and repair row boundaries or official evidence attachment.";
    }
    if (bucket === "official-partial") {
      return "A matrix/API-like source produced partial official rows; inspect whether parser coverage is incomplete or the source genuinely covers only some items.";
    }
    if (bucket === "official-disclosure-only") {
      return "Only item-level official disclosure text was found for a small subset of items; preserve those rows but do not treat this as a complete official matrix.";
    }
    if (bucket === "official-global-note-only") {
      return "Only a global official cross-contact/disclosure note was found; avoid treating it as full item-level official coverage.";
    }
    return "Partial official evidence is present for some items, but this is not a complete official allergen matrix.";
  }

  if (classifications.includes("supported-strict-direct-matrix")) {
    return "High direct-allergen counts are backed by row-level official matrix cells; preserve as official direct allergen data.";
  }

  if (classifications.includes("supported-cross-contact")) {
    return "Broad may-contain/cross-contact warnings are supported by official source evidence and preserved.";
  }

  return "";
}

function cleanSnippet(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function round(value) {
  return Math.round(Number(value ?? 0) * 1000) / 1000;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
