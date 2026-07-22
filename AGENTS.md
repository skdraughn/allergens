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
