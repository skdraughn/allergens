# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Expo development server signing

- Every request to start or restart the Expo development server must use the code-signing private key via `npx expo start --private-key-path <path>`.
- Resolve the key path from `EXPO_UPDATES_PRIVATE_KEY_PATH` first, then from the ignored local fallback `certs/expo-updates/private-key.pem`.
- Before starting Metro, verify that the key file exists. Never start this app's development server unsigned or with anonymous/offline manifest signatures.
- If the signing key is unavailable, stop and tell the user instead of starting Metro.
- Never print, commit, log, or embed private-key contents in commands, reports, QR codes, or project instructions.

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
