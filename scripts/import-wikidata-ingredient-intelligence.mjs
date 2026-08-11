import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const endpoint = "https://query.wikidata.org/sparql";
const defaultOutputPath = "data/ingredient-intelligence/v1/candidates/wikidata-candidates.json";

const query = `
SELECT ?item ?itemLabel ?itemAltLabel ?ingredient ?ingredientLabel WHERE {
  VALUES ?item {
    wd:Q9896
    wd:Q283231
    wd:Q23930012
    wd:Q275508
    wd:Q5096312
  }
  OPTIONAL { ?item wdt:P186 ?ingredient. }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en".
    ?item rdfs:label ?itemLabel.
    ?ingredient rdfs:label ?ingredientLabel.
    ?item skos:altLabel ?itemAltLabel.
  }
}
`;

const outputPath = path.resolve(process.argv[2] ?? defaultOutputPath);
const url = new URL(endpoint);
url.searchParams.set("format", "json");
url.searchParams.set("query", query);

const response = await fetch(url, {
  headers: {
    "User-Agent": "allergy-app-ingredient-intelligence/1.0 (Wikidata candidate importer)",
  },
});

if (!response.ok) {
  throw new Error(`Wikidata query failed: ${response.status} ${response.statusText}`);
}

const payload = await response.json();
const candidatesByQid = new Map();

for (const binding of payload.results?.bindings ?? []) {
  const qid = entityId(binding.item?.value);

  if (!qid) {
    continue;
  }

  const candidate = candidatesByQid.get(qid) ?? {
    id: qid,
    label: binding.itemLabel?.value ?? qid,
    aliases: [],
    ingredients: [],
    provenance: [{ source: "wikidata", qid, pid: "P186" }],
  };
  const alias = binding.itemAltLabel?.value;
  const ingredientQid = entityId(binding.ingredient?.value);

  if (alias && !candidate.aliases.includes(alias)) {
    candidate.aliases.push(alias);
  }

  if (ingredientQid) {
    candidate.ingredients.push({
      qid: ingredientQid,
      label: binding.ingredientLabel?.value ?? ingredientQid,
    });
  }

  candidatesByQid.set(qid, candidate);
}

const artifact = {
  generatedAt: new Date().toISOString(),
  reviewStatus: "candidate-only",
  source: {
    id: "wikidata",
    license: "CC0-1.0",
    query,
    url: endpoint,
  },
  candidates: Array.from(candidatesByQid.values()),
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`Wrote Wikidata candidates to ${outputPath}`);

function entityId(value) {
  return String(value ?? "").match(/\/entity\/(Q\d+)$/)?.[1] ?? null;
}
