# Restaurant Verification POC Flow

This document is the authoritative workflow for producing the initial SafePlate proof-of-concept restaurant set. It replaces the mandatory Luna -> Terra -> Sol workflow. The legacy three-tier worker artifacts remain available for audit history but must not be used for new batches.

## Objective

Produce a useful, internally consistent restaurant catalog quickly. Prioritize correct menu identity and conservative allergen semantics. Do not spend proof-of-concept time generalizing shared parsers or building reusable extraction infrastructure.

At the 2026-07-16T19:34:46.873Z checkpoint, the frozen ledger contains:

- 1,495 total restaurants.
- 94 `codex_verified` restaurants.
- 9 `repair_in_progress` restaurants.
- 24 `discrepancy_found` restaurants.
- 7 `recheck_required` restaurants.
- 1,361 pending restaurants.

The 40 existing repair/discrepancy/recheck records must be drained before new restaurants are claimed.

## Exact agent and thread budget

Each batch contains exactly three restaurants.

- One root coordinator thread owns selection, routing, canonical writes, ledger transitions, and final validation.
- Three `gpt-5.6-luna` low-reasoning subagent threads each own one restaurant.
- Zero Terra threads are used in the POC workflow.
- At most one `gpt-5.6-sol` medium-reasoning reviewer thread is opened for the batch. It handles every safety escalation serially and performs the audit sample when due.
- Maximum open threads: five total: one root, three Luna, one Sol.
- Maximum simultaneously working subagents: three.
- Subagent nesting depth: one. Subagents never spawn subagents.
- One of every 20 Luna fast-path completions receives a Sol audit sample.

Do not start the next three-restaurant batch until every restaurant in the current batch is terminal or explicitly blocked.

## Ingredient Intelligence timing

Ingredient Intelligence is build-time enrichment, not a display-time model call.

1. Finalize the current menu catalog and direct-source allergen fields.
2. Mark items without found official allergen evidence as `allergenSourceType: "unavailable"`.
3. Run `annotateRestaurantWithIngredientIntelligence` through the repository build or the targeted `recompute:ingredient-intelligence` command.
4. Store `inferredAllergenSignals`, inferred ingredients, questions, summary, and inference version on each menu-item record.
5. Publish the enriched restaurant record.
6. At display time, `src/lib/safety.ts` reads the stored signals only when official allergen data is unavailable. Ingredient Intelligence may raise `caution`; it never produces `ok` and never overrides direct official evidence.

An unavailable official allergen matrix can therefore be an acceptable restaurant-verification result. It does not mean the food is safe. It means the app clearly identifies official allergen data as unavailable and uses Ingredient Intelligence only as an extra caution layer.

## End-to-end flow

### 1. Drain before claiming

Resolve existing `repair_in_progress`, `discrepancy_found`, and `recheck_required` rows before selecting pending rows. Apply the same routing policy below. Do not create a discovery backlog.

### 2. Claim three restaurants

The root coordinator claims exactly three alphabetical records and creates one isolated job packet per restaurant. Each packet includes the frozen restaurant record, item checks, known source URLs, and expected output path.

### 3. Run three Luna workers in parallel

Each Luna worker follows the exact protocol below. A worker may not skip a step because a restaurant looks simple.

#### Luna input packet

Before Luna starts, the coordinator creates one immutable packet containing:

- `restaurantId`, restaurant name, location, domain, and known official URLs;
- the frozen restaurant record and baseline item fingerprint;
- the full frozen item-check path and expected item-check count;
- existing dossier/evidence paths, when they exist;
- the isolated research-result path and isolated APPLY patch path;
- the current policy version and required search classes.

If the packet restaurant, location, fingerprint, or item-check count does not match the files on disk, Luna stops and returns `packet_invalid`. Luna does not guess which input is correct.

#### Luna phase A: read-only research

1. **Load and validate the packet.** Read the entire frozen item-check file. Confirm that every row belongs to the packet restaurant. Record the exact count and fingerprint before browsing.
2. **Confirm restaurant identity.** Match the name, location, domain, and official homepage. If two businesses or locations cannot be separated confidently, set `identityAmbiguous: true`; do not merge them.
3. **Inventory current menu surfaces.** Starting from the official homepage, enumerate every relevant current food and nonalcoholic menu surface: HTML menus, PDFs, menu images, service-period menus, location pages, and restaurant-linked ordering vendors. Record each URL, authority, location scope, service period, and retrieval outcome.
4. **Build the current product boundary.** Enumerate each current product in POC scope. Consolidate repeated presentations of the same product while retaining every source/presentation reference. Alcohol-only items and clearly out-of-location menus are out of scope and must be identified as such.
5. **Search for official allergen material.** Execute all four search classes in order: `official_site`, `official_documents`, `linked_vendor`, and `targeted_web_search`. Record the query or location inspected, URLs found, outcome, and evidence IDs for every class. Only after all four are complete may Luna return `accurately_unavailable`.
6. **Apply direct allergen evidence.** Preserve explicit restaurant-issued or linked-vendor positives and cross-contact statements with their authority labels. Never infer that an allergen is absent from a menu description, culinary expectation, or missing matrix. When official disclosure is incomplete, use `unavailable`, not an empty array presented as certainty.
7. **Reconcile every frozen item exactly once.** Assign each frozen `auditItemKey` one disposition: `exact_match`, `normalized_match`, `equivalent_presentation`, `stale`, `artifact`, `location_mismatch`, or `unresolved`. Link matches to current product keys and evidence IDs. The reconciled key set must equal the frozen key set with no omissions or duplicates.
8. **Classify catalog changes.** Mark ordinary duplicate cleanup, count drift, stale/new items, naming/category cleanup, restaurant-specific extraction, and parser symptoms as Luna-fix signals. Mark only unresolved identity/scope, official-allergen conflicts, cross-contact conflicts, unsupported negative claims, or authority conflicts as Sol-review signals.
9. **Write the isolated result.** Luna writes no canonical restaurant, generated dataset, dossier, evidence, item-check, or ledger file during research. The isolated result must contain the packet identity, sources, menu surfaces, current products, matrix-search audit, complete reconciliation, proposed changes, routing signals, and any blocked reason.

The coordinator validates the isolated result mechanically. A schema or coverage failure gets one focused Luna retry containing only the validator errors; it does not restart the full research pass.

#### Coordinator routing after research

10. **Route deterministically.** The coordinator runs `classifyPocRestaurant`. Clean results enter `verify`; mechanical catalog work enters `luna_fix`; only the narrow safety conflicts listed above enter `sol_review`.
11. **Resolve Sol questions narrowly.** When needed, Sol receives only the conflicting claims, affected product/item keys, and source evidence. Sol does not repeat menu discovery. Sol returns a binding resolution or a precise blocked reason.

#### Luna phase B: serialized APPLY

12. **Wait for APPLY authorization.** The coordinator authorizes only one canonical repair at a time. Luna rechecks the packet fingerprint immediately before editing; a changed fingerprint returns `stale_apply_packet`. The contract fingerprint is SHA-256 of `JSON.stringify(itemChecks.map(row => row.baseline))`; hashing full enriched rows or raw NDJSON bytes is not equivalent.
13. **Apply the smallest target-specific repair.** Edit only the named restaurant record, target fixture/adapter, dossier/evidence, or direct target transformation. Delete harmless duplicates, merge useful non-allergen metadata, add/remove current/stale products, and preserve source references. Do not redesign a shared parser for the POC.
14. **Recompute Ingredient Intelligence.** After the direct-source catalog is final, run the targeted Ingredient Intelligence recomputation. Inferred signals stay in `inferred*` fields and may only raise caution.
15. **Validate and prove idempotency.** Run target-only generation/tests, ledger artifact validation, reconciliation coverage, and the repair a second time. The second repair run must produce no diff. Luna writes an APPLY result containing changed paths, commands, exit codes, and before/after fingerprints.

#### Coordinator-only closeout

16. **Make the terminal decision.** The coordinator independently validates the research file, checks the published app record, persists hashed POC job/research/APPLY artifacts, verifies every terminal gate, applies the one-in-20 Sol audit rule, and is the only actor allowed to write the ledger. Ordinary POC fast paths use `codex-poc-coordinator` adjudication and do not require Terra or Sol artifacts. A record with `solRequired: true` still requires hashed Sol review and validation artifacts. The coordinator writes the dossier, evidence, item checks, and ledger transition atomically, or records the precise nonterminal status.

Luna never marks itself `codex_verified`. A worker can only return evidence and a validated repair; the coordinator owns the terminal decision.

### 4. Required official allergen search

Luna must perform and record all four search classes before reporting that no official matrix exists:

1. `official_site`: inspect the restaurant-controlled site and menu/navigation pages.
2. `official_documents`: inspect nutrition, allergen, ingredient, FAQ, PDF, image, sitemap, CDN, and downloadable-document surfaces.
3. `linked_vendor`: inspect the ordering or menu provider linked by the restaurant.
4. `targeted_web_search`: search the restaurant/domain with terms including allergen, allergy, nutrition, ingredients, PDF, and menu.

Outcomes:

- Matrix found: capture it, classify its authority, and apply its direct evidence.
- Matrix not found after all four searches: set official allergen status to `accurately_unavailable` and continue. This is not an escalation by itself.
- Search incomplete: return to Luna for one focused retry.

### 5. Deterministic routing

Run `classifyPocRestaurant` from `scripts/restaurant-verification-poc-policy.mjs`.

#### Verify lane

Use when the catalog is reconciled, required searches are complete, and no repair or safety escalation remains. Missing official allergen data is acceptable as `accurately_unavailable`.

#### Luna fix lane

Luna fixes these without Terra or Sol:

- exact or equivalent duplicate items;
- ordinary item-count drift;
- stale or newly added menu items;
- name or category cleanup;
- restaurant-specific extraction work;
- parser quirks or under-extraction;
- missing official allergen matrix after all required searches.

For this proof of concept, prefer a restaurant-specific repair, fixture, adapter, or direct target transformation. Do not redesign a shared parser. Record shared-parser opportunities as technical-debt notes only.

Canonical repairs run one restaurant at a time. After repair, rerun focused validation and routing. A clean repaired record goes directly to verification.

#### Sol review lane

Sol is reserved for these safety-sensitive unresolved questions:

- restaurant identity or location ambiguity;
- unresolved menu scope after Luna retry;
- conflicting official allergen evidence;
- conflicting cross-contact evidence;
- an unsupported claim that an allergen is absent;
- unresolved source-authority conflict.

Sol reviews the narrow conflicting evidence only. It does not repeat the full Luna pass. Sol returns a binding resolution or a precise blocked reason. The Luna worker or root coordinator then applies any resulting target-specific repair.

### 6. Duplicate policy

- Identical duplicate with identical allergen semantics: delete the duplicate automatically.
- Equivalent duplicate presentation from the same restaurant/menu scope: collapse to one product and retain presentation/source references.
- Duplicate with different non-allergen metadata: merge the useful metadata automatically.
- Duplicate with conflicting allergen or cross-contact evidence: preserve both evidence records and send only that conflict to Sol.

Duplicates are a catalog-quality issue unless their allergen semantics conflict. They must not trigger shared-parser work.

### 7. Ingredient Intelligence

After the direct-source record is final, recompute Ingredient Intelligence for the target restaurant. Never copy an inferred signal into `allergens` or `mayContain`. Store it only in the `inferred*` fields.

### 8. Terminal validation

A restaurant becomes `codex_verified` when:

- identity and location are confirmed;
- every frozen item is reconciled once;
- the current POC menu catalog is represented;
- duplicate/artifact cleanup is complete;
- all four allergen-matrix searches are recorded;
- direct allergen evidence is preserved with correct authority;
- absent official allergen evidence is explicitly `accurately_unavailable`;
- no unsupported negative claim or unresolved cross-contact conflict remains;
- Ingredient Intelligence has been recomputed after the final catalog repair;
- target-only repair validation passes and the repair is idempotent;
- the ledger, dossier, evidence, and item-check files validate.

No shared-parser review is required for terminal POC verification.

### 9. Audit sample

Every 20th Luna fast-path completion is reviewed by the single Sol reviewer thread. Sol checks identity, menu scope, official-matrix search evidence, and unsupported negative claims. If a sampled restaurant has a material safety error:

1. Pause new claims.
2. Recheck the prior 20 fast-path completions using the narrow failed rule.
3. Tighten the deterministic policy or Luna instructions.
4. Resume only after the sampled failure is repaired.

## Token controls

- Do not run Terra in the POC workflow.
- Do not send a clean Luna result to Sol unless it is the one-in-20 audit sample.
- Do not ask a reviewer to repeat full source discovery.
- Reuse captured source artifacts and hashes.
- Pass only conflicting evidence and affected item keys to Sol.
- Retry schema/format failures once with the validator errors; do not restart research.
- Keep batch size at three and enforce backpressure.
- Do not load unrelated restaurants into any worker context.

## Legacy workflow

`scripts/restaurant-verification-workers.mjs pipeline` and `pilot` implement the retired mandatory Luna -> Terra -> Sol flow. They are blocked unless explicitly invoked with `--allow-legacy-three-tier`. Existing run artifacts remain evidence and may be reused when draining the 40-row backlog.

## Current continuation checkpoint

Batch 59 is complete. The exact frozen targets, commands, expected counts, and
worker allocation for Batch 60 are in
`docs/restaurant-verification-batch-60-handoff.md`. A new coordinator can start
that batch from a fresh task by sending only `batch 60`.
