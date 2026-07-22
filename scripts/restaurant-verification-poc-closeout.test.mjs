import assert from "node:assert/strict";
import test from "node:test";

import { buildPocCloseoutPacket, mergeBindingSolReview } from "./restaurant-verification-poc-closeout.mjs";

test("builds a terminal coordinator packet with inverse item mappings", () => {
  const packet = buildPocCloseoutPacket({
    job: { batchId: "batch", restaurantId: "r", name: "Restaurant", baselineItemCount: 1, baselineFingerprint: "fp" },
    result: {
      batchId: "batch",
      restaurantId: "r",
      packetValidation: { baselineItemCount: 1, baselineFingerprint: "fp" },
      matrixSearch: { attempted: ["official_site", "official_documents", "linked_vendor", "targeted_web_search"], status: "accurately_unavailable" },
      sources: [{ evidenceId: "source", url: "https://example.com/menu", authorityTier: "restaurant_issued", purpose: "menu", retrievedAt: "2026-07-16" }],
      menuSurfaces: [{ surfaceId: "menu", title: "Menu", url: "https://example.com/menu", current: true, sourceEvidenceIds: ["source"] }],
      currentProducts: [{
        currentProductKey: "product",
        name: "Product",
        sourceEvidenceIds: ["source"],
        containsAllergens: [],
        mayContainAllergens: [],
        allergenSourceType: "unavailable",
        allergenAuthorityTier: null,
        allergenSourceEvidenceIds: [],
      }],
      reconciliation: { items: [{ auditItemKey: "1:item", disposition: "exact_match", matchedCurrentProductKeys: ["product"], sourceEvidenceIds: ["source"] }] },
      changes: policyChanges(),
    },
    applyResult: { validation: { valid: true }, secondRunDiff: "none", changedPaths: ["generated.json"], commands: [{ command: "test" }] },
    dossier: {
      identity: { address: "1 Main St", sourceEvidenceIds: ["source"] },
      restaurantWideCaution: { text: "Shared kitchen.", sourceEvidenceIds: ["warning"] },
      restaurantLevelAllergenEvidence: [{ kind: "shared_fryer", statement: "Shared fryer.", sourceEvidenceIds: ["warning"] }],
      currentCatalog: {
        currentProductCount: 1,
        surfaces: [
          { surfaceId: "menu", current: true, scopeStatus: "complete", sourceEvidenceIds: ["source"] },
          { surfaceId: "support", url: "https://example.com/", current: true, scopeStatus: "excluded", sourceEvidenceIds: ["source"] },
          { surfaceId: "index", url: "https://example.com/index", current: true, scopeStatus: "supporting", sourceEvidenceIds: ["source"] },
        ],
        products: [{
          currentProductKey: "product",
          name: "Product",
          sourceEvidenceIds: ["source", "menu-only"],
          containsAllergens: ["egg"],
          mayContainAllergens: [],
          allergenSourceType: "official-ingredients",
          allergenAuthorityTier: "restaurant_issued",
          allergenSourceEvidenceIds: ["source"],
        }],
      },
      adjudication: { artifactHashes: [] },
    },
    evidence: { sources: [
      { evidenceId: "source", url: "https://example.com/menu", authorityTier: "restaurant_issued", purpose: "menu", currentAsOf: "2026-07-16", excerpt: "Published menu row." },
      { evidenceId: "menu-only", url: "https://example.com/menu-only", authorityTier: "restaurant_issued", purpose: "menu", currentAsOf: "2026-07-16", excerpt: "Additional published menu row." },
      { evidenceId: "warning", url: "https://example.com/warning", authorityTier: "restaurant_issued", purpose: "cross_contact", currentAsOf: "2026-07-16", excerpt: "Shared kitchen warning." },
    ] },
    itemChecks: [{ auditItemKey: "1:item" }],
    workerHandoff: {
      runId: "batch",
      restaurantId: "r",
      solRequired: false,
      artifacts: [
        { kind: "poc_job", path: "job.json", sha256: "a".repeat(64) },
        { kind: "poc_research", path: "research.json", sha256: "b".repeat(64) },
      ],
    },
  });
  assert.equal(packet.restaurantId, "r");
  assert.equal(packet.name, "Restaurant");
  assert.equal(packet.identity.address, "1 Main St");
  assert.equal(packet.restaurantWideCaution.text, "Shared kitchen.");
  assert.equal(packet.restaurantLevelAllergenEvidence[0].kind, "shared_fryer");
  assert.equal(packet.status, "repair_in_progress");
  assert.equal(packet.checks.menu.verdict, "verified");
  assert.equal(packet.currentCatalog.products[0].coordinatorReviewed, true);
  assert.deepEqual(packet.currentCatalog.products[0].matchedBaselineAuditItemKeys, ["1:item"]);
  assert.deepEqual(packet.itemChecks[0].matchedCurrentProductKeys, ["product"]);
  assert.equal(packet.itemChecks[0].allergenVerdict, "verified");
  assert.deepEqual(packet.itemChecks[0].allergenSourceEvidenceIds, ["source"]);
  assert.deepEqual(packet.currentCatalog.surfaces.map((surface) => surface.surfaceId), ["menu"]);
  assert.equal(packet.currentCatalog.surfaces[0].url, "https://example.com/menu");
  assert.equal(packet.evidence[0].purpose, "both");
  assert.equal(packet.evidence[0].id, "source");
  assert.equal(packet.evidence[0].retrievedAt, "2026-07-16");
  assert.equal(packet.evidence.find((source) => source.id === "menu-only").purpose, "menu");
  assert.equal(packet.evidence.find((source) => source.id === "warning").purpose, "cross_contact");
  assert.equal(packet.replaceEvidence, true);
  assert.equal(packet.workerHandoff.runId, "batch");
  assert.deepEqual(packet.findings, []);
  assert.equal(packet.replaceFindings, true);
  assert.equal(packet.replaceRepairs, true);
});

test("preserves a conservative declared authority for mixed direct evidence", () => {
  const packet = buildPocCloseoutPacket({
    job: { batchId: "batch", restaurantId: "r", name: "Restaurant", baselineItemCount: 1, baselineFingerprint: "fp" },
    result: {
      batchId: "batch",
      restaurantId: "r",
      packetValidation: { baselineItemCount: 1, baselineFingerprint: "fp" },
      matrixSearch: { attempted: ["official_site", "official_documents", "linked_vendor", "targeted_web_search"], status: "accurately_unavailable" },
      sources: [
        { evidenceId: "official", url: "https://example.com/menu", authorityTier: "restaurant_issued", purpose: "menu", retrievedAt: "2026-07-16" },
        { evidenceId: "vendor", url: "https://vendor.example/menu", authorityTier: "restaurant_linked_vendor", purpose: "allergen", retrievedAt: "2026-07-16" },
      ],
      menuSurfaces: [{ surfaceId: "menu", url: "https://example.com/menu", current: true, scopeStatus: "complete", sourceEvidenceIds: ["official"] }],
      currentProducts: [{
        currentProductKey: "product",
        name: "Product",
        sourceEvidenceIds: ["official"],
        containsAllergens: ["egg"],
        mayContainAllergens: [],
        allergenSourceType: "restaurant_linked_vendor",
        allergenAuthorityTier: "restaurant_linked_vendor",
        allergenSourceEvidenceIds: ["official", "vendor"],
      }],
      reconciliation: { items: [{ auditItemKey: "1:item", disposition: "exact_match", matchedCurrentProductKeys: ["product"], sourceEvidenceIds: ["official"] }] },
      changes: policyChanges(),
    },
    applyResult: { validation: { valid: true, currentProductCount: 1 }, secondRunDiff: "none", changedPaths: [], commands: [] },
    dossier: {
      currentCatalog: {
        currentProductCount: 1,
        surfaces: [{ surfaceId: "menu", url: "https://example.com/menu", current: true, scopeStatus: "complete", sourceEvidenceIds: ["official"] }],
        products: [{
          currentProductKey: "product",
          name: "Product",
          sourceEvidenceIds: ["official"],
          containsAllergens: ["egg"],
          mayContainAllergens: [],
          allergenSourceType: "restaurant_linked_vendor",
          allergenAuthorityTier: "restaurant_linked_vendor",
          allergenSourceEvidenceIds: ["official", "vendor"],
        }],
      },
    },
    evidence: { sources: [
      { id: "official", url: "https://example.com/menu", authorityTier: "restaurant_issued", purpose: "menu", retrievedAt: "2026-07-16", excerpt: "Official description." },
      { id: "vendor", url: "https://vendor.example/menu", authorityTier: "restaurant_linked_vendor", purpose: "allergen", retrievedAt: "2026-07-16", excerpt: "Vendor ingredient text." },
    ] },
    itemChecks: [{ auditItemKey: "1:item" }],
  });
  assert.equal(packet.currentCatalog.products[0].allergenAuthorityTier, "restaurant_linked_vendor");
  assert.equal(packet.itemChecks[0].adjudicatedAllergenAuthorityTier, "restaurant_linked_vendor");
});

test("binding Sol review resolves the exact unresolved subset and adds mapped products", () => {
  const result = {
    batchId: "batch",
    restaurantId: "r",
    currentProducts: { products: [] },
    reconciliation: { items: [{ auditItemKey: "1:item", disposition: "unresolved", matchedCurrentProductKeys: [] }] },
    changes: { menuScopeUnresolved: true },
  };
  const review = {
    batchId: "batch",
    restaurantId: "r",
    reviewType: "narrow_scope_conflict_resolution",
    validation: { valid: true },
    resolution: {
      binding: true,
      items: [{
        auditItemKey: "1:item",
        disposition: "exact_match",
        matchedCurrentProductKeys: ["product"],
        currentProductMapping: { currentProductKey: "product", name: "Product" },
        sourceEvidenceIds: ["source"],
        allergenAssessment: { explicitPositiveSupport: ["egg"] },
      }],
    },
  };
  const merged = mergeBindingSolReview(result, review);
  assert.equal(merged.changes.menuScopeUnresolved, false);
  assert.equal(merged.reconciliation.items[0].disposition, "exact_match");
  assert.equal(merged.currentProducts.products[0].currentProductKey, "product");
  assert.equal(merged.solConflictPacket.required, true);
});

test("binding Sol review resolves every partial menu surface exactly once", () => {
  const result = {
    batchId: "batch",
    restaurantId: "r",
    menuSurfaces: [
      { surfaceId: "support", current: true, scopeStatus: "partial", notes: "Homepage." },
      { surfaceId: "catalog", current: true, scopeStatus: "unresolved" },
    ],
    currentProducts: { products: [] },
    reconciliation: { items: [] },
    changes: { menuScopeUnresolved: true },
  };
  const review = {
    batchId: "batch",
    restaurantId: "r",
    reviewType: "narrow_scope_conflict_resolution",
    validation: { valid: true },
    resolution: {
      binding: true,
      items: [],
      surfaceResolutions: [
        { surfaceId: "support", disposition: "supporting", rationale: "Identity only." },
        { surfaceId: "catalog", disposition: "included", rationale: "Complete catalog." },
      ],
    },
  };
  const merged = mergeBindingSolReview(result, review);
  assert.equal(merged.menuSurfaces[0].current, false);
  assert.equal(merged.menuSurfaces[0].scopeStatus, "supporting");
  assert.match(merged.menuSurfaces[0].notes, /Identity only/);
  assert.equal(merged.menuSurfaces[1].current, true);
  assert.equal(merged.menuSurfaces[1].scopeStatus, "complete");
  assert.deepEqual(merged.solConflictPacket.resolvedSurfaceIds, ["support", "catalog"]);
});

test("binding Sol review rejects an incomplete partial-surface resolution set", () => {
  const result = {
    batchId: "batch",
    restaurantId: "r",
    menuSurfaces: [
      { surfaceId: "one", current: true, scopeStatus: "partial" },
      { surfaceId: "two", current: true, scopeStatus: "partial" },
    ],
    currentProducts: { products: [] },
    reconciliation: { items: [] },
    changes: { menuScopeUnresolved: true },
  };
  const review = {
    batchId: "batch",
    restaurantId: "r",
    validation: { valid: true },
    resolution: {
      binding: true,
      items: [],
      surfaceResolutions: [{ surfaceId: "one", disposition: "excluded" }],
    },
  };
  assert.throws(() => mergeBindingSolReview(result, review), /exact partial surface set once/);
});

test("binding Sol review adds products required by resolved menu surfaces", () => {
  const result = {
    batchId: "batch",
    restaurantId: "r",
    menuSurfaces: [{ surfaceId: "brunch", current: true, scopeStatus: "partial" }],
    currentProducts: { products: [{ currentProductKey: "dinner", name: "Dinner", sourceEvidenceIds: ["dinner"] }] },
    reconciliation: { items: [] },
    changes: {
      identityAmbiguous: true,
      menuScopeUnresolved: true,
      sourceAuthorityAmbiguous: true,
      officialAllergenConflict: true,
      crossContactConflict: true,
      unsupportedNegativeClaim: true,
    },
  };
  const review = {
    batchId: "batch",
    restaurantId: "r",
    validation: {
      valid: true,
      resolvedCatalogProductCount: 2,
      boundedChainLevelCatalogDeclared: true,
      storeIdentityClaimed: false,
    },
    resolution: {
      binding: true,
      items: [],
      safetySourceAuthorityConflictRemains: false,
      surfaceResolutions: [{
        surfaceId: "brunch",
        disposition: "complete",
        additionalProductsRequired: [{
          currentProductKey: "brunch-item",
          name: "Brunch Item",
          sourceEvidenceIds: ["brunch"],
        }],
      }],
    },
  };
  const merged = mergeBindingSolReview(result, review);
  assert.deepEqual(merged.currentProducts.products.map((product) => product.currentProductKey), ["dinner", "brunch-item"]);
  assert.equal(merged.changes.identityAmbiguous, false);
  assert.equal(merged.changes.sourceAuthorityAmbiguous, false);
  assert.equal(merged.changes.officialAllergenConflict, false);
  assert.equal(merged.changes.crossContactConflict, false);
  assert.equal(merged.changes.unsupportedNegativeClaim, false);
  assert.equal(merged.menuSurfaces[0].scopeStatus, "complete");
});

test("binding Sol review clears a resolved single-location identity conflict", () => {
  const result = {
    batchId: "batch",
    restaurantId: "r",
    menuSurfaces: [],
    currentProducts: { products: [] },
    reconciliation: { items: [] },
    changes: { identityAmbiguous: true },
  };
  const review = {
    batchId: "batch",
    restaurantId: "r",
    validation: {
      valid: true,
      identityConflictResolved: true,
      storeIdentityClaimed: false,
      resolvedCatalogProductCount: 0,
    },
    resolution: {
      binding: true,
      items: [],
      surfaceResolutions: [],
    },
  };

  const merged = mergeBindingSolReview(result, review);
  assert.equal(merged.changes.identityAmbiguous, false);
});

test("binding Sol item mappings may reference products added by a surface resolution", () => {
  const result = {
    batchId: "batch",
    restaurantId: "r",
    menuSurfaces: [{ surfaceId: "shop", current: true, scopeStatus: "partial" }],
    currentProducts: { products: [] },
    reconciliation: { items: [{ auditItemKey: "1:item", disposition: "unresolved", matchedCurrentProductKeys: [] }] },
    changes: { menuScopeUnresolved: true },
  };
  const review = {
    batchId: "batch",
    restaurantId: "r",
    validation: { valid: true, resolvedCatalogProductCount: 1 },
    resolution: {
      binding: true,
      items: [{
        auditItemKey: "1:item",
        disposition: "exact_match",
        matchedCurrentProductKeys: ["shop-item"],
        sourceEvidenceIds: ["shop"],
      }],
      surfaceResolutions: [{
        surfaceId: "shop",
        disposition: "complete",
        additionalProductsRequired: [{ currentProductKey: "shop-item", name: "Shop Item", sourceEvidenceIds: ["shop"] }],
      }],
    },
  };
  const merged = mergeBindingSolReview(result, review);
  assert.equal(merged.currentProducts.products[0].currentProductKey, "shop-item");
  assert.deepEqual(merged.reconciliation.items[0].matchedCurrentProductKeys, ["shop-item"]);
});

test("binding Sol review may exclude every category placeholder for a zero-product catalog", () => {
  const result = {
    batchId: "batch",
    restaurantId: "r",
    menuSurfaces: [{ surfaceId: "faq", current: true, scopeStatus: "partial" }],
    currentProducts: { products: [{ currentProductKey: "beverages", name: "Beverages" }] },
    reconciliation: { items: [] },
    changes: { menuScopeUnresolved: true, sourceAuthorityAmbiguous: true },
  };
  const review = {
    batchId: "batch",
    restaurantId: "r",
    validation: { valid: true, resolvedCatalogProductCount: 0 },
    resolution: {
      binding: true,
      items: [],
      safetySourceAuthorityConflictRemains: false,
      catalogDefinition: { excludedCategoryPlaceholderKeys: ["beverages"] },
      surfaceResolutions: [{ surfaceId: "faq", disposition: "excluded" }],
    },
  };
  const merged = mergeBindingSolReview(result, review);
  assert.deepEqual(merged.currentProducts.products, []);
  assert.equal(merged.menuSurfaces[0].current, false);
  assert.deepEqual(merged.solConflictPacket.excludedProductKeys, ["beverages"]);
});

function policyChanges() {
  return {
    identityAmbiguous: false,
    menuScopeUnresolved: false,
    officialAllergenConflict: false,
    crossContactConflict: false,
    unsupportedNegativeClaim: false,
    sourceAuthorityAmbiguous: false,
    duplicateItems: false,
    catalogDrift: false,
    staleItems: false,
    newItems: false,
    nameOrCategoryCleanup: false,
    restaurantSpecificExtraction: false,
    parserIssue: false,
  };
}
