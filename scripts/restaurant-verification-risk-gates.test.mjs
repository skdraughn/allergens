import assert from "node:assert/strict";
import test from "node:test";

import {
  RISK_GATE_IDS as G,
  evaluateScoutRisk,
} from "./restaurant-verification-risk-gates.mjs";

function job(baselineItemCount, overrides = {}) {
  return {
    restaurant: {
      restaurantId: "fixture",
      name: "Fixture",
      domain: "fixture.example",
      baselineItemCount,
      sourceUrls: ["https://fixture.example/menu"],
      sourceFamily: "generic-website",
      parserProfile: "generic-website",
      ...overrides,
    },
  };
}

function source(overrides = {}) {
  return {
    evidenceId: "menu",
    url: "https://fixture.example/menu",
    authorityTier: "restaurant_issued",
    purpose: "menu",
    excerpt: "Anchored menu evidence",
    stableRowId: "menu-row",
    contentHash: null,
    artifactSuggested: null,
    ...overrides,
  };
}

function surface(overrides = {}) {
  return {
    surfaceId: "dinner",
    url: "https://fixture.example/menu",
    servicePeriod: "dinner",
    mediaType: "html",
    accessStatus: "accessible",
    scopeStatus: "complete",
    fullyEnumerated: true,
    ...overrides,
  };
}

function product(index, baselineAuditItemKeys = [`${index}:item-${index}`], overrides = {}) {
  return {
    productId: `item-${index}`,
    name: `Item ${index}`,
    baselineAuditItemKeys,
    presentationIds: [`dinner:item-${index}`],
    authorityVerdict: "verified",
    ...overrides,
  };
}

function exactGroup(count, overrides = {}) {
  return {
    auditItemKeys: Array.from({ length: count }, (_, index) => `${index + 1}:item-${index + 1}`),
    disposition: "exact_match",
    allergenVerdict: "verified",
    sourceEvidenceIds: ["menu"],
    ...overrides,
  };
}

function result(overrides = {}) {
  return {
    outcome: "no_discrepancy",
    confidence: {
      level: "high",
      overall: 0.95,
      menu: 0.95,
      allergenSource: 0.95,
      extraction: 0.95,
    },
    menuSurfaces: [surface()],
    currentProducts: [product(1)],
    itemCheckGroups: [exactGroup(1)],
    sources: [source()],
    sourceAttempts: [{ kind: "official_site", status: "accessible", url: "https://fixture.example" }],
    findings: [],
    ...overrides,
  };
}

function validation(overrides = {}) {
  return { valid: true, errors: [], warnings: [], ...overrides };
}

test("a structurally complete simple scout packet has no strong-review or retry gates", () => {
  const evaluated = evaluateScoutRisk({ job: job(1), result: result(), validation: validation() });

  assert.deepEqual(evaluated.triggeredGates, []);
  assert.equal(evaluated.requiresStrongReview, false);
  assert.equal(evaluated.retryRequired, false);
  assert.equal(evaluated.metrics.currentProductCount, 1);
  assert.equal(evaluated.metrics.uniqueReconciledItemCount, 1);
});

test("AYŞE-style multi-surface undercoverage cannot clear on model confidence", () => {
  const baselineCount = 106;
  const currentProducts = Array.from({ length: 151 }, (_, index) =>
    product(index + 1, index < 96 ? [`${index + 1}:item-${index + 1}`] : [], {
      presentationIds: index === 0 ? ["main:item-1", "brunch:item-1"] : [`main:item-${index + 1}`],
    })
  );
  const evaluated = evaluateScoutRisk({
    job: job(baselineCount, {
      restaurantId: "osm-ay-e-meze-lounge-13134929927",
      domain: "aysemeze.com",
      sourceUrls: ["https://aysemeze.com/", "https://aysemeze.com/main.pdf"],
    }),
    result: result({
      outcome: "discrepancy_found",
      confidence: { level: "high", overall: 0.99, menu: 0.99, allergenSource: 0.99, extraction: 0.99 },
      menuSurfaces: [
        surface({ surfaceId: "main", url: "https://aysemeze.com/main.pdf", mediaType: "pdf" }),
        surface({ surfaceId: "brunch", servicePeriod: "brunch", url: "https://aysemeze.com/brunch.pdf", mediaType: "pdf" }),
        surface({ surfaceId: "kids", servicePeriod: "kids", url: "https://aysemeze.com/kids.pdf", mediaType: "pdf", fullyEnumerated: false, scopeStatus: "partial" }),
      ],
      currentProducts,
      itemCheckGroups: [
        exactGroup(58),
        exactGroup(48, {
          auditItemKeys: Array.from({ length: 48 }, (_, index) => `${index + 59}:item-${index + 59}`),
          allergenVerdict: "mismatch",
        }),
      ],
      sources: [source({ url: "https://aysemeze.com/main.pdf" })],
      findings: [{ kind: "menu_extraction", summary: "Parser omitted current service-menu products." }],
    }),
    validation: validation(),
  });

  for (const gate of [
    G.MULTI_SERVICE,
    G.PDF_OR_IMAGE,
    G.SCOPE_INCOMPLETE,
    G.COUNT_DRIFT,
    G.CURRENT_ONLY,
    G.DUPLICATE_PRESENTATIONS,
    G.ALLERGEN_MISMATCH,
    G.PARSER_OR_REPAIR_FINDING,
    G.SCOUT_FLAGGED_RISK,
  ]) {
    assert.ok(evaluated.triggeredGates.includes(gate), `missing ${gate}`);
  }
  assert.equal(evaluated.metrics.currentOnlyCount, 55);
  assert.equal(evaluated.metrics.allergenMismatchItemCount, 48);
  assert.equal(evaluated.requiresStrongReview, true);
  assert.equal(evaluated.retryRequired, false);
});

test("B Side-style service expansion, blocked source, and cross-contact require strong review", () => {
  const currentProducts = Array.from({ length: 58 }, (_, index) =>
    product(index + 1, index < 25 ? [`${index + 1}:item-${index + 1}`] : [], {
      presentationIds: index === 0 ? ["dinner:item-1", "brunch:item-1"] : [`dinner:item-${index + 1}`],
      ...(index === 21 ? { mayContainAllergens: ["milk", "gluten"] } : {}),
    })
  );
  const evaluated = evaluateScoutRisk({
    job: job(25, {
      restaurantId: "b-side-mosaic-fairfax-va",
      domain: "bsidecuts.com",
      sourceUrls: ["https://www.bsidecuts.com/", "https://cdn.example/dinner.pdf"],
    }),
    result: result({
      outcome: "discrepancy_found",
      menuSurfaces: [
        surface({ surfaceId: "dinner", url: "https://cdn.example/dinner.pdf", mediaType: "pdf" }),
        surface({ surfaceId: "brunch", servicePeriod: "brunch", url: "https://cdn.example/brunch.pdf", mediaType: "pdf" }),
        surface({ surfaceId: "kids", servicePeriod: "kids", url: "https://cdn.example/kids.pdf", mediaType: "pdf" }),
        surface({ surfaceId: "happy-hour", servicePeriod: "happy_hour", url: "https://cdn.example/hh.pdf", mediaType: "pdf" }),
        surface({ surfaceId: "order", servicePeriod: "all_day", url: "https://order.example/b-side", accessStatus: "blocked", scopeStatus: "unknown" }),
      ],
      currentProducts,
      itemCheckGroups: [
        exactGroup(24),
        exactGroup(1, {
          auditItemKeys: ["25:item-25"],
          allergenVerdict: "mismatch",
        }),
      ],
      sources: [
        source({ url: "https://cdn.example/dinner.pdf", linkedFromOfficial: true }),
        source({ evidenceId: "order", url: "https://order.example/b-side", authorityTier: "restaurant_linked_vendor", purpose: "cross_contact", excerpt: "Cross-contaminated with gluten and dairy." }),
      ],
      sourceAttempts: [{ kind: "ordering_vendor", status: "blocked", url: "https://order.example/b-side" }],
    }),
    validation: validation(),
  });

  for (const gate of [
    G.MULTI_SERVICE,
    G.PDF_OR_IMAGE,
    G.INACCESSIBLE_SOURCE,
    G.COUNT_DRIFT,
    G.CURRENT_ONLY,
    G.DUPLICATE_PRESENTATIONS,
    G.ALLERGEN_MISMATCH,
    G.CROSS_CONTACT,
  ]) {
    assert.ok(evaluated.triggeredGates.includes(gate), `missing ${gate}`);
  }
  assert.equal(evaluated.metrics.currentOnlyCount, 33);
  assert.equal(evaluated.requiresStrongReview, true);
  assert.equal(evaluated.retryRequired, false);
});

test("Azteca-style full-menu count drift and frozen authority mismatch are deterministic", () => {
  const currentProducts = Array.from({ length: 94 }, (_, index) =>
    product(index + 1, index < 3 ? [`${index + 1}:item-${index + 1}`] : [], {
      ...(index < 3 ? { baselineSourceDomainMismatch: true } : {}),
    })
  );
  const evaluated = evaluateScoutRisk({
    job: job(3, {
      restaurantId: "azteca-restaurant-college-park-md-dc-metro",
      domain: "aztecarestaurantcantinamd.com",
      sourceUrls: ["https://aztecarestaurantcantinamd.com/"],
    }),
    result: result({
      outcome: "discrepancy_found",
      menuSurfaces: [surface({
        surfaceId: "fox-menu",
        url: "https://aztecarestaurantcantinamd.com/location/menu",
        servicePeriod: "all_day",
      })],
      currentProducts,
      itemCheckGroups: [
        exactGroup(2),
        exactGroup(1, {
          auditItemKeys: ["3:item-3"],
          disposition: "variant_match",
          allergenVerdict: "mismatch",
        }),
      ],
      sources: [source({
        url: "https://aztecarestaurantcantinamd.com/location/menu",
        authorityTier: "restaurant_linked_vendor",
      })],
    }),
    validation: validation(),
  });

  for (const gate of [
    G.COUNT_DRIFT,
    G.CURRENT_ONLY,
    G.DIFFERENT_DOMAIN,
    G.NON_EXACT_RECONCILIATION,
    G.ALLERGEN_MISMATCH,
  ]) {
    assert.ok(evaluated.triggeredGates.includes(gate), `missing ${gate}`);
  }
  assert.equal(evaluated.metrics.currentProductCount, 94);
  assert.equal(evaluated.metrics.currentOnlyCount, 91);
  assert.equal(evaluated.metrics.differentDomainCount, 3);
  assert.equal(evaluated.requiresStrongReview, true);
  assert.equal(evaluated.retryRequired, false);
});

test("structural item coverage requires retry while unresolved scope and missing anchors require strong review", () => {
  const evaluated = evaluateScoutRisk({
    job: job(2),
    result: result({
      confidence: { level: "low", overall: 0.6, menu: 0.6, allergenSource: 0.6, extraction: 0.6 },
      menuSurfaces: [surface({ unresolved: true, resolutionStatus: "unresolved" })],
      sources: [source({ excerpt: null, stableRowId: null, contentHash: null, artifactSuggested: null })],
    }),
    validation: validation({ valid: false, errors: ["missing item"], warnings: ["unresolved evidence"] }),
  });

  for (const gate of [
    G.STRUCTURAL_INVALID,
    G.BASELINE_COVERAGE_INCOMPLETE,
    G.UNRESOLVED_SURFACE,
    G.MISSING_ANCHORS,
    G.VALIDATION_WARNINGS,
    G.LOW_CONFIDENCE,
  ]) {
    assert.ok(evaluated.triggeredGates.includes(gate), `missing ${gate}`);
  }
  assert.equal(evaluated.retryRequired, true);
  assert.equal(evaluated.requiresStrongReview, true);
});
