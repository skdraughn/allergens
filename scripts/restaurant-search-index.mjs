const allergenIds = [
  "shellfish",
  "milk",
  "peanut",
  "tree-nut",
  "egg",
  "fish",
  "wheat",
  "soy",
  "sesame",
  "gluten",
  "mustard",
  "sulfites",
];

const chainAliases = {
  mcdonalds: ["mcdonalds", "mcdonald's", "mickey d", "mickey ds", "mickey d's", "mcd"],
  dunkin: ["dunkin", "dunkin donuts", "dunkin' donuts"],
  "burger-king": ["burger king", "bk"],
  "chick-fil-a": ["chick fil a", "chickfila", "chick-fil-a", "cfa"],
  dominos: ["dominos", "domino's", "domino pizza", "dominos pizza"],
  "dairy-queen": ["dairy queen", "dq"],
  kfc: ["kfc", "kentucky fried chicken"],
  "little-caesars": ["little caesars", "little caesar's"],
  arbys: ["arbys", "arby's"],
  zaxbys: ["zaxbys", "zaxby's"],
  "buffalo-wild-wings": ["buffalo wild wings", "bww"],
  "papa-johns": ["papa johns", "papa john's"],
  "jimmy-johns": ["jimmy johns", "jimmy john's"],
  "five-guys": ["five guys"],
  "in-n-out": ["in n out", "in-n-out", "in and out"],
  "pf-changs": ["pf changs", "p.f. changs", "p.f. chang's"],
  "raising-canes": ["raising canes", "raising cane's", "canes", "cane's"],
  "ruths-chris": ["ruths chris", "ruth's chris"],
  "auntie-annes": ["auntie annes", "auntie anne's"],
};

export const nationalLocationId = "national";
export const restaurantSearchIndexVersion = 1;

export function buildRestaurantSearchIndexRows(repository) {
  const rows = [];
  const generatedAt = repository.generatedAt ?? new Date().toISOString();

  for (const restaurant of repository.restaurants ?? []) {
    if (!isIndexableRestaurant(restaurant)) {
      continue;
    }

    const locationId = restaurant.locationId ?? nationalLocationId;
    const meta = createRestaurantMeta(restaurant, locationId, generatedAt);
    rows.push({
      pk: `META#${restaurant.id}#${locationId}`,
      sk: "METADATA",
      ...meta,
    });

    rows.push({
      pk: "POPULAR#GLOBAL",
      sk: rankKey(restaurant.rank, restaurant.id, locationId),
      ...meta,
    });

    for (const token of searchTokensForRestaurant(restaurant)) {
      rows.push({
        pk: `TOKEN#${token}`,
        sk: rankKey(restaurant.rank, restaurant.id, locationId),
        ...meta,
        matchToken: token,
      });
    }

    if (Number.isFinite(restaurant.lat) && Number.isFinite(restaurant.lng)) {
      const geohash = encodeGeohash(restaurant.lat, restaurant.lng, 6);
      rows.push({
        pk: `GEO#${geohash}`,
        sk: rankKey(restaurant.rank, restaurant.id, locationId),
        ...meta,
        geohash,
      });
    }
  }

  return rows;
}

export function normalizeSearchText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function searchTokensForRestaurant(restaurant) {
  const aliases = new Set([
    restaurant.name,
    restaurant.normalizedName,
    restaurant.category,
    ...(restaurant.aliases ?? []),
    ...(chainAliases[restaurant.id] ?? []),
  ]);
  const tokens = new Set();

  for (const alias of aliases) {
    const normalized = normalizeSearchText(alias);

    if (!normalized) {
      continue;
    }

    tokens.add(normalized);

    for (const word of normalized.split(" ")) {
      addPrefixes(tokens, word);
    }

    addPrefixes(tokens, normalized.replace(/\s+/g, ""));
  }

  return Array.from(tokens).filter((token) => token.length > 0).sort();
}

export function compatibilitySummaryForRestaurant(restaurant) {
  const directAllergenItemCounts = Object.fromEntries(allergenIds.map((id) => [id, 0]));
  const directAllergenItemIndexes = Object.fromEntries(allergenIds.map((id) => [id, []]));
  const mayContainAllergenItemCounts = Object.fromEntries(allergenIds.map((id) => [id, 0]));
  const mayContainAllergenItemIndexes = Object.fromEntries(allergenIds.map((id) => [id, []]));
  const unavailableItemIndexes = [];
  let unavailableCount = 0;

  for (const [index, item] of (restaurant.items ?? []).entries()) {
    const unavailable =
      item.allergenSourceType === "unavailable" ||
      (!item.allergenSourceType &&
        (item.allergens ?? []).length === 0 &&
        (item.mayContain ?? []).length === 0);

    if (unavailable) {
      unavailableCount += 1;
      unavailableItemIndexes.push(index);
    }

    for (const allergen of uniqueStrings(item.allergens ?? [])) {
      if (allergen in directAllergenItemCounts) {
        directAllergenItemCounts[allergen] += 1;
        directAllergenItemIndexes[allergen].push(index);
      }
    }

    for (const allergen of uniqueStrings(item.mayContain ?? [])) {
      if (allergen in mayContainAllergenItemCounts) {
        mayContainAllergenItemCounts[allergen] += 1;
        mayContainAllergenItemIndexes[allergen].push(index);
      }
    }
  }

  return {
    directAllergenItemCounts,
    directAllergenItemIndexes,
    mayContainAllergenItemCounts,
    mayContainAllergenItemIndexes,
    officialItemCount:
      restaurant.allergenDataStatus?.officialItemCount ??
      (restaurant.items ?? []).filter((item) => item.allergenSourceType !== "unavailable").length,
    totalItemCount: (restaurant.items ?? []).length,
    unavailableCount,
    unavailableItemIndexes,
  };
}

export function encodeGeohash(latitude, longitude, precision = 6) {
  const base32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let latRange = [-90, 90];
  let lngRange = [-180, 180];
  let hash = "";
  let bit = 0;
  let ch = 0;
  let even = true;

  while (hash.length < precision) {
    const range = even ? lngRange : latRange;
    const value = even ? longitude : latitude;
    const mid = (range[0] + range[1]) / 2;

    if (value >= mid) {
      ch = (ch << 1) + 1;
      range[0] = mid;
    } else {
      ch <<= 1;
      range[1] = mid;
    }

    even = !even;

    if (bit < 4) {
      bit += 1;
    } else {
      hash += base32[ch];
      bit = 0;
      ch = 0;
    }
  }

  return hash;
}

function createRestaurantMeta(restaurant, locationId, generatedAt) {
  return {
    address: restaurant.address ?? null,
    category: restaurant.category ?? "Restaurant",
    city: restaurant.city ?? restaurant.address?.city ?? null,
    compatibilitySummary: compatibilitySummaryForRestaurant(restaurant),
    country: restaurant.country ?? restaurant.address?.country ?? null,
    coveragePercent: restaurant.coveragePercent ?? null,
    coverageStatus: restaurant.coverageStatus ?? null,
    displayAddress: restaurant.displayAddress ?? restaurant.address?.displayAddress ?? null,
    distanceMiles: null,
    guideLabel: restaurant.guideLabel ?? null,
    guideUrl: restaurant.guideUrl ?? null,
    indexVersion: restaurantSearchIndexVersion,
    lat: Number.isFinite(restaurant.lat) ? restaurant.lat : null,
    lng: Number.isFinite(restaurant.lng) ? restaurant.lng : null,
    locationId,
    name: restaurant.name,
    normalizedName: normalizeSearchText(restaurant.name),
    officialItemCount: restaurant.allergenDataStatus?.officialItemCount ?? 0,
    rank: restaurant.rank ?? 9999,
    region: restaurant.region ?? restaurant.address?.region ?? null,
    restaurantId: restaurant.id,
    snapshotGeneratedAt: restaurant.sourceUpdatedAt ?? generatedAt,
    snapshotPath: `restaurant-data/restaurants/${restaurant.id}/latest.json`,
    sourceStatus: restaurant.sourceStatus ?? null,
    sourceUrls: restaurant.sourceUrls ?? [],
    totalItemCount: (restaurant.items ?? []).length,
    type: restaurant.type ?? "chain",
  };
}

function addPrefixes(tokens, value) {
  const normalized = normalizeSearchText(value).replace(/\s+/g, "");

  for (let length = 1; length <= normalized.length; length += 1) {
    tokens.add(normalized.slice(0, length));
  }
}

function isIndexableRestaurant(restaurant) {
  return (
    restaurant &&
    restaurant.id &&
    restaurant.name &&
    Array.isArray(restaurant.items) &&
    restaurant.items.length > 0 &&
    (!restaurant.coverageStatus ||
      restaurant.coverageStatus === "complete" ||
      restaurant.coverageStatus === "kept-previous")
  );
}

function rankKey(rank, restaurantId, locationId) {
  return `${String(rank ?? 9999).padStart(6, "0")}#${restaurantId}#${locationId}`;
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === "string" && value.trim())));
}
