import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const sourceUrls9292 = Object.freeze({
  listing: "https://9292-korean-bbq.placejoys.com/menu",
  primaryMenuPhoto: "https://cdn.placejoys.com/7885-oy-img-menu-2.jpg",
  lunchMenuPhoto: "https://cdn.placejoys.com/7885-oy-img-menu-3.jpg",
  gopchangMenuPhoto: "https://cdn.placejoys.com/7885-oy-img-menu-1.jpg",
});

export const auditRetrievedAt9292 = "2026-07-14T18:42:39.356Z";

const primaryRows = [
  ...names("Beef", [
    "Marinated Beef Short Rib", "Prime Rib Eye", "Prime Rib", "Fresh Beef Short Rib",
    "Seasoned Beef Prime Rib", "Hand Rub Seasoned Steak", "Beef Bulgogi", "Short Rib",
    "Prime Beef Brisket", "Beef Tartare",
  ]),
  ...names("Chicken", [
    "Spicy Chicken", "Soy Sauce Marinated Chicken", "Garlic Pepper Chicken",
    "Lemon Pepper Chicken", "Onion Garlic Marinated Chicken",
  ]),
  ...names("Pork", [
    "Pork Jowl", "Seasoned Pork Short Ribs", "Thick-Cut Pork Belly", "Paper Thin Pork Belly",
    "Pork Neck", "Garlic Pepper Pork Neck", "Spicy Pork Belly", "Pork Belly",
    "Bean Paste Pork Belly",
  ]),
  ...names("Seafood", ["Shrimp", "Grilled Squid"]),
  ["Combinations", "9292 A Combo", "Serves 2-3: prime rib eye, marinated beef short rib, prime beef brisket, beef bulgogi, soy sauce marinated chicken, spicy chicken, and soybean stew."],
  ["Combinations", "9292 B Combo", "Serves 3-4: prime rib eye, marinated beef short rib, prime beef brisket, hand-rub seasoned steak, pork belly, pork jowl, shrimp, and soybean stew."],
  ["Combinations", "9292 C Combo", "Serves 4: prime beef brisket, prime rib eye, fresh beef short rib, marinated beef short rib, hand-rub seasoned steak, prime short rib, shrimp, and soybean stew."],
  ["Combinations", "9292 D Combo", "Serves 5: prime beef brisket, prime rib eye, fresh beef short rib, marinated beef short rib, hand-rub seasoned steak, prime short rib, short rib, bulgogi, shrimp, and soybean stew."],
  ["Unlimited", "9292 A Unlimited", "Per person: pork belly, spicy pork belly, seasoned pork short rib, bean paste pork belly, beef bulgogi, pork neck, soy sauce marinated chicken, spicy chicken, onion garlic marinated chicken, and spicy rice cake."],
  ["Unlimited", "9292 B Unlimited", "Per person: prime beef brisket, hand-rub seasoned steak, beef bulgogi, pork belly, spicy pork belly, bean paste pork belly, seasoned pork short ribs, garlic pepper pork neck, soy sauce marinated chicken, spicy chicken, onion garlic marinated chicken, spicy rice cake, and shrimp."],
  ["Specials", "9292 Special 1", "Serves 2: prime brisket, prime rib eye, marinated beef short rib, seasoned pork short ribs, and soybean paste stew."],
  ["Specials", "9292 Special 2", "Serves 2-3: pork belly, seasoned pork short rib, prime rib eye, marinated beef short rib, prime beef brisket, and soybean paste stew."],
  ["Dinner", "Pork Kimchi Stew", "Pork kimchi stew for two."],
  ["Dinner", "Kalguksu", "Knife-cut noodle soup."],
  ["Dinner", "Spicy Kalguksu", "Spicy beef knife-cut noodle soup."],
  ["Dinner", "Yukgaejang Kalguksu", "Spicy beef noodle soup in a hot pot."],
  ["Dinner", "Cold Noodle Soup", "Cold buckwheat noodles."],
  ["Dinner", "Spicy Cold Noodle", "Spicy cold buckwheat noodles."],
  ["Dinner", "Extra Spicy Cold Noodle", "Extra-spicy cold buckwheat noodles."],
  ["Dinner", "Small Cold Buckwheat Noodles", "Small cold buckwheat noodles."],
  ["Dinner", "Small Spicy Cold Buckwheat Noodles", "Small spicy cold buckwheat noodles."],
  ["Dinner", "Radish Kimchi Fried Rice", "Radish kimchi fried rice."],
  ["Dinner", "Napa Cabbage Fried Rice", "Napa cabbage fried rice."],
  ["Dinner", "Soybean Paste Stew", null],
  ["Dinner", "Steamed Rice", null],
];

const lunchRows = [
  ["Lunch - Bibimbap", "Bibimbap", "Assorted vegetable toppings with rice and soybean paste stew."],
  ["Lunch - Bibimbap", "Dolsot Bibimbap", "Assorted vegetable toppings with rice in a hot stone pot and soybean paste stew."],
  ["Lunch - Bibimbap", "Dolsot Yukhoe Bibimbap", "Assorted vegetables and beef tartare with rice in a hot stone pot."],
  ["Lunch - Bibimbap", "Dolsot Jeyuk Bibimbap", "Assorted vegetables and stir-fried pork with rice in a hot stone pot."],
  ["Lunch - Bibimbap", "Dolsot Bulgogi Bibimbap", "Assorted vegetables and bulgogi with rice in a hot stone pot."],
  ["Lunch - Soup & Stir-Fry", "Galbi Tang", "Beef short rib in a beef bone soup."],
  ["Lunch - Soup & Stir-Fry", "Spicy Galbi Tang", "Spicy beef short rib in a beef bone soup."],
  ["Lunch - Soup & Stir-Fry", "Yukgaejang", "Spicy beef soup."],
  ["Lunch - Soup & Stir-Fry", "Seolleongtang", "Ox bone soup."],
  ["Lunch - Soup & Stir-Fry", "Hot Pot Bulgogi", "Bulgogi in a hot pot."],
  ["Lunch - Soup & Stir-Fry", "Hot Pot Kimchi Jjigae", "Kimchi stew in a hot pot."],
  ["Lunch - Soup & Stir-Fry", "Brisket Soybean Paste Stew", "Soybean paste stew with brisket point."],
  ["Lunch - Soup & Stir-Fry", "Jeyuk Bokkeum", "Stir-fried spicy pork."],
  ["Lunch - Soup & Stir-Fry", "Stir-Fried Squid", null],
  ["Lunch - Soup & Stir-Fry", "LA Galbi", null],
  ["Lunch - Soup & Stir-Fry", "Toppoki", null],
  ["Lunch Box", "Lunch Box Bulgogi", "Tender boneless prime beef marinated in Korean sauce."],
  ["Lunch Box", "Lunch Box Chicken", "Choice of spicy chicken, soy sauce marinated chicken, or lemon pepper chicken."],
  ["Lunch Box", "Lunch Box Galbi", "Grilled prime beef short ribs marinated in Korean sauce."],
  ["Lunch Box", "Lunch Box Jeyuk Bokkeum", "Stir-fried spicy pork."],
  ["Lunch - Noodles", "Cold Noodle Soup", "Cold buckwheat noodle soup."],
  ["Lunch - Noodles", "Spicy Cold Noodle", "Spicy cold buckwheat noodle."],
  ["Lunch - Noodles", "Yukgaejang Kalguksu", "Spicy beef and noodle soup."],
  ["Lunch Combos", "9292 Galbi + Soybean Paste Stew", "Marinated and grilled beef ribs with soybean paste stew."],
  ["Lunch Combos", "9292 Galbi + Cold Noodle Soup", "Grilled beef ribs with cold buckwheat noodle soup."],
  ["Lunch Combos", "9292 Galbi + Spicy Cold Noodle", "Grilled beef ribs with spicy cold buckwheat noodle."],
  ["Lunch Combos", "9292 Jeyuk Bokkeum + Soybean Paste Stew", "Stir-fried spicy pork with soybean paste stew."],
  ["Lunch Combos", "Seasoned Pork Short Ribs + Cold Noodle Soup", "Seasoned pork short ribs with cold buckwheat noodle soup."],
];

const gopchangRows = [
  ["Gopchang Combinations", "Gopchang Combo A", "Serves 2: prime beef brisket, pork belly, beef small intestine, beef large intestine, beef abomasum, beef tripe, soybean paste stew, and choice of noodles or kimchi fried rice."],
  ["Gopchang Combinations", "Gopchang Combo B", "Serves 3: prime beef brisket, hand-rub seasoned steak, pork belly, beef small intestine, beef large intestine, beef abomasum, beef tripe, soybean paste stew, and choice of noodles or kimchi fried rice."],
  ["Gopchang Combinations", "Gopchang Combo C", "Serves 4: prime beef brisket, marinated prime rib, pork jowl, pork belly, beef small intestine, beef large intestine, beef abomasum, beef tripe, soybean paste stew, and spicy seafood ramen."],
  ["Gopchang Combinations", "Gopchang Combo D", "Serves 4: prime beef brisket, fresh beef short rib, marinated prime rib, hand-rub seasoned steak, beef small intestine, beef large intestine, beef abomasum, beef tripe, soybean paste stew, and spicy seafood ramen."],
  ["Stir-Fried, Stewed & Braised", "Stir-Fried Spicy Beef Large/Small Intestine", null],
  ["Stir-Fried, Stewed & Braised", "Stir-Fried Spicy Beef Large Intestine", null],
  ["Stir-Fried, Stewed & Braised", "Beef Intestine Stew", "Optional udon noodle add-on."],
  ["Stir-Fried, Stewed & Braised", "Braised Spicy Beef Short Rib", null],
  ["Stir-Fried, Stewed & Braised", "Spicy Shrimp Noodle Soup", null],
  ...names("Gopchang", [
    "Grilled Beef Small Intestine", "Grilled Beef Large Intestine",
    "Grilled Beef Abomasum", "Grilled Beef Tripe",
  ]),
];

const beverageRows = [
  ...names("Alcohol - Soju & Wine", [
    "Chumchurum", "Chamisul", "Jinro Is Back", "Korean Rice Wine", "Myungjak",
  ]),
  ["Alcohol - Flavored Soju", "Flavored Soju", "Green grape, apple, peach, or yogurt."],
  ["Alcohol - Beer", "Imported Beer", "Corona, Heineken, or Cass."],
  ["Alcohol - Beer", "Terra or Kloud Large", null],
  ["Alcohol - Beer", "Domestic Beer", "Coors Lite or Miller Lite."],
  ["Non-Alcoholic Drinks", "Soda", "Sprite, Coke, Diet Coke, or Fanta."],
  ["Non-Alcoholic Drinks", "Sacsac", null],
  ["Non-Alcoholic Drinks", "Milkis", null],
];

export function build9292AuditSnapshot({ retrievedAt = auditRetrievedAt9292 } = {}) {
  const rows = [
    ...primaryRows.map((row) => sourced(row, sourceUrls9292.primaryMenuPhoto)),
    ...lunchRows.map((row) => sourced(row, sourceUrls9292.lunchMenuPhoto)),
    ...gopchangRows.map((row) => sourced(row, sourceUrls9292.gopchangMenuPhoto)),
    ...beverageRows.map((row) => sourced(
      row,
      /Non-Alcoholic|Alcohol/.test(row[0]) ? sourceUrls9292.gopchangMenuPhoto : sourceUrls9292.primaryMenuPhoto,
    )),
  ];

  const items = rows.map(([category, name, description, sourceUrl], index) => ({
    auditItemKey: `${index + 1}:${slugify(category)}:${slugify(name)}`,
    id: `${slugify(category)}-${slugify(name)}`,
    name,
    category,
    description,
    ingredientsText: description,
    isConfigurable: /combo|unlimited|special|lunch box chicken/i.test(name),
    sourceUrls: [sourceUrl],
    sourceType: "reviewed-third-party-menu-photo",
    allergens: [],
    mayContain: [],
    allergenSourceType: "unavailable",
  }));

  return {
    schemaVersion: 1,
    restaurantId: "replacement-9292-korean-bbq-annandale-va",
    retrievedAt,
    sourceUrls: Object.values(sourceUrls9292),
    itemCount: items.length,
    officialAllergenItemCount: 0,
    unavailableAllergenCount: items.length,
    sourceWarning:
      "No restaurant-issued allergen guide or complete ingredient disclosure was found. The current menu is transcribed conservatively from photographed Annandale menu boards hosted by a third-party listing; all restaurant-official allergen arrays remain unavailable, while the app may separately show labeled Ingredient Intelligence inferences.",
    items,
  };
}

function names(category, values) {
  return values.map((name) => [category, name, null]);
}

function sourced([category, name, description], sourceUrl) {
  return [category, name, description, sourceUrl];
}

function slugify(value) {
  return String(value).replace(/&/g, " and ")
    .normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/[’']/g, "").replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "").toLowerCase();
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const outputPath = path.resolve(
    process.argv[2] ?? "data/restaurant-verification/repairs/replacement-9292-korean-bbq-annandale-va/corrected-menu.json",
  );
  const snapshot = build9292AuditSnapshot();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  const sha256 = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  console.log(JSON.stringify({ outputPath, itemCount: snapshot.itemCount, sha256 }, null, 2));
}
