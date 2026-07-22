import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  blockedAttemptKinds,
  claimRestaurant,
  completeRestaurantVerification,
  extractSquareOnlineMenuSnapshot,
  extractToastMenuSnapshot,
  generateVerificationSummary,
  getRestaurantVerification,
  initializeVerificationLedger,
  nextRestaurant,
  recordRestaurantVerification,
  validateAdjudicationForStatus,
  validateVerificationLedger,
  validateWorkerHandoff,
  verificationPaths,
} from "./restaurant-verification-ledger.mjs";

test("POC terminal contract accepts coordinator adjudication without Terra", () => {
  const adjudication = {
    type: "coordinator",
    runId: "poc-batch-1",
    decidedAt: "2026-07-16T20:00:00.000Z",
    recommendation: "codex_verified",
    model: { id: "codex-poc-coordinator", reasoningEffort: "high" },
    rationale: "POC terminal gates passed.",
  };
  assert.doesNotThrow(() => validateAdjudicationForStatus(adjudication, "codex_verified"));
  const handoff = {
    runId: "poc-batch-1",
    restaurantId: "restaurant",
    solRequired: false,
    artifacts: [
      { kind: "poc_job", path: "job.json", sha256: "a".repeat(64) },
      { kind: "poc_research", path: "research.json", sha256: "b".repeat(64) },
    ],
  };
  assert.doesNotThrow(() => validateWorkerHandoff(handoff, "restaurant"));
});

test("POC terminal contract still requires Sol artifacts when routed to Sol", () => {
  const handoff = {
    runId: "poc-batch-1",
    restaurantId: "restaurant",
    solRequired: true,
    artifacts: [
      { kind: "poc_job", path: "job.json", sha256: "a".repeat(64) },
      { kind: "poc_research", path: "research.json", sha256: "b".repeat(64) },
    ],
  };
  assert.throws(() => validateWorkerHandoff(handoff, "restaurant"), /missing sol_review/);
});

test("Square audit snapshot keeps menu sections and applies conservative allergen semantics", () => {
  const bootstrap = {
    siteData: {
      page: {
        properties: {
          contentAreas: {
            userContent: {
              content: {
                cells: [
                  {
                    content: {
                      purpose: "featured-products@^1.0.0",
                      elements: [{ purpose: "title", properties: { title: { quill: { ops: [{ insert: "Vegan Soups\n" }] } } } }],
                      properties: { products: ["mustard", "coconut"] },
                    },
                  },
                  {
                    content: {
                      purpose: "featured-products@^1.0.0",
                      elements: [{ purpose: "title", properties: { title: { quill: { ops: [{ insert: "Meat Soups\n" }] } } } }],
                      properties: { products: ["miso"] },
                    },
                  },
                  {
                    content: {
                      purpose: "featured-products@^1.0.0",
                      elements: [{ purpose: "title", properties: { title: { quill: { ops: [{ insert: "Merchandise\n" }] } } } }],
                      properties: { products: ["bag"] },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    },
  };
  const products = {
    data: [
      squareProduct("mustard", "Creamy Mushroom", "vegan", "Mustard gives this soup its flavor."),
      squareProduct("coconut", "Curry Pumpkin", "vegan", "Ingredients: Squash, Coconut Milk, Ginger"),
      squareProduct("miso", "Miso Tofu", "meat", "<p>Soup</p><p><strong>Ingredients:</strong> Tofu (Soybeans), Miso, Sesame Oil</p>"),
      squareProduct("barley", "Mushroom Buckwheat", "vegan", "Our version of Mushroom Barley but we use gluten free buckwheat instead of barley."),
      squareProduct("bag", "Reusable Bag", "retail", ""),
    ],
  };
  const snapshot = extractSquareOnlineMenuSnapshot(
    `<script>window.__BOOTSTRAP_STATE__ = ${JSON.stringify(bootstrap)};</script>`,
    products,
    {
      apiUrl: "https://shop.example/api/products",
      restaurantId: "square-test",
      sourceUrl: "https://shop.example/",
      retrievedAt: "2026-07-14T00:00:00.000Z",
    },
  );

  assert.equal(snapshot.itemCount, 4);
  assert.deepEqual(snapshot.items.find((item) => item.productId === "mustard").allergens, ["mustard"]);
  assert.deepEqual(snapshot.items.find((item) => item.productId === "coconut").allergens, []);
  assert.deepEqual(snapshot.items.find((item) => item.productId === "miso").allergens, ["soy", "sesame"]);
  assert.deepEqual(snapshot.items.find((item) => item.productId === "barley").allergens, []);
  assert.equal(snapshot.excludedProducts.some((product) => product.productId === "bag"), true);
});

function squareProduct(id, name, categoryId, description) {
  return {
    id,
    site_product_id: id,
    name,
    short_description: description,
    visibility: "visible",
    fulfillable: true,
    categoryIds: [categoryId],
    inventory: { all_variations_sold_out: false },
    absolute_site_link: `https://shop.example/product/${id}`,
    product_type: "physical",
  };
}

test("Toast audit snapshot preserves card/category pairing and removes featured duplicates", () => {
  const snapshot = extractToastMenuSnapshot(
    `<div class="menuSection"><div class="headerWrapper"><h3>Featured Items</h3></div><ul><li data-testid="menu-item-card"><a aria-label="CHEESE" href="/item-cheese"><span class="headerText">CHEESE</span><div data-testid="item-content-description">Featured copy</div></a></li></ul></div>
     <div class="menuSection"><div class="headerWrapper"><h3>CLASSIC PIZZA</h3></div><ul><li data-testid="menu-item-card"><a aria-label="CHEESE" href="/item-cheese"><span class="headerText">CHEESE</span><div data-testid="item-content-description">Tomato and mozzarella</div></a></li></ul></div>`,
    { restaurantId: "toast-test", sourceUrl: "https://order.example.com/menu" },
  );

  assert.equal(snapshot.cardCount, 2);
  assert.equal(snapshot.itemCount, 1);
  assert.deepEqual(snapshot.items[0], {
    auditItemKey: "1:cheese",
    category: "CLASSIC PIZZA",
    description: "Tomato and mozzarella",
    name: "CHEESE",
    sourceUrl: "https://order.example.com/item-cheese",
    allergens: [],
    mayContain: [],
    allergenSourceType: "unavailable",
  });
});

async function withFixture(run) {
  const root = await mkdtemp(path.join(tmpdir(), "restaurant-verification-"));
  const repositoryPath = path.join(root, "repository.json");
  const ledgerRoot = path.join(root, "ledger");
  const repository = {
    generatedAt: "2026-07-14T00:00:00.000Z",
    restaurants: [
      {
        id: "zulu-cafe",
        name: "Zulu Cafe",
        domain: "zulu.example",
        items: [
          {
            id: "tea",
            name: "Tea",
            category: "Beverages",
            allergens: [],
            mayContain: [],
            allergenSourceType: "unavailable",
            sourceUrls: ["https://zulu.example/menu"],
          },
        ],
      },
      {
        id: "alpha-grill",
        name: "Alpha Grill",
        domain: "alpha.example",
        officialAllergenStatus: "extracted",
        items: [
          {
            id: "burger",
            name: "Burger",
            category: "Mains",
            allergens: ["wheat"],
            mayContain: ["sesame"],
            allergenSourceType: "official-allergen-menu",
            sourceUrls: ["https://alpha.example/allergens"],
          },
        ],
      },
    ],
  };

  await writeFile(repositoryPath, JSON.stringify(repository));

  try {
    await run({ ledgerRoot, repositoryPath, root });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

test("verification ledger initializes a frozen alphabetical baseline", async () => {
  await withFixture(async ({ ledgerRoot, repositoryPath }) => {
    const { manifest, rows } = await initializeVerificationLedger({
      now: "2026-07-14T01:00:00.000Z",
      repositoryPath,
      root: ledgerRoot,
    });

    assert.equal(manifest.baseline.restaurantCount, 2);
    assert.equal(manifest.baseline.itemCount, 2);
    assert.equal(manifest.model.id, "gpt-5.6-sol");
    assert.equal(manifest.model.reasoningEffort, "medium");
    assert.deepEqual(rows.map((row) => row.restaurantId), ["alpha-grill", "zulu-cafe"]);
    assert.equal((await nextRestaurant({ root: ledgerRoot })).restaurantId, "alpha-grill");
    assert.deepEqual(await validateVerificationLedger({ root: ledgerRoot }), {
      errors: [],
      itemCount: 2,
      ok: true,
      restaurantCount: 2,
    });
  });
});

test("verified completion requires evidence and complete item adjudication", async () => {
  await withFixture(async ({ ledgerRoot, repositoryPath }) => {
    await initializeVerificationLedger({ repositoryPath, root: ledgerRoot });
    await claimRestaurant({ restaurantId: "alpha-grill", root: ledgerRoot });

    await assert.rejects(
      completeRestaurantVerification({
        restaurantId: "alpha-grill",
        root: ledgerRoot,
        status: "codex_verified",
      }),
      /item checks are still pending/,
    );

    const incompleteCatalog = verifiedCatalog();
    incompleteCatalog.currentProductCount = 2;
    await recordRestaurantVerification({
      restaurantId: "alpha-grill",
      root: ledgerRoot,
      input: {
        checks: {
          menu: { reviewedItemCount: 1, sourceItemCount: 1, verdict: "verified" },
          allergenSource: {
            highestAuthorityTier: "restaurant_issued",
            verdict: "verified",
          },
          extraction: {
            parserReviewed: true,
            semanticsVerified: true,
            verdict: "verified",
          },
        },
        evidence: [
          {
            id: "official-allergen-guide",
            authorityTier: "restaurant_issued",
            purpose: "both",
            retrievedAt: "2026-07-14T02:00:00.000Z",
            sha256: "a".repeat(64),
            url: "https://alpha.example/allergens",
          },
        ],
        itemChecks: [
          {
            auditItemKey: "1:burger",
            allergenVerdict: "verified",
            disposition: "exact_match",
            sourceEvidenceIds: ["official-allergen-guide"],
            matchedCurrentProductKeys: ["current:burger"],
            adjudicatedContainsAllergens: ["wheat"],
            adjudicatedMayContainAllergens: ["sesame"],
            adjudicatedAllergenSourceType: "restaurant_allergen_document",
            adjudicatedAllergenAuthorityTier: "restaurant_issued",
            allergenSourceEvidenceIds: ["official-allergen-guide"],
          },
        ],
        currentCatalog: incompleteCatalog,
        adjudication: terminalAdjudication("codex_verified"),
        workerHandoff: await workerHandoff(ledgerRoot, "alpha-grill"),
      },
    });

    await assert.rejects(
      completeRestaurantVerification({ restaurantId: "alpha-grill", root: ledgerRoot, status: "codex_verified" }),
      /product count does not match/i,
    );
    await recordRestaurantVerification({ restaurantId: "alpha-grill", root: ledgerRoot, input: { currentCatalog: verifiedCatalog() } });
    await recordRestaurantVerification({
      restaurantId: "alpha-grill",
      root: ledgerRoot,
      input: { itemChecks: [{ auditItemKey: "1:burger", allergenVerdict: "mismatch", resolvedFindingIds: [] }] },
    });
    await assert.rejects(
      completeRestaurantVerification({ restaurantId: "alpha-grill", root: ledgerRoot, status: "codex_verified" }),
      /repaired mismatch needs resolved finding linkage/i,
    );
    await recordRestaurantVerification({
      restaurantId: "alpha-grill",
      root: ledgerRoot,
      input: { itemChecks: [{ auditItemKey: "1:burger", allergenVerdict: "verified" }] },
    });

    await recordRestaurantVerification({
      restaurantId: "alpha-grill",
      root: ledgerRoot,
      input: { itemChecks: [{ auditItemKey: "1:burger", allergenSourceEvidenceIds: [] }] },
    });
    await assert.rejects(
      completeRestaurantVerification({ restaurantId: "alpha-grill", root: ledgerRoot, status: "codex_verified" }),
      /require allergen evidence/i,
    );
    await recordRestaurantVerification({
      restaurantId: "alpha-grill",
      root: ledgerRoot,
      input: { itemChecks: [{
        auditItemKey: "1:burger",
        allergenSourceEvidenceIds: ["official-allergen-guide"],
        adjudicatedAllergenAuthorityTier: "third_party",
      }] },
    });
    await assert.rejects(
      completeRestaurantVerification({ restaurantId: "alpha-grill", root: ledgerRoot, status: "codex_verified" }),
      /does not support the adjudicated authority tier/i,
    );
    await recordRestaurantVerification({
      restaurantId: "alpha-grill",
      root: ledgerRoot,
      input: { itemChecks: [{ auditItemKey: "1:burger", adjudicatedAllergenAuthorityTier: "restaurant_issued" }] },
    });

    await recordRestaurantVerification({
      restaurantId: "alpha-grill",
      root: ledgerRoot,
      input: { itemChecks: [{ auditItemKey: "1:burger", matchedCurrentProductKeys: ["current:invented"] }] },
    });
    await assert.rejects(
      completeRestaurantVerification({ restaurantId: "alpha-grill", root: ledgerRoot, status: "codex_verified" }),
      /unknown current product/i,
    );
    await recordRestaurantVerification({
      restaurantId: "alpha-grill",
      root: ledgerRoot,
      input: { itemChecks: [{ auditItemKey: "1:burger", matchedCurrentProductKeys: ["current:burger"] }] },
    });
    const oneSidedCatalog = verifiedCatalog();
    oneSidedCatalog.products[0].matchedBaselineAuditItemKeys = [];
    await recordRestaurantVerification({ restaurantId: "alpha-grill", root: ledgerRoot, input: { currentCatalog: oneSidedCatalog } });
    await assert.rejects(
      completeRestaurantVerification({ restaurantId: "alpha-grill", root: ledgerRoot, status: "codex_verified" }),
      /missing the inverse baseline link/i,
    );
    await recordRestaurantVerification({ restaurantId: "alpha-grill", root: ledgerRoot, input: { currentCatalog: verifiedCatalog() } });
    await recordRestaurantVerification({
      restaurantId: "alpha-grill",
      root: ledgerRoot,
      input: { itemChecks: [{ auditItemKey: "1:burger", matchedCurrentProductKeys: [] }] },
    });
    await assert.rejects(
      completeRestaurantVerification({ restaurantId: "alpha-grill", root: ledgerRoot, status: "codex_verified" }),
      /requires a current product match/i,
    );
    await recordRestaurantVerification({
      restaurantId: "alpha-grill",
      root: ledgerRoot,
      input: { itemChecks: [{ auditItemKey: "1:burger", matchedCurrentProductKeys: ["current:burger"] }] },
    });

    const completed = await completeRestaurantVerification({
      restaurantId: "alpha-grill",
      root: ledgerRoot,
      status: "codex_verified",
    });

    assert.equal(completed.row.status, "codex_verified");
    assert.equal((await nextRestaurant({ root: ledgerRoot })).restaurantId, "zulu-cafe");
    assert.equal((await validateVerificationLedger({ root: ledgerRoot })).ok, true);
  });
});

test("blocked completion enforces exhaustive documented source attempts", async () => {
  await withFixture(async ({ ledgerRoot, repositoryPath }) => {
    await initializeVerificationLedger({ repositoryPath, root: ledgerRoot });
    await claimRestaurant({ restaurantId: "zulu-cafe", root: ledgerRoot });

    await recordRestaurantVerification({
      restaurantId: "zulu-cafe",
      root: ledgerRoot,
      input: {
        sourceAttempts: blockedAttemptKinds.map((kind) => ({
          id: `attempt-${kind}`,
          attemptedAt: "2026-07-14T03:00:00.000Z",
          kind,
          outcome: "No reproducible item-level allergen evidence located.",
          status: "not_found",
          query: `${kind} source query`,
          scopeImpact: "The current menu or allergen scope could not be verified.",
        })),
        itemChecks: [{ auditItemKey: "1:tea", disposition: "missing_from_source", allergenVerdict: "accurately_unavailable" }],
        currentCatalog: unverifiableCatalog(),
        adjudication: terminalAdjudication("blocked_unverifiable"),
        workerHandoff: await workerHandoff(ledgerRoot, "zulu-cafe", true),
      },
    });

    await recordRestaurantVerification({
      restaurantId: "zulu-cafe",
      root: ledgerRoot,
      input: { itemChecks: [{ auditItemKey: "1:tea", disposition: "exact_match", allergenVerdict: "verified" }] },
    });
    await assert.rejects(
      completeRestaurantVerification({ restaurantId: "zulu-cafe", root: ledgerRoot, status: "blocked_unverifiable" }),
      /requires accurately_unavailable|cannot claim a verified current product match/i,
    );
    await recordRestaurantVerification({
      restaurantId: "zulu-cafe",
      root: ledgerRoot,
      input: { itemChecks: [{ auditItemKey: "1:tea", disposition: "missing_from_source", allergenVerdict: "accurately_unavailable" }] },
    });

    const completed = await completeRestaurantVerification({
      restaurantId: "zulu-cafe",
      root: ledgerRoot,
      status: "blocked_unverifiable",
    });

    assert.equal(completed.row.status, "blocked_unverifiable");
    assert.equal((await validateVerificationLedger({ root: ledgerRoot })).ok, true);
  });
});

test("summary emits Markdown and CSV from the canonical ledger", async () => {
  await withFixture(async ({ ledgerRoot, repositoryPath }) => {
    await initializeVerificationLedger({ repositoryPath, root: ledgerRoot });
    const summary = await generateVerificationSummary({
      now: "2026-07-14T04:00:00.000Z",
      root: ledgerRoot,
    });
    const paths = verificationPaths(ledgerRoot);
    const markdown = await readFile(paths.summaryMarkdown, "utf8");
    const csv = await readFile(paths.summaryCsv, "utf8");

    assert.equal(summary.total, 2);
    assert.match(markdown, /Next restaurant: \*\*Alpha Grill\*\*/);
    assert.match(csv, /alpha-grill,Alpha Grill,pending/);
  });
});

test("record can replace superseded findings and evidence for terminal closeout", async () => {
  await withFixture(async ({ ledgerRoot, repositoryPath }) => {
    await initializeVerificationLedger({ repositoryPath, root: ledgerRoot });
    await claimRestaurant({ restaurantId: "alpha-grill", root: ledgerRoot });
    await recordRestaurantVerification({
      restaurantId: "alpha-grill",
      root: ledgerRoot,
      input: {
        findings: [{
          id: "scope-gap",
          severity: "medium",
          kind: "scope",
          summary: "A partial menu surface still needs review.",
        }],
      },
    });
    await recordRestaurantVerification({
      restaurantId: "alpha-grill",
      root: ledgerRoot,
      input: {
        findings: [],
        replaceFindings: true,
        evidence: [{
          id: "terminal-menu",
          url: "https://alpha.example/menu",
          authorityTier: "restaurant_issued",
          purpose: "menu",
          retrievedAt: "2026-07-16T00:00:00.000Z",
          excerpt: "Terminal menu evidence.",
        }],
        replaceEvidence: true,
      },
    });

    const state = await getRestaurantVerification("alpha-grill", { root: ledgerRoot });
    assert.deepEqual(state.dossier.findings, []);
    assert.deepEqual(state.evidence.sources.map((source) => source.id), ["terminal-menu"]);
  });
});

test("record initializes missing legacy check sections before merging", async () => {
  await withFixture(async ({ ledgerRoot, repositoryPath }) => {
    await initializeVerificationLedger({ repositoryPath, root: ledgerRoot });
    await claimRestaurant({ restaurantId: "alpha-grill", root: ledgerRoot });
    const before = await getRestaurantVerification("alpha-grill", { root: ledgerRoot });
    delete before.dossier.checks;
    await writeFile(
      path.join(ledgerRoot, before.row.paths.dossier),
      `${JSON.stringify(before.dossier, null, 2)}\n`,
    );

    await recordRestaurantVerification({
      restaurantId: "alpha-grill",
      root: ledgerRoot,
      input: { checks: { menu: { verdict: "verified", reviewedItemCount: 1 } } },
    });
    const after = await getRestaurantVerification("alpha-grill", { root: ledgerRoot });
    assert.equal(after.dossier.checks.menu.verdict, "verified");
    assert.equal(after.dossier.checks.allergenSource.verdict, "not_reviewed");
    assert.equal(after.dossier.checks.extraction.verdict, "not_reviewed");
  });
});

test("terminal records reject mutation until explicitly reopened", async () => {
  await withFixture(async ({ ledgerRoot, repositoryPath }) => {
    await initializeVerificationLedger({ repositoryPath, root: ledgerRoot });
    await claimRestaurant({ restaurantId: "zulu-cafe", root: ledgerRoot });
    await recordRestaurantVerification({
      restaurantId: "zulu-cafe",
      root: ledgerRoot,
      input: {
        sourceAttempts: blockedAttemptKinds.map((kind) => ({ id: `attempt-${kind}`, attemptedAt: "2026-07-14T03:00:00.000Z", kind, outcome: "Unavailable.", status: "not_found", query: kind, scopeImpact: "Scope unavailable." })),
        itemChecks: [{ auditItemKey: "1:tea", disposition: "missing_from_source", allergenVerdict: "accurately_unavailable" }],
        currentCatalog: unverifiableCatalog(),
        adjudication: terminalAdjudication("blocked_unverifiable"),
        workerHandoff: await workerHandoff(ledgerRoot, "zulu-cafe", true),
      },
    });
    await completeRestaurantVerification({ restaurantId: "zulu-cafe", root: ledgerRoot, status: "blocked_unverifiable" });
    await assert.rejects(
      recordRestaurantVerification({ restaurantId: "zulu-cafe", root: ledgerRoot, input: { notes: ["late mutation"] } }),
      /transition to recheck_required/,
    );
    const reopened = await recordRestaurantVerification({
      restaurantId: "zulu-cafe",
      root: ledgerRoot,
      input: { status: "recheck_required", notes: ["Reopened for new evidence."] },
    });
    assert.equal(reopened.row.status, "recheck_required");
  });
});

function verifiedCatalog() {
  return {
    status: "verified",
    reviewedBaselineItemCount: 1,
    currentProductCount: 1,
    reconciledCurrentProductCount: 1,
    surfaces: [{ surfaceId: "menu", title: "Menu", url: "https://alpha.example/allergens", current: true, scopeStatus: "complete", verified: true, evidenceIds: ["official-allergen-guide"] }],
    products: [{
      currentProductKey: "current:burger",
      name: "Burger",
      category: "Mains",
      presentationIds: ["menu:burger"],
      matchedBaselineAuditItemKeys: ["1:burger"],
      sourceEvidenceIds: ["official-allergen-guide"],
      containsAllergens: ["wheat"],
      mayContainAllergens: ["sesame"],
      allergenSourceType: "restaurant_allergen_document",
      allergenAuthorityTier: "restaurant_issued",
      allergenSourceEvidenceIds: ["official-allergen-guide"],
      coordinatorReviewed: true,
    }],
  };
}

function unverifiableCatalog() {
  return { status: "unverifiable", reviewedBaselineItemCount: 1, currentProductCount: 0, reconciledCurrentProductCount: 0, surfaces: [], products: [] };
}

function terminalAdjudication(recommendation) {
  return {
    type: "coordinator",
    runId: "test-run",
    decidedAt: "2026-07-14T04:00:00.000Z",
    recommendation,
    model: { id: "gpt-5.6-sol", reasoningEffort: "medium" },
    rationale: "The complete structured record supports this terminal recommendation.",
    artifactHashes: [],
  };
}

async function workerHandoff(root, restaurantId, solRequired = false) {
  const base = ["job", "scout_result", "scout_route", "terra_result", "terra_route"];
  if (solRequired) base.push("sol_review", "sol_validation");
  const artifacts = [];
  for (const [index, kind] of base.entries()) {
    const artifactPath = `worker-runs/test-run/${restaurantId}-${kind}-${index}.json`;
    const contents = JSON.stringify({ restaurantId, kind });
    await mkdir(path.dirname(path.join(root, artifactPath)), { recursive: true });
    await writeFile(path.join(root, artifactPath), contents);
    artifacts.push({ kind, path: artifactPath, sha256: createHash("sha256").update(contents).digest("hex") });
  }
  return {
    runId: "test-run",
    restaurantId,
    preparedAt: "2026-07-14T04:00:00.000Z",
    routeDestination: solRequired ? "sol_medium" : "coordinator",
    solRequired,
    artifacts,
  };
}
