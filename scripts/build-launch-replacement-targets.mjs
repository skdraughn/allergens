import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const defaultAggregatePath = path.join(
  projectRoot,
  "data/scraped/launch-coverage/aggregate-after-nutritionix-recovery-01/quality-report.json",
);
const defaultCurrentTargetsPath = path.join(
  projectRoot,
  "data/discovery/dc-metro-1200-launch-targets.json",
);
const defaultCandidatePaths = [
  path.join(projectRoot, "data/discovery/dc-metro-places-selected-menuurls.json"),
  path.join(projectRoot, "data/discovery/dc-metro-places-candidates.json"),
];
const defaultOutputPath = path.join(
  projectRoot,
  "data/discovery/dc-metro-launch-replacement-wave-01.json",
);

const excludedHosts = [
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "tripadvisor.com",
  "yelp.com",
  "opentable.com",
  "resy.com",
  "google.com",
  "business.site",
  "edan.io",
  "expireddomains.com",
  "hugedomains.com",
  "godaddysites.com",
  "wixsite.com",
  "marriott.com",
  "sevenrooms.com",
  "hilton.com",
  "hyatt.com",
  "westfield.com",
  "tysonscornercenter.com",
  "visittcl.com",
  "alwharf.com",
];

const excludedTypes = new Set([
  "amphitheatre",
  "amusement_center",
  "clothing_store",
  "department_store",
  "indoor_playground",
  "lodging",
  "marina",
  "movie_theater",
  "performing_arts_theater",
  "playground",
  "shopping_mall",
  "shoe_store",
  "tourist_attraction",
]);

const hardNonRestaurantTypes = new Set([
  "amphitheatre",
  "amusement_center",
  "clothing_store",
  "department_store",
  "hotel",
  "indoor_playground",
  "lodging",
  "marina",
  "movie_theater",
  "performing_arts_theater",
  "playground",
  "shopping_mall",
  "tourist_attraction",
]);

const restaurantPositiveTypes = [
  "restaurant",
  "american_restaurant",
  "asian_restaurant",
  "bakery",
  "bar_and_grill",
  "breakfast_restaurant",
  "brunch_restaurant",
  "cafe",
  "chicken_restaurant",
  "chinese_restaurant",
  "deli",
  "diner",
  "family_restaurant",
  "fast_food_restaurant",
  "fine_dining_restaurant",
  "french_restaurant",
  "greek_restaurant",
  "hamburger_restaurant",
  "indian_restaurant",
  "italian_restaurant",
  "japanese_restaurant",
  "korean_restaurant",
  "latin_american_restaurant",
  "mediterranean_restaurant",
  "mexican_restaurant",
  "middle_eastern_restaurant",
  "pizza_restaurant",
  "ramen_restaurant",
  "sandwich_shop",
  "seafood_restaurant",
  "steak_house",
  "sushi_restaurant",
  "thai_restaurant",
  "vegan_restaurant",
  "vegetarian_restaurant",
  "vietnamese_restaurant",
];

const allowedRegions = new Set(["DC", "MD", "VA"]);
const dcMetroBounds = {
  maxLat: 39.45,
  maxLng: -76.65,
  minLat: 38.25,
  minLng: -77.85,
};

const outsideMetroPattern =
  /\b(?:baltimore|charlottesville|cleveland|columbia\b(?!,?\s*md)|dallas|georgetown\b(?!,?\s*(?:dc|washington))|miami|minneapolis|new york|philadelphia|seattle)\b/i;

const sourceUrlPreferencePatterns = [
  /\/menu\b/i,
  /\/menus\b/i,
  /toasttab\.com/i,
  /getbento\.com/i,
  /popmenu\.com/i,
  /square\.site/i,
  /clover\.com/i,
];

export async function buildLaunchReplacementTargets(rawArgs = process.argv.slice(2)) {
  const args = parseArgs(rawArgs);
  const limit = Number(args.limit ?? 450);
  const aggregatePath = path.resolve(args.aggregate ?? defaultAggregatePath);
  const currentTargetsPath = path.resolve(args.currentTargets ?? defaultCurrentTargetsPath);
  const outputPath = path.resolve(args.output ?? defaultOutputPath);
  const candidatePaths = String(args.candidates ?? defaultCandidatePaths.join(","))
    .split(",")
    .map((entry) => path.resolve(entry.trim()))
    .filter(Boolean);

  const aggregate = await readJson(aggregatePath);
  const currentTargets = await readJson(currentTargetsPath);
  const candidates = uniqueCandidates(
    (await Promise.all(candidatePaths.map(readCandidateRows))).flat(),
  );
  const currentFingerprint = buildCurrentFingerprint({
    aggregate,
    targets: currentTargets.targets ?? [],
  });
  const { selected, skipped } = selectReplacementCandidates({
    candidates,
    currentFingerprint,
    limit,
  });
  const targets = selected.map((candidate, index) =>
    replacementTargetForCandidate(candidate, index),
  );
  const payload = {
    generatedAt: new Date().toISOString(),
    summary: {
      aggregate: path.relative(projectRoot, aggregatePath),
      currentTargets: path.relative(projectRoot, currentTargetsPath),
      candidateInputs: candidatePaths.map((candidatePath) =>
        path.relative(projectRoot, candidatePath),
      ),
      requested: limit,
      selected: targets.length,
      skipped: skipped.length,
      currentPublished: (aggregate.rows ?? []).filter((row) => row.launchStatus === "published").length,
      currentDeduped: (aggregate.rows ?? []).filter((row) => row.launchStatus === "deduped-to-source").length,
      currentNotPublishable: (aggregate.rows ?? []).filter((row) =>
        !["published", "deduped-to-source"].includes(row.launchStatus),
      ).length,
    },
    targets,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(reportPathFor(outputPath), replacementMarkdownReport({ payload, selected, skipped }));

  console.log(JSON.stringify({
    output: path.relative(projectRoot, outputPath),
    report: path.relative(projectRoot, reportPathFor(outputPath)),
    summary: payload.summary,
  }, null, 2));

  return payload;
}

function buildCurrentFingerprint({ aggregate, targets }) {
  const publishedRows = new Set(
    (aggregate.rows ?? [])
      .filter((row) => ["published", "deduped-to-source"].includes(row.launchStatus))
      .map((row) => row.id),
  );
  const allTargetIds = new Set(targets.map((target) => target.id));
  const names = new Set();
  const hosts = new Set();
  const badHosts = new Set();

  for (const target of targets) {
    const nameKey = normalizeName(target.name);
    if (nameKey) {
      names.add(nameKey);
    }

    for (const url of [target.sourceUrl, ...(target.sourceUrls ?? []), ...(target.menuUrls ?? [])]) {
      const host = hostFromUrl(url);
      if (host) {
        hosts.add(host);
      }
    }
  }

  for (const row of aggregate.rows ?? []) {
    const rowHosts = (row.sourceUrls ?? []).map(hostFromUrl).filter(Boolean);
    const nameKey = normalizeName(row.name);
    if (nameKey) {
      names.add(nameKey);
    }

    if (row.launchStatus !== "published" && row.launchStatus !== "deduped-to-source") {
      for (const host of rowHosts) {
        if (host && /(?:facebook|expireddomains|hugedomains|business\.site|edan\.io)/i.test(host)) {
          badHosts.add(host);
        }
      }
    }
  }

  return { allTargetIds, badHosts, hosts, names, publishedRows };
}

function selectReplacementCandidates({ candidates, currentFingerprint, limit }) {
  const skipped = [];
  const selected = [];
  const selectedNames = new Set();
  const selectedHosts = new Set();

  for (const candidate of candidates) {
    const evaluation = evaluateCandidate(candidate, currentFingerprint);

    if (!evaluation.ok) {
      skipped.push({ ...candidate, skipReasons: evaluation.reasons });
      continue;
    }

    const nameKey = normalizeName(candidate.name);
    const host = cleanHost(candidate.host || hostFromUrl(candidate.website));

    if (selectedNames.has(nameKey)) {
      skipped.push({ ...candidate, skipReasons: ["duplicate-selected-name"] });
      continue;
    }

    if (selectedHosts.has(host) && !hasLocationSpecificMenuUrl(candidate)) {
      skipped.push({ ...candidate, skipReasons: ["duplicate-selected-host"] });
      continue;
    }

    selected.push({
      ...candidate,
      launchReplacementScore: scoreCandidate(candidate),
      launchReplacementReasons: evaluation.reasons,
    });
    selectedNames.add(nameKey);
    selectedHosts.add(host);
  }

  selected.sort(
    (a, b) =>
      b.launchReplacementScore - a.launchReplacementScore ||
      Number(b.ratings ?? 0) - Number(a.ratings ?? 0) ||
      String(a.name).localeCompare(String(b.name)),
  );

  return {
    selected: selected.slice(0, limit),
    skipped,
  };
}

function evaluateCandidate(candidate, currentFingerprint) {
  const reasons = [];
  const host = cleanHost(candidate.host || hostFromUrl(candidate.website));
  const nameKey = normalizeName(candidate.name);
  const types = new Set(candidate.types ?? []);
  const parsedArea = areaFromCandidate(candidate);
  const addressText = `${candidate.city ?? ""} ${candidate.region ?? ""} ${candidate.address ?? ""}`;

  if (!candidate.website || !isHttpUrl(candidate.website)) {
    reasons.push("missing-website");
  }

  if (!allowedRegions.has(parsedArea.region)) {
    reasons.push("outside-dc-md-va");
  }

  if (!isInDcMetroBounds(candidate)) {
    reasons.push("outside-dc-metro-bounds");
  }

  if (!/,\s*(?:USA|United States)\s*$/i.test(String(candidate.address ?? ""))) {
    reasons.push("outside-us-address");
  }

  if (outsideMetroPattern.test(addressText)) {
    reasons.push("outside-dc-metro-name-address");
  }

  if (excludedHosts.some((excludedHost) => host === excludedHost || host.endsWith(`.${excludedHost}`))) {
    reasons.push("excluded-host");
  }

  if (currentFingerprint.names.has(nameKey)) {
    reasons.push("already-targeted-name");
  }

  if (currentFingerprint.hosts.has(host) && !hasLocationSpecificMenuUrl(candidate)) {
    reasons.push("already-targeted-host");
  }

  if (currentFingerprint.badHosts.has(host)) {
    reasons.push("known-bad-host");
  }

  if ([...types].some((type) => excludedTypes.has(type)) && !hasRestaurantSpecificType(types)) {
    reasons.push("non-restaurant-place-type");
  }

  if ([...types].some((type) => hardNonRestaurantTypes.has(type)) && !hasStrongFoodBusinessType(types)) {
    reasons.push("hard-non-restaurant-place-type");
  }

  if (!hasRestaurantSpecificType(types)) {
    reasons.push("weak-restaurant-type");
  }

  if (Number(candidate.ratings ?? 0) < 50) {
    reasons.push("low-review-count");
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}

function scoreCandidate(candidate) {
  const types = new Set(candidate.types ?? []);
  const ratings = Number(candidate.ratings ?? 0);
  const rating = Number(candidate.rating ?? 0);
  const menuUrls = candidateMenuUrls(candidate);
  let score = Math.log10(Math.max(1, ratings)) * 120 + rating * 18;

  const area = areaFromCandidate(candidate);

  if (area.region === "DC") {
    score += 35;
  }

  if (["Washington", "Arlington", "Alexandria", "Bethesda", "Silver Spring"].includes(area.city)) {
    score += 12;
  }

  if (hasKnownMenuPlatform(menuUrls)) {
    score += 30;
  }

  if (menuUrls.some((url) => /\/menus?\b/i.test(url))) {
    score += 18;
  }

  if (types.has("bar") || types.has("cocktail_bar") || types.has("wine_bar") || types.has("night_club")) {
    score -= 16;
  }

  if (types.has("event_venue") || types.has("catering_service")) {
    score -= 8;
  }

  return Math.round(score * 10) / 10;
}

function replacementTargetForCandidate(candidate, index) {
  const menuUrls = candidateMenuUrls(candidate);
  const sourceUrl = menuUrls[0] ?? candidate.website;
  const { city, region } = areaFromCandidate(candidate);

  return {
    id: `replacement-${normalizeKey(`${candidate.name}-${city}-${region}`)}`,
    name: candidate.name,
    key: normalizeKey(candidate.name),
    type: "local",
    area: [city, region].filter(Boolean).join(", "),
    bucket: region === "DC" ? "DC" : "DC Metro Replacement",
    cuisine: candidate.category || cuisineFromTypes(candidate.types) || "Restaurant",
    sourceStatus: "new-candidate",
    sourceUrl,
    sourceUrls: menuUrls,
    currentItems: 0,
    officialStatus: "not-found",
    rationale: [
      "Replacement candidate for launch coverage gap.",
      `${candidate.rating ?? "?"} rating / ${candidate.ratings ?? 0} reviews.`,
      `Score ${candidate.launchReplacementScore}.`,
    ].join(" "),
    priority: 500 - index,
    origin: "replacement-candidate",
    placeId: candidate.placeId,
    rating: candidate.rating ?? null,
    ratings: candidate.ratings ?? null,
    address: candidate.address ?? "",
    rank: 20000 + index + 1,
  };
}

function candidateMenuUrls(candidate) {
  const discovered = Array.isArray(candidate.discoveredMenuUrls) ? candidate.discoveredMenuUrls : [];
  const urls = [...discovered, candidate.website]
    .map((url) => typeof url === "string" ? url.trim() : "")
    .filter(isHttpUrl);

  return [...new Set(urls)].sort((a, b) => sourceUrlScore(b) - sourceUrlScore(a));
}

function sourceUrlScore(url) {
  return sourceUrlPreferencePatterns.reduce(
    (score, pattern, index) => score + (pattern.test(url) ? 20 - index : 0),
    0,
  );
}

function hasKnownMenuPlatform(urls) {
  return urls.some((url) => /(?:toasttab|order\.online|olo|clover|square\.site|popmenu|getbento)\./i.test(url));
}

function hasLocationSpecificMenuUrl(candidate) {
  return candidateMenuUrls(candidate).some((url) =>
    /\/(?:locations?|store|stores|menu|menus|order)\//i.test(new URL(url).pathname),
  );
}

function hasRestaurantSpecificType(types) {
  return restaurantPositiveTypes.some((type) => types.has(type));
}

function hasStrongFoodBusinessType(types) {
  return restaurantPositiveTypes
    .filter((type) => type !== "restaurant" && type !== "food")
    .some((type) => types.has(type));
}

function isInDcMetroBounds(candidate) {
  const lat = Number(candidate.lat);
  const lng = Number(candidate.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }

  return (
    lat >= dcMetroBounds.minLat &&
    lat <= dcMetroBounds.maxLat &&
    lng >= dcMetroBounds.minLng &&
    lng <= dcMetroBounds.maxLng
  );
}

function areaFromCandidate(candidate) {
  const parsed = parseUsAddressArea(candidate.address);
  return {
    city: parsed.city || candidate.city || "DC Metro",
    region: parsed.region || candidate.region || "",
  };
}

function parseUsAddressArea(address) {
  const text = String(address ?? "");
  const match = text.match(/,\s*([^,]+),\s*(DC|MD|VA)\s+\d{5}(?:-\d{4})?,\s*(?:USA|United States)\s*$/i);

  if (!match) {
    return { city: "", region: "" };
  }

  return {
    city: titleCase(match[1].trim()),
    region: match[2].toUpperCase(),
  };
}

function cuisineFromTypes(types = []) {
  const type = types.find((entry) => /(?:restaurant|cafe|bakery|deli|diner|shop)$/i.test(entry));
  return type ? titleCase(type.replace(/_/g, " ").replace(/\brestaurant\b/i, "").trim()) : "";
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  const unique = [];

  for (const candidate of candidates) {
    const key = candidate.placeId || `${normalizeName(candidate.name)}:${cleanHost(candidate.host || hostFromUrl(candidate.website))}`;
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(candidate);
  }

  return unique;
}

async function readCandidateRows(filePath) {
  const json = await readJson(filePath);
  return Array.isArray(json) ? json : json.rows ?? json.targets ?? [];
}

function replacementMarkdownReport({ payload, selected, skipped }) {
  const skippedReasons = countBy(skipped.flatMap((candidate) => candidate.skipReasons ?? []));
  const selectedRows = selected.slice(0, 75).map((candidate, index) => {
    const target = payload.targets[index];
    return `| ${index + 1} | ${escapeMd(candidate.name)} | ${escapeMd(target.area)} | ${escapeMd(cleanHost(candidate.host || hostFromUrl(candidate.website)))} | ${candidate.rating ?? ""} | ${candidate.ratings ?? 0} | ${candidate.launchReplacementScore} |`;
  });

  return [
    "# DC Metro Launch Replacement Wave 01",
    "",
    "Generated by `scripts/build-launch-replacement-targets.mjs`.",
    "",
    "## Summary",
    "",
    `- Selected: ${payload.summary.selected}`,
    `- Skipped: ${payload.summary.skipped}`,
    `- Current published direct rows: ${payload.summary.currentPublished}`,
    `- Current deduped rows: ${payload.summary.currentDeduped}`,
    `- Current not-publishable rows: ${payload.summary.currentNotPublishable}`,
    "",
    "## Top Selected Candidates",
    "",
    "| # | Name | Area | Host | Rating | Reviews | Score |",
    "|---:|---|---|---|---:|---:|---:|",
    ...selectedRows,
    "",
    "## Top Skip Reasons",
    "",
    ...Object.entries(skippedReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([reason, count]) => `- ${reason}: ${count}`),
    "",
  ].join("\n");
}

function reportPathFor(outputPath) {
  return outputPath.replace(/\.json$/i, ".md");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function countBy(values) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function normalizeName(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(?:restaurant|cafe|bar|grill|dc|washington|md|va)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanHost(host) {
  return String(host ?? "").toLowerCase().replace(/^www\./, "");
}

function hostFromUrl(url) {
  try {
    return cleanHost(new URL(url).hostname);
  } catch {
    return "";
  }
}

function isHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function titleCase(value) {
  return String(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function escapeMd(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}

function parseArgs(argv) {
  return Object.fromEntries(
    argv
      .filter((arg) => arg.startsWith("--"))
      .map((arg) => {
        const [rawKey, ...rest] = arg.replace(/^--/, "").split("=");
        return [rawKey, rest.join("=") || "true"];
      }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildLaunchReplacementTargets();
}
