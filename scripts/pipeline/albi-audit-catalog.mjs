import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAlbi = "albi-dc";
export const sourceUrlsAlbi = Object.freeze({
  menu: "https://www.albidc.com/menu",
  faq: "https://www.albidc.com/faq",
  dinner: "https://albimenu.s3.us-east-1.amazonaws.com/Albi_Menu_Dinner.pdf",
  sweets: "https://albimenu.s3.us-east-1.amazonaws.com/Albi_Sweets.pdf",
});

const dinnerRows = [
  row("Dinner — Sofra", "SOFRA", "Allow our chefs to curate a spontaneous, five-course exploration of Palestinian cooking", [], { isConfigurable: true }),
  row("Dinner — Snacks", "SFEEHA", "wood-fired lamb meat pies with a dollop of toum & squeeze of lemon", ["wheat", "gluten"]),
  row("Dinner — Snacks", "OYSTER", "embered over coals in arak butter & trout roe", ["milk", "fish", "shellfish"]),
  row("Dinner — Snacks", "CRISPY KIBBEH", "smoky soujek with pine nuts and spring onion labne", ["milk", "tree-nut", "wheat", "gluten"]),
  row("Dinner — Snacks", "ARAYES", "english pea falafel, cherry tomato jibne and green shatta labne", ["milk", "wheat", "gluten"]),
  row("Dinner — Snacks", "JERICHO DATES", "blistered with ras el hanout and brown butter", ["milk"]),
  row("Dinner — Kibbeh Naya", "YELLOWFIN TUNA", "served with garden goodies, ferments, a lot of mint, sumac onion and pickles", ["fish"]),
  row("Dinner — Kibbeh Naya", "SMOKED PEA", "served with garden goodies, ferments, a lot of mint, sumac onion and pickles", []),
  row("Dinner — Khubz +", "MUSHROOMS LIGHTLY SMOKED", "on hummus with confit egg yolk & black garlic; served with wood-fired potato pita", ["egg", "wheat", "gluten"], { aliases: ["MUSHROOMS LIGHTLY SMOKED on hummus"] }),
  row("Dinner — Khubz +", "SMOKED GOAT AWARMA", "on hummus with scallion, date molasses & red shatta; served with wood-fired potato pita", ["wheat", "gluten"], { aliases: ["SMOKED GOAT AWARMA on hummus"] }),
  row("Dinner — Khubz +", "FUL MEDAMES", "on hummus; charred fava bean, green tomato, ramps & tatbili; served with wood-fired potato pita", ["wheat", "gluten"], { aliases: ["FUL MEDAMES on hummus"] }),
  row("Dinner — Khubz +", "LABNE TABAT", "on spring onion jam, rose macerated cherries, pistachios & amba; served with wood-fired potato pita", ["milk", "tree-nut", "wheat", "gluten"]),
  row("Dinner — Mezze", "SALATA ARABIYA", "little gems dressed with citrus honey, spring pea tahini & Pipe Dreams goat curd", ["milk", "sesame"]),
  row("Dinner — Mezze", "FATTOUSH", "heirloom tomato, sweet cherry, cucumber, crunchy pita, smoked feta, red shatta labne + lots of mint and basil", ["milk", "wheat", "gluten"]),
  row("Dinner — Mezze", "BATATA HARRA", "dusted in shawarma spices with toum", []),
  row("Dinner — Mezze", "KOUSA MAHSHI", "summer squash stuffed with MD crab, shrimp & aromatic rice, crab fat labne + soujek", ["milk", "shellfish"]),
  row("Dinner — Mezze", "SHISH BARAK", "tiny lamb dumplings with chanterelles, vadouvan & glazed garlic yogurt", ["milk", "wheat", "gluten"]),
  row("Dinner — Mezze", "WARAK DAWALI", "stuffed grapeleaves with barbeque’d lamb belly + neck, burnt cinnamon & tomato molasses", []),
  row("Dinner — Mezze", "GAMBARI", "prawn embered over coals with tomatillo & fennel daqqa, cucumber yogurt", ["milk", "shellfish"]),
  row("Dinner — Mezze", "WOLFE RANCH QUAIL", "bbq’d with strawberry molasses, green tomato matbucha, charred brassica labne and early summer salata", ["milk"]),
  row("Dinner — Mashawi", "TROUT STEAMED IN GRAPE LEAVES", "tatbili oil, preserved citrus & crab fat tartoor; MD crab tabouli with all kinds of spring peas", ["fish", "shellfish"]),
  row("Dinner — Mashawi", "BBQ’D LAMB KEBABS", "loin & belly shish marinated in dill yogurt on herb tahini; shaved summer squash, fermented chili honey; cinnamon stick kefta", ["milk", "sesame"]),
  row("Dinner — Mashawi", "SLOW COOKED LONG RIB", "lacquered in tomato molasses, 7 spice and burnt shallot; bazella (smoked peas) & sity’s butter rice", ["milk"]),
  row("Dinner — Mashawi", "MAQLUBA", "softshell crab upside down rice with sprouting brassica & crab fat yogurt; crab dagga gazawiya; smashed tomatillo, dill seed & chilis", ["milk", "shellfish"]),
];

const sweetsRows = [
  row("Sweets — Alhalwaa", "KNAFEH", "floral syrup, brown butter, pistachio + mish mish sorbet", ["milk", "tree-nut", "wheat", "gluten"]),
  row("Sweets — Alhalwaa", "HALAWA BAR", "tahini labne semifreddo, halawa, chocolate + sesame cocoa nib tuile", ["milk", "sesame"]),
  row("Sweets — Alhalwaa", "MAHALABIYA", "toasted rice milk pudding, puffed rice, rhubarb sorbet + strawberry granita", ["milk"]),
  row("Sweets — Soft Serve", "LABNE", "pomegranate molasses, sea salt + Palestinian olive oil", ["milk"]),
  row("Sweets — Soft Serve", "STRAWBERRY", "rose + arak", []),
  row("Sweets — Soft Serve", "TWIST", "sorghum chocolate + ras el hanout shortbread", ["wheat", "gluten"]),
  row("Sweets — Soft Serve", "AFFOGATO", "chocolate ice cream, almond + Arabic coffee", ["milk", "tree-nut"]),
  row("Sweets — Small Bites", "Baklawa", "cinnamon + walnut", ["tree-nut", "wheat", "gluten"]),
  row("Sweets — Small Bites", "Turkish Delight", "lemon + sumac", []),
  row("Sweets — Small Bites", "Ma’amoul", "date + rose", ["wheat", "gluten"]),
  row("Sweets — Small Bites", "Qatayef", "rose + candied hazelnut", ["tree-nut", "wheat", "gluten"]),
  row("Sweets — Small Bites", "Namoura", "coconut + almond", ["tree-nut", "wheat", "gluten"]),
  row("Sweets — Hot Tea", "BLACK TEA", "sunstone: cocoa, apricot", []),
  row("Sweets — Hot Tea", "GREEN TEA", "morning mist: honey, white pepper", []),
  row("Sweets — Hot Tea", "HERBAL TEA (CAFFEINE FREE)", "choice of fresh mint leaf, malabar (ginger, turmeric & licorice), or chamomile", [], { isConfigurable: true }),
  row("Sweets — Qahwah", "‘TRADITIONAL’ SERVICE", "brewed in ibrik over flame; served with cocoa nib halawa", ["sesame"]),
  row("Sweets — Qahwah", "ARABIC PRESS", "somewhere between a dallah & French press", []),
];

export function buildAlbiAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const items = [...dinnerRows, ...sweetsRows].map((sourceRow, index) => {
    const menuUrl = sourceRow.category.startsWith("Dinner") ? sourceUrlsAlbi.dinner : sourceUrlsAlbi.sweets;
    return {
      auditItemKey: `${index + 1}:${slugify(sourceRow.name)}`,
      id: slugify(sourceRow.name),
      name: sourceRow.name,
      category: sourceRow.category,
      description: sourceRow.description,
      ingredientsText: sourceRow.description,
      imageUrl: null,
      isConfigurable: Boolean(sourceRow.isConfigurable),
      aliases: sourceRow.aliases ?? [],
      presentations: [{ category: sourceRow.category, sourceName: sourceRow.name, sourceUrl: menuUrl }],
      sourceUrls: [menuUrl, sourceUrlsAlbi.faq],
      sourceType: "restaurant-issued-menu-pdf+official-faq",
      allergens: orderedAllergens(sourceRow.allergens),
      mayContain: ["sesame"],
      allergenSourceType: sourceRow.allergens.length > 0 ? "official-ingredients" : "official-global-cross-contact-note",
      sourceSummary: "Albi's current menu names selected fixed ingredients but is not a complete allergen matrix. Its FAQ says the kitchen cannot guarantee an allergen-free environment and cannot accommodate sesame sensitivities; sesame is therefore represented as a global may-contain caution, not a fixed ingredient or a negative safety claim.",
      evidence: [
        { sourceKind: "restaurant-issued-menu-text", sourceUrl: menuUrl, text: `${sourceRow.name}: ${sourceRow.description}` },
        { sourceKind: "restaurant-issued-global-cross-contact-note", sourceUrl: sourceUrlsAlbi.faq, text: "Due to the nature of our kitchen, we cannot guarantee an allergen-free environment. Unfortunately, we are unable to accommodate certain sensitivities such as allium (garlic and onion), nightshades (including tomatoes and peppers), and sesame." },
      ],
    };
  });

  const categoryCount = new Set(items.map((item) => item.category)).size;
  const ingredientSignalCount = items.filter((item) => item.allergenSourceType === "official-ingredients").length;
  const crossContactOnlyCount = items.filter((item) => item.allergenSourceType === "official-global-cross-contact-note").length;
  if (items.length !== 41 || categoryCount !== 11 || ingredientSignalCount !== 31 || crossContactOnlyCount !== 10 || new Set(items.map((item) => item.id)).size !== 41) {
    throw new Error(`Albi current manifest changed: ${items.length} items, ${categoryCount} categories, ${ingredientSignalCount} fixed-positive, ${crossContactOnlyCount} cross-contact-only.`);
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdAlbi,
    retrievedAt,
    sourceUrls: Object.values(sourceUrlsAlbi),
    presentationCount: items.length,
    itemCount: items.length,
    categoryCount,
    ingredientSignalCount,
    crossContactOnlyCount,
    unavailableAllergenCount: 0,
    sourceWarning: "The current official dinner and sweets PDFs publish selected fixed menu text, not recipes or an allergen matrix. Positive contains claims use direct named components and mandatory named food formats only. The FAQ's inability to accommodate sesame sensitivity is retained as global may-contain sesame; the broader no-guarantee statement is not expanded into invented may-contain claims for every allergen.",
    items,
  };
}

function row(category, name, description, allergens, options = {}) {
  return { category, name, description, allergens, ...options };
}

function slugify(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const allergenOrder = ["milk", "egg", "peanut", "tree-nut", "wheat", "gluten", "fish", "shellfish", "soy", "sesame", "mustard"];
function orderedAllergens(values) {
  const found = new Set(values);
  return allergenOrder.filter((allergen) => found.has(allergen));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = buildAlbiAuditSnapshot();
  const outputDir = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAlbi}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "corrected-menu.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({
    itemCount: snapshot.itemCount,
    categoryCount: snapshot.categoryCount,
    ingredientSignalCount: snapshot.ingredientSignalCount,
    crossContactOnlyCount: snapshot.crossContactOnlyCount,
  }, null, 2));
}
