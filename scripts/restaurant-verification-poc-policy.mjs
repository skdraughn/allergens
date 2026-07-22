export const pocBatchSize = 3;
export const pocLunaWorkerCount = 3;
export const pocSolReviewerCount = 1;
export const pocTerraWorkerCount = 0;
export const pocMaxOpenThreads = 5;
export const pocMaxSimultaneousSubagents = 3;
export const pocAuditSampleEvery = 20;

export const requiredAllergenMatrixSearches = Object.freeze([
  "official_site",
  "official_documents",
  "linked_vendor",
  "targeted_web_search"
]);

const strongReviewSignals = Object.freeze([
  "identityAmbiguous",
  "menuScopeUnresolved",
  "officialAllergenConflict",
  "crossContactConflict",
  "unsupportedNegativeClaim",
  "sourceAuthorityAmbiguous"
]);

const lightweightRepairSignals = Object.freeze([
  "duplicateItems",
  "catalogDrift",
  "staleItems",
  "newItems",
  "nameOrCategoryCleanup",
  "restaurantSpecificExtraction",
  "parserIssue"
]);

export function classifyPocRestaurant(input = {}) {
  const validation = input.validation ?? {};
  const matrixSearch = input.matrixSearch ?? {};
  const changes = input.changes ?? {};
  const errors = [];

  if (validation.valid === false || (validation.errors ?? []).length > 0) {
    errors.push(...(validation.errors ?? ["Structured result is invalid."]));
  }

  const attemptedSearches = new Set(matrixSearch.attempted ?? []);
  const missingMatrixSearches = requiredAllergenMatrixSearches.filter(
    search => !attemptedSearches.has(search)
  );
  const matrixStatus = matrixSearch.status ?? "not_searched";

  if (matrixStatus === "not_searched" || missingMatrixSearches.length > 0) {
    errors.push(
      `Official allergen search is incomplete: ${missingMatrixSearches.join(
        ", "
      ) || "status not recorded"}.`
    );
  }

  if (errors.length > 0) {
    return {
      lane: "luna_retry",
      terminalAllowed: false,
      officialAllergenStatus: null,
      reasons: errors
    };
  }

  const strongSignals = strongReviewSignals.filter(
    signal => changes[signal] === true
  );
  if (strongSignals.length > 0) {
    return {
      lane: "sol_review",
      terminalAllowed: false,
      officialAllergenStatus:
        matrixStatus === "found" ? "extracted" : "accurately_unavailable",
      reasons: strongSignals
    };
  }

  const repairSignals = lightweightRepairSignals.filter(
    signal => changes[signal] === true
  );
  if (repairSignals.length > 0) {
    return {
      lane: "luna_fix",
      terminalAllowed: false,
      officialAllergenStatus:
        matrixStatus === "found" ? "extracted" : "accurately_unavailable",
      reasons: repairSignals
    };
  }

  return {
    lane: "verify",
    terminalAllowed: true,
    officialAllergenStatus:
      matrixStatus === "found" ? "extracted" : "accurately_unavailable",
    reasons: [
      matrixStatus === "found"
        ? "Current official allergen evidence was captured."
        : "Required searches found no official allergen matrix; unavailable is an accepted result."
    ]
  };
}

export function shouldSampleForSolAudit(completedFastPathCount) {
  return (
    Number.isInteger(completedFastPathCount) &&
    completedFastPathCount > 0 &&
    completedFastPathCount % pocAuditSampleEvery === 0
  );
}
