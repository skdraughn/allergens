# Ingredient Intelligence v1

This directory contains the approved runtime manifest for Ingredient Intelligence.

Source policy:

- Wikidata-derived dish and composite profiles must keep QID/PID provenance. Wikidata structured data is CC0.
- Open Food Facts-derived aliases and allergen vocabulary must keep attribution and ODbL license metadata.
- Import scripts write candidate artifacts for review; only approved entries are copied into `manifest.json`.
- Runtime restaurant refreshes must read this manifest locally and must not call Wikidata or Open Food Facts live.

Future scale path:

- Wikidata can be imported through targeted SPARQL exports for v1, or through the weekly line-readable JSON/RDF dumps for larger offline processing.
- Open Food Facts can be imported through bulk JSONL or tab-separated CSV exports from `https://static.openfoodfacts.org/data/`.
