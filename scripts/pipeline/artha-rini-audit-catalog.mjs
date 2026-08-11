import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdArthaRini = "osm-artha-rini-45808686";

const menuIndexUrl = "https://artharini.com/menu";
const crossContactAllergens = [
  "peanut",
  "tree-nut",
  "wheat",
  "gluten",
  "milk",
  "egg",
  "soy",
  "fish",
  "shellfish",
  "sesame",
];
const allergenOrder = [
  "milk", "egg", "wheat", "gluten", "soy", "peanut", "tree-nut",
  "fish", "shellfish", "sesame", "mustard",
];

const sourceContracts = {
  main: {
    label: "Main Menu (2026)",
    sourceUrl: "https://img1.wsimg.com/blobby/go/d59dd7f6-cdcd-4180-a6b3-2efec73aee9b/%5BComp%5D%202026_Artha%20Rini_Menu%20.pdf",
    artifactPath: "data/restaurant-verification/artifacts/osm-artha-rini-45808686/official-artha-rini-main-menu-2026.pdf",
    sha256: "0147fcee3223e7a98a400c612b4bd8f190514a779e0e40baf93afad019c44eb9",
    expectedProductCount: 75,
  },
  liwetan: {
    label: "Liwetan (2025)",
    sourceUrl: "https://img1.wsimg.com/blobby/go/d59dd7f6-cdcd-4180-a6b3-2efec73aee9b/%5B2025%5D%20Liwetan%20Menu_Artha%20Rini.pdf",
    artifactPath: "data/restaurant-verification/artifacts/osm-artha-rini-45808686/official-artha-rini-liwetan-2025.pdf",
    sha256: "57f167b838984881aacce68f00ca941f24667107b269eb1168126f82bd656649",
    expectedProductCount: 6,
  },
  gudeg: {
    label: "Gudeg (2025)",
    sourceUrl: "https://img1.wsimg.com/blobby/go/d59dd7f6-cdcd-4180-a6b3-2efec73aee9b/%5B2025%5D%20Gudeg%20Menu_Artha%20Rini.pdf",
    artifactPath: "data/restaurant-verification/artifacts/osm-artha-rini-45808686/official-artha-rini-gudeg-2025.pdf",
    sha256: "38cdf4a20ac973e808dc2a779e36211b5c2ca6e5694f509bbb386c0ed856a39e",
    expectedProductCount: 5,
  },
  rijsttafel: {
    label: "Rijsttafel (2024)",
    sourceUrl: "https://img1.wsimg.com/blobby/go/d59dd7f6-cdcd-4180-a6b3-2efec73aee9b/downloads/Rijstaffel%20Menu_ArthaRini_August%202024.pdf?ver=1783310552686",
    artifactPath: "data/restaurant-verification/artifacts/osm-artha-rini-45808686/official-artha-rini-rijsttafel-2024.pdf",
    sha256: "3ace3fe4c82fb3b5ed8def72f1685928b98bb5665ee6c8bcaf29e6ef7e0d73a6",
    expectedProductCount: 3,
  },
  foodstall: {
    label: "Food Stall (2024)",
    sourceUrl: "https://img1.wsimg.com/blobby/go/d59dd7f6-cdcd-4180-a6b3-2efec73aee9b/downloads/60cb33b5-8896-4374-8a4c-b1960f0d53da/Foodstall%20Menu_ArthaRini_2024.pdf?ver=1783310552686",
    artifactPath: "data/restaurant-verification/artifacts/osm-artha-rini-45808686/official-artha-rini-foodstall-2024.pdf",
    sha256: "fbae5eadac5dd5c862075204a8c7d63249d85eee56bfa03c9d66891afe575451",
    expectedProductCount: 12,
  },
  ricebox: {
    label: "Rice Box",
    sourceUrl: "https://img1.wsimg.com/blobby/go/d59dd7f6-cdcd-4180-a6b3-2efec73aee9b/downloads/1bdfe79f-dcdc-4dcf-8d06-23d30a4c2cf1/Artha%20Rini_Ricebox%20Menu_Website.pdf?ver=1783310552686",
    artifactPath: "data/restaurant-verification/artifacts/osm-artha-rini-45808686/official-artha-rini-ricebox.pdf",
    sha256: "6d87b852f9a345380986a6d8cc41196c0a00ce2c1454b65a71e39c818c228037",
    expectedProductCount: 17,
  },
  tumpeng: {
    label: "Tumpeng",
    sourceUrl: "https://img1.wsimg.com/blobby/go/d59dd7f6-cdcd-4180-a6b3-2efec73aee9b/downloads/331456bb-76bf-41f0-9159-e62acfede66f/Tumpeng%20Menu_Updated.pdf?ver=1783310552686",
    artifactPath: "data/restaurant-verification/artifacts/osm-artha-rini-45808686/official-artha-rini-tumpeng.pdf",
    sha256: "b7d189a3bfaa6301d06ae1dcea4e5ffc7d7172cc0f4e10c608cef386baa62c07",
    expectedProductCount: 2,
  },
  jajanan: {
    label: "Jajanan Pasar (2026)",
    sourceUrl: "https://img1.wsimg.com/blobby/go/d59dd7f6-cdcd-4180-a6b3-2efec73aee9b/downloads/715c7344-3da5-49da-822a-110b6065e796/Jajanan%20Pasar_2026.pdf?ver=1783310552686",
    artifactPath: "data/restaurant-verification/artifacts/osm-artha-rini-45808686/official-artha-rini-jajanan-pasar-2026.pdf",
    sha256: "916dc1e18de6d117d4ce2f9c9ca02ea2cfad900826d411b0b98a75bb2a46a86b",
    expectedProductCount: 40,
  },
};

const mainRows = [
  ["Pempek Kapal Selam", "Fish cake with egg filling served with cuko sweet-sour sauce.", ["fish", "egg"]],
  ["Pempek Adaan", "Fish cake balls served with sweet-sour sauce.", ["fish"]],
  ["Siomay", "Fish and shrimp dumplings served with peanut sauce.", ["fish", "shellfish", "peanut"]],
  ["Mendoan", "Batter-fried tempeh.", ["soy", "wheat", "gluten"]],
  ["Tahu Gejrot", "Fried tofu with gluten-free spicy and sour sauce.", ["soy"]],
  ["Karedok", "Raw vegetable salad with tofu, peanut sauce, and kencur.", ["soy", "peanut"]],
  ["Gado-Gado", "Mixed vegetable salad with tempeh, tofu, egg, rice cake, and peanut sauce.", ["soy", "egg", "peanut"]],
  ["Mie Baso", "Meatball soup with noodles.", ["wheat", "gluten"]],
  ["Tengkleng", "Lamb curry soup without coconut milk.", []],
  ["Rawon", "Black beef soup made with keluak; served with rice, salted egg, and potato fritter.", ["egg"]],
  ["Soto Ayam", "Yellow chicken soup with noodles, cabbage, egg, rice, and potato fritter; bean-curd-sheet swap available.", ["wheat", "gluten", "egg", "soy"], { configurable: true }],
  ["Soto Mie", "Beef noodle soup with spring roll, cow feet, and chips.", ["wheat", "gluten"]],
  ["Soto Betawi", "Jakarta beef soup in coconut-milk broth with rice, potato fritters, boiled egg, and emping.", ["egg"]],
  ["Rendang", "Spicy slow-cooked beef stew with coconut milk.", []],
  ["Ayam Bakar Padang", "Grilled chicken prepared Padang style.", []],
  ["Gulai Nangka", "Jackfruit curry.", []],
  ["Balado Telur", "Egg in red-pepper balado sauce.", ["egg"]],
  ["Gulai Kikil", "Cow-feet curry.", []],
  ["Sate Ayam", "Chicken skewers with gluten-free peanut sauce and rice cake.", ["peanut"]],
  ["Sate Maranggi", "Tenderloin skewers with spicy gluten-free sweet soy and rice cake.", ["soy"]],
  ["Sate Kambing", "Lamb skewers with spicy gluten-free sweet soy and rice cake.", ["soy"]],
  ["Sate Padang", "Beef-tongue satay with thick gluten-free curry sauce and rice cake.", []],
  ["Lontong Sayur", "Vegetarian coconut-milk soup with lontong and kerupuk.", []],
  ["Oseng Buncis Tempe", "Sauteed green beans and tempeh.", ["soy"]],
  ["Oseng Kale", "Sauteed kale.", []],
  ["Bandeng Asap Goreng", "Fried boneless smoked milkfish with sambal.", ["fish"]],
  ["Salmon Kuah Kuning", "Salmon fillet in yellow soup with lime, kaffir lime, ginger, and chili.", ["fish"]],
  ["Udang Asam Manis", "Shrimp in sweet-and-sour sauce.", ["shellfish"]],
  ["Udang Saus Padang", "Shrimp in Padang-style sauce made with gluten-free vegan oyster sauce.", ["shellfish"]],
  ["Udang Balado Pete", "Shrimp in balado sauce with pete beans.", ["shellfish"]],
  ["Ikan Bakar Sambal Mangga", "Grilled fish with spicy mango sambal.", ["fish"]],
  ["Tilapia Saus Asam Manis", "Tilapia with sweet-and-sour sauce.", ["fish"]],
  ["Tilapia Saus Padang", "Tilapia in Padang-style sauce containing oyster sauce.", ["fish", "shellfish"]],
  ["Rice Platter Padang Style", "Configurable rice platter with rendang, grilled chicken, spicy egg, and jackfruit curry choices.", ["egg"], { configurable: true }],
  ["Nasi Uduk", "Coconut rice with Kalasan chicken, anchovies and peanut, potato and shrimp, shredded egg, and chips.", ["fish", "peanut", "shellfish", "egg"]],
  ["Nasi Kuning", "Turmeric coconut rice with Kalasan chicken, anchovies and peanut, potato and shrimp, shredded egg, and chips.", ["fish", "peanut", "shellfish", "egg"]],
  ["Paket Nasi Sayur Asem", "Vegetable sour soup with rice, Kalasan chicken, and tempeh mendoan; vegetarian and gluten-free modifications available.", ["soy", "wheat", "gluten"], { configurable: true }],
  ["Nasi Bungkus Padang", "Padang-style rice platter wrapped in banana leaf.", []],
  ["Nasi Ayam Kremes", "Indonesian fried chicken with crunchy bits and rice.", []],
  ["Pecel Lele", "Fried catfish with rice, tofu, tempeh, and shrimp-paste sambal.", ["fish", "soy", "shellfish"]],
  ["Nasi Goreng Vegetarian", "Gluten-free vegetable fried rice with fried egg and chips.", ["egg"]],
  ["Nasi Goreng Ayam", "Gluten-free chicken fried rice with fried egg and chips.", ["egg"]],
  ["Nasi Goreng Daging", "Gluten-free beef fried rice with fried egg and chips.", ["egg"]],
  ["Nasi Goreng Kambing", "Gluten-free lamb fried rice with fried egg and chips.", ["egg"]],
  ["Nasi Goreng Udang", "Gluten-free shrimp fried rice with fried egg and chips.", ["egg", "shellfish"]],
  ["Nasi Goreng Combination", "Gluten-free combination fried rice with more than three condiments, fried egg, and chips.", ["egg", "shellfish"], { configurable: true }],
  ["Nasi Goreng Cabe Rawit", "Extra-spicy gluten-free fried rice with fried egg and chips.", ["egg"]],
  ["Mie Goreng Vegetarian", "Fried noodles with vegetables, sesame oil, gluten-free vegan oyster sauce, gluten-free soy sauce, and egg.", ["wheat", "gluten", "soy", "sesame", "egg"]],
  ["Mie Goreng Ayam", "Chicken fried noodles based on the vegetable preparation with sesame oil, soy sauce, and egg.", ["wheat", "gluten", "soy", "sesame", "egg"]],
  ["Mie Goreng Udang", "Shrimp fried noodles based on the vegetable preparation with sesame oil, soy sauce, and egg.", ["wheat", "gluten", "soy", "sesame", "egg", "shellfish"]],
  ["Bihun Goreng", "Gluten-free fried rice noodles with soy sauce, sesame oil, vegan oyster sauce, and egg.", ["soy", "sesame", "egg"]],
  ["Mie Ayam", "Chicken noodles with diced chicken, meatball soup, garlic seasoning, and sesame oil.", ["wheat", "gluten", "sesame"]],
  ["Internet (Indomie Telur Kornet)", "Indomie with egg, corned beef, sesame oil, and optional cheese.", ["wheat", "gluten", "egg", "sesame", "milk"], { configurable: true }],
  ["Pisang Goreng", "Indonesian-style banana fritter.", []],
  ["Pisang Coklat Keju", "Banana fritter with chocolate and cheese.", ["milk"]],
  ["Es Campur", "Mixed iced dessert with coconut, jackfruit, cendol, palm seed, avocado, tapioca pearls, grass jelly, condensed and whole milk; almond milk is an alternative.", ["milk", "tree-nut"], { configurable: true }],
  ["Es Doger", "Shaved ice with tapioca pearl, fermented cassava, black sweet rice, coconut, jackfruit, syrup, and coconut milk.", []],
  ["Es Cendol", "Iced pandan rice-flour jelly with coconut milk and palm-sugar syrup.", []],
  ["Sekuteng", "Ginger drink with diced bread, mung beans, tapioca pearls, palm seeds, peanut, and condensed milk.", ["wheat", "gluten", "peanut", "milk"]],
  ["Jus Durian", "Durian smoothie with whole milk; almond milk is an alternative.", ["milk", "tree-nut"], { configurable: true }],
  ["Jus Mangga", "Mango smoothie with whole milk; almond milk is an alternative.", ["milk", "tree-nut"], { configurable: true }],
  ["Jus Alpukat", "Avocado smoothie with whole milk; almond milk is an alternative.", ["milk", "tree-nut"], { configurable: true }],
  ["Soda / Water / Tea", "Choice of canned soda, Teh Kotak, Teh Botol, or bottled water.", [], { configurable: true }],
  ["Bajigur", "Ginger milk; almond milk is an alternative.", ["milk", "tree-nut"], { configurable: true }],
  ["Jamu Turmeric & Tamarind Juice", "Turmeric and tamarind blended with palm sugar.", []],
  ["Aji Tea", "Locally made jasmine tea with honey in multiple flavors.", [], { configurable: true }],
  ["Steamed Rice", "Steamed rice side.", []],
  ["Coconut Rice", "Coconut rice side.", []],
  ["Turmeric Coconut Rice (Nasi Kuning)", "Turmeric coconut rice side.", []],
  ["Emping", "Melinjo-seed Indonesian chips.", []],
  ["Kerupuk Udang", "Shrimp crackers.", ["shellfish"]],
  ["Kerupuk Tapioka", "Tapioca crackers.", []],
  ["Kerupuk Bawang", "Garlic crackers.", []],
  ["Rempeyek / Peyek", "Deep-fried flour cracker with peanut, dried anchovy, or dried shrimp; the menu warns that it contains peanuts and fish.", ["wheat", "gluten", "peanut", "fish", "shellfish"], { configurable: true }],
  ["Rengginang", "Thick rice crackers made from cooked glutinous sticky rice and spices.", []],
];

const mainCategoryCounts = [
  ["Main Menu · Appetizers", 5], ["Main Menu · Salads", 2], ["Main Menu · Soups", 6],
  ["Main Menu · Entrees", 12], ["Main Menu · Seafood", 8], ["Main Menu · Rice Platters", 7],
  ["Main Menu · Fried Rice", 7], ["Main Menu · Noodles", 6],
];

const liwetanRows = [
  ["Liwetan", "Sundanese nasi liwet with anchovies, tamarind vegetable soup, collard greens, fried chicken, fried tofu, salted fish, sambal, vegetables, and tapioca crackers; four-portion dine-in minimum.", ["fish", "soy"], { configurable: true }],
  ["Sambal Terasi Pete", "Liwetan additional: sambal terasi with pete.", ["shellfish"]],
  ["Sambal Ijo Ikan Asin", "Liwetan additional: green sambal with salted fish.", ["fish"]],
  ["Fried Whole Fish", "Liwetan additional: fried whole fish.", ["fish"]],
  ["Salted Squid with Green Chilli", "Liwetan additional: salted squid with green chilli.", ["shellfish"]],
  ["Squid with Ink Sauce", "Liwetan additional: squid with ink sauce.", ["shellfish"]],
];

const gudegRows = [
  ["Nasi Gudeg", "Pre-order rice meal with jackfruit stew, spicy beef skin, seasoned boiled egg, and chicken white curry; twenty-person minimum.", ["egg"], { configurable: true }],
  ["Gudeg", "Gluten-free jackfruit stew offered as a regular entree.", []],
  ["Krecek", "Gluten-free spicy beef skin offered as a regular entree.", []],
  ["Seasoned Boiled Eggs (4 Pieces)", "Gluten-free brown seasoned boiled eggs.", ["egg"]],
  ["Opor", "Gluten-free chicken white curry offered as a regular entree.", []],
];

const rijsttafelRows = [
  ["Rijsttafel Menu A", "Configurable per-person package with yellow chicken soup, vegetarian fried rice, green bean and tofu, chicken satay, rendang, shrimp and potatoes, peanut serundeng, tapioca crackers, and acar.", ["soy", "peanut", "shellfish"], { configurable: true }],
  ["Rijsttafel Menu B", "Configurable per-person package with yellow chicken soup, steamed rice, gado-gado with peanut sauce, chicken satay, rendang, grilled chicken, peanut serundeng, tapioca crackers, and acar.", ["soy", "egg", "peanut"], { configurable: true }],
  ["Rijsttafel Menu C", "Configurable per-person package with vegetarian fried noodles, mixed vegetables, chicken satay, rendang, sweet-and-sour tilapia, peanut serundeng, tapioca crackers, and acar.", ["wheat", "gluten", "fish", "peanut"], { configurable: true }],
];

const foodstallRows = [
  ["Gado-Gado", "Food-stall salad with rice cake, vegetables, egg, tofu, tempeh, chips, and peanut sauce.", ["egg", "soy", "peanut"]],
  ["Pecel", "Food-stall vegetable salad with chips and peanut sauce.", ["peanut"]],
  ["Mie Baso Kuah", "Food-stall soup with beef meatballs, yellow noodles, rice noodles, and yuchoy.", ["wheat", "gluten"]],
  ["Mie Ayam Baso", "Food-stall soup with beef meatballs, chicken, mushrooms, yellow noodles, fried wonton, and yuchoy.", ["wheat", "gluten"]],
  ["Bakwan Malang", "Food-stall soup with beef meatball, meat-filled tofu, fried wonton, rolled yellow noodles, and yuchoy.", ["soy", "wheat", "gluten"]],
  ["Soto Ayam", "Food-stall soup with chicken, vermicelli, bean sprouts, potato fritters, egg, and chips.", ["egg"]],
  ["Soto Mie", "Food-stall soup with beef, yellow noodles, potato, cow feet, rice-noodle spring roll, and chips.", ["wheat", "gluten"]],
  ["Soto Betawi", "Food-stall soup with beef, tripe, potato, and chips.", []],
  ["Steam Siomay", "Food-stall steamed fish wonton with filled tofu, bitter melon, and egg.", ["fish", "soy", "egg", "wheat", "gluten"]],
  ["Sate Ayam", "Food-stall chicken satay with rice cake and peanut sauce; meal and per-skewer options.", ["peanut"], { configurable: true }],
  ["Sate Maranggi", "Food-stall beef satay with rice cake and sweet soy sauce; meal and per-skewer options.", ["soy"], { configurable: true }],
  ["Sate Kambing", "Food-stall lamb satay with rice cake and sweet soy sauce; meal and per-skewer options.", ["soy"], { configurable: true }],
];

const riceboxRows = [
  ["Nasi Liwet Solo", "Rice box with nasi gurih, papaya lodeh and tofu, chicken opor, bacem egg, areh, crackers, and sambal.", ["soy", "egg"]],
  ["Nasi Gudeg", "Rice box with white rice, gudeg, krecek, bacem egg, chicken opor, crackers, and sambal.", ["egg"]],
  ["Lontong Cap Gomeh", "Rice box with lontong, papaya lodeh, chicken opor, shrimp sambal, bacem egg, crackers, and sambal.", ["shellfish", "egg"]],
  ["Nasi Uduk", "Rice box with nasi uduk, fried chicken, braised tofu, bihun, egg omelette, cucumber, crackers, and sambal.", ["soy", "egg"]],
  ["Nasi Kuning", "Rice box with turmeric rice, chicken or beef, corn fritter, shrimp sambal, balado egg, tempeh or anchovy-peanut caramel, crackers, and sambal.", ["shellfish", "egg", "soy", "fish", "peanut"], { configurable: true }],
  ["Nasi Langgi", "Rice box with nasi gurih, fried chicken, beef, potato sambal, tempeh, serundeng, egg omelette, crackers, and sambal.", ["soy", "egg"]],
  ["Nasi Liwet Sunda", "Rice box with spiced anchovy rice, fried or grilled chicken, fish balado, tofu or tempeh, collards, cucumber, crackers, and sambal.", ["fish", "soy"], { configurable: true }],
  ["Nasi Ijo", "Rice box with green nasi gurih, grilled chicken, corn fritter, lettuce, cucumber, crackers, and sambal.", []],
  ["Nasi Timbel", "Rice box with nasi timbel, vegetable soup, fried chicken, fried fish, fried tofu, cucumber, crackers, and sambal.", ["fish", "soy"]],
  ["Nasi Daun Jeruk", "Rice box with lime-leaf rice, grilled or fried chicken, collards, corn fritter, lettuce, cucumber, crackers, and sambal.", [], { configurable: true }],
  ["Paket Nasi Padang", "Rice box with rice, rendang, grilled chicken, balado egg, vegetable curry, raw vegetables, crackers, and sambal.", ["egg"]],
  ["Paket Nasi Pare", "Rice box with rice, serundeng chicken, vegetable fritter, bitter melon and shrimp, lettuce, cucumber, crackers, and sambal.", ["shellfish"]],
  ["Paket Nasi Ikan Fillet", "Rice box with rice, sweet-and-sour fish fillet, capcay, potato fritter, lettuce, cucumber, crackers, and sambal.", ["fish"]],
  ["Paket Nasi Pecel", "Rice box with rice, pecel, fried chicken, fritter, fried egg, crackers, and sambal.", ["peanut", "egg"]],
  ["Paket Nasi Gado-Gado", "Rice box with rice, gado-gado, boiled egg, chicken, tempeh mendoan or fritter, crackers, and sambal.", ["soy", "egg", "peanut", "wheat", "gluten"], { configurable: true }],
  ["Paket Nasi Breakfast", "Rice box with green-chilli fried rice; beef, fried chicken, or chicken satay; fried egg, fritter, pickle, crackers, and sambal.", ["egg", "peanut"], { configurable: true }],
  ["Paket Nasi Bakar", "Configurable rice box with anchovy-mushroom, rendang, squid, chicken, or shredded-fish baked rice plus tofu, tempeh mendoan, or fritter.", ["fish", "shellfish", "soy", "wheat", "gluten"], { configurable: true }],
];

const tumpengSelectionText = "Menu A choices: fried chicken, grilled chicken, sweet fried beef, rendang, fried shrimp, or shredded chicken. Menu B choices: coconut vegetables, fried noodles, shrimp potato, beef-liver potato, quail-egg potato, ground-beef potato, balado egg, tempeh, anchovy and peanut, potato chips, tofu, tempeh, or potato/corn fritters.";
const tumpengRows = [
  ["Tumpeng with 5 Selections", `Configurable tumpeng package with two Menu A and three Menu B selections, available in three sizes. ${tumpengSelectionText}`, ["shellfish", "wheat", "gluten", "egg", "soy", "fish", "peanut"], { configurable: true }],
  ["Tumpeng with 7 Selections", `Configurable tumpeng package with two Menu A and five Menu B selections, available in three sizes. ${tumpengSelectionText}`, ["shellfish", "wheat", "gluten", "egg", "soy", "fish", "peanut"], { configurable: true }],
];

const jajananRows = [
  ["Arem-Arem", "Compacted rice with vegetables and ground beef wrapped in banana leaves.", []],
  ["Arem-Arem (V)", "Compacted rice with tempeh wrapped in banana leaves.", ["soy"]],
  ["Bolu Kukus", "Steamed cupcakes.", []],
  ["Centik Manis (V)", "Tapioca pearl pudding.", []],
  ["Combro (V)", "Grated cassava with tempeh filling.", ["soy"]],
  ["Dadar Gulung", "Indonesian rolled crepes with coconut and coconut-sugar filling.", ["wheat", "gluten"]],
  ["Getuk", "Rolled cassava cake with grated coconut topping.", []],
  ["Ketan Serundeng", "Sticky rice with seasoned shredded coconut topping.", []],
  ["Klepon", "Sweet rice-flour balls with coconut-sugar filling and shredded coconut.", []],
  ["Kroket", "Breaded mashed potato with vegetables and ground beef filling.", ["wheat", "gluten"]],
  ["Kue Ku (V)", "Steamed glutinous-rice-flour cake with mung-bean filling.", []],
  ["Kue Lapis Beras (V)", "Steamed layered rice-flour cake.", []],
  ["Kue Lumpur", "Indonesian egg tart with mashed potato and coconut milk, topped with raisins.", ["egg", "wheat", "gluten"]],
  ["Kue Mendut (V)", "Glutinous-flour balls with shredded coconut filling and coconut-milk dressing.", []],
  ["Kue Pepe (V)", "Indonesian steamed layered tapioca cake.", []],
  ["Kue Sus Vla", "Indonesian cream-puff pastry with custard filling.", ["wheat", "gluten"]],
  ["Kue Sus Tuna Salad", "Savory cream-puff pastry with tuna-salad filling.", ["wheat", "gluten", "fish"]],
  ["Lapis Singkong (V)", "Steamed grated-cassava cake with shredded coconut.", []],
  ["Lemper Ayam Bakar", "Sticky rice with seasoned chicken, banana-leaf wrapped and toasted.", []],
  ["Lemper Ayam Kukus", "Sticky rice with seasoned chicken, banana-leaf wrapped and steamed.", []],
  ["Lemper Tuna Bakar", "Sticky rice with seasoned tuna, banana-leaf wrapped and toasted.", ["fish"]],
  ["Lopi (V)", "Steamed sticky rice with coconut topping and coconut-sugar dressing.", []],
  ["Lumpia Rebung Semarang", "Spring rolls with bamboo shoots, chicken, shrimp, and egg.", ["wheat", "gluten", "shellfish", "egg"]],
  ["Martabak Telur Mini", "Mini egg pancake with scallions and ground beef.", ["egg", "wheat", "gluten"]],
  ["Nagasari (V)", "Steamed rice-flour and coconut-milk cake with banana.", []],
  ["Panada", "Fried bread with spicy tuna filling.", ["wheat", "gluten", "fish"]],
  ["Pastel", "Indonesian empanadas with vegetables and chicken or beef filling.", ["wheat", "gluten"], { configurable: true }],
  ["Pastel Spiral", "Layered-skin empanadas with vegetables and chicken or beef filling.", ["wheat", "gluten"], { configurable: true }],
  ["Pastel Spiral Curry", "Layered-skin empanadas with vegetables and curry chicken or beef filling.", ["wheat", "gluten"], { configurable: true }],
  ["Putu Ayu (V)", "Steamed pandan cake with shredded coconut topping.", []],
  ["Risoles Ragout Chicken", "Fried savory rolled crepes with creamy vegetables and chicken filling.", ["wheat", "gluten"]],
  ["Risoles Ragout Veggies", "Fried savory rolled crepes with creamy vegetable filling.", ["wheat", "gluten"]],
  ["Risoles Mayonnaise", "Fried savory rolled crepes with turkey bacon, egg, cheese, and mayonnaise.", ["wheat", "gluten", "egg", "milk"]],
  ["Semar Mendem", "Savory rolled crepes with sticky rice and seasoned chicken filling.", ["wheat", "gluten"]],
  ["Sosis Solo", "Rolled omelette with ground chicken or beef filling.", ["egg"], { configurable: true }],
  ["Tahu Isi", "Fried tofu with mixed vegetables.", ["soy"]],
  ["Talam Ubi", "Steamed sweet-potato and coconut-milk cake.", []],
  ["Ketan Srikaya", "Steamed sticky-rice snack with custardy pandan-coconut layer.", []],
  ["Kue Sus Vla Buah", "Choux pastry with fruit toppings.", ["wheat", "gluten"]],
  ["Kue Sus Chicken Ragout", "Savory choux pastry with chicken ragout and potato.", ["wheat", "gluten"]],
];

export async function buildArthaRiniAuditSnapshot({ retrievedAt = new Date().toISOString() } = {}) {
  const sourceStats = [];
  for (const [key, contract] of Object.entries(sourceContracts)) {
    const buffer = await readFile(path.resolve(contract.artifactPath));
    const actualSha256 = createHash("sha256").update(buffer).digest("hex");
    if (actualSha256 !== contract.sha256) {
      throw new Error(`${contract.label} artifact hash changed: expected ${contract.sha256}, got ${actualSha256}.`);
    }
    sourceStats.push({ key, ...contract, actualSha256 });
  }

  const rowsBySource = {
    main: categorizeMainRows(mainRows), liwetan: categoryRows(liwetanRows, "Pre-Order · Liwetan"),
    gudeg: categoryRows(gudegRows, "Pre-Order · Gudeg"),
    rijsttafel: categoryRows(rijsttafelRows, "Catering · Rijsttafel"),
    foodstall: categoryRows(foodstallRows, "Catering · Food Stall"),
    ricebox: categoryRows(riceboxRows, "Catering · Rice Boxes"),
    tumpeng: categoryRows(tumpengRows, "Catering · Tumpeng"),
    jajanan: categoryRows(jajananRows, "Jajanan Pasar"),
  };
  const items = Object.entries(rowsBySource).flatMap(([sourceKey, rows]) => {
    const contract = sourceContracts[sourceKey];
    if (rows.length !== contract.expectedProductCount) {
      throw new Error(`${contract.label} source boundary changed: expected ${contract.expectedProductCount}, got ${rows.length}.`);
    }
    return rows.map((row) => canonicalItem(row, sourceKey, contract));
  });
  if (items.length !== 160 || new Set(items.map((item) => item.id)).size !== 160) {
    throw new Error(`Artha Rini canonical catalog changed: expected 160 unique products, got ${items.length}.`);
  }

  return {
    schemaVersion: 1,
    restaurantId: restaurantIdArthaRini,
    retrievedAt,
    sourceUrls: [menuIndexUrl, ...Object.values(sourceContracts).map((source) => source.sourceUrl)],
    sourceStats: sourceStats.map(({ expectedProductCount, ...source }) => ({ ...source, productCount: expectedProductCount })),
    itemCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
    officialIngredientCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    globalCrossContactOnlyCount: items.filter((item) => item.allergenSourceType === "official-global-cross-contact-note").length,
    globalCrossContactAllergens: [...crossContactAllergens],
    items,
  };
}

function categorizeMainRows(rows) {
  const output = [];
  let cursor = 0;
  for (const [category, count] of mainCategoryCounts) {
    output.push(...categoryRows(rows.slice(cursor, cursor + count), category));
    cursor += count;
  }
  const beverageRows = rows.slice(cursor, cursor + 13);
  cursor += beverageRows.length;
  const sideRows = rows.slice(cursor, cursor + 9);
  cursor += sideRows.length;
  output.push(...categoryRows(sideRows, "Main Menu · Sides & Crackers"));
  output.push(...categoryRows(beverageRows, "Main Menu · Beverages & Desserts"));
  if (cursor !== rows.length) throw new Error(`Main-menu category boundary stopped at ${cursor} of ${rows.length}.`);
  return output;
}

function categoryRows(rows, category) {
  return rows.map(([name, description, allergens = [], options = {}]) => ({
    name, description, allergens, category, ...options,
  }));
}

function canonicalItem(row, sourceKey, contract) {
  const allergens = sortAllergens(row.allergens);
  const sourceSummary = allergens.length > 0
    ? "Artha Rini's restaurant-issued menu text directly names ingredients or formulation terms supporting these positive allergen signals. Its establishment-wide warning separately discloses cross-contact risk for the listed major allergens; neither source establishes allergen absence."
    : "Artha Rini's restaurant-issued menu does not publish an item-level positive major-allergen term for this offering. Its establishment-wide warning still discloses cross-contact risk for the listed major allergens; menu silence is not treated as absence.";
  return {
    id: slugify(`${row.name}-${sourceKey}`),
    name: row.name,
    category: row.category,
    description: row.description,
    ingredientsText: row.description,
    imageUrl: null,
    isConfigurable: Boolean(row.configurable),
    allergenSourceType: allergens.length > 0 ? "official-ingredients" : "official-global-cross-contact-note",
    allergens,
    mayContain: [...crossContactAllergens],
    sourceType: "restaurant-issued-menu-text-and-global-cross-contact-warning",
    sourceUrls: [contract.sourceUrl, sourceContracts.main.sourceUrl],
    sourceSummary,
    evidence: [
      { sourceKind: "restaurant-issued-menu-text", sourceUrl: contract.sourceUrl, text: `${row.name}. ${row.description}` },
      { sourceKind: "restaurant-issued-global-cross-contact-warning", sourceUrl: sourceContracts.main.sourceUrl, text: "Food prepared in our establishment may contain or come in contact with peanuts, tree nuts, wheat, dairy, egg, soy, fish, shellfish, sesame and other known food allergens." },
    ],
    variantGroup: contract.label,
  };
}

function sortAllergens(values) {
  return [...new Set(values)].sort((a, b) => allergenOrder.indexOf(a) - allergenOrder.indexOf(b));
}

function slugify(value) {
  return value.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const outputPath = path.resolve(`data/restaurant-verification/repairs/${restaurantIdArthaRini}/corrected-menu.json`);
  const snapshot = await buildArthaRiniAuditSnapshot({ retrievedAt: "2026-07-15T00:00:00.000Z" });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, itemCount: snapshot.itemCount, officialIngredientCount: snapshot.officialIngredientCount, globalCrossContactOnlyCount: snapshot.globalCrossContactOnlyCount }, null, 2));
}
