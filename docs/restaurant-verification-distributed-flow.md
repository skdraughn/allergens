# Distributed Restaurant Verification Flow

This is an opt-in research-only workflow. It does not replace or modify the
existing three-worker single-machine batch handoff.

## Safety model

- The canonical ledger remains authoritative and is written only by the primary
  integration machine.
- A secondary machine receives an explicit allocation containing restaurant
  IDs and frozen baseline fingerprints.
- The secondary machine may run at most five Luna-low research workers.
- Secondary workers write only isolated distributed-run results and logs.
- Canonical APPLY, closeout, ledger transitions, generated-data rebuilds, and
  global audits remain serialized on the primary machine.
- Imports are rejected when a restaurant is no longer pending or its baseline
  fingerprint has changed.

## Secondary machine: backward allocation

Both machines must begin from the same repository/ledger snapshot. On the
secondary machine, run:

```bash
node scripts/restaurant-verification-distributed.mjs start-back \
  --machine=machine-b \
  --allocation=data/restaurant-verification/allocations/machine-b-back.json \
  --count=100 \
  --workers=5
```

This reserves the last 100 pending rows in a local allocation and launches the
first five research jobs. Re-run the same command to process the next five.
It does not claim or complete rows in the canonical ledger.

While workers run, the coordinator prints a heartbeat every 15 seconds with
each restaurant's latest research milestone and log size. Each worker also
writes a durable status file under the run's `status/` directory. Final output
distinguishes `ready_for_verification`, `needs_luna_fix`, `needs_sol_review`,
and `failed`; a valid research file is no longer presented as though every
downstream step were finished.

The coordinator automatically continues every nonterminal research lane:

- validation or traceability failures receive one focused Luna correction;
- mechanical catalog routes receive a Luna catalog-fix pass;
- safety conflicts enter the single serialized Sol-medium review lane;
- a Sol resolution that still requires mechanical cleanup returns to Luna;
- clean results stop at `awaiting_serialized_apply`.

Follow-ups are capped at four transitions per restaurant. Exhausting that cap,
an unresolvable Sol decision, or a worker failure becomes an explicit blocked
or failed terminal state. On both machines these follow-ups remain isolated:
they write only run results, reviews, status, and logs. Canonical APPLY and
ledger closeout remain serialized on the primary machine.

The primary machine can use the same isolated five-worker research flow from
the front of the ledger:

```bash
node scripts/restaurant-verification-distributed.mjs start-front \
  --machine=machine-a \
  --allocation=data/restaurant-verification/allocations/machine-a-front.json \
  --count=100 \
  --workers=5
```

Inspect or re-audit any run at any time:

```bash
node scripts/restaurant-verification-distributed.mjs status \
  --run=<distributed-run-id>
```

The audit reports product, source, menu-surface, inspected-URL, and matrix
evidence counts, the policy-selected next lane, and any traceability warnings.
It is safe and read-only.

Export a completed run:

```bash
node scripts/restaurant-verification-distributed.mjs export \
  --allocation=data/restaurant-verification/allocations/machine-b-back.json \
  --run=<distributed-run-id> \
  --output=tmp/<distributed-run-id>-export
```

Transfer that export directory to the primary machine.

## Primary machine: verify and import

First perform a read-only verification:

```bash
node scripts/restaurant-verification-distributed.mjs verify-import \
  --bundle=/path/to/transferred/export
```

Then persist the verified research bundle under
`data/restaurant-verification/distributed-imports/`:

```bash
node scripts/restaurant-verification-distributed.mjs import \
  --bundle=/path/to/transferred/export
```

Importing does not apply results or update the ledger. The primary coordinator
must still validate and apply restaurants serially in canonical ledger order.

## Returning to the original flow

Use the ordinary `next` request or existing batch commands. Distributed
allocations and runs live in separate directories and are ignored by the
single-machine workflow.
