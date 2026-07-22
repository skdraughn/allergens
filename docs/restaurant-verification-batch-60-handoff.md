# Batch 60 Handoff

This file is the binding continuation contract for the next restaurant
verification coordinator. When the user sends `batch 60`, execute this batch
without asking them to restate the workflow.

## Frozen checkpoint

- Completed through: Batch 59
- Ledger total: 1,495 restaurants
- `codex_verified`: 271
- `pending`: 1,224
- In progress: 0
- Frozen baseline menu items: 112,873
- Batch size: 3 restaurants
- Expected after a clean Batch 60: 274 verified and 1,221 pending

Validate these values before claiming work. If they differ, stop and reconcile
the committed ledger rather than silently selecting different targets.

## Batch 60 targets

Process these three restaurants in this order:

1. `centrolina-dc`
   - Location: `penn-quarter-dc`
   - Official domain: `centrolinadc.com`
   - Frozen items: 35
   - Fingerprint: `864c0f7f3880a5e8284035d5283191891dac08a38773fe657eafd0a4c648c025`
2. `chaatwala-herndon-va-dc-metro`
   - Location: `herndon-va`
   - Official domain: `chaatwala.com`
   - Frozen items: 87
   - Fingerprint: `44851455e8d9630aa5723de27f3edd00b49c4fb3b2d830988dc7e002bc6fab32`
3. `chadwicks-alexandria-va-dc-metro`
   - Location: `alexandria-va`
   - Official domain: `chadwicksoldtown.com`
   - Frozen items: 110
   - Fingerprint: `7611ad63b27f59f341d15885e066ae7f9397d973c5cc9fd1058fb873c7363b3f`

## Worker allocation

- Luna: exactly 3 lightweight workers, one per restaurant
- Terra: 0 workers
- Sol: 0 by default; use the single Sol reviewer only for an unresolved
  safety-sensitive conflict or a scheduled one-in-20 sample
- Coordinator: 1 root task, responsible for claims, validation, serialized
  application, closeout, and ledger completion

Do not give one worker multiple restaurants. Do not run shared-parser work.

## Exact execution flow

1. Read `docs/restaurant-verification-plan.md` and validate the ledger with
   `node scripts/restaurant-verification-ledger.mjs validate`.
2. Create run ID `poc-batch-060-2026-07-22`, claim only the three frozen
   targets, and generate their job packets. Use Batch 59's run directory as the
   file-layout template.
3. Dispatch the three Luna workers concurrently. Each worker must verify
   restaurant identity and menu scope, reconcile every frozen menu item,
   remove ordinary duplicates directly, and perform all four official allergen
   matrix searches: restaurant site, official-domain search, linked vendor,
   and targeted web search.
4. If no official allergen matrix is found after all four searches, record
   `accurately_unavailable` and continue. Escalate only unresolved identity,
   scope, official-evidence, cross-contact, or unsupported-negative conflicts.
5. Preserve direct evidence separately from Ingredient Intelligence. After the
   direct catalog is final, recompute inferred ingredient signals; never copy
   inferred values into `allergens` or `mayContain`.
6. Validate every worker result against the policy, result, risk-gate, source,
   item-check, evidence, and closeout schemas. Retry a formatting failure once
   using only the validator errors.
7. Add Batch 60's frozen target metadata to
   `scripts/apply-batch40-poc.mjs`, then apply accepted changes serially in the
   frozen order. Run the application twice and verify the second run is
   idempotent.
8. Write the restaurant dossiers, evidence records, item checks, run manifest,
   coordinator results, and closeout. Complete each ledger row only after all
   terminal gates pass.
9. Run the verification test suite and the distribution, smear, generated-data,
   and ingredient-intelligence audits. Refresh the human-readable dashboard.
10. Confirm the ledger reports 274 verified, 1,221 pending, and no in-progress
    rows. Report Batch 60 results to the user and stop before Batch 61.

## Durable versus local data

The committed source of truth is `data/restaurant-verification/ledger.jsonl`
plus the dossiers, evidence, repairs, item checks, and run metadata under that
directory. `data/restaurant-verification/artifacts/`, `data/scraped/`, and
`src/data/generated/restaurants.generated.json` are local capture/build outputs
and are intentionally excluded from verification checkpoint commits.
