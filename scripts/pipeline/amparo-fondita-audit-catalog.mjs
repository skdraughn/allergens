import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  annotateMenuItemWithIngredientIntelligence,
  getDefaultIngredientIntelligenceManifest,
} from "../ingredient-intelligence.mjs";

export const restaurantIdAmparo = "amparo-fondita-dc";

export const sourceUrlsAmparo = Object.freeze({
  home: "https://amparofondita.com/",
  currentTastingPage: "https://amparofondita.com/tasting-menu",
  currentTastingImage: "https://images.squarespace-cdn.com/content/v1/5b18899f70e802e523553734/85b6b732-c126-47fb-98f8-f3a7496660c5/Tasting+Menu+26%27.png",
  linkedToastMenu: "https://order.toasttab.com/online/amparo-fondita-2002-p-street-northwest",
  toastMirror: "https://r.jina.ai/http://order.toasttab.com/online/amparo-fondita-2002-p-street-northwest",
  conflictingSampleMenu: "https://amparofondita.com/menu",
  staleTastingPdf: "https://amparofondita.com/s/Single-Tasting-menu-Template-Dinner-Menu.pdf",
});

const artifactPaths = Object.freeze({
  toastMirror: `data/restaurant-verification/artifacts/${restaurantIdAmparo}/toast-current-menu-mirror.txt`,
  currentTastingFixture: "data/fixtures/amparo-fondita-current-tasting-menu.json",
});

const categoryOrder = [
  "Botanitas",
  "Ensaladas",
  "Clásicos",
  "De Ladito",
  "Postres",
  "Especial",
  "Sides",
  "Amparo's Masa",
  "Barra Fria",
  "Tentempié",
  "Cena",
  "Bebidas",
  "Sake",
  "Cocktails",
];

const canonicalNames = new Map([
  [normalize("Hongos con Shishitos"), "Hongos con Shishito"],
  [normalize("NA Amparo's Marg"), "NA Amparo's Margarita"],
  [normalize("La Picosa"), "La Picosa (Spicy Marg)"],
]);

const officialAllergens = new Map([
  ["Tostaditas de Atún", ["fish"]],
  ["Naranjas de Invierno", ["mustard"]],
  ["Sopesitos", ["milk"]],
  ["Hongos con Shishito", ["milk"]],
  ["Camarones en Mole Coloradito", ["shellfish"]],
  ["Tres Leches", ["egg", "gluten", "milk", "wheat"]],
]);

const allergenOrder = [
  "milk",
  "peanut",
  "tree-nut",
  "egg",
  "fish",
  "shellfish",
  "wheat",
  "gluten",
  "soy",
  "sesame",
  "mustard",
  "sulfites",
];

export async function buildAmparoAuditSnapshot({
  retrievedAt = new Date().toISOString(),
  toastMirrorText,
  tastingFixture,
} = {}) {
  const [resolvedToastText, resolvedTastingFixture, manifest] = await Promise.all([
    toastMirrorText ?? readFile(artifactPaths.toastMirror, "utf8"),
    tastingFixture ?? readFile(artifactPaths.currentTastingFixture, "utf8").then(JSON.parse),
    getDefaultIngredientIntelligenceManifest(),
  ]);
  const toast = extractToastMirrorMenu(resolvedToastText);
  const tasting = resolvedTastingFixture.items.map((item, index) => ({
    presentationId: `official-tasting-${index + 1}`,
    menu: "Current Tasting Menu",
    category: cleanText(item.category),
    name: cleanText(item.name),
    description: cleanText(item.description),
    price: null,
    outOfStock: false,
    isConfigurable: false,
    sourceKind: "restaurant-issued-current-tasting-image",
    sourceUrl: sourceUrlsAmparo.currentTastingImage,
  }));

  const grouped = new Map();
  for (const presentation of [...toast.presentations, ...tasting]) {
    const canonicalName = canonicalizeName(presentation.name);
    const key = normalize(canonicalName);
    const current = grouped.get(key) ?? { name: canonicalName, presentations: [] };
    current.presentations.push({ ...presentation, name: canonicalName });
    grouped.set(key, current);
  }

  const items = [...grouped.values()].map((group) => {
    const officialPresentation = group.presentations.find((entry) =>
      entry.sourceKind === "restaurant-issued-current-tasting-image"
    ) ?? null;
    const toastPresentations = group.presentations.filter((entry) =>
      entry.sourceKind === "restaurant-linked-toast-menu"
    );
    const preferredToast = toastPresentations.find((entry) => entry.description) ?? toastPresentations[0] ?? null;
    const preferred = preferredToast ?? officialPresentation ?? group.presentations[0];
    const preferredDescription = officialPresentation?.description ?? preferred.description ?? null;
    const allergens = orderedAllergens(officialAllergens.get(group.name) ?? []);
    const hasOfficialIngredients = Boolean(officialPresentation && allergens.length);
    const sourceUrls = [
      ...(officialPresentation ? [sourceUrlsAmparo.currentTastingPage, sourceUrlsAmparo.currentTastingImage] : []),
      ...(toastPresentations.length ? [sourceUrlsAmparo.linkedToastMenu] : []),
    ];
    const base = {
      auditItemKey: "",
      id: slugify(group.name),
      name: group.name,
      category: cleanText(preferred.category),
      description: preferredDescription,
      ingredientsText: preferredDescription,
      price: preferred.price,
      imageUrl: null,
      isConfigurable: group.presentations.some((entry) => entry.isConfigurable),
      allergenSourceType: hasOfficialIngredients ? "official-ingredients" : "unavailable",
      allergens,
      mayContain: [],
      sourceType: officialPresentation && toastPresentations.length
        ? "restaurant-issued-tasting-and-linked-ordering-menu"
        : officialPresentation
          ? "reviewed-current-official-image-menu"
          : "reviewed-restaurant-linked-ordering-menu",
      sourceUrls,
      sourceSummary: hasOfficialIngredients
        ? "Amparo Fondita's current on-page tasting-menu image directly supports these positive ingredient or unambiguous formulation signals. It is not a complete allergen matrix and does not establish absence of other allergens or cross-contact."
        : "Amparo Fondita's current linked Toast catalog supports this formulation, but vendor descriptions are not promoted to restaurant-issued allergen claims. Official allergen data remains unavailable, and description clues are kept as separately labeled Ingredient Intelligence.",
      presentationCount: group.presentations.length,
      presentations: group.presentations.map((entry) => ({
        presentationId: entry.presentationId,
        menu: entry.menu,
        category: entry.category,
        price: entry.price,
        outOfStock: entry.outOfStock,
        isConfigurable: entry.isConfigurable,
        sourceKind: entry.sourceKind,
        sourceUrl: entry.sourceUrl,
      })),
      evidence: [
        ...(officialPresentation ? [{
          sourceKind: "reviewed-current-official-image-menu",
          sourceUrl: sourceUrlsAmparo.currentTastingImage,
          text: `${officialPresentation.name}: ${officialPresentation.description}`,
        }] : []),
        ...toastPresentations.map((entry) => ({
          sourceKind: "restaurant-linked-ordering-menu-text",
          sourceUrl: sourceUrlsAmparo.linkedToastMenu,
          text: `${entry.name}${entry.description ? `: ${entry.description}` : ""}${entry.outOfStock ? " [out of stock]" : ""}`,
        })),
      ],
    };
    return correctInference(
      annotateMenuItemWithIngredientIntelligence(base, { manifest }),
    );
  }).sort((left, right) =>
    categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category) ||
    left.name.localeCompare(right.name),
  );

  items.forEach((item, index) => {
    item.auditItemKey = `${index + 1}:${item.id}`;
  });

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAmparo,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAmparo),
    currentStore: toast.store,
    currentMenuCount: toast.menuCount,
    currentPresentationCount: toast.presentations.length + tasting.length,
    toastPresentationCount: toast.presentations.length,
    tastingPresentationCount: tasting.length,
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    officialIngredientCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    duplicatePresentationCount: toast.presentations.length - new Set(toast.presentations.map((item) => normalize(item.name))).size,
    orphanTextBlocks: toast.orphanTextBlocks,
    itemNameFingerprint: createHash("sha256")
      .update(items.map((item) => normalize(item.name)).sort().join("\n"))
      .digest("hex"),
    sourceWarning: "The current restaurant site links a live Toast catalog and displays a current winter tasting-menu image. Its tasting-page download still resolves to an older, visually contradictory six-course PDF that seeded the frozen app rows, so the PDF is quarantined as stale. A separate unlinked /menu page contains a conflicting sample image set and is retained only as source-history evidence. The working catalog uses all published Toast presentations plus the current on-page tasting courses. Toast descriptions remain restaurant-linked vendor evidence and are never promoted to official allergen claims; only six current on-page tasting formulations have restaurant-issued positive ingredient signals. No current allergen matrix or item-level cross-contact disclosure was found, and every may-contain value remains empty.",
    items,
  };
}

export function extractToastMirrorMenu(text) {
  const lines = String(text).split(/\r?\n/);
  let menu = null;
  let category = null;
  const presentations = [];
  const orphanTextBlocks = [];
  for (const line of lines) {
    const menuMatch = line.match(/^## (Dinner|Amparo's Masa|Bar)\s*$/);
    if (menuMatch) {
      menu = menuMatch[1];
      category = menu === "Amparo's Masa" ? "Amparo's Masa" : null;
      continue;
    }
    const categoryMatch = line.match(/^### (?!\[)(.+?)\s*$/);
    if (categoryMatch && menu) {
      category = cleanText(categoryMatch[1]);
      continue;
    }
    const itemMatch = line.match(/^\*\s+###\s+\[(.+?)\]\((https?:\/\/[^)]+\/item-[^)]+)\)\s*$/);
    if (itemMatch) {
      if (!menu || !category) throw new Error(`Toast item without menu/category: ${line}`);
      const parsed = splitToastItemLabel(itemMatch[1], itemMatch[2]);
      presentations.push({
        ...parsed,
        menu,
        category,
        sourceKind: "restaurant-linked-toast-menu",
        sourceUrl: sourceUrlsAmparo.linkedToastMenu,
      });
      continue;
    }
    if (menu && category && line.trim() && !line.startsWith("#") && !line.startsWith("*") &&
        !line.startsWith("[") && !line.startsWith("!") && !/^(Delivery|Pickup|Search|Schedule|Only accepting)/.test(line)) {
      const cleaned = cleanText(line);
      if (cleaned && /[a-z]/i.test(cleaned) && !/^Manage your consent/i.test(cleaned)) {
        orphanTextBlocks.push({ menu, category, text: cleaned });
      }
    }
  }
  if (!presentations.length) throw new Error("No Toast item presentations parsed");
  const addressMatch = text.match(/## Amparo Fondita 2002 P Street Northwest\s+\n\s*2002 P Street Northwest, Washington, DC/);
  if (!addressMatch) throw new Error("Toast mirror does not match Amparo Fondita's address");
  return {
    store: {
      name: "Amparo Fondita",
      address: "2002 P Street Northwest, Washington, DC 20036",
    },
    menuCount: new Set(presentations.map((item) => item.menu)).size,
    presentations,
    orphanTextBlocks: deduplicateOrphanBlocks(orphanTextBlocks),
  };
}

export function splitToastItemLabel(label, url) {
  const presentationId = url.match(/_([0-9a-f-]{36})$/i)?.[1];
  const slug = url.match(/\/item-(.+?)_[0-9a-f-]{36}$/i)?.[1];
  if (!presentationId || !slug) throw new Error(`Invalid Toast item URL: ${url}`);
  const outOfStock = /\s+OUT OF STOCK(?=\s+\$|$)/i.test(label);
  let content = cleanText(label.replace(/\s+OUT OF STOCK(?=\s+\$|$)/i, ""));
  const priceMatch = content.match(/\s+(\$[0-9]+(?:\.[0-9]{2})?)(\+)?$/);
  const price = priceMatch?.[1] ?? null;
  const isConfigurable = Boolean(priceMatch?.[2]);
  if (priceMatch) content = cleanText(content.slice(0, priceMatch.index));
  const target = compactNormalize(slug);
  const boundaries = [];
  for (let index = 1; index <= content.length; index += 1) {
    if (index < content.length && !/\s/.test(content[index])) continue;
    const candidate = compactNormalize(content.slice(0, index));
    if (Math.abs(candidate.length - target.length) > 1) continue;
    const distance = levenshtein(candidate, target);
    if (distance <= 1) boundaries.push({ index, distance });
  }
  boundaries.sort((left, right) => left.distance - right.distance || left.index - right.index);
  const boundary = boundaries[0]?.index;
  if (!boundary) throw new Error(`Could not split Toast item label '${label}' from slug '${slug}'`);
  const name = cleanText(content.slice(0, boundary));
  const description = cleanText(content.slice(boundary)) || null;
  return {
    presentationId,
    name,
    description,
    price,
    outOfStock,
    isConfigurable,
  };
}

function correctInference(item) {
  if (item.name === "Arrachera en Mole Coloradito") {
    return inferenceOverride(item, {
      mentions: [],
      ingredients: [],
      signals: [],
      questions: [
        "What ingredients and preparation surfaces are used for the mole coloradito and papas fundidas?",
      ],
      summary: "Niman Ranch is the beef producer's name, not ranch dressing; the vendor description does not support an egg or milk signal.",
    });
  }
  if (item.name === "Chile Relleno") {
    return inferenceOverride(item, {
      mentions: [
        menuMention("egg", "egg", "egg"),
        menuMention("cheese", "cheese", "chihuahua cheese"),
      ],
      ingredients: ["egg", "cheese"],
      signals: [
        signal("egg", "high", ["menu:egg", "ingredient:egg"]),
        signal("milk", "high", ["menu:chihuahua_cheese", "ingredient:cheese"]),
      ],
      questions: ["Is any wheat flour used to dust the poblano before the explicitly egg-based batter?"],
      summary: "The vendor description directly names egg batter and Chihuahua cheese. 'Battered' is not separately treated as wheat when the batter is explicitly described as egg-based.",
    });
  }
  if (item.name === "Queso Frito") {
    return inferenceOverride(item, {
      mentions: [
        menuMention("cheese", "cheese", "oaxaca cheese curds"),
        menuMention("cream", "cream", "crema verde"),
      ],
      ingredients: ["cheese", "cream", "probable-panko-breadcrumbs"],
      signals: [
        signal("milk", "high", ["menu:oaxaca_cheese", "menu:crema", "ingredient:cheese"]),
        signal("wheat", "medium", ["menu:anko_crusted", "question:probable_panko"]),
        signal("gluten", "medium", ["menu:anko_crusted", "question:probable_panko"]),
      ],
      questions: ["Does the source's truncated 'anko-crusted' wording mean wheat-based panko?"],
      summary: "Oaxaca cheese curds and crema support milk. The ordering text appears to truncate 'panko' to 'anko,' so wheat and gluten remain medium-confidence questions rather than official claims.",
    });
  }
  if (item.name === "Horchata") {
    return inferenceOverride(item, {
      mentions: [],
      ingredients: ["rice", "oat-milk", "lemon"],
      signals: [],
      questions: ["Which oat-milk brand is used, and does it carry a gluten cross-contact statement?"],
      summary: "The description says oat milk, not dairy milk; no milk allergen signal is inferred.",
    });
  }
  if (item.name === "Quesadilla de Maiz") {
    return inferenceOverride(item, {
      mentions: [menuMention("cheese", "cheese", "quesillo")],
      ingredients: ["cheese"],
      signals: [signal("milk", "high", ["menu:quesillo", "ingredient:cheese"])],
      questions: [],
      summary: "The restaurant-linked description directly names quesillo, supporting a high-confidence milk cue while remaining non-official evidence.",
    });
  }
  const translatedSeafood = {
    "Lenguado Verde": ["fish", "lenguado", "sole/flounder"],
    "Pescadillas": ["fish", "pescadillas", "fish"],
    "Cuello de Jurel": ["fish", "jurel", "jack mackerel"],
    "Tostada de Callo de Hacha": ["shellfish", "callo de hacha", "scallop"],
    "Jaiba Tacos": ["shellfish", "jaiba", "crab"],
  }[item.name];
  if (translatedSeafood) {
    const [allergen, sourceText, translation] = translatedSeafood;
    return inferenceOverride(item, {
      mentions: [menuMention(translation, translation, sourceText, "name")],
      ingredients: [translation],
      signals: [signal(allergen, "high", [`menu:${normalize(sourceText).replace(/ /g, "_")}`, `translation:${normalize(translation).replace(/ /g, "_")}`])],
      questions: [],
      summary: `The Spanish item name directly denotes ${translation}, supporting a high-confidence ${allergen} cue while remaining non-official evidence.`,
    });
  }
  return item;
}

function inferenceOverride(item, { mentions, ingredients, signals, questions, summary }) {
  return {
    ...item,
    extractedIngredientMentions: mentions,
    inferredIngredients: ingredients,
    inferredAllergenSignals: signals,
    inferenceQuestions: questions,
    inferenceSummary: summary,
    inferenceVersion: "restaurant-menu-review-2026-07-15",
  };
}

function menuMention(ingredientId, label, text, sourceField = "description") {
  return { ingredientId, label, sourceField, text };
}

function signal(id, confidence, evidence) {
  return { id, c: confidence, e: evidence };
}

function deduplicateOrphanBlocks(blocks) {
  const seen = new Set();
  return blocks.filter((block) => {
    const key = `${block.menu}|${block.category}|${block.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalizeName(value) {
  const cleaned = cleanText(value);
  return canonicalNames.get(normalize(cleaned)) ?? cleaned;
}

function orderedAllergens(values) {
  return [...new Set(values)].sort(
    (left, right) => allergenOrder.indexOf(left) - allergenOrder.indexOf(right),
  );
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactNormalize(value) {
  return normalize(value).replace(/\s+/g, "");
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

function levenshtein(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const outputPath = path.resolve(
    `data/restaurant-verification/repairs/${restaurantIdAmparo}/corrected-menu.json`,
  );
  const snapshot = await buildAmparoAuditSnapshot();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    outputPath: path.relative(process.cwd(), outputPath),
    itemCount: snapshot.itemCount,
    currentPresentationCount: snapshot.currentPresentationCount,
    categoryCount: snapshot.categoryCount,
    officialIngredientCount: snapshot.officialIngredientCount,
    unavailableAllergenCount: snapshot.unavailableAllergenCount,
    orphanTextBlockCount: snapshot.orphanTextBlocks.length,
  }, null, 2));
}
