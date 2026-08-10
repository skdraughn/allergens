# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Restaurant verification continuation

When the user says `batch N` (for any integer `N`), immediately follow
`docs/restaurant-verification-batch-handoff.md` and complete that batch end to
end. Do not require or look for a batch-specific handoff document, and do not
ask the user to restate the workflow. Stop after the requested batch; do not
claim or begin the following batch.

For restaurant verification work, also follow
`docs/restaurant-verification-plan.md`. Treat the ledger and canonical
restaurant records under `data/restaurant-verification/` as the source of
truth. Raw captures and generated application projections are local build
artifacts and must not be committed.

## Opt-in distributed restaurant research

Keep the ordinary `next` and `batch N` workflow unchanged. When the user asks
to start a distributed, five-worker, front, or back restaurant batch, follow
`docs/restaurant-verification-distributed-flow.md` instead.

- "Start the distributed front batch" means run the opt-in `start-front` flow
  with five research workers and monitor it until all five finish.
- "Start the distributed back batch" means run the opt-in `start-back` flow
  with five research workers and monitor it until all five finish.
- On a secondary/back machine, do research only. Never claim or complete the
  canonical ledger, run canonical APPLY, or modify generated/canonical files.
- Reuse the machine's existing allocation file on later requests so each batch
  consumes the next five explicitly allocated rows.
