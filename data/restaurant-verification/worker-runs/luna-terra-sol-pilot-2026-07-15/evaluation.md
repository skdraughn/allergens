# Restaurant Worker Pilot Evaluation

Status: **INELIGIBLE**

Run: `luna-terra-sol-pilot-2026-07-15`

Generated: 2026-07-16T14:02:35.258Z

Cohort: 10/10

## Eligibility

- 10 restaurant(s) lack a canonical terminal adjudication.

## Stage reliability

| Stage | Restaurants | Attempts | Runtime failures |
| --- | ---: | ---: | ---: |
| luna | 10 | 27 | 5 |
| terra | 10 | 23 | 10 |
| sol | 10 | 10 | 0 |

## Per-restaurant quality

| Restaurant | Luna frozen | Terra frozen | Luna false-clean | Authority promotions | Unreviewed products | Coordinator-only findings | Route violations |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| Baan Mae | 28/28 | 28/28 | false | 0 | 0 | 0 | 0 |
| Baan Siam | 76/76 | 76/76 | false | 0 | 0 | 0 | 0 |
| Babylon Futbol Cafe | 30/30 | 30/30 | false | 0 | 0 | 0 | 0 |
| Bacchus of Lebanon | 91/91 | 91/91 | false | 0 | 0 | 0 | 0 |
| Badd Pizza | 18/18 | 18/18 | false | 0 | 0 | 0 | 6 |
| Bai Khao Thai | 70/70 | 70/70 | false | 0 | 0 | 0 | 0 |
| Baked & Wired | 194/194 | 194/194 | false | 0 | 0 | 0 | 0 |
| Bakeshop | 16/16 | 16/16 | false | 0 | 0 | 0 | 7 |
| Ballston Local | 127/127 | 127/127 | false | 0 | 0 | 0 | 0 |
| Balos Estiatorio | 108/108 | 108/108 | false | 0 | 0 | 0 | 0 |

## Deterministic routing and escalation

Sol escalations: 10/10

- osm-badd-pizza-2193531310: unreviewed_gate:multi_service
- osm-badd-pizza-2193531310: unreviewed_gate:pdf_or_image
- osm-badd-pizza-2193531310: unreviewed_gate:inaccessible_source
- osm-badd-pizza-2193531310: unreviewed_gate:count_drift
- osm-badd-pizza-2193531310: unreviewed_gate:authority_ambiguity
- osm-badd-pizza-2193531310: unreviewed_gate:cross_contact
- osm-bakeshop-11399205397: unreviewed_gate:pdf_or_image
- osm-bakeshop-11399205397: unreviewed_gate:scope_incomplete
- osm-bakeshop-11399205397: unreviewed_gate:unresolved_surface
- osm-bakeshop-11399205397: unreviewed_gate:current_only
- osm-bakeshop-11399205397: unreviewed_gate:duplicate_presentations
- osm-bakeshop-11399205397: unreviewed_gate:authority_ambiguity
- osm-bakeshop-11399205397: unreviewed_gate:parser_or_repair_finding

## Discovery lineage

- baan-mae-dc: Luna missed 10; Terra added 0; Sol added 10; coordinator-only 0.
- baan-siam-dc: Luna missed 6; Terra added 0; Sol added 6; coordinator-only 0.
- osm-babylon-futbol-9311198934: Luna missed 9; Terra added 0; Sol added 9; coordinator-only 0.
- replacement-bacchus-of-lebanon-bethesda-md: Luna missed 7; Terra added 0; Sol added 7; coordinator-only 0.
- osm-badd-pizza-2193531310: Luna missed 7; Terra added 0; Sol added 7; coordinator-only 0.
- osm-bai-khao-thai-3763902064: Luna missed 9; Terra added 0; Sol added 9; coordinator-only 0.
- baked-and-wired-dc: Luna missed 8; Terra added 0; Sol added 8; coordinator-only 0.
- osm-bakeshop-11399205397: Luna missed 9; Terra added 0; Sol added 9; coordinator-only 0.
- osm-ballston-local-9596339846: Luna missed 10; Terra added 0; Sol added 10; coordinator-only 0.
- balos-estiatorio-dc: Luna missed 7; Terra added 0; Sol added 7; coordinator-only 0.

## Acceptance gates

| Gate | Passed | Actual | Expected |
| --- | --- | ---: | ---: |
| evaluation_eligible | no | false | true (baan-mae-dc, baan-siam-dc, osm-babylon-futbol-9311198934, replacement-bacchus-of-lebanon-bethesda-md, osm-badd-pizza-2193531310, osm-bai-khao-thai-3763902064, baked-and-wired-dc, osm-bakeshop-11399205397, osm-ballston-local-9596339846, balos-estiatorio-dc) |
| exact_model_provenance | no | false | true |
| luna_false_clean_count | not evaluated | — | 0 |
| authority_promotion_count | not evaluated | — | 0 |
| missing_frozen_reconciliation_count | not evaluated | — | 0 |
| duplicate_frozen_reconciliation_count | not evaluated | — | 0 |
| unreviewed_current_product_count | not evaluated | — | 0 |
| coordinator_only_material_finding_count | not evaluated | — | 0 |
| routing_violation_count | not evaluated | — | 0 |
