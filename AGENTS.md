# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Restaurant verification continuation

When the user says `batch 60`, immediately follow
`docs/restaurant-verification-batch-60-handoff.md` and complete Batch 60 end to
end. Do not ask the user to restate the workflow. Stop after Batch 60; do not
claim or begin Batch 61.

For restaurant verification work, also follow
`docs/restaurant-verification-plan.md`. Treat the ledger and canonical
restaurant records under `data/restaurant-verification/` as the source of
truth. Raw captures and generated application projections are local build
artifacts and must not be committed.
