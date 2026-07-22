# Restaurant Verification Batch Handoff

This is the reusable continuation contract for every verification batch. When
the user sends `batch N`, execute the requested batch without asking them to
restate the workflow and without requiring a `batch-N-handoff.md` file.

## Resolve the batch

1. Parse `N` from the user's message.
2. Find the highest completed batch number under
   `data/restaurant-verification/worker-runs/poc-batch-*` by accepting only run
   directories with a manifest, three terminal results, three closeouts, and
   three terminal ledger rows.
3. Require `N` to be exactly that completed number plus one. If a prior batch
   is genuinely incomplete, finish or reconcile that prior batch; never skip
   ledger rows merely to match the requested label.
4. Validate the ledger with
   `node scripts/restaurant-verification-ledger.mjs validate` and require no
   stale in-progress claims.
5. Freeze the first three `pending` rows in ledger order. Their committed files
   under `data/restaurant-verification/item-checks/` are the baseline item
   packets. The ledger, not a hand-written target list, selects the targets.

The checkpoint committed after Batch 59 has 271 `codex_verified`, 1,224
`pending`, 1,495 total restaurants, and 112,873 frozen baseline items. Its next
three rows are `centrolina-dc`, `chaatwala-herndon-va-dc-metro`, and
`chadwicks-alexandria-va-dc-metro`.

## Worker allocation

- Luna: exactly three lightweight workers, one per restaurant
- Terra: zero workers
- Sol: zero by default; one only for a scheduled one-in-20 sample or an
  unresolved safety-sensitive conflict
- Coordinator: one root task for claims, validation, serialized application,
  closeout, ledger completion, and reporting

Do not assign multiple restaurants to one worker. Do not perform shared-parser
work in this proof-of-concept pipeline.

## Execute the batch

1. Create run ID `poc-batch-NNN-YYYY-MM-DD`, claim only the three frozen rows,
   and write their job packets using the immediately preceding completed run as
   the file-layout template.
2. Dispatch the three Luna workers concurrently. Each verifies identity and
   menu scope, reconciles every frozen item exactly once, removes ordinary
   duplicates directly, and performs all four official allergen-matrix
   searches: restaurant site, official-domain search, linked vendor, and
   targeted web search.
3. If no official matrix exists after all four searches, record
   `accurately_unavailable` and continue. Escalate only unresolved identity,
   scope, official-evidence, cross-contact, source-authority, or unsupported
   negative-claim conflicts.
4. Preserve direct allergen evidence separately from Ingredient Intelligence.
   Recompute inferred ingredient signals after the direct catalog is final and
   never copy inferred values into `allergens` or `mayContain`.
5. Validate each result against the policy, result, risk-gate, source,
   item-check, evidence, and closeout contracts. Retry a formatting failure once
   using only the validator errors.
6. Extend `scripts/apply-batch40-poc.mjs` for the three frozen targets and the
   requested batch number. Apply accepted changes serially in ledger order,
   apply them a second time, and require an idempotent second run.
7. Write canonical dossiers, evidence summaries, item checks, run manifest,
   coordinator results, and closeouts. Mark a ledger row terminal only after all
   gates pass.
8. Run `node --test scripts/restaurant-verification-*.test.mjs`, ledger
   validation, and the distribution, smear, generated-data, and Ingredient
   Intelligence audits. Refresh the human-readable dashboard.
9. Confirm exactly three additional terminal rows, no in-progress claims, and
   that the next pending row follows the completed batch. Report results and
   stop before claiming the following batch.

## Persistence policy

Commit the ledger, all item-check packets, dossiers, evidence summaries,
repairs, run metadata, workflow code, and documentation. Do not commit raw
captures under artifact directories, `data/scraped/`, local agent state, or the
generated application projection at
`src/data/generated/restaurants.generated.json`.
