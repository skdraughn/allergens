import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyPocRestaurant,
  pocBatchSize,
  pocLunaWorkerCount,
  pocMaxOpenThreads,
  pocMaxSimultaneousSubagents,
  pocSolReviewerCount,
  pocTerraWorkerCount,
  requiredAllergenMatrixSearches,
  shouldSampleForSolAudit
} from "./restaurant-verification-poc-policy.mjs";

const completeMatrixSearch = {
  attempted: [...requiredAllergenMatrixSearches],
  status: "not_found"
};

test("POC concurrency is explicit and bounded", () => {
  assert.equal(pocBatchSize, 3);
  assert.equal(pocLunaWorkerCount, 3);
  assert.equal(pocTerraWorkerCount, 0);
  assert.equal(pocSolReviewerCount, 1);
  assert.equal(pocMaxOpenThreads, 5);
  assert.equal(pocMaxSimultaneousSubagents, 3);
});

test("missing official matrix is accepted after every required search", () => {
  assert.deepEqual(
    classifyPocRestaurant({
      validation: { valid: true, errors: [] },
      matrixSearch: completeMatrixSearch,
      changes: {}
    }),
    {
      lane: "verify",
      terminalAllowed: true,
      officialAllergenStatus: "accurately_unavailable",
      reasons: [
        "Required searches found no official allergen matrix; unavailable is an accepted result."
      ]
    }
  );
});

test("missing official matrix cannot pass before the search is complete", () => {
  const result = classifyPocRestaurant({
    validation: { valid: true, errors: [] },
    matrixSearch: { status: "not_found", attempted: ["official_site"] },
    changes: {}
  });

  assert.equal(result.lane, "luna_retry");
  assert.equal(result.terminalAllowed, false);
});

for (const signal of [
  "duplicateItems",
  "catalogDrift",
  "staleItems",
  "newItems",
  "nameOrCategoryCleanup",
  "restaurantSpecificExtraction",
  "parserIssue"
]) {
  test(`${signal} stays in the lightweight repair lane`, () => {
    const result = classifyPocRestaurant({
      validation: { valid: true, errors: [] },
      matrixSearch: completeMatrixSearch,
      changes: { [signal]: true }
    });

    assert.equal(result.lane, "luna_fix");
    assert.deepEqual(result.reasons, [signal]);
  });
}

for (const signal of [
  "identityAmbiguous",
  "menuScopeUnresolved",
  "officialAllergenConflict",
  "crossContactConflict",
  "unsupportedNegativeClaim",
  "sourceAuthorityAmbiguous"
]) {
  test(`${signal} requires strong review`, () => {
    const result = classifyPocRestaurant({
      validation: { valid: true, errors: [] },
      matrixSearch: completeMatrixSearch,
      changes: { [signal]: true }
    });

    assert.equal(result.lane, "sol_review");
    assert.deepEqual(result.reasons, [signal]);
  });
}

test("one of every twenty fast-path completions is sampled", () => {
  assert.equal(shouldSampleForSolAudit(19), false);
  assert.equal(shouldSampleForSolAudit(20), true);
  assert.equal(shouldSampleForSolAudit(40), true);
});
