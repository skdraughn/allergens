import assert from "node:assert/strict";
import test from "node:test";

import { validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";

const job = {
  batchId: "batch-1",
  restaurantId: "restaurant-1",
  baselineItemCount: 2,
  baselineFingerprint: "fingerprint",
};
const itemChecks = [{ auditItemKey: "1:a" }, { auditItemKey: "2:b" }];

test("accepts complete mapped reconciliation and computes the repair lane", () => {
  const validation = validatePocResearchResult({ job, itemChecks, result: validResult() });
  assert.equal(validation.valid, true);
  assert.equal(validation.route.lane, "luna_fix");
  assert.equal(validation.currentProductCount, 2);
});

test("rejects matched rows without defined product mappings", () => {
  const result = validResult();
  result.reconciliation.items[0].matchedCurrentProductKeys = [];
  result.reconciliation.items[1].matchedCurrentProductKeys = ["missing-product"];
  const validation = validatePocResearchResult({ job, itemChecks, result });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join("\n"), /no current-product mapping/);
  assert.match(validation.errors.join("\n"), /undefined current products/);
  assert.equal(validation.route.lane, "luna_retry");
});

test("rejects unresolved rows that are hidden from routing", () => {
  const result = validResult();
  result.reconciliation.items[0] = { auditItemKey: "1:a", disposition: "unresolved", matchedCurrentProductKeys: [] };
  const validation = validatePocResearchResult({ job, itemChecks, result });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join("\n"), /menuScopeUnresolved/);
});

test("rejects stale or artifact rows that reference current products", () => {
  const result = validResult();
  result.reconciliation.items[0] = { auditItemKey: "1:a", disposition: "stale", matchedCurrentProductKeys: ["a"] };
  result.reconciliation.items[1] = { auditItemKey: "2:b", disposition: "artifact", matchedCurrentProductKeys: ["b"] };
  const validation = validatePocResearchResult({ job, itemChecks, result });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join("\n"), /stale\/artifact rows incorrectly reference current products/);
  assert.deepEqual(validation.mappedNonmatchKeys, ["1:a", "2:b"]);
  assert.equal(validation.route.lane, "luna_retry");
});

test("rejects stale rows when the exact current product exists", () => {
  const result = validResult();
  result.reconciliation.items[0] = {
    auditItemKey: "1:a",
    disposition: "stale",
    matchedCurrentProductKeys: [],
    sourceEvidenceIds: ["source"],
  };
  const validation = validatePocResearchResult({ job, itemChecks, result });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join("\n"), /exact current-product key/);
});

test("rejects missing and unresolved research evidence inventories", () => {
  const missing = validResult();
  delete missing.sources;
  let validation = validatePocResearchResult({ job, itemChecks, result: missing });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join("\n"), /nonempty sources inventory/);

  const unresolved = validResult();
  unresolved.currentProducts[0].sourceEvidenceIds = ["missing-source"];
  validation = validatePocResearchResult({ job, itemChecks, result: unresolved });
  assert.equal(validation.valid, false);
  assert.deepEqual(validation.unresolvedEvidenceIds, ["missing-source"]);
  assert.match(validation.errors.join("\n"), /Unresolved research evidence ids/);
});

test("rejects products without the canonical direct-allergen schema", () => {
  const result = validResult();
  delete result.currentProducts[0].containsAllergens;
  result.currentProducts[1].allergenSourceType = "restaurant_issued";
  const validation = validatePocResearchResult({ job, itemChecks, result });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join("\n"), /canonical direct-allergen schema/);
});

test("rejects inconsistent direct evidence and noncanonical source authority", () => {
  const result = validResult();
  result.sources[0].authorityTier = "web_search";
  result.currentProducts[0] = {
    ...result.currentProducts[0],
    containsAllergens: ["egg"],
    allergenSourceType: "unavailable",
    allergenAuthorityTier: null,
    allergenSourceEvidenceIds: [],
  };
  const validation = validatePocResearchResult({ job, itemChecks, result });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join("\n"), /inconsistent direct-allergen evidence/);
  assert.match(validation.errors.join("\n"), /Invalid research source authority tiers/);
});

test("pairs grouped keys and product keys by position", () => {
  const result = validResult();
  result.reconciliation = {
    dispositions: [{
      disposition: "exact_match",
      auditItemKeys: ["1:a", "2:b"],
      matchedCurrentProductKeys: ["a", "b"],
    }],
  };
  const validation = validatePocResearchResult({ job, itemChecks, result });
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.undefinedMappings, []);
});

test("routes a partial current menu surface to Sol even when the worker misses the signal", () => {
  const result = validResult();
  result.menuSurfaces = [{ surfaceId: "catering", current: true, scopeStatus: "partial" }];
  const validation = validatePocResearchResult({ job, itemChecks, result });
  assert.equal(validation.valid, true);
  assert.equal(validation.route.lane, "sol_review");
  assert.deepEqual(validation.partialCurrentSurfaceIds, ["catering"]);
});

test("accepts an explicitly empty catalog for a zero-item baseline", () => {
  const zeroJob = { ...job, baselineItemCount: 0 };
  const result = validResult();
  result.packetValidation.baselineItemCount = 0;
  result.currentProducts = [];
  result.reconciliation.items = [];
  const validation = validatePocResearchResult({ job: zeroJob, itemChecks: [], result });
  assert.equal(validation.valid, true);
  assert.equal(validation.currentProductCount, 0);
  assert.equal(validation.reconciledItemCount, 0);
});

function validResult() {
  return {
    batchId: "batch-1",
    restaurantId: "restaurant-1",
    packetValidation: { baselineItemCount: 2, baselineFingerprint: "fingerprint" },
    matrixSearch: {
      attempted: ["official_site", "official_documents", "linked_vendor", "targeted_web_search"],
      status: "accurately_unavailable",
      attempts: [],
    },
    sources: [{
      evidenceId: "source",
      url: "https://example.com/menu",
      authorityTier: "restaurant_issued",
      purpose: "menu",
      retrievedAt: "2026-07-16",
    }],
    currentProducts: [
      {
        currentProductKey: "a",
        name: "A",
        sourceEvidenceIds: ["source"],
        containsAllergens: [],
        mayContainAllergens: [],
        allergenSourceType: "unavailable",
        allergenAuthorityTier: null,
        allergenSourceEvidenceIds: [],
      },
      {
        currentProductKey: "b",
        name: "B",
        sourceEvidenceIds: ["source"],
        containsAllergens: [],
        mayContainAllergens: [],
        allergenSourceType: "unavailable",
        allergenAuthorityTier: null,
        allergenSourceEvidenceIds: [],
      },
    ],
    reconciliation: {
      items: [
        { auditItemKey: "1:a", disposition: "exact_match", matchedCurrentProductKeys: ["a"], sourceEvidenceIds: ["source"] },
        { auditItemKey: "2:b", disposition: "normalized_match", matchedCurrentProductKeys: ["b"], sourceEvidenceIds: ["source"] },
      ],
    },
    changes: {
      identityAmbiguous: false,
      menuScopeUnresolved: false,
      officialAllergenConflict: false,
      crossContactConflict: false,
      unsupportedNegativeClaim: false,
      sourceAuthorityAmbiguous: false,
      duplicateItems: false,
      catalogDrift: true,
      staleItems: false,
      newItems: false,
      nameOrCategoryCleanup: false,
      restaurantSpecificExtraction: false,
      parserIssue: false,
    },
    recommendedLane: "luna_fix",
  };
}
