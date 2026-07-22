const sourceBoilerplateDescriptionPatterns = [
  /\bfrom the restaurant'?s current official menu or allergen source\b/i,
  /^official\s+.+\s+allergen matrix\.?$/i,
  /^.+\s+official\s+.+\s+allergen matrix\.?$/i,
  /^official\s+.+\s+(?:interactive\s+)?(?:allergen|nutrition|allergen and nutrition|nutrition and allergen)\s+(?:widget|api|calculator)\.?$/i,
  /^official\s+.+\s+nutrition calculator api\.?$/i,
  /^official\s+.+\s+(?:nutrition|allergen|allergen and nutrition|nutrition and allergen)\s+calculator\s+api\.?$/i,
  /^official\s+.+\s+menu item from allergen matrix\.?$/i,
  /^official\s+.+\s+menu item from (?:the )?allergen matrix\.?$/i,
  /^.+\s+menu item from (?:the )?official\s+.+\s+guide\.?$/i,
  /^official\s+allergen\s+matrix\.?$/i,
  /^official allergen matrix(?: row parsed from table cells?)?\.?$/i,
  /^official menu item from allergen matrix\.?$/i,
  /^official\s+.+\s+allergen matrix note:/i,
  /^official\s+.+\s+(?:national\s+)?allergen guide\.?$/i,
  /^official\s+.+\s+nutrition guide allergen footnotes\.?$/i,
  /^official\s+nutrition\s+pdf\.\s+serving size:/i,
  /^official\s+.+\s+nutritionix online nutrition guide\.?$/i,
  /^official\s+.+\s+menu item allergen data\.?$/i,
  /^official\s+.+\s+nutrition and allergen information\.?$/i,
  /^official\s+.+\s+allergen information pdf\.?$/i,
  /^official\s+.+\s+(?:allergy|allergen|allergens|sensitivities|sensitivity|nutrition|ingredient|ingredients)\s+.+(?:table|matrix|pdf|guide|chart|list|data|information|menu|source|declaration|xml|api)\.?$/i,
  /^.+\s+official\s+.+\s+(?:allergy|allergen|allergens|sensitivities|sensitivity|nutrition|ingredient|ingredients)\s+.+(?:table|matrix|pdf|guide|chart|list|data|information|menu|source|declaration|xml|api)\.?$/i,
  /^official\s+.+(?:allergy|allergen|allergens|sensitivities|sensitivity|nutrition|ingredient|ingredients).+$/i,
  /^.+\s+nutritionix online nutrition and allergen guide\.?$/i,
  /^.+\s+nutritionix online nutrition guide\.?$/i,
  /^reviewed\s+.+\s+official\s+.+\s+(?:api|pdf|guide|matrix|source|menu|product api)\.?$/i,
  /^reviewed\s+official\s+.+\s+(?:api|pdf|guide|matrix|source|menu|product api)\.?$/i,
  /^official\s+allergen\s+flags?:\s*.+$/i,
  /^official\s+allergen\s+(?:sheet|page|guide|matrix)\s+(?:notes?|lists?)\s+.+$/i,
  /^row;\s+no\s+major\s+allergen\s+marked\s+in\s+the\s+table\.?$/i,
  /^pdf\.?$/i,
];

const sourceBoilerplatePrefixPatterns = [
  /^official\s+allergen\s+matrix\.?\s*/i,
  /^official\s+menu\s+item\s+from\s+(?:the\s+)?allergen\s+matrix\.?\s*/i,
  /^official\s+.+?\s+allergen\s+matrix\.?\s*/i,
  /^official\s+.+?\s+(?:interactive\s+)?(?:allergen|nutrition|allergen and nutrition|nutrition and allergen)\s+(?:widget|api|calculator)\.?\s*/i,
  /^official\s+.+?\s+nutrition\s+calculator\s+api\.?\s*/i,
  /^official\s+.+?\s+(?:national\s+)?allergen\s+guide\.?\s*/i,
  /^official\s+.+?\s+(?:nutrition|allergen|allergen and nutrition|nutrition and allergen)\s+information\.?\s*/i,
];

const optionGroupNamePatterns = [
  /^toppings?:\s*/i,
  /^(?:add|sub):\s*/i,
  /^(?:pick|choose|select|choice of)\s+(?:a\s+|your\s+)?(?:cheese|protein|sauce|side|dressing|topping|base|roll|bread|meat|fish|vegetable|veggie)s?:?$/i,
  /^(?:pick|choose|select)\s+(?:a\s+|your\s+)?(?:bagel|bread|bun|cheese|protein|sauce|side|dressing|topping|base|roll|meat|fish|vegetable|veggie)s?\b/i,
  /^\d+\s*choose\s+(?:a\s+|your\s+)?(?:protein|sauce|side|dressing|topping|base|bread|bun|meat|fish|vegetable|veggie)s?:?$/i,
  /^(?:add|extra|side of)\s+(?:a\s+|your\s+)?(?:cheese|protein|sauce|side|dressing|topping|base|roll|bread|meat|fish|vegetable|veggie)s?:?$/i,
  /^(?:premium options?)(?:\s+for\s+\d+(?:\.\d{2})?\s+each)?$/i,
  /^substitute\s+(?:with|for)\s+.+$/i,
  /^extra\s+.+\(\s*\d+\s*oz\s*\)$/i,
  /^(?:red pepper packet|side sauces?)$/i,
  /^\d+\.\s*(?:add|choose|pick|select)\s+(?:a\s+|your\s+)?(?:cheese|protein|sauce|side|dressing|topping|base|roll|bread|meat|fish|vegetable|veggie)s?:?$/i,
  /^choice of \d+ of the following:?$/i,
  /^choice of (?:one|two|three|\d+)\s+(?:sides?|sauces?|dressings?|toppings?)$/i,
  /^(?:sauces?|enhancements?|add[- ]ons?|sandwich add[- ]ons?|(?:small|large)?\s*espresso drinks mods)(?:\s*[+]\s*\d+)?$/i,
  /^(?:no utensils|no utensils\/silverware|no cutlery(?:\s+or\s+napkins)?|please add cutlery(?:\s+and\s+napkins)?|please add cutleryplease specify how many sets by increasing the order number|no wasabi|no ginger|your bag|no bag)$/i,
  /^with chaser or neat$/i,
];

const promoNamePatterns = [
  /\b(?:summer favorite is back|limited time|new item|coming soon|join us|book now|reserve|subscribe|newsletter|gift card|never miss a deal|sign me up|private events?|catering|cater with us|weddings catering|corporate catering|request a quote|order on doordash)\b/i,
  /^(?:join the pack|all merchandise|on sale)$/i,
  /^(?:doordash|culinary journal book|.+\s+journal book)$/i,
  /\bget exclusive offers?\b/i,
  /\bupcoming big games\b/i,
  /^#(?:givingtaco|giveback|promo)\b/i,
  /^(?:poquito dinero(?:\s*\$\d+(?:\.\d+)?\s*\(cont\.\))?)$/i,
  /^(?:another great green space|be part of\b|best lunch\b|best lunch and dinner\b|book your party|celebrations? in\b|culinary excellence|don'?t settle for anything less|looking for the best\b|product price|staying in business for|tasty food for all\b|treat yourself\b|voted best\b|calling personal foul\b|handcrafted pasta\b|waterfront views\b|top rating\b|upcoming big games\b)/i,
  /^(?:egift cards?|when:\s*\d|foxwoods casino|wellesley|welcome to|riverfront dining room|the dining room|patty o'?s cafe|happens here|why .+\?|our culture|nourishing our community|elevating k-food)$/i,
];

const navigationLegalNamePatterns = [
  /\b(?:privacy policy|terms of use|cookie policy|cookie preferences|copyright|all rights reserved|accessibility|sign in|log in|checkout|cart|quick links|home about menu events contact|photo gallery|video gallery|testimonials|testimonial|our ceo|why whole plants|partners|resources|virtual classes|opening hours|operating hours|location and ordering hours|manage your order|navigation|sitemap|responsible disclosure)\b/i,
  /^(?:how do i join you\??|allergies\??|contacts?|admin-dev|donate|education|sustainability)$/i,
  /^(?:host at .+|work at .+|join our (?:team|mailing list)|join our mailing list for updates|email signup|newsletter signup|thanks for submitting!?|cookie preferences)$/i,
  /^jump to (?:footer|main content|navigation) links$/i,
  /^\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/i,
];

const menuPolicyOrLegendNamePatterns = [
  /^(?:allergen|allergy|dietary|legend|key|allergen key|allergy key|dietary key):?$/i,
  /^(?:allergens?\/dietary info|allergen guide(?: pdf)?|allergy guide|allergen information!?|nutritional\s*&\s*allergen information)$/i,
  /^allergen\s*&\s*allergy\s+menu\s+info$/i,
  /^food allergies:?$/i,
  /^dietary\s+(?:tags|options)$/i,
  /^key to this guide$/i,
  /^please always inform us of any dietary restrictions or allergies when placing your order$/i,
  /^service\s*@?$/i,
  /^flexitarian options$/i,
  /^flexitarianoptions$/i,
  /^hh\s*[–-]\s*lower in fat and cholesterol$/i,
  /^(?:a\s+)?\d{1,2}(?:\.\d+)?%\s+(?:gratuity|service charge)\b/i,
  /^\d{1,2}(?:\.\d+)?%\s+(?:gratuity|service charge)\s+(?:is|will be)\s+applied\b/i,
  /^(?:gratuity|service charge)\s+(?:is|will be)\s+applied\b/i,
  /^(?:foodborneillness|riskoffoodborneillness)$/i,
  /^allergen disclaimer\b/i,
  /^blank\s*=\s*specific allergen\b/i,
  /^of all allergens due to the cooking method$/i,
  /^contains or may contain raw or undercooked ingredients$/i,
  /^consumer advisory$/i,
  /^raw seafood advisory$/i,
  /^all menu items are subject to daily changes$/i,
  /^for dine-in parties of \d+ or more \d{1,2}percent gratuity will be automatically added$/i,
  /^allergy index$/i,
  /^surcharge$/i,
];

const addressNamePatterns = [
  /\b\d{3,5}\s+[A-Za-z0-9.' -]+(?:avenue|ave|street|st|road|rd|boulevard|blvd|place|pl|drive|dr|lane|ln|northwest|nw|northeast|ne|southeast|se|southwest|sw)\b/i,
  /^[A-Z][A-Za-z .'-]+,\s*(?:D\.?C\.?|MD|VA|Washington|Arlington|Alexandria|Bethesda|Fairfax|Falls Church|Herndon|McLean|Reston|Tysons|Vienna)$/i,
  /^[A-Z][A-Za-z .'-]+,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|WA|WV|WI|WY)$/i,
];
const addressDescriptionPattern =
  /\b\d{3,5}\s+[A-Za-z0-9.' -]+(?:avenue|ave|street|st|road|rd|boulevard|blvd|place|pl|drive|dr|lane|ln|pike|ste|suite)\b/i;
const compactAddressDescriptionPattern =
  /[A-Za-z][A-Za-z .'-]+\d{3,5}\s+[A-Za-z0-9.' -]+(?:avenue|ave|street|st|road|rd|boulevard|blvd|place|pl|drive|dr|lane|ln|pike)[A-Za-z .'-]*,\s*[A-Z]{2}\s+\d{5}/i;

const sectionHeaderNamePatterns = [
  /^(?:appetizers?|starters?|snacks?|small plates|salads?|soups?|sandwiches?|burgers?|entrees?|main dishes|mains?|sides?|sides?\s*&\s*more|desserts?|sweet|drinks?|beverages?|hot beverages?|cocktails?|wine|beer|spirits?|breakfast|brunch|lunch|dinner|kids?|vegan|vegetarian|gluten[- ]free|menus?|menus▼|items?|food|restaurant|all day|meal plan|meal plan & programs|large share|small share|large format|weekly specials|with bread|sushi & ramen|kitchen entrées|signature rolls|sushi platters? \/ combos?)$/i,
  /^kids?\s*menu\s*for\s*children$/i,
  /^(?:to start|salads\s*\(served with dressing\)|wr\s*aps\s*\(include s si de salad\))$/i,
  /^\(?for\s+kids\s+under\s+\d+\)?$/i,
  /^(?:burgers?\s*&\s*sandwiches?|bowls?\s*&\s*salads?|sandwiches?\s*\((?:hot|cold|hot or cold)\)|select\s*burgers?)$/i,
  /^from the (?:grill|land|sea)$/i,
  /^les\s+salades?\s+et\s+sandwich(?:es)?$/i,
  /^les\s+entr[ée]es(?:\s*les\s+poissons)?$/i,
  /^from the .+ bar$/i,
  /^hand rolls?$/i,
  /^teriyaki\s+entr[ée]es$/i,
  /^bone[- ]in signature prime steaks$/i,
  /^artisan dogs$/i,
  /^kids?\s+menu\s*for\s+children$/i,
  /^experience to share$/i,
];

const assetOrMerchNamePatterns = [
  /\.(?:avif|webp|png|jpe?g|svg)$/i,
  /\b(?:scaled|final final|web scaled|home page|cta home page|square|sq|hero|shadow|image|photo|thumbnail|thumb|merch(?:andise)?|hats?|sweatshirts?|t-?shirts?|tee|tank|jogger|crew socks|long sleeve|jacket)\b/i,
  /^[a-f0-9]{16,}\s+(?:smoothie|bowl|image|photo)?$/i,
];

const websiteWidgetNamePatterns = [
  /^(?:advanced animation effects|automatically repeat timer|count up number per visitor|countdown number per visitor|countdown timer per visitor|custom content after count|hide days, hours or minutes|number of counters|paypal or custom button)$/i,
  /^(?:activity report|animate your welcome bar|autocomplete suggestions|business dashboard|content research tools|customer activity statistics|customer demographics|customer profiles|customizable signup form|dedicated in-app editor|display settings|easy-to-use|ecommmerce search results|email support|flexible content sources|frequent sync|get daily content updates|get subscribers and leads|increased engagement|number of customers|number of searches|publish unlimited articles|remove filtr8 promotions|remove signature|rich snippet integration|schedule your welcome bar|set email notifications|set how images pop up|share to social media|viral marketing module|your branding & logo)$/i,
  /^(?:configure map|marker icons|multiple markers|no ads|rich content baloon|search box|sync from google drive|unlock icons)$/i,
  /^(?:digital download file limit|easily export your data|filter your site visits|find out where visitors go|get advanced insights|map your visitors|recurring subscriptions|show off your visits|unlimited stats)$/i,
  /^this is your (?:first|second|third|fourth|fifth) item$/i,
  /^(?:beautiful premium templates|beautiful templates|stunning templates|display star rating|templates|change it anytime|gather email addresses|can't send form|thank you!|follow|more|now)$/i,
  /^(?:allow file uploads|additional form fields|collect visitor emails|custom form field elements|file upload and html content|number of form fields|receive file attachments)$/i,
  /^(?:google indexing|number of sliders|number of slides|premium layout options|star ratings|use social icons)$/i,
  /^(?:analytics|media|store|visit|take out|our mission|giving back|cooking classes|find in stores|find your soup|soup faqs|broth faqs|links|give the gift of well-being|private banquet events|can i freeze your soup\?|is your soup low in salt\?)$/i,
  /^(?:annual events|bid programs and publications|bid programs & publications|business and office directory|business & office directory|calendar|commercial activity|georgetown dc faqs|labor day|signature cocktails|beers)$/i,
  /^(?:a day on the line|dining at dogon|chef de cuisine|q&a with chef kwame|history and inspiration|sign-up|guides|office space in georgetown|sidewalk extensions & streateries)$/i,
  /^(?:business planning|products?|shipping cost(?:\s*\(.+\))?)$/i,
];

const editorialOrPressCardNamePatterns = [
  /^(?:\d+\s+food halls around d\.?c\.?|a late night eating cheat sheet for d\.?c\.?|best thai restaurants in d\.?c\.?|d\.?c\.?[’']?s best italian restaurants|where to (?:find|go for) .+|taco bamba .+|the surprising success story behind .+)$/i,
  /^(?:\d+\s+food halls around dc|a late night eating cheat sheet for dc|best thai restaurants in dc|dc[’']?s best italian restaurants)$/i,
  /^(?:co-founder .+ version|looking for the best .+|another great green space!?|.+ plans new .+ for .+)$/i,
];

const nonFoodCategoryPattern =
  /\b(?:banquet events|events?|gift cards?|newsletter|party menus?|welcome to|locations?)\b/i;

const ingredientFragmentNamePatterns = [
  /^(?:beta carotene|buttermilk, corn|dextrose, vanilla extract|diglycerides, guar gum|flavor, baking|lecithin|margarine \(vegetable|monoglycerides|natural,\s*dye-free cherries|niacin, reduced|powder, palm|processed with|salt\), chocolate|sea salt|shortening|vanilla)$/i,
  /^(?:acid,\s*natural|aluminum phosphate,?|cider vinegar,\s*salt,\s*oleoresin paprika,\s*natural|corn syrup,\s*caramel)$/i,
  /^(?:product has been|guests with gluten sensitivities|does not recommend|cookies is not an allergen|although not all of our products)\b/i,
  /^contains\s+(?:allergendiet|meat|nuts?\s+and\s+dairy|sugar)$/i,
];

const toppingHeaderNamePatterns = [
  /^(?:salad\s+toppings?|pizza\s+toppings?|burger\s+toppings?|sandwich\s+toppings?)$/i,
];

const nameOnlyPizzaOrSandwichModifierPatterns = [
  /^(?:basil|garlic confit|ground beef|honey|pepperoni|ricotta|sausage|red pepper flakes)$/i,
  /^(?:meat lover|veg\s*-\s*no roni\s*\/\s*add garlic)(?:\s*\(.+\))?$/i,
  /^make it a tray\b/i,
  /^yes,\s*on the (?:pizza|side)$/i,
];

const legalDescriptionPatterns = [
  /^\*?allergen notice:\s*menu items may contain or come into contact with\b/i,
  /\b(?:poetry reading\/open mic|open mic night)\b/i,
  /\b(?:please inform|please notify|contains raw or undercooked|cross[- ]?contact|menu items and prices may vary|automatic gratuity|service charge[sd]?|split checks)\b/i,
  /\b(?:privacy policy|terms of use|copyright|all rights reserved)\b/i,
];

const menuTransitionPatterns = [
  /\b(?:appetizers?|starters?|salads?|soups?|sandwiches?|burgers?|entrees?|mains?|sides?|desserts?|drinks?|beverages?|cocktails?|wine|beer)\b.{0,20}\b(?:appetizers?|starters?|salads?|soups?|sandwiches?|burgers?|entrees?|mains?|sides?|desserts?|drinks?|beverages?|cocktails?|wine|beer)\b/i,
];

function spacedOutPhraseBoundaryPattern(phrase) {
  const tokens = phrase.split(/\s+/).filter(Boolean);
  const tokenPatterns = tokens.map((token) =>
    token
      .split("")
      .map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+"),
  );

  return new RegExp(`\\b${tokenPatterns.join("\\s+")}\\b`, "i");
}

const spacedMenuTailBoundaryPatterns = [
  "appetizers",
  "bakery",
  "beverages",
  "breakfast",
  "brunch",
  "cocktails",
  "coffee",
  "desserts",
  "dinner",
  "drinks",
  "entrees",
  "farmhouse sushi",
  "from the broiler",
  "hot tea",
  "lunch",
  "main courses",
  "sandwiches",
  "slice",
  "suggested wine pairing",
  "sushi and ceviche",
].map((phrase) => spacedOutPhraseBoundaryPattern(phrase));

const venueSelfDescriptionPatterns = [
  /\b(?:chef de cuisine|general manager|please inquire for private parties|follow along|video courtesy|every dish tells a story|culinary innovation|acclaimed .* kitchen|visit our restaurants|order online for fresh|some nights are better spent at home)\b/i,
];

const alcoholOnlyDescriptionPattern =
  /\b(?:aglianico|ale|aperitif|barbaresco|barbera|barolo|beer|belgian wit|bitters|blanton|brandy|brewing|brunello|cabernet|champagne|chardonnay|chianti|corvina|daiginjo|fiano|frappato|gin|grappa|grillo|junmai|lagrein|lillet|martini|meritage|mezcal|montepulciano|moscato|nebbiolo|nero d'avola|pinot|prosecco|riesling|rioja|ros[ée]|rum|sake|sangria|sauvignon|sauternes|sagrantino|stout|pils|pilsner|lager|ipa|abv|lambic|gueuze|saison|fermentation|tequila|tonic|tawny port|valpolicella|vermentino|vermouth|vodka|whiskey|bourbon|brut|elderflower|grapefruit|nectar|hard cider|hard seltzer|nonalcoholic spirit|na spirit)\b/i;
const alcoholOnlyNamePattern =
  /\b(?:amrut|brewery|bubbly blanc|cider|eastcider|inedit|lager|pils|pilsner|ipa|stout|porter|martini|tini|mojito|gimlet|negroni|groni|old fashioned|margarita|sangria|moscow mule|spritz|cellos|limoncello|wine|wines|red blend|cabernet|chardonnay|riesling|pinot|rosso|ros[ée]|brut|champagne|veuve|clicquot|bichot|meursault|valpolicella|vermentino|blue moon|stella artois|bavik|belgian white|mezcal|tequila|vodka|gin|rum|bourbon|whiskey|hard seltzer|hayden|peroni|sake|junmai|daiginjo)\b/i;
const alcoholOnlyCategoryPattern =
  /\b(?:alcohol free|alpine italian regions|amari|beer|bianco macerato|bourbon|cabernet|canned\s*&\s*bottled beers|champagne|chardonnay|cocktails?|craft|distilled|drafts?|drink menu|happy hour drinks|islands|italy\s*\|\s*(?:central|north|south)|la cantina|martinis?|mezcal|mocktails?|night cap|other central regions|piemonte|pilsner|pinot|red\s*\|\s*rosso|rest of world|riesling|sips|southern regions|sparkling|spumante|spirits?|sweet wines?|the classics|umbria|veneto|wine|wines|zero proof)\b/i;

const drinkOnlyCategoryPattern =
  /\b(?:canned\s*&\s*bottled beers|cocktails?|craft|drink menu|happy hour drinks|la cantina|mocktails?|night cap|pilsner|sips|spirits?|zero proof)\b/i;

const simpleDrinkOnlyNamePattern =
  /^(?:bottled\s+)?(?:tap water|club soda|coffee|coca[- ]?cola|coke(?:\s+zero)?|diet coke|sprite|brisk(?:\s+iced?)?\s+tea|iced? tea(?:\s+brisk)?|(?:barq['’]?s?\s+)?root\s*beer|sarsaparilla root\s*beer|drip coffee|iced coffee|topo chico(?:\s+(?:mineral|sparkling mineral)\s+water)?|topo chico(?:®|r| lime®| limer)?)(?:\s+bottle)?[,]?$/i;

const nutritionTableBlobPattern =
  /\b(?:Wgt\s*\(g\)|Cals\s*\(kcal\)|FatCals|SatFat|TransFat|Chol\s*\(mg\)|Sod\s*\(mg\)|TotFib|Prot\s*\(g\))\b/i;
const nutritionDocumentCardNamePattern =
  /^(?:nutrition\s*\(|nutrition(?:\s*(?:[-–—]|\(|$)|\s+facts?\b|\s+information\b)|.+\s+nutrition(?:\s*(?:[-–—]|\(|$)|\s+facts?\b|\s+information\b)|nutrition informa(?:tion)?(?:\s+nutrition informa(?:tion)?)?\s*tion)$/i;
const allergenMatrixBlobPattern =
  /\b(?:X\s+Contains|Contains\s+(?:Milk|Egg|Soy|Wheat|Fish|Shellfish|Tree Nuts?|Peanuts?|Sesame)|(?:Milk|Egg|Soy|Wheat|Fish|Shellfish|Tree Nuts?|Peanuts?|Sesame)\s+Contains)\b/i;
const dietaryMatrixMarkerPrefixPattern =
  /^(?:(?:Y|N|NOTE|modify|vegan|dairy-free|gluten-free|soy-free)\b\s*){4,}/i;
const dietaryMatrixMarkerTokenPattern = /^(?:Y|N|NOTE|modify|vegan|dairy-free|gluten-free|soy-free)$/i;
const dietaryLegendTextPattern =
  /\b(?:v|vg|df|gf|g|n|sh|hc)\s*[-–]\s*(?:vegetarian|vegan|dairy[- ]?free|gluten|contains\s+(?:nuts?|dairy|gluten|shellfish)|health conscious)\b/i;
const dietaryLegendBlobPattern =
  /\b(?:GF\s+Gluten[- ]Friendly|DF\s+Dairy[- ]Free|V\s+Vegetarian|N\s+Contains\s+Nuts|S\s+Spicy)\b/i;

const availabilityDescriptionPattern = /\s*(?:out of stock|sold out|unavailable)\b.*$/i;
const topoChicoMarketingDescriptionPattern =
  /^topo chico has always been known for the legend surrounding its origins\./i;
const websiteWidgetDescriptionPattern =
  /\b(?:welcome bar|autocomplete suggestions|content research tools|newsroom smart links|custom call-to-action|ecommerce search results|search traffic to your site|rich snippet rendering|bizmate signature|filtr8 popups|customers'? birthday rewards|publish unlimited articles|magazine'?s subscribers|premium sites will automatically benefit|display your custom call-to-action|important stats right to your inbox|set the frequency\s*-\s*daily,\s*weekly or monthly|testimonials app|testimonial texts|testimonial content|social proof|wix contacts|form entries|select from a variety of marker icons|google drive|visitor analytics|click path graphs|export your stats to excel)\b/i;
const carouselAccessibilityDescriptionPattern =
  /\bthere are currently\s+\d+\s+menu items in the viewport\b.+\bslider navigation buttons\b/i;
const gameCardDescriptionPattern = /^(?:quick and annoying|keep ['’]em moving|tap|score|game over)\b/i;

const visitPlanningNamePatterns = [
  /^(?:call for larger groups|check hours first|confirm (?:the visit window|timing))$/i,
];

const visitPlanningDescriptionPattern =
  /\b(?:current hours signal|for larger parties,\s*peak times,\s*or tight schedules|calling is safer than guessing from public listings|see the location page for the full weekly schedule)\b/i;

function isSpacedOutLetterText(value) {
  const text = String(value ?? "").trim();
  const letters = text.match(/[A-Za-z]/g) ?? [];

  return letters.length >= 8 && /(?:\b[A-Za-z]\s+){4,}[A-Za-z]\b/.test(text);
}

function evidenceUrlsForItem(item) {
  return [
    ...(Array.isArray(item?.sourceUrls) ? item.sourceUrls : []),
    ...(Array.isArray(item?.evidence) ? item.evidence.map((entry) => entry?.sourceUrl) : []),
  ]
    .map((value) => String(value ?? ""))
    .filter(Boolean);
}

function evidenceTextForItem(item) {
  return (Array.isArray(item?.evidence) ? item.evidence : [])
    .map((entry) => entry?.text)
    .map((value) => String(value ?? ""))
    .filter(Boolean)
    .join(" ");
}

function cleanEvidenceDescriptionCandidate(item, currentDescription) {
  const description = String(currentDescription ?? "").replace(/\s+/g, " ").trim();

  if (description.length < 140 || !Array.isArray(item?.evidence)) {
    return null;
  }

  const normalizedDescription = description.toLowerCase().replace(/\s+/g, " ");
  const candidates = item.evidence
    .map((entry) => String(entry?.text ?? "").replace(/\s+/g, " ").trim())
    .filter((text) => text.length >= 12 && text.length <= 240)
    .filter((text) => !text.endsWith("...") && !text.endsWith("…"))
    .filter((text) => !isSourceBoilerplateDescription(text))
    .filter((text) => !isPriceOnlyDescription(text))
    .filter((text) => !/\b(?:privacy policy|terms of use|all rights reserved|location and ordering hours)\b/i.test(text))
    .filter((text) => {
      const normalizedCandidate = text.toLowerCase().replace(/\s+/g, " ");

      return (
        normalizedDescription.startsWith(normalizedCandidate) ||
        normalizedDescription.includes(normalizedCandidate)
      );
    })
    .sort((left, right) => left.length - right.length);

  const best = candidates[0];

  if (!best || description.length < best.length + 60) {
    return null;
  }

  return best;
}

function isWebsiteAnchorNavigationCard(name, description, item) {
  if (description || item?.sourceType !== "html-card") {
    return false;
  }

  const normalizedName = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const anchorUrls = evidenceUrlsForItem(item).filter((url) => /#[a-z0-9_-]+$/i.test(url));

  if (anchorUrls.length === 0) {
    return false;
  }

  const navAnchorNames = new Set([
    "bar",
    "gift",
    "gift-ideas",
    "who",
    "who-we-are",
    "whoweare",
    "about",
    "contact",
    "events",
    "private-events",
  ]);

  return navAnchorNames.has(normalizedName) || anchorUrls.some((url) => {
    const anchor = url.split("#").pop()?.toLowerCase() ?? "";
    return navAnchorNames.has(anchor) && !hasDishSpecificName(name);
  });
}

function isPdfBulletModifierOrAddon(name, description, item) {
  if (item?.sourceType !== "pdf-menu") {
    return false;
  }

  const cleanName = name.replace(/^[•·]\s*/u, "").replace(/\s*[•·]\s*$/u, "").trim();
  const cleanDescription = description.replace(/^[•·]\s*/u, "").replace(/\s*[•·]\s*$/u, "").trim();

  if (!/^[•·]/u.test(name)) {
    return false;
  }

  if (/:\s*$/.test(name) && /^(?:\d+\s+)?(?:mild\s+)?(?:italian\s+)?(?:sausage|meatballs?|shrimp|chicken|salmon|steak|protein|sauce|dressing|rolls?)s?:?$/i.test(cleanName)) {
    return true;
  }

  if (/^a\s+side\s+of\b/i.test(cleanName)) {
    return true;
  }

  if (cleanDescription && /^[•·]/u.test(description) && !hasDishSpecificName(`${cleanName} ${cleanDescription}`)) {
    return true;
  }

  return false;
}

function isConcatenatedMenuListArtifact(name, description) {
  const text = `${name ?? ""} ${description ?? ""}`.trim();

  if (!text) {
    return false;
  }

  const packedBoundaryCount =
    (text.match(/[a-z](?:Queso|Guacamole|Rice|Beans|Churros|Salsa|Tacos|Burritos|Bowls|Salads|Sides|Drinks|Desserts)\b/g) ??
      []).length;
  const menuListTermCount = new Set(
    (text.match(/\b(?:chips|salsa|queso|guacamole|rice|beans|churros|tacos|burritos|bowls|salads|sides|desserts|drinks)\b/gi) ??
      []).map((value) => value.toLowerCase()),
  ).size;

  return packedBoundaryCount >= 2 && menuListTermCount >= 4;
}

function isCompactedMultiItemPriceArtifact(name, description) {
  const text = `${name ?? ""} ${description ?? ""}`.replace(/\s+/g, " ").trim();

  if (!text) {
    return false;
  }

  const compactPriceBoundaries =
    text.match(/\b[A-Z][A-Z'’&(). -]{2,60}\s+\d{1,2}(?:\.\d{2})?(?=[A-Z])/g) ?? [];
  const mixedPriceBoundaries =
    text.match(/\b[A-Z][A-Za-z'’&(). -]{2,60}\s+\$?\d{1,2}(?:\.\d{2})?\s*[|]\s*/g) ?? [];
  const compactOptionBoundaries =
    text.match(/\b(?:Chicken|Pork|Shrimp|Seafood|Scallop|Crabmeat|Crispy Pork|Crispy Duck|Roti|Egg|Peanut Sauce)\s+\d{1,2}(?=[A-Z])/g) ??
    [];
  const compactNamedBoundaryCount =
    (text.match(/[a-z)](?=[A-Z][A-Z'’&() -]{3,}\s+\d{1,2}(?:\.\d{2})?)/g) ?? []).length;

  if (compactPriceBoundaries.length + compactOptionBoundaries.length >= 2) {
    return true;
  }

  if (mixedPriceBoundaries.length >= 2 && compactNamedBoundaryCount >= 1) {
    return true;
  }

  return false;
}

function isGenericPackageCourseChoiceHeader(name, description) {
  return (
    /^(?:first|second|third|fourth|fifth|sixth)\s+course$/i.test(String(name ?? "").trim()) &&
    /^(?:choose\s+from|choice\s+of):?$/i.test(String(description ?? "").trim())
  );
}

function isPdfOcrMangledSplitName(value, item = {}) {
  const text = String(value ?? "").trim();
  const description = String(item?.description ?? "");
  const category = String(item?.category ?? "");
  const sourceUrls = Array.isArray(item?.sourceUrls) ? item.sourceUrls.join(" ") : "";

  if (text.length < 8 || text.length > 80) {
    return false;
  }

  const alpha = text.replace(/[^A-Za-z]/g, "");
  if (alpha.length < 8) {
    return false;
  }

  const words = text.split(/\s+/).filter(Boolean);
  const shortUpperChunks = words.filter((word) => /^[A-Z]{1,3}$/.test(word)).length;
  const allCapsish = text === text.toUpperCase();
  const hasBrokenLongWord = /\b[A-Z]{1,3}\s+[A-Z]{1,3}\s+[A-Z]{1,3}\b/.test(text);
  const hasOcrTableContext =
    /\b\d{2,4}\s*cal\b/i.test(description) ||
    /\bnorthitalia\b/i.test(`${category} ${sourceUrls}`);

  return allCapsish && shortUpperChunks >= 3 && hasOcrTableContext && (hasBrokenLongWord || /\b[A-Z]\b/.test(text));
}

function hasNorthItaliaSource(item = {}) {
  const sourceUrls = Array.isArray(item?.sourceUrls) ? item.sourceUrls.join(" ") : "";
  const sourceSummary = String(item?.sourceSummary ?? "");

  return /\bnorthitalia\b|North-Italia|tcf-north-italia/i.test(`${sourceUrls} ${sourceSummary}`);
}

function isRepeatedCompactNameArtifact(value) {
  const compact = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

  if (compact.length < 16 || compact.length % 2 !== 0) {
    return false;
  }

  const half = compact.length / 2;

  return compact.slice(0, half) === compact.slice(half);
}

function isNorthItaliaDisplayArtifactName(name) {
  const text = String(name ?? "").trim();

  if (!text) {
    return false;
  }

  if (isRepeatedCompactNameArtifact(text)) {
    return true;
  }

  return (
    /^(?:2\s*oz\.?\s*pour|all beers|brunch(?:\s*[-–—]\s*)+|brunch sides(?:\s*[-–—]\s*)+|craft cocktails|dinner entrees|dinner pastas|fresh pasta\s*&\s*entr[ée]es|napkins\s*&\s*utensils|pizza\s*&\s*stromboli|weekend brunch)$/i.test(text) ||
    /^(?:barbera|bombo|br\s+ookie|caci|capr|car|dirty|drip coffee|close|chocolate dipping sauce)$/i.test(text) ||
    /^(?:alta rossa(?:\s*\([^)]+\))?|breakfast mule(?:\s*\([^)]+\))?|cabe\s+rnets?\s+au\s+vignon|caff[éè]\s+borghetti|caff[éè]\s+piazza|calle ocho(?:\s*\([^)]+\))?|caravella orangecello|ch\s+ar\s+donn\s+ay|chianti classico|greco\s*di\s*tufo|grecoditufo|gri\s*llo|kids beverage|la spezia|m\s+albe\s+c|merlot|moscato d'?asti|negroamaro|panna\s+1\s+liter|passione|ph\s+onynegroni|phonynegroni|pi\s+nano\s*-?l\s+ada|pomegranate mule(?:\s+glass|\s+pitcher)?|rie|ristretto|s\s+au\s+vignon|super tuscan)$/i.test(text) ||
    /^(?:banan coffee cake|cr\s+isp\s+yegg|cr\s+ush\s+edme|dai\s+ly\s+soup|dai\s+ly\s+soupdai\s+ly\s+soup|gri|h\s+o\s+use-m|haze|i\s+tali|jump\s+star\s+t|se\s+ason\s+al\s+butter|se\s+ason\s+al\s+vege\s+table|sm\s+okeds|spi\s+cyi\s+tali\s+an\s+grinder|spi\s+cyrig|squidink|tir|wh\s+itetruff)$/i.test(text) ||
    /^(?:choice of crispy potatoes or a green salad|choice of green salad or crispy fries(?:\..*)?|creamy polenta,\s*rustic marinara,\s*grana padano|fontina,\s*rosemary,\s*black truffle honey|heirloom tomato,\s*stracciatella,\s*arugula,\s*basil pesto|mionetto na aperitivo,\s*crushed lemon,\s*bubbles|mozzarella,\s*fresh basil,\s*red sauce,\s*evoo|pepperonata,\s*smoked mozzarella,\s*calabrian aioli|ricotta,\s*pecorino,\s*simple tomato sauce,\s*basil|roasted mushroom,\s*truffle,\s*cipollini,\s*smoked mozzarella|sea salt,\s*agrumato,\s*lemon aioli)$/i.test(text)
  );
}

function isNorthItaliaPollutedDescription(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return false;
  }

  return (
    /\bClose\b/i.test(text) ||
    /\b(?:Coffee|Daily Soups?|Fresh Pasta|Garlic Knot Sliders|Gluten-Free Crust Pizza|Happy Hour|Kids'? (?:Menu|Beverage)|Sides|Brunch|Pizza(?: & Stromboli)?)\s+-\s+-\s+-/i.test(text) ||
    /\b(?:CAPPUCCINO|MACCHIATO|LATTE|ESPRESSO|HOT TEA)\b.+\b(?:Happy Hour|ZUCCH|whole milk|nonfat milk|soy milk|almond milk)\b/i.test(text) ||
    /\b(?:Monday-Friday|Served in the Bar|Join Us for Brunch)\b/i.test(text) ||
    /\b(?:SPICY RIGATONI VODKA|BOLOGNESE STROZZAPRETI)\b.+\b\d{2,4}\s+\d{2,4}\s+\d{1,3}\s+\d{1,3}\b/i.test(text) ||
    /\b(?:FARMERS MARKET BOARD|CHEF'S BOARD|GRILLED ARTICHOKE)\b.+\b(?:Daily Soups?|BUTTERNUT SQUASH)\b/i.test(text) ||
    /\b(?:BREAKFAST CARBONARA PASTA|SHORT RIB HASH|FARMER'S MARKET SCRAMBLE|POLLO FRITTO|ROSEMARY HAM)\b/i.test(text) ||
    /\b(?:ARANCINI|WHITE TRUFFLE GARLIC BREAD)\b/i.test(text) ||
    /\b(?:SPICY ITALIAN GRINDER|TUSCAN KALE|BRUSSELS SPROUT|BUTTERNUT SQUASH & BRUSSELS CARBONARA)\b/i.test(text) ||
    /\b(?:CHICKPEA LENTIL MINESTRONE|ITALIAN COBB|FUNGHI|BRAISED SHORT RIB(?: MARSALA)?|PRIME NEW YORK TAGLIATA)\b/i.test(text) ||
    /\bSalads includes dressing\s+-\s+-\s+-/i.test(text) ||
    /\bvegetable Noodle Pasta\s+-\s+-\s+-/i.test(text) ||
    /\ball sandwiches are served with choice of side:\s+-\s+-\s+-/i.test(text) ||
    /\b(?:Fresh Pasta Sub Gluten-Free Pasta|KIDS MEATBALL SLIDERS|POTATO & SPINACH|PROSCIUTTO & ARTICHOKE|PROSCIUTTO COTTO)\b/i.test(text) ||
    /^(?:Beverages|Hot Tea)$/i.test(text) ||
    /\b(?:Gluten-Free\s+[A-Z][A-Z '&]+){2,}/.test(text)
  );
}

function trimDescriptionAtAdjacentMenuBoundary(value) {
  const description = String(value ?? "").trim();

  if (description.length < 45) {
    return description;
  }

  const boundaryPatterns = [
    /\s+\$\d{1,3}(?:\.\d{2})?\+?(?:\s*\/\s*\$?\d{1,3}(?:\.\d{2})?)?\s+(?=[A-Z][A-Za-z0-9 '&+().-]{2,70}\b)/,
    /\s+\b(?:Grilled\s+Chicken\s+Sandwich|Po[’']?Boys|Chopped\s+Salad|House\s+Salad|Roasted\s+Beet\s+&\s+Blood\s+Orange|Campechana|Blackened\s+Catfish)\b(?=\s+[A-Z][A-Za-z,&'’ -]{3,})/,
    /\s+\b[A-Z][A-Z0-9'’&+().-]{2,}(?:\s+[A-Z][A-Z0-9'’&+().-]{2,}){1,5}\b(?=\s+(?:[a-z“"]|A\s+NOLA\b))/,
    /\s+\b[A-Z][A-Za-z0-9 '&+().-]{3,70}\s+\[[^\]]{3,40}\](?=\s|$)/,
    /\s+\b[A-Z][A-Za-z '&().!-]{3,70}\s+(?:(?:agf|vg|gf|df|sf|nf|v|n|d)\b\s*)?\.{5,}\s*(?:\$?\d(?:\.\d{2})?)?/,
    /\s+\b[A-Z][A-Z '&().!-]{5,70}\s+\.{5,}\s*\$?\d(?:\.\d{2})?(?:\s*\/\s*\$?\d(?:\.\d{2})?)?/,
    /\s+\b[A-Z][A-Z '&().-]{5,70}\s+\$?\d{1,3}(?:\.\d{2})?\s*\/\s*\$?\d{1,3}(?:\.\d{2})?\b/,
    /\s+\b[A-Z][A-Z '&().-]{5,70}\s+\$\d{1,3}(?:\.\d{2})?\b/,
    /\s+\b(?:[A-Z]\s*,\s*)?(?:[A-Z]\s*,\s*)?[A-Z]\s+[A-Z][A-Z '&().-]{5,70}\b/,
    /\s+\bSodas,\s+Iced\s+Teas\s+&\s+Juices\b/i,
  ];
  let cutIndex = -1;

  for (const pattern of boundaryPatterns) {
    const match = description.match(pattern);

    if (match?.index != null && match.index >= 20 && (cutIndex === -1 || match.index < cutIndex)) {
      cutIndex = match.index;
    }
  }

  if (cutIndex === -1) {
    return description;
  }

  const trimmed = description
    .slice(0, cutIndex)
    .replace(/\s+/g, " ")
    .replace(/[,\s;:-]+$/g, "")
    .trim();

  return trimmed.length >= 20 ? trimmed : description;
}

function trimDescriptionAtSpacedMenuTailBoundary(value) {
  const description = String(value ?? "").trim();

  if (!description) {
    return description;
  }

  let cutIndex = -1;

  for (const pattern of spacedMenuTailBoundaryPatterns) {
    const match = description.match(pattern);

    if (match?.index == null) {
      continue;
    }

    if (cutIndex === -1 || match.index < cutIndex) {
      cutIndex = match.index;
    }
  }

  if (cutIndex === -1) {
    return description;
  }

  const before = description
    .slice(0, cutIndex)
    .replace(/\s+/g, " ")
    .replace(/[,\s;:-]+$/g, "")
    .trim();

  return before.length >= 12 ? before : "";
}

function trimDescriptionAtSpacedDotLeader(value) {
  const description = String(value ?? "").trim();
  const dotLeaderPattern = /(?:(?:\s*\.\s*)|(?:\s*[…]\s*)){4,}|[…][\s.…]*\d+(?:\.\d{2})?/;
  const match = description.match(dotLeaderPattern);

  if (!match?.index && match?.index !== 0) {
    return description;
  }

  const index = match.index;
  const before = description
    .slice(0, index)
    .replace(/\s+/g, " ")
    .replace(/[,\s;:-]+$/g, "")
    .trim();
  const after = description.slice(index + match[0].length).trim();

  if (!before) {
    return "";
  }

  if (/^(?:large|small|regular|bottled soda|fountain soda|homemade ice tea|iced tea|check for availability)$/i.test(before)) {
    return "";
  }

  if (/^(?:[A-Z]|\d+[A-Z]?|[A-Z]\s+[A-Z])(?:\s+[A-Z])?$/i.test(before)) {
    return "";
  }

  if (/^[A-Z]?\d{1,3}\s+[A-Z][\p{L}\s'&-]{3,40}$/iu.test(before) && /\$?\d/.test(after)) {
    return "";
  }

  if (
    before.length >= 20 ||
    /^[A-Z][A-Z\s&'()-]{6,}$/.test(before) ||
    /\b(?:cheese|cake|salmon|crab|burger|sandwich|pasta|salad|soup|rice|noodle|taco|pizza)\b/i.test(before)
  ) {
    return before;
  }

  if (/(?:(?:\s*\.\s*)|(?:\s*[…]\s*)){4,}/.test(after)) {
    return "";
  }

  if (after.length > 40 && /\b(?:service charge|gratuity|foodborne|food borne|allerg|appetizers?|starters?|salads?|soups?|sandwiches?|entrees?|desserts?)\b/i.test(after)) {
    return before.length >= 8 ? before : "";
  }

  return description.replace(/\.{4,}/g, "...").replace(/\s+/g, " ").trim();
}

function trimNameAtSpacedDotLeader(value) {
  const name = String(value ?? "").trim();
  const dotLeaderPattern = /(?:\s*\.\s*){4,}/;
  const match = name.match(dotLeaderPattern);

  if (!match?.index && match?.index !== 0) {
    return name;
  }

  const before = name
    .slice(0, match.index)
    .replace(/\s+/g, " ")
    .replace(/[,\s;:-]+$/g, "")
    .trim();

  return before.length >= 3 ? before : name;
}

export function isSourceBoilerplateDescription(value) {
  const text = String(value ?? "").trim();

  return text.length > 0 && sourceBoilerplateDescriptionPatterns.some((pattern) => pattern.test(text));
}

export function isSourceBoilerplateSummary(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return false;
  }

  if (/^.+\s+from the restaurant'?s current official menu or allergen source\.?$/i.test(text)) {
    return true;
  }

  return (
    /^pdf\.?$/i.test(text) ||
    /^row;\s+no\s+major\s+allergen\s+marked\s+in\s+the\s+table\.?$/i.test(text) ||
    /^official\s+allergen\s+matrix\.?$/i.test(text) ||
    /^official\s+.+\s+allergen matrix note:/i.test(text) ||
    /^.+\s+nutritionix online nutrition (?:and allergen )?guide\.?$/i.test(text) ||
    /^.+\s+official\s+.+\s+(?:allergen|nutrition|allergen and nutrition|nutrition and allergen)\s+(?:guide|matrix|pdf|api|calculator|widget)\.?$/i.test(
      text,
    ) ||
    /^official\s+.+\s+(?:item-level\s+)?(?:allergen|nutrition|allergen and nutrition|nutrition and allergen)\s+(?:guide|matrix|pdf|api|calculator|widget)\.?$/i.test(
      text,
    ) ||
    /^official\s+.+\s+nutrition\s+calculator\s+api\.?$/i.test(text)
  );
}

function isSourceReviewNoteIngredientsText(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();

  if (!text) {
    return false;
  }

  return (
    /^reviewed official (?:row-level allergen evidence|global allergen notice)\.?$/i.test(text) ||
    /^.+ official menu ingredient review:/i.test(text) ||
    /^reviewed .+ official menu text:/i.test(text) ||
    /\bmapped to app allergens\b/i.test(text) ||
    /\bstored as cross-contact caution, not direct item ingredients\b/i.test(text)
  );
}

function isLegalOrWebsiteBoilerplateIngredientsText(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();

  if (!text) {
    return false;
  }

  return (
    /^lorem ipsum dolor sit amet\b/i.test(text) ||
    /\b(?:©|copyright)\s*\d{4}\b/i.test(text) ||
    /\ball rights reserved\b/i.test(text) ||
    /\b(?:privacy policy|terms of use|cookie policy|accessibility statement)\b/i.test(text) ||
    /\b(?:website designed|powered by|managed by)\b/i.test(text)
  );
}

function isCmsPlaceholderMenuDescription(value) {
  const text = String(value ?? "").replace(/[“”]/g, "\"").replace(/\s+/g, " ").trim();

  return (
    /^"?I(?:'|’| a)m a dish description\.?\s+Click "?Edit Menu"? to open the Restaurant Menu editor and change my text\.?"?$/i.test(
      text,
    ) ||
    /^"?I(?:'|’| a)m a description for a section of your menu\.?\s+Click me and then "?Edit Menu"? to open the Restaurant Menu editor and change my text\.?"?$/i.test(
      text,
    ) ||
    /^lorem ipsum dolor sit amet\b/i.test(text) ||
    /^support\s+lorem ipsum dolor sit amet\b/i.test(text)
  );
}

function cleanPublishedEvidenceText(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();

  if (!text) {
    return text;
  }

  return text
    .replace(/\s+-\s+Reviewed official row[- ]level allergen evidence\.?$/i, "")
    .replace(/\s+-\s+Reviewed official global allergen notice\b[\s\S]*$/i, "")
    .replace(/\s+-\s+Official\s+.+?\s+nutrition calculator API\.?$/i, "")
    .replace(/\s+-\s+Official\s+.+?\s+(?:allergen|nutrition|allergen and nutrition|nutrition and allergen)\s+(?:guide|matrix|pdf|api|calculator|widget)\.?$/i, "")
    .trim();
}

function isPublishEvidenceBoilerplateOnly(value) {
  const text = cleanPublishedEvidenceText(value);

  if (!text) {
    return true;
  }

  return isCmsPlaceholderMenuDescription(text) || isSourceBoilerplateSummary(text);
}

function cleanDietaryMatrixMarkerText(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();

  if (!dietaryMatrixMarkerPrefixPattern.test(text)) {
    return null;
  }

  const tokens = text.split(/\s+/);
  let index = 0;

  while (index < tokens.length && dietaryMatrixMarkerTokenPattern.test(tokens[index])) {
    index += 1;
  }

  const note = tokens
    .slice(index)
    .join(" ")
    .replace(/\s+\/\s+/g, " / ")
    .trim();

  if (
    !note ||
    /^(?:Y|N|NOTE|modify)(?:\s+(?:Y|N|NOTE|modify))*$/i.test(note) ||
    !/\b(?:gluten|wheat|dairy|milk|egg|soy|sesame|nuts?|cashews?|pecans?|almond|coconut|cross[- ]?contamination|same fryer|no\s+\w+)/i.test(
      note,
    )
  ) {
    return null;
  }

  return note;
}

function stripInlineAllergenHeadingFromDescription(value) {
  const description = String(value ?? "").trim();

  if (!description) {
    return { description, strippedSummary: null };
  }

  let nextDescription = description;
  let strippedSummary = null;
  const secondAllergenHeadingIndex = nextDescription.search(/\s+ALLERGENS?:\s+/i);

  if (secondAllergenHeadingIndex > 0) {
    strippedSummary = nextDescription.slice(secondAllergenHeadingIndex).trim();
    nextDescription = nextDescription.slice(0, secondAllergenHeadingIndex).trim();
  }

  const leadingAllergenHeadingMatch = nextDescription.match(
    /^ALLERGENS?:\s*([A-Z][A-Z\s/&,-]{2,120}?)(?=\s+[A-Z][a-z])\s*/,
  );

  if (leadingAllergenHeadingMatch) {
    strippedSummary = leadingAllergenHeadingMatch[0].trim();
    nextDescription = nextDescription.slice(leadingAllergenHeadingMatch[0].length).trim();
  }

  const leadingNonAppAllergenFragmentMatch = nextDescription.match(
    /^(?:CITRUS|ALLIUMS|CAPSICUM|VINEGAR|MUSHROOM|PORK)(?:,\s*(?:CITRUS|ALLIUMS|CAPSICUM|VINEGAR|MUSHROOM|PORK))*\s+(?=[A-Z][a-z])/,
  );

  if (leadingNonAppAllergenFragmentMatch) {
    strippedSummary = [strippedSummary, leadingNonAppAllergenFragmentMatch[0].trim()].filter(Boolean).join(" ");
    nextDescription = nextDescription.slice(leadingNonAppAllergenFragmentMatch[0].length).trim();
  }

  return {
    description: nextDescription.replace(/\s+/g, " ").trim(),
    strippedSummary,
  };
}

function stripInlineAllergenNoticeTailFromDescription(value) {
  const description = String(value ?? "").trim();

  if (!description) {
    return { description, strippedSummary: null };
  }

  const patterns = [
    /\s*(?:⚠️?\s*)?(?:gluten|wheat|milk|dairy|egg|eggs|soy|sesame|fish|finfish|shellfish|peanuts?|tree nuts?|nuts)(?:\s*[,/&]\s*(?:gluten|wheat|milk|dairy|egg|eggs|soy|sesame|fish|finfish|shellfish|peanuts?|tree nuts?|nuts))*\s+Allergens?(?:\s+(?:Possible\s+cross\s+contact\s+with\s+(?:gluten|wheat|milk|dairy|egg|eggs|soy|sesame|fish|finfish|shellfish|peanuts?|tree nuts?|nuts)|Cross[- ]?contact\s+(?:possible\s+)?with\s+(?:gluten|wheat|milk|dairy|egg|eggs|soy|sesame|fish|finfish|shellfish|peanuts?|tree nuts?|nuts)))?\.?$/i,
    /\s*(?:⚠️?\s*)?(?:gluten|wheat|milk|dairy|egg|eggs|soy|sesame|fish|finfish|shellfish|peanuts?|tree nuts?|nuts)(?:\s*[,/&]\s*(?:gluten|wheat|milk|dairy|egg|eggs|soy|sesame|fish|finfish|shellfish|peanuts?|tree nuts?|nuts))*\s+Allergens?\s+[A-Z][A-Za-z ]{2,48}\s+contains?\s+(?:gluten|wheat|milk|dairy|egg|eggs|soy|sesame|fish|finfish|shellfish|peanuts?|tree nuts?|nuts)\.?$/i,
    /\s*(?:⚠️?\s*)?Contains?\s+(?:gluten|wheat|milk|dairy|egg|soy|sesame|fish|shellfish|peanuts?|tree nuts?)(?:\s*[,/&]\s*(?:gluten|wheat|milk|dairy|egg|soy|sesame|fish|shellfish|peanuts?|tree nuts?))*\.?\s+Cross[- ]?contact\s+(?:with\s+)?(?:gluten|wheat|milk|dairy|egg|soy|sesame|fish|shellfish|peanuts?|tree nuts?)\s+is\s+possible\.?$/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);

    if (!match) {
      continue;
    }

    return {
      description: description.slice(0, match.index).replace(/\s+/g, " ").trim(),
      strippedSummary: match[0].trim(),
    };
  }

  return { description, strippedSummary: null };
}

function stripLeadingAllergenLabelFromDescription(value) {
  const description = String(value ?? "").trim();

  if (!description) {
    return { description, strippedSummary: null };
  }

  const allergenLabel =
    "(?:allium|alliums|dairy|milk|lactose|gluten|wheat|egg|eggs|soy|soybean|sesame|fish|shellfish|shrimp|pork|mushroom|peanuts?|tree nuts?|nuts?|almonds?|cashews?|walnuts?|pistachio|garlic|honey|raisins?)";
  const separator = "(?:[,/&]|\\s+and\\s+|\\s*[•]\\s*)";
  const pattern = new RegExp(
    `^\\s*(?:\\(?\\s*)?(contains?|may\\s+contain|contains?\\s+or\\s+may\\s+contain)\\s*(?:-|:)?\\s*${allergenLabel}(?:\\s*${separator}\\s*${allergenLabel})*\\s*(?:\\)|\\])?\\s*(?:[.:;,-]\\s*)?`,
    "i",
  );
  const match = description.match(pattern);

  if (!match) {
    return { description, strippedSummary: null };
  }

  const strippedSummary = match[0].replace(/[.:;,\s-]+$/g, "").trim();
  const remaining = description.slice(match[0].length).replace(/\s+/g, " ").trim();

  if (
    !remaining ||
    /^(?:can be modified|orders? must be placed|vegetarian|vegan|gluten[- ]free)?\s*\$?\d*(?:\.\d{2})?$/i.test(
      remaining,
    )
  ) {
    return { description: "", strippedSummary };
  }

  return { description: remaining, strippedSummary };
}

export function sanitizeMenuItemDisplayFields(item) {
  if (!item || typeof item !== "object") {
    return item;
  }

  const description = String(item.description ?? "").trim();
  const ingredientsText = String(item.ingredientsText ?? "").trim();
  const next = { ...item };

  if (typeof next.name === "string") {
    const unicodeEllipsisPriceMergedNameMatch = next.name.match(/^(.{3,80}?)[…]+\s*\d{1,3}(?:\.\d{2})?\s*([A-Z][\s\S]{8,})$/);

    if (unicodeEllipsisPriceMergedNameMatch) {
      next.name = unicodeEllipsisPriceMergedNameMatch[1].trim();
      next.description = unicodeEllipsisPriceMergedNameMatch[2].replace(/\s+/g, " ").trim();
      next.sourceSummary = item.sourceSummary ?? item.description ?? next.sourceSummary;
    }
  }

  if (typeof next.name === "string") {
    next.name = next.name
      .replace(/\s*[-–—]?\s*\((?:sold out|out of stock|unavailable)\)\s*/gi, " ")
      .replace(/\s*[-–—]?\s*(?:sold out|out of stock|unavailable)\s*$/gi, "")
      .replace(/\s*[-–—]\s*Order Anytime for\b[\s\S]*$/i, "")
      .replace(/\s+(?:(?:agf|vg|gf|df|sf|nf|v|n|d)\b\s*)?\.{5,}\s*(?:\$?\d+(?:\.\d{2})?(?:\s*\/\s*\$?\d+(?:\.\d{2})?)?)?.*$/i, "")
      .replace(/\.{5,}\s*(?:\$?\d+(?:\.\d{2})?(?:\s*\/\s*\$?\d+(?:\.\d{2})?)?)?.*$/i, "")
      .replace(/^(.+?[|]\s*\d{1,3}(?:\.\d{2})?)\s+\1$/i, "$1")
      .replace(/^(.+?)[|]\s*\d{1,3}(?:\.\d{2})?\s+\1$/i, "$1")
      .replace(/\s+(?:[|]|\bI\b)\s*\d{1,3}(?:\.\d{2})?\s*$/g, "")
      .replace(/[|]\s*\d{1,3}(?:\.\d{2})?\s*$/g, "")
      .replace(/\s*\.{5,}\s*$/g, "")
      .replace(/\s*[…]+\s*$/g, "")
      .replace(/\s*•\s*(?:\(\d+\)\s*)?(?:\d+(?:\.\d{2})?)?\s*(?:agf|vg|gf|df|sf|nf|v|n|d)?\s*$/i, "")
      .replace(/\s+(?:AGF|VG|GF|DF|SF|NF|V)\s*$/i, "")
      .replace(/\bSpaghei\b/g, "Spaghetti")
      .replace(/\bspaghei\b/g, "spaghetti")
      .replace(/\bBaered\b/g, "Battered")
      .replace(/\bbaered\b/g, "battered")
      .replace(/\bBuer\b/g, "Butter")
      .replace(/\bbuer\b/g, "butter")
      .replace(/\bricoa\b/gi, (match) => (match === match.toUpperCase() ? "RICOTTA" : "Ricotta"))
      .replace(/^[a-f0-9]{16,}\s+/i, "")
      .replace(/\s*,\s*$/g, "")
      .replace(/\s+/g, " ")
      .trim();

    next.name = trimNameAtSpacedDotLeader(next.name);

    const rawNameParts = next.name.split(/\s+/).filter(Boolean);
    if (rawNameParts.length >= 4 && rawNameParts.length % 2 === 0) {
      const halfway = rawNameParts.length / 2;
      const firstHalf = rawNameParts.slice(0, halfway).join(" ");
      const secondHalf = rawNameParts.slice(halfway).join(" ");

      if (firstHalf.toLowerCase() === secondHalf.toLowerCase()) {
        next.name = firstHalf.trim();
      }
    }

    const normalizedNameParts = next.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (normalizedNameParts.length >= 4 && normalizedNameParts.length % 2 === 0) {
      const halfway = normalizedNameParts.length / 2;
      const firstHalf = normalizedNameParts.slice(0, halfway).join(" ");
      const secondHalf = normalizedNameParts.slice(halfway).join(" ");

      if (firstHalf === secondHalf) {
        const originalParts = next.name.split(/\s+/).filter(Boolean);
        next.name = originalParts.slice(0, halfway).join(" ").trim();
      }
    }
  }

  if (typeof next.name === "string") {
    const pickBetweenBoundaryMatch =
      /^pick between:?$/i.test(next.name.trim()) &&
      typeof next.description === "string" &&
      next.description.match(/^([A-Z][A-Za-z0-9 &'’().-]{3,80}):\s+([a-zA-Z0-9][\s\S]{8,})$/);

    if (pickBetweenBoundaryMatch) {
      next.name = pickBetweenBoundaryMatch[1].trim();
      next.description = pickBetweenBoundaryMatch[2].replace(/\s+/g, " ").trim();
    }
  }

  if (typeof next.name === "string") {
    const dietaryMarkerMergedNameMatch = next.name.match(
      /^(.{3,80}?)\s+(?:v|vg|gf|agf|df|sf|nf|n|d)(?:\/(?:v|vg|gf|agf|df|sf|nf|n|d))+([A-Z][\s\S]{4,})$/i,
    );

    if (dietaryMarkerMergedNameMatch) {
      next.name = dietaryMarkerMergedNameMatch[1].trim();
      next.description = dietaryMarkerMergedNameMatch[2].replace(/\s+/g, " ").trim();
    }
  }

  if (typeof next.name === "string") {
    const bulletPriceMergedNameMatch = next.name.match(/^(.{3,80}?)\s*[•]\s*(?:\(\d+\)\s*)?\d+(?:\.\d{2})?\s*([A-Za-z][\s\S]{3,})$/);

    if (bulletPriceMergedNameMatch) {
      next.name = bulletPriceMergedNameMatch[1].trim();
      next.description = bulletPriceMergedNameMatch[2].replace(/\s+/g, " ").trim();
    }
  }

  if (typeof next.name === "string") {
    const priceMergedNameMatch = next.name.match(/^(.{3,80}?)\s*[—-]\s*\$\d+(?:\.\d{2})?([A-Z][\s\S]{8,})$/);

    if (priceMergedNameMatch) {
      next.name = priceMergedNameMatch[1].trim();
      next.description = priceMergedNameMatch[2].replace(/\s+/g, " ").trim();
    }
  }

  if (typeof next.name === "string") {
    const compactPriceMergedNameMatch = next.name.match(/^(.{3,80}?)\s*\$\d+(?:\.\d{2})?([A-Z][\s\S]{3,})$/);

    if (compactPriceMergedNameMatch) {
      next.name = compactPriceMergedNameMatch[1].trim();
      next.description = compactPriceMergedNameMatch[2].replace(/\s+/g, " ").trim();
    }
  }

  if (typeof next.name === "string" && typeof next.description === "string") {
    const sentenceName = next.name.trim();
    const possibleTitle = next.description.trim();

    if (
      /^[a-z](?:[a-z0-9'’&.,-]|\s){24,180}$/i.test(sentenceName) &&
      /^[a-z]/.test(sentenceName) &&
      /^[A-Z][A-Za-z0-9'’&(). -]{3,64}$/.test(possibleTitle) &&
      /\b(?:served with|topped with|made with|black bean|vegetable patty|lettuce|tomato|cheese|sauce|bread|bun|roll|sandwich)\b/i.test(sentenceName) &&
      !/[.!?]\s+[A-Z]/.test(sentenceName)
    ) {
      next.name = possibleTitle;
      next.description = sentenceName.replace(/\s+/g, " ").trim();
    }
  }

  if (typeof next.imageUrl === "string" && /^data:image\//i.test(next.imageUrl)) {
    delete next.imageUrl;
  }

  if (typeof next.category === "string" && shouldInferDisplayCategory(next)) {
    next.category = inferDisplayCategoryFromItem(next) ?? "Menu";
  }

  if (description && isSourceBoilerplateDescription(description)) {
    delete next.description;
    next.sourceSummary = item.sourceSummary ?? description;
  }

  if (
    ingredientsText &&
    (isSourceReviewNoteIngredientsText(ingredientsText) || isLegalOrWebsiteBoilerplateIngredientsText(ingredientsText))
  ) {
    next.sourceSummary = item.sourceSummary ?? ingredientsText;
    delete next.ingredientsText;
  }

  if (typeof next.description === "string" && isCmsPlaceholderMenuDescription(next.description)) {
    delete next.description;
  }

  if (Array.isArray(next.evidence)) {
    let evidenceChanged = false;
    const evidence = next.evidence
      .filter((entry) => {
        const keep = !isPublishEvidenceBoilerplateOnly(entry?.text);
        evidenceChanged ||= !keep;
        return keep;
      })
      .map((entry) => {
        const text = cleanPublishedEvidenceText(entry?.text);
        evidenceChanged ||= Boolean(text && text !== entry?.text);

        return text && text !== entry?.text ? { ...entry, text } : entry;
      });

    if (evidence.length === 0) {
      delete next.evidence;
    } else if (evidenceChanged) {
      next.evidence = evidence;
    }
  }

  if (typeof next.description === "string") {
    let sourceSummaryFromPrefix = null;
    let descriptionWithoutSourcePrefix = next.description;

    for (const pattern of sourceBoilerplatePrefixPatterns) {
      const match = descriptionWithoutSourcePrefix.match(pattern);

      if (match && match[0].trim().length > 0) {
        sourceSummaryFromPrefix = match[0].trim();
        descriptionWithoutSourcePrefix = descriptionWithoutSourcePrefix.slice(match[0].length).trim();
        break;
      }
    }

    if (sourceSummaryFromPrefix) {
      next.sourceSummary = item.sourceSummary ?? sourceSummaryFromPrefix;
    }

    const cleanedDescription = descriptionWithoutSourcePrefix
      .replace(/\bExploreReservations\b/g, "")
      .replace(/\s*\bAdd Item\b\s*/gi, " ")
      .replace(/\s*\bOur Menu\b\s*/gi, " ")
      .replace(/\s+\bOrder Now\b[\s\S]*$/i, "")
      .replace(/\s+\bPisco y Nazca [A-Za-z ]+ Location and Ordering Hours\b[\s\S]*$/i, "")
      .replace(/\s+\b[A-Z][A-Za-z0-9'’& .-]{2,80}\s+Location and Ordering Hours\b[\s\S]*$/i, "")
      .replace(/\s*\b(?:BREAKFAST|BEVERAGE|BRUNCH|DINNER|LUNCH)\s+MENU\s+@?[A-Z0-9_ -]+(?:\s*\|\s*[A-Z0-9./-]+)?\s+preparation\.?\s*/gi, " ")
      .replace(/\s+\bsafety is paramount\.?\s+Not all ingredients are listed[\s\S]*$/i, "")
      .replace(/\s+\bwith severe allergies susceptible to cross[- ]contact do not dine in the restaurant[\s\S]*$/i, "")
      .replace(/\s+\bSustainably wild-caught or sustainably farmed\.?\s+Traceable\.?[\s\S]*$/i, "")
      .replace(/\s+\bAmerican Vegetarian Association certified Vegetarian food items[\s\S]*$/i, "")
      .replace(/\s*\bMUST BE ORDERED A DAY IN ADVANCE\.?\s*/gi, " ")
      .replace(/\s*\bFor orders of 4 or more[\s\S]*$/i, "")
      .replace(/\s*\bYour choice:?\s*served hot or cold and we'?ll provide heating instructions\.?\s*/gi, " ")
      .replace(/^(?:[A-Za-z][A-Za-z &/+.-]{2,40}\s*[|]\s*)+(?:(?:V|VG|GF|DF|SF|NF|K|N|Seasonal)\s*[|]\s*)*(?:CAL\.?\s*[|]\s*)?\$?\d+(?:\.\d{2})?\s*/i, "")
      .replace(/^egetable\b/i, "vegetable")
      .replace(/^egetables\b/i, "vegetables")
      .replace(/^arinated\b/i, "marinated")
      .replace(/^uer\b/i, "butter")
      .replace(/^aered\b/i, "battered")
      .replace(/\bSpaghei\b/g, "Spaghetti")
      .replace(/\bspaghei\b/g, "spaghetti")
      .replace(/\bBaered\b/g, "Battered")
      .replace(/\bbaered\b/g, "battered")
      .replace(/\bBuer\b/g, "Butter")
      .replace(/\bbuer\b/g, "butter")
      .replace(/\bricoa\b/gi, (match) => (match === match.toUpperCase() ? "RICOTTA" : "Ricotta"))
      .replace(/\bVinaigree\b/g, "Vinaigrette")
      .replace(/\bvinaigree\b/g, "vinaigrette")
      .replace(/^\s*[•]\s*(?:\(\d+\)\s*)?\d+(?:\.\d{2})?\s*/i, "")
      .replace(/^[+/]?\d+(?:\.\d{2})?\s+(?!(?:oz|ounce|ounces|qt|quart|quarts|pt|pint|pints|lb|lbs|pound|pounds|cup|cups|piece|pieces|pc|pcs|slice|slices)\b)/i, "")
      .replace(/^\/?v\/?(?=agf|gf|df|sf|nf)/i, "")
      .replace(/^\/?(?:(?:n|d)\/)?(?:agf|vg|gf|df|sf|nf)(?:\/(?:agf|vg|gf|df|sf|nf|v|n|d))*/i, "")
      .replace(/^\s*[•]\s*(?:\(\d+\)\s*)?\d+(?:\.\d{2})?\s*/i, "")
      .replace(/^\/?v\/?(?=agf|gf|df|sf|nf)/i, "")
      .replace(/^\/?(?:(?:n|d)\/)?(?:agf|vg|gf|df|sf|nf)(?:\/(?:agf|vg|gf|df|sf|nf|v|n|d))*/i, "")
      .replace(/^\/m(?=(?:soy|garlic|thin|vegetables))/i, "")
      .replace(/\s+(?:(?:v|n|d)\/)?(?:agf|vg|gf|df|sf|nf|v)(?:\/(?:agf|vg|gf|df|sf|nf|v|n|d))*\s*[—-]\s*/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (cleanedDescription !== next.description.trim()) {
      next.description = cleanedDescription;
    }

    if (typeof next.description === "string") {
      const cleanEvidenceDescription = cleanEvidenceDescriptionCandidate(item, next.description);

      if (cleanEvidenceDescription) {
        next.sourceSummary = item.sourceSummary ?? next.description;
        next.description = cleanEvidenceDescription;
      }
    }

    if (typeof next.description === "string") {
      const strippedAllergenLabel = stripLeadingAllergenLabelFromDescription(next.description);

      if (strippedAllergenLabel.strippedSummary) {
        next.sourceSummary = item.sourceSummary ?? strippedAllergenLabel.strippedSummary;
        if (strippedAllergenLabel.description) {
          next.description = strippedAllergenLabel.description;
        } else {
          delete next.description;
        }
      }
    }

    if (typeof next.description === "string") {
      if (
        /official-product-allergen-section/i.test(String(next.allergenSourceType ?? "")) &&
        /^contains?\s+[-a-z0-9 ,/&()]+\.?$/i.test(next.description)
      ) {
        next.sourceSummary = next.description.trim();
        delete next.description;
      }
    }

    if (typeof next.description === "string") {
      const inlineAllergenHeading = stripInlineAllergenHeadingFromDescription(next.description);

      if (inlineAllergenHeading.strippedSummary) {
        next.sourceSummary = item.sourceSummary ?? inlineAllergenHeading.strippedSummary;
        if (inlineAllergenHeading.description) {
          next.description = inlineAllergenHeading.description;
        } else {
          delete next.description;
        }
      }
    }

    if (typeof next.description === "string") {
      const inlineAllergenNoticeTail = stripInlineAllergenNoticeTailFromDescription(next.description);

      if (inlineAllergenNoticeTail.strippedSummary) {
        next.sourceSummary = item.sourceSummary ?? inlineAllergenNoticeTail.strippedSummary;
        if (inlineAllergenNoticeTail.description) {
          next.description = inlineAllergenNoticeTail.description;
        } else {
          delete next.description;
        }
      }
    }

    if (
      typeof next.description === "string" &&
      /\b(?:with\s+)?(?:your\s+)?choice\s+of:\s*$/i.test(next.description)
    ) {
      const withoutDanglingChoice = next.description
        .replace(/\s*\b(?:with\s+)?(?:your\s+)?choice\s+of:\s*$/i, "")
        .replace(/[,\s]+$/g, "")
        .trim();

      next.sourceSummary = item.sourceSummary ?? next.description;
      if (withoutDanglingChoice) {
        next.description = withoutDanglingChoice;
      } else {
        delete next.description;
      }
    }

    if (
      typeof next.description === "string" &&
      /^(?:gluten|wheat|milk|dairy|egg|soy|sesame|fish|shellfish|peanuts?|tree nuts?|nuts?)$/i.test(
        next.description.trim(),
      )
    ) {
      next.sourceSummary = item.sourceSummary ?? next.description.trim();
      delete next.description;
    }

    if (typeof next.description === "string" && /\.{5,}/.test(next.description)) {
      const dottedTrimmed = trimDescriptionAtDottedLeader(next.description);

      if (dottedTrimmed !== next.description) {
        next.sourceSummary = item.sourceSummary ?? next.description;
        if (dottedTrimmed) {
          next.description = dottedTrimmed;
        } else {
          delete next.description;
        }
      }
    }

    if (
      typeof next.description === "string" &&
      /(?:(?:\s*\.\s*)|(?:\s*[…]\s*)){4,}|[…][\s.…]*\d+(?:\.\d{2})?/.test(next.description)
    ) {
      const spacedDotTrimmed = trimDescriptionAtSpacedDotLeader(next.description);

      if (spacedDotTrimmed !== next.description) {
        next.sourceSummary = item.sourceSummary ?? next.description;
        if (spacedDotTrimmed) {
          next.description = spacedDotTrimmed;
        } else {
          delete next.description;
        }
      }
    }

    if (typeof next.description === "string") {
      const trimmedAtBoundary = trimDescriptionAtAdjacentMenuBoundary(next.description);

      if (trimmedAtBoundary !== next.description) {
        next.sourceSummary = item.sourceSummary ?? next.description;
        next.description = trimmedAtBoundary;
      }
    }

    if (typeof next.description === "string") {
      const trimmedAtSpacedBoundary = trimDescriptionAtSpacedMenuTailBoundary(next.description);

      if (trimmedAtSpacedBoundary !== next.description) {
        next.sourceSummary = item.sourceSummary ?? next.description;
        if (trimmedAtSpacedBoundary) {
          next.description = trimmedAtSpacedBoundary;
        } else {
          delete next.description;
        }
      }
    }

    if (typeof next.description === "string") {
      const strippedLegalTail = stripMenuLegalTail(next.description);

      if (strippedLegalTail !== next.description) {
        next.sourceSummary = item.sourceSummary ?? next.description;
        if (strippedLegalTail) {
          next.description = strippedLegalTail;
        } else {
          delete next.description;
        }
      }
    }

    if (typeof next.description === "string") {
      const strippedOperationalTail = stripMenuOperationalTail(next.description);

      if (strippedOperationalTail !== next.description) {
        if (strippedOperationalTail) {
          next.sourceSummary = item.sourceSummary ?? next.description;
        } else if (isOperationalOnlyText(item.sourceSummary)) {
          delete next.sourceSummary;
        }

        if (strippedOperationalTail) {
          next.description = strippedOperationalTail;
        } else {
          delete next.description;
        }
      }
    }

    if (isOperationalOnlyText(next.sourceSummary)) {
      delete next.sourceSummary;
    }

    if (typeof next.description === "string" && hasNorthItaliaSource(next) && isNorthItaliaPollutedDescription(next.description)) {
      next.sourceSummary = item.sourceSummary ?? next.description;
      delete next.description;
    }

    if (
      typeof next.description === "string" &&
      /^(?:fresh fruit starters?|starters?|breakfast menu|brunch menu|dinner menu|lunch menu|pasta|sides?)$/i.test(
        next.description,
      )
    ) {
      next.sourceSummary = item.sourceSummary ?? next.description;
      delete next.description;
    }

    if (
      !next.description ||
      /^[a-z]$/i.test(next.description) ||
      /^\.\d+(?:\.\d+)?$/.test(next.description) ||
      /^\/m$/i.test(next.description) ||
      /^none$/i.test(next.description) ||
      /^\(?\s*serves?\s+\d+(?:\s*-\s*\d+)?\s*\)?$/i.test(next.description) ||
      /^per\s+(?:person|variety|item)(?:\s*\(per\s+(?:person|variety|item)\))?$/i.test(next.description) ||
      isPriceOnlyDescription(next.description) ||
      /^(?:[YN](?:\s*;\s*[YN])*)$/i.test(next.description)
    ) {
      delete next.description;
    }
  }

  if (
    typeof next.description === "string" &&
    (
      /^[A-Za-z][A-Za-z &,'’().-]{2,90}\s+•\s*(?:\(\d+\)\s*)?(?:\d+(?:\.\d{2})?)?/i.test(next.description) ||
      /^[A-Za-z][A-Za-z &,'’().-]{2,90}\s+•\s*$/i.test(next.description)
    )
  ) {
    next.sourceSummary = item.sourceSummary ?? next.description;
    delete next.description;
  }

  if (typeof next.description === "string" && /\*?\s*ALLERG(?:Y|EN) ALERT:/i.test(next.description)) {
    next.sourceSummary = item.sourceSummary ?? next.description;
    next.description = next.description
      .replace(/\s*\*?\s*ALLERG(?:Y|EN) ALERT:[\s\S]*?(?:\*|$)/i, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!next.description) {
      delete next.description;
    }
  }

  if (typeof next.description === "string" && /\b(?:menu\s+)?items and prices are subject to change\b/i.test(next.description)) {
    next.sourceSummary = item.sourceSummary ?? next.description;
    delete next.description;
  }

  if (
    typeof next.description === "string" &&
    (/^(?:©|copyright)\s*\d{4}\b/i.test(next.description.trim()) ||
      /\b(?:©|copyright)\s*\d{4}\b[\s\S]*\ball rights reserved\b/i.test(next.description))
  ) {
    next.sourceSummary = item.sourceSummary ?? next.description;
    delete next.description;
  }

  if (
    typeof next.description === "string" &&
    /\bgift cards?\b/i.test(next.description) &&
    /\b(?:about|contact|books|vegetarian|vegan|gluten free)\b/i.test(next.description) &&
    !/\b(?:served with|made with|topped with|filled with|crust|cream|lime|chocolate|cheese|cake)\b/i.test(next.description)
  ) {
    next.sourceSummary = item.sourceSummary ?? next.description;
    delete next.description;
  }

    if (typeof next.description === "string" && isAllergenNutritionTableBleedDescription(next.description)) {
      next.sourceSummary = item.sourceSummary ?? next.description.trim();
      delete next.description;
    }

    if (
      typeof next.description === "string" &&
      /^(?:[YN]\s+){2,}/i.test(next.description.trim()) &&
      /\b(?:allergens?|gluten|soy|sesame|dairy|nuts?|pork casing|substitute|modify|cross[- ]?contamination|same fryer)\b/i.test(
        next.description,
      )
    ) {
      next.sourceSummary = item.sourceSummary ?? next.description.trim();
      delete next.description;
    }

  if (typeof next.description === "string" && typeof next.name === "string") {
    const normalizedName = next.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const normalizedDescription = next.description
      .toLowerCase()
      .replace(/\b\d+(?:\.\d{2})?\b/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

    if (normalizedName && normalizedName === normalizedDescription) {
      delete next.description;
    }
  }

  if (description && availabilityDescriptionPattern.test(description)) {
    const cleanedDescription = description.replace(availabilityDescriptionPattern, "").trim();
    if (cleanedDescription) {
      next.description = cleanedDescription;
    } else {
      delete next.description;
    }
    next.sourceSummary = item.sourceSummary ?? description;
  }

  if (description && topoChicoMarketingDescriptionPattern.test(description)) {
    delete next.description;
    next.sourceSummary = item.sourceSummary ?? description;
  }

  if (typeof next.description === "string" && carouselAccessibilityDescriptionPattern.test(next.description)) {
    next.sourceSummary = item.sourceSummary ?? next.description.trim();
    delete next.description;
  }

  if (typeof next.description === "string" && /^all hours\.?$/i.test(next.description.trim())) {
    next.sourceSummary = item.sourceSummary ?? next.description.trim();
    delete next.description;
  }

  if (
    typeof next.description === "string" &&
    /\bclaim this menu disclaimer\b|\bTerms of Service\s*\|\s*Privacy Policy\b|\bUser Agreement,\s*Privacy Policy,\s*and Cookie Policy\b/i.test(
      next.description,
    )
  ) {
    next.sourceSummary = item.sourceSummary ?? next.description.trim();
    delete next.description;
  }

  if (typeof next.description === "string" && /\bLocations and Ordering Hours$/i.test(next.description.trim())) {
    next.sourceSummary = item.sourceSummary ?? next.description.trim();
    delete next.description;
  }

  if (typeof next.description === "string") {
    const dietaryMatrixNote = cleanDietaryMatrixMarkerText(next.description);

    if (dietaryMatrixNote) {
      next.sourceSummary = item.sourceSummary ?? `Official dietary matrix note: ${dietaryMatrixNote}`;
      delete next.description;
    }
  }

  if (ingredientsText && isPollutedStructuredBlob(ingredientsText)) {
    delete next.ingredientsText;

    if (
      item.allergenSourceType === "official-product-allergen-section" &&
      (item.allergens?.length ?? 0) === 0 &&
      (item.mayContain?.length ?? 0) === 0
    ) {
      next.allergenSourceType = "unavailable";
    }
  }

  if (
    typeof next.ingredientsText === "string" &&
    (/^(?:[YN](?:\s*;\s*[YN])*)$/i.test(next.ingredientsText.trim()) ||
      isPriceOnlyDescription(next.ingredientsText) ||
      dietaryLegendTextPattern.test(next.ingredientsText) ||
      isDietaryLegendContactBlob(next.ingredientsText))
  ) {
    delete next.ingredientsText;
  }

  if (typeof next.ingredientsText === "string") {
    const dietaryMatrixNote = cleanDietaryMatrixMarkerText(next.ingredientsText);

    if (dietaryMatrixNote) {
      if (
        !next.sourceSummary ||
        next.sourceSummary === next.ingredientsText ||
        cleanDietaryMatrixMarkerText(next.sourceSummary)
      ) {
        next.sourceSummary = `Official dietary matrix note: ${dietaryMatrixNote}`;
      }
      delete next.ingredientsText;
    }
  }

  if (typeof next.sourceSummary === "string") {
    const dietaryMatrixNote = cleanDietaryMatrixMarkerText(next.sourceSummary);

    if (dietaryMatrixNote) {
      next.sourceSummary = `Official dietary matrix note: ${dietaryMatrixNote}`;
    }
  }

  if (typeof next.sourceSummary === "string" && isSourceBoilerplateSummary(next.sourceSummary)) {
    delete next.sourceSummary;
  }

  if (typeof next.sourceSummary === "string" && dietaryLegendTextPattern.test(next.sourceSummary)) {
    delete next.sourceSummary;
  }

  if (typeof next.sourceSummary === "string" && isOperationalOnlyText(next.sourceSummary)) {
    delete next.sourceSummary;
  }

  return next;
}

export function sanitizeMenuItemsForDisplay(items) {
  return (items ?? []).map((item) => sanitizeMenuItemDisplayFields(item));
}

export function classifyMenuItemRow(item) {
  const name = String(item?.name ?? "").trim();
  const category = String(item?.category ?? "").trim();
  const description = String(item?.description ?? "").trim();
  const reasons = [];

  if (!name) {
    return { kind: "navigation/legal", reasons: ["missing-name"] };
  }

  if (navigationLegalNamePatterns.some((pattern) => pattern.test(name))) {
    return { kind: "navigation/legal", reasons: ["navigation-legal-name"] };
  }

  if (/^(?:agree\s*&\s*join\s+linkedin|new to linkedin\??|user agreement)$/i.test(name)) {
    return { kind: "navigation/legal", reasons: ["linkedin-auth-legal-row"] };
  }

  if (/^admin$/i.test(name) && /^(?:menu|restaurant)$/i.test(String(item?.category ?? ""))) {
    return { kind: "navigation/legal", reasons: ["website-admin-row"] };
  }

  if (
    /^(?:added to force\b|collect email leads|custom order instructions|collect custom order instructions)$/i.test(name) ||
    /\b(?:top bar|custom instructions at checkout|automatically added to your contact list)\b/i.test(description)
  ) {
    return { kind: "navigation/legal", reasons: ["website-admin-row"] };
  }

  if (/^get started easily$/i.test(name) && /\b(?:visitors analytics|stats in your dashboard|publish your site)\b/i.test(description)) {
    return { kind: "navigation/legal", reasons: ["website-admin-row"] };
  }

  if (/^admin(?:[-\s].*)?$/i.test(name) && !description) {
    return { kind: "navigation/legal", reasons: ["website-admin-row"] };
  }

  if (/^.+\s+restaurant$/i.test(name) && /^admin$/i.test(String(item?.category ?? "")) && !description) {
    return { kind: "navigation/legal", reasons: ["website-admin-row"] };
  }

  if (/^welcome to .+!?$/i.test(name) && /Delivery\s*Pickup.+find your closest location/i.test(description)) {
    return { kind: "navigation/legal", reasons: ["ordering-location-shell"] };
  }

  if (/^welcome to .+!?$/i.test(name) && /find your closest location/i.test(description)) {
    return { kind: "navigation/legal", reasons: ["ordering-location-shell"] };
  }

  if (/^welcome to .+!?$/i.test(name) && /^Delivery\s*Pickup$/i.test(description)) {
    return { kind: "navigation/legal", reasons: ["ordering-location-shell"] };
  }

  if (/^how would you like to order\?$/i.test(name) && /\bselect location\b/i.test(description)) {
    return { kind: "navigation/legal", reasons: ["ordering-location-shell"] };
  }

  if (
    /\border online from\b/i.test(description) &&
    /\bincluding\b/i.test(description) &&
    !/\b(?:contains?|served with|topped with|filled with|made with)\b/i.test(description)
  ) {
    return { kind: "navigation/legal", reasons: ["ordering-location-shell"] };
  }

  if (/^you'?re not at the restaurant$/i.test(name) && /\benable location\b/i.test(description)) {
    return { kind: "navigation/legal", reasons: ["ordering-location-shell"] };
  }

  if (/^(?:we[’']?re\s+out(?:\s+for\s+the\s+day)?!?|sold\s+out|out\s+of\s+stock|currently\s+unavailable|unavailable)$/i.test(name)) {
    return { kind: "source-note", reasons: ["availability-status-row"] };
  }

  if (
    /^closed$/i.test(name) &&
    /\b(?:hours|reservations?|visit|private events?|wine|pasta|know before your visit)\b/i.test(description)
  ) {
    return { kind: "navigation/legal", reasons: ["closed-location-or-visit-card"] };
  }

  if (/^check our locations$/i.test(description) || /^find .+ store location$/i.test(description)) {
    return { kind: "navigation/legal", reasons: ["location-or-venue-card"] };
  }

  if (
    /^(?:counter service|party size\?|leagues|pickups|solo|volunteer\s*-\s*coach\s*-\s*donate)$/i.test(name) &&
    /\b(?:first come|served|party|guests|sign up|games|teams|coach|donate|community)\b/i.test(description)
  ) {
    return { kind: "navigation/legal", reasons: ["venue-logistics-card"] };
  }

  if (
    /^(?:counter service|first come\s*\/\s*first served)$/i.test(name.replace(/:\s*.+$/, "").trim()) &&
    /\b(?:mon|tues|wed|thur|fri|sat|sun|closed|first come|served)\b/i.test(`${name} ${description}`)
  ) {
    return { kind: "navigation/legal", reasons: ["venue-logistics-card"] };
  }

  if (
    /^(?:lincoln center(?:,\s*nyc)?|second avenue|walt disney world swan and dolphin resort|del ray)$/i.test(name) ||
    (/^(?:menus?|locations?|lincoln center|second avenue)$/i.test(String(item?.category ?? "")) &&
      /^(?:lincoln center|second avenue|walt disney world|the menus|.+now open!?|.+nyc)$/i.test(name))
  ) {
    return { kind: "navigation/legal", reasons: ["location-or-venue-card"] };
  }

  if (menuPolicyOrLegendNamePatterns.some((pattern) => pattern.test(name))) {
    return { kind: "source-note", reasons: ["menu-policy-or-legend-name"] };
  }

  if (isCmsPlaceholderMenuDescription(description)) {
    return { kind: "source-note", reasons: ["cms-placeholder-menu-description"] };
  }

  if (/^support$/i.test(name) && /^lorem ipsum dolor sit amet\b/i.test(String(item?.ingredientsText ?? ""))) {
    return { kind: "source-note", reasons: ["cms-placeholder-menu-description"] };
  }

  if (
    /^(?:how to\b|instructions?\b)/i.test(name) &&
    /\b(?:bake|broiler|oven|pizza stone|make your pizza kit|recipe|heating instructions)\b/i.test(
      `${name} ${description} ${item?.category ?? ""} ${evidenceTextForItem(item)}`,
    )
  ) {
    return { kind: "source-note", reasons: ["cooking-instruction-row"] };
  }

  if (
    /\bmake your pizza kitinstructions\b/i.test(name) ||
    (/^make your pizza kit$/i.test(String(item?.category ?? "")) &&
      /\b(?:instructions?|chef .* demonstrates|make a pizza|pizza at home)\b/i.test(`${name} ${description}`))
  ) {
    return { kind: "source-note", reasons: ["cooking-instruction-row"] };
  }

  if (/^seafood$/i.test(name) && /\b(?:relationships? over \d+ years with|top seafood suppliers|market availability)\b/i.test(description)) {
    return { kind: "source-note", reasons: ["supplier-section-header"] };
  }

  if (/^category$/i.test(name) && /\ballergens?\b/i.test(`${description} ${item?.ingredientsText ?? ""}`)) {
    return { kind: "source-note", reasons: ["table-category-header-artifact"] };
  }

  if (
    /(?:^|[-–—]\s*)common allergens?(?:\s+guide)?(?::\s*.+)?$/i.test(name) &&
    /(?:pdf-menu-matrix|allergen|nutrition)/i.test(
      `${item?.sourceType ?? ""} ${item?.sourceKind ?? ""} ${item?.allergenSourceType ?? ""} ${evidenceTextForItem(item)}`,
    )
  ) {
    return { kind: "source-note", reasons: ["official-allergen-guide-header"] };
  }

  if (
    /^(?:key to this guide(?:\s+preparation)?|preparation)$/i.test(name) &&
    /\bcommon allergens?\b/i.test(`${description} ${item?.ingredientsText ?? ""} ${item?.sourceSummary ?? ""} ${evidenceTextForItem(item)}`)
  ) {
    return { kind: "source-note", reasons: ["official-matrix-legend-header"] };
  }

  if (
    /^our granola may$/i.test(name) &&
    /\bcontains?\s+(?:tree\s+)?nuts?\b/i.test(`${description} ${item?.sourceSummary ?? ""}`)
  ) {
    return { kind: "source-note", reasons: ["global-granola-allergen-disclosure-row"] };
  }

  if (
    /^the nectarine content is approximately$/i.test(name) &&
    /\bcontains?\s+only\s+wheat,\s*barley malt,\s*hops\b/i.test(`${description} ${item?.sourceSummary ?? ""}`)
  ) {
    return { kind: "source-note", reasons: ["beer-ingredient-sentence-fragment"] };
  }

  if (/^for dine-in parties of \d+ or more \d{1,2}%?\s*gratuity will be automatically added/i.test(name)) {
    return { kind: "source-note", reasons: ["menu-policy-or-legend-name"] };
  }

  if (/^column\d+$/i.test(name)) {
    return { kind: "source-note", reasons: ["table-column-header-artifact"] };
  }

  if (isCompactedMultiItemPriceArtifact(name, description)) {
    return { kind: "source-note", reasons: ["compacted-multi-item-price-artifact"] };
  }

  if (/^(?:sugar|protein|(?:total\s+)?carbohydrates?|calories?|sodium|fat|fiber)\s+in\s+(?:grams?|mg)$/i.test(name)) {
    return { kind: "source-note", reasons: ["nutrition-column-header-artifact"] };
  }

  if (isSentenceFragmentDisclosureRow(name, description)) {
    return { kind: "source-note", reasons: ["sentence-fragment-disclosure-row"] };
  }

  if (
    /^(?:several menu items|many of our products also|although not all of our products|products? may contain)\b/i.test(
      name,
    ) &&
    /\b(?:contain|allergens?|come into contact|prepared|soy oil|fryer|common allergens?)\b/i.test(description)
  ) {
    return { kind: "source-note", reasons: ["global-allergen-disclosure-row"] };
  }

  if (isAllergenDisclosurePrefixName(name, description)) {
    return { kind: "source-note", reasons: ["allergen-disclosure-prefix-name"] };
  }

  if (isAllergenMatrixBleedName(name, description)) {
    return { kind: "source-note", reasons: ["allergen-matrix-bleed-name"] };
  }

  if (isOfficialAllergenIngredientFragmentRow(name, description, item)) {
    return { kind: "source-note", reasons: ["official-allergen-ingredient-fragment"] };
  }

  if (isOfficialMatrixDanglingBoundaryRow(name, description, item)) {
    return { kind: "source-note", reasons: ["official-matrix-dangling-boundary"] };
  }

  if (
    /^(?:for orders of|includes)$/i.test(name) &&
    item?.allergenSourceType === "official-product-allergen-section" &&
    /^(?:contains?|may contain)\b/i.test(description)
  ) {
    return { kind: "source-note", reasons: ["official-product-boundary-fragment"] };
  }

  if (
    /\bproducts?\s+are\s+fried\s+in\s+oil\s+which\s+may\b/i.test(name) ||
    (/^fried items$/i.test(name) && /\bfried in the same fryer\b/i.test(description)) ||
    (/^(?:kfc|restaurant|menu)$/i.test(name) &&
      /\bmay\s+contain\s+the\s+following:\s*(?:canola oil|hydrogenated soybean oil|soybean oil)\b/i.test(description))
  ) {
    return { kind: "source-note", reasons: ["global-fryer-oil-disclosure-row"] };
  }

  if (/^(?:closed|open now)\s*[•-]\s*(?:opens|closes)\b/i.test(name)) {
    return { kind: "navigation/legal", reasons: ["ordering-status-row"] };
  }

  if (/^\d{1,2}:\d{2}\s*(?:AM|PM)\s*[-–—]\s*\d{1,2}:\d{2}\s*(?:AM|PM)$/i.test(name)) {
    return { kind: "navigation/legal", reasons: ["standalone-time-window-row"] };
  }

  if (/^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday):?$/i.test(name) && /\$\d/.test(description)) {
    return { kind: "source-note", reasons: ["weekday-menu-boundary-row"] };
  }

  if (/^total\s+(?:beef|chicken|pork|shrimp|vegetable|veggie)\s+(?:crispy|soft|grilled|fried)\b/i.test(name)) {
    return { kind: "source-note", reasons: ["pos-total-option-boundary-row"] };
  }

  if (/^taco\s+(?:beef|chicken|pork|shrimp|vegetable|veggie)\s+(?:crispy|soft|grilled|fried)\s+single$/i.test(name)) {
    return { kind: "modifier", reasons: ["pos-taco-option-boundary-row"] };
  }

  if (/^(?:duck|chicken|pork|beef|steak|shrimp|fish)\s*\((?:fried|grilled|roasted|steamed|baked)\)$/i.test(name)) {
    return { kind: "modifier", reasons: ["protein-preparation-option-row"] };
  }

  if (isSpacedOutLetterText(name)) {
    return { kind: "promo", reasons: ["spaced-out-letter-text"] };
  }

  if (isPdfOcrMangledSplitName(name, item)) {
    return { kind: "source-note", reasons: ["pdf-ocr-mangled-split-name"] };
  }

  if (/^where to find us$/i.test(name)) {
    return { kind: "navigation/legal", reasons: ["location-heading"] };
  }

  if (/^\$?\d+(?:\.\d{2})?\s*[•|-]\s*\d+\s*cal$/i.test(name)) {
    return { kind: "price-line", reasons: ["price-calorie-name"] };
  }

  if (/^\$\s*\d{1,4}(?:\.\d{2})?\s+\S/i.test(name)) {
    return { kind: "source-note", reasons: ["price-prefixed-fragment-name"] };
  }

  if (/\b(?:S|M|L|XL)\s+(?:10|12|14|16)in\b/i.test(name)) {
    return { kind: "source-note", reasons: ["pizza-size-variant-catalog-row"] };
  }

  if (/\b\d{2,4}\s+300\s+n\/a\b/i.test(`${name} ${description}`)) {
    return { kind: "source-note", reasons: ["nutrition-table-collapsed-row"] };
  }

  if (/^(?:directions?|get directions|parking|parking\s*&\s*metro|unlimited free parking|serving hours|follow us|ouick links|quick links)$/i.test(name)) {
    return { kind: "navigation/legal", reasons: ["navigation-legal-name"] };
  }

  if (
    /^(?:best dining experiences at|birthday celebration|corporate events? & business dinners?|private dining|event packages?)\b/i.test(name) &&
    /\b(?:private dining|custom menus|date night|happy hour|romantic|corporate|birthday|event|party|premium service)\b/i.test(description)
  ) {
    return { kind: "promo", reasons: ["private-dining-or-event-marketing-card"] };
  }

  if (
    /^(?:book your private dining space|banqueting and events)$/i.test(name) &&
    /\b(?:private dining|private party|banquet|special event|celebration|tailor-make|event)\b/i.test(description)
  ) {
    return { kind: "promo", reasons: ["private-dining-or-event-marketing-card"] };
  }

  if (/^good to know$/i.test(name) && /\b(?:dog friendly|wheelchair accessible|gift cards?|late-night kitchen|patio dining)\b/i.test(description)) {
    return { kind: "navigation/legal", reasons: ["venue-info-card"] };
  }

  if (/^pdf and print$/i.test(name) && /\b(?:export submission to pdf|dashboard panel)\b/i.test(description)) {
    return { kind: "navigation/legal", reasons: ["website-admin-row"] };
  }

  if (/^sorry\b.*do not accept checks/i.test(name) && /\b(?:prices & menu items subject to change|all rights reserved|carry-out|dine-in)\b/i.test(description)) {
    return { kind: "source-note", reasons: ["menu-policy-or-legend-name"] };
  }

  if (
    /^(?:craving .+ at home\?|call ahead\b)/i.test(name) &&
    /\b(?:call ahead|private dining|parties of|order will be ready)\b/i.test(`${name} ${description}`)
  ) {
    return { kind: "promo", reasons: ["ordering-or-private-dining-marketing-card"] };
  }

  if (isWebsiteAnchorNavigationCard(name, description, item)) {
    return { kind: "navigation/legal", reasons: ["website-anchor-navigation-card"] };
  }

  if (/^(?:sku|sku:)$/i.test(name) && /\b(?:categories?|tags?)\s*:/i.test(description)) {
    return { kind: "source-note", reasons: ["commerce-metadata-row"] };
  }

  if (/^(?:yelp!?|google)\s+review$/i.test(name)) {
    return { kind: "promo", reasons: ["review-widget-row"] };
  }

  if (/^(?:write a review|read full description|read more|view details)$/i.test(name) && !description) {
    return { kind: "navigation/legal", reasons: ["product-page-control-row"] };
  }

  if (
    /^(?:quick\s+\d+-day shipping|free shipping|shipping|how it works)$/i.test(name) &&
    /\b(?:ships?|shipping|arrives?|delivered|delivery|order)\b/i.test(description)
  ) {
    return { kind: "navigation/legal", reasons: ["commerce-fulfillment-card"] };
  }

  if (/^(?:chart your course|life at .+|growth at .+)$/i.test(name) && !/\b(?:menu|roll|lobster|shrimp|crab|fish|sandwich|salad|soup|cake|pie)\b/i.test(description)) {
    return { kind: "promo", reasons: ["brand-careers-or-content-card"] };
  }

  if (/^(?:special\s+)?store hours$/i.test(name) && /\b(?:AM|PM|Christmas Eve|New Year'?s Eve|July 4th|holiday)\b/i.test(description)) {
    return { kind: "navigation/legal", reasons: ["store-hours-row"] };
  }

  if (hasNorthItaliaSource(item) && isNorthItaliaDisplayArtifactName(name)) {
    return { kind: "source-note", reasons: ["north-italia-display-artifact"] };
  }

  if (/^close$/i.test(name) && /\b(?:cocktails?|pizza|chef'?s board|for the table|happy hour)\b/i.test(description)) {
    return { kind: "navigation/legal", reasons: ["menu-close-control-row"] };
  }

  if (isLocationOrVenueCard(name, String(item?.category ?? ""), description)) {
    return { kind: "navigation/legal", reasons: ["location-or-venue-card"] };
  }

  if (/^our drinks$/i.test(name)) {
    return { kind: "source-note", reasons: ["drink-section-card"] };
  }

  if (/^all\s+burgers\s+served\s+on\b/i.test(name)) {
    return { kind: "source-note", reasons: ["menu-section-policy-row"] };
  }

  if (isMarketingOrEventCard(name, description, item)) {
    return { kind: "promo", reasons: ["marketing-or-event-card"] };
  }

  if (/^non[-\s]?alcoholic$/i.test(name) && /\b(?:0?\.5%|12\s*oz|pils|lager|beer|abv)\b/i.test(description)) {
    return { kind: "source-note", reasons: ["section-heading-or-drink-menu-row"] };
  }

  if (
    /^(?:antipasti|insalate|la pasta|pasta|pesce|pollo|vitello|sides?)$/i.test(name) &&
    /\b(?:carpaccio|prosciutto|mozzarella|calamari|crostini|ravioli|spaghetti|antipasto|zuppa|bruschetta)\b/i.test(description) &&
    /\b[A-Z][a-zà-ÿ'’]+\s+[a-zà-ÿ'’]+\b/.test(description)
  ) {
    return { kind: "source-note", reasons: ["section-heading-collapsed-menu-list"] };
  }

  if (/^drop[- ]ins$/i.test(name) && /\b(?:league game|try a new sport|season-long commitment|find a drop-in)\b/i.test(description)) {
    return { kind: "promo", reasons: ["marketing-or-event-card"] };
  }

  if (/^join our vip list$/i.test(name) && /\b(?:private events|special promotions|sign up for (?:our )?(?:email|text)|newsletters?)\b/i.test(description)) {
    return { kind: "promo", reasons: ["newsletter-signup-row"] };
  }

  if (/^collect custom order instructions$/i.test(name) && /\bcustom instructions at checkout\b/i.test(description)) {
    return { kind: "navigation/legal", reasons: ["ordering-shell-card"] };
  }

  if (/^we proudly serve american ground beef$/i.test(name) && /\b(?:private events|catering available|visit our website|follow)\b/i.test(description)) {
    return { kind: "source-note", reasons: ["pdf-footer-branding-row"] };
  }

  if (/^new year'?s eve$/i.test(name) && /\b(?:reservations?|champagne toast|dj|wine pairing|four-course menu)\b/i.test(description)) {
    return { kind: "promo", reasons: ["event-or-reservation-policy-row"] };
  }

  if (isGenericPackageCourseChoiceHeader(name, description)) {
    return { kind: "option-group", reasons: ["generic-package-course-choice-header"] };
  }

  if (/^we also recently added\b/i.test(name)) {
    return { kind: "promo", reasons: ["marketing-sentence-as-item-name"] };
  }

  if (isConcatenatedMenuListArtifact(name, description)) {
    return { kind: "source-note", reasons: ["concatenated-menu-list-artifact"] };
  }

  if (/^\*?allergen notice:\s*menu items may contain or come into contact with\b/i.test(description)) {
    return { kind: "source-note", reasons: ["global-allergen-notice-description"] };
  }

  if (/^(?:contains?|contain)\s+(?:glutens?|allergens?|dairy|nuts?|shellfish|fish|soy|sesame|wheat|egg)s?$/i.test(name)) {
    return { kind: "source-note", reasons: ["allergen-disclosure-as-item-name"] };
  }

  if (/^(?:consumer advisory|raw seafood advisory)$/i.test(name)) {
    return { kind: "source-note", reasons: ["menu-policy-or-legend-name"] };
  }

  if (/^surcharge$/i.test(name) && /\b(?:offset rising costs|added a \d+(?:\.\d+)?% surcharge)\b/i.test(description)) {
    return { kind: "source-note", reasons: ["menu-policy-or-legend-name"] };
  }

  if (/^macaroni surcharge$/i.test(name) && !description) {
    return { kind: "source-note", reasons: ["menu-policy-or-legend-name"] };
  }

  if (/\bany entr[ée]e below can be enjoyed\b/i.test(description) && /\bsurcharge\b/i.test(description)) {
    return { kind: "source-note", reasons: ["menu-policy-or-legend-name"] };
  }

  if (assetOrMerchNamePatterns.some((pattern) => pattern.test(name))) {
    return { kind: "promo", reasons: ["asset-or-merch-name"] };
  }

  if (/^poster$/i.test(name) && /\b(?:print|glossy|mailer|frame not included|facade)\b/i.test(description)) {
    return { kind: "promo", reasons: ["asset-or-merch-name"] };
  }

  if (/\bposter\b/i.test(name) && /\b(?:print|cardstock|glossy|mailer|frame not included|facade)\b/i.test(description)) {
    return { kind: "promo", reasons: ["asset-or-merch-name"] };
  }

  if (
    item?.sourceType === "html-image-menu" &&
    (
      /^[a-f0-9]{16,}\s+/i.test(name) ||
      /\b(?:courtesy|resize\d*|scaled|image|photo|thumbnail|thumb)\b/i.test(name) ||
      /\.0\.0(?:\.0)*$/i.test(name)
    )
  ) {
    return { kind: "source-note", reasons: ["image-menu-asset-row"] };
  }

  if (/^view and print\b/i.test(String(item?.category ?? ""))) {
    return { kind: "source-note", reasons: ["image-menu-asset-row"] };
  }

  if (websiteWidgetNamePatterns.some((pattern) => pattern.test(name))) {
    return { kind: "promo", reasons: ["website-widget-name"] };
  }

  if (/\b(?:will open|opening|opens?)\b/i.test(name) && /\b(?:restaurant|steakhouse|bar|cafe|boutique)\b/i.test(name)) {
    return { kind: "promo", reasons: ["editorial-or-press-card"] };
  }

  if (/^(?:\d+\s+food halls around d\.?c\.?|\d+\s+food halls around dc|best thai restaurants in d\.?c\.?|best thai restaurants in dc|where to (?:find|go for) .+)$/i.test(name)) {
    return { kind: "promo", reasons: ["editorial-or-press-card"] };
  }

  if (
    editorialOrPressCardNamePatterns.some((pattern) => pattern.test(name)) &&
    !hasDishSpecificName(`${name} ${description}`)
  ) {
    return { kind: "promo", reasons: ["editorial-or-press-card"] };
  }

  if (
    /^(?:discount codes|driving directions|easy to add|import from excel|inventory tracking|mass import|offer directions|product images|product option groups|product options|searchable database|watch visitors in real time)$/i.test(name) &&
    /\b(?:store locations?|locations?|database|products?|visitors?|discount codes?|checkout|option group|spreadsheet|map|directions)\b/i.test(description)
  ) {
    return { kind: "promo", reasons: ["website-widget-name"] };
  }

  if (websiteWidgetDescriptionPattern.test(description)) {
    return { kind: "promo", reasons: ["website-widget-description"] };
  }

  if (gameCardDescriptionPattern.test(description)) {
    return { kind: "promo", reasons: ["game-card-description"] };
  }

  if (/\b(?:bottle service reservations?|reservation policy|single ticket includes tax|please include your name,\s*phone number and email)\b/i.test(description)) {
    return { kind: "promo", reasons: ["event-or-reservation-policy-row"] };
  }

  if (/^flexible dates$/i.test(name) && /\bnumber of nights\b/i.test(description)) {
    return { kind: "navigation/legal", reasons: ["booking-widget-row"] };
  }

  if (/^general\s*manager\b/i.test(name) && /\bprivate dining rooms available\b/i.test(description)) {
    return { kind: "source-note", reasons: ["restaurant-info-row"] };
  }

  if (/^generalmanager/i.test(name.replace(/[^a-z]/gi, ""))) {
    return { kind: "source-note", reasons: ["restaurant-info-row"] };
  }

  if (/^aclyde'?srestaurantgroupconcept$/i.test(name)) {
    return { kind: "source-note", reasons: ["restaurant-info-row"] };
  }

  if (/^(?:brunch|dinner)\s*:?\s*$/i.test(name) && /\bc\s*o\s*c\s*k\s*t\s*a\s*i\s*l\s*s\b/i.test(description)) {
    return { kind: "source-note", reasons: ["section-heading-or-drink-menu-row"] };
  }

  if (/^pick\s*your\s*protein$/i.test(name.replace(/\s+/g, ""))) {
    return { kind: "option-group", reasons: ["option-group-name"] };
  }

  if (
    /^\d+\.\s*(?:build|pick|get|top|choose|select)\b/i.test(name) &&
    /\b(?:choose|pick|select|unlimited|all options|options)\b/i.test(description)
  ) {
    return { kind: "option-group", reasons: ["numbered-build-step-option-row"] };
  }

  if (/^stay in the know!?$/i.test(name) && /\bsign up for (?:our )?newsletter\b/i.test(description)) {
    return { kind: "promo", reasons: ["newsletter-signup-row"] };
  }

  if (
    visitPlanningNamePatterns.some((pattern) => pattern.test(name)) ||
    visitPlanningDescriptionPattern.test(description)
  ) {
    return { kind: "navigation/legal", reasons: ["visit-planning-row"] };
  }

  if (isOrderingShellCard(name, String(item?.category ?? ""), description)) {
    return { kind: "navigation/legal", reasons: ["ordering-shell-card"] };
  }

  if (
    /^restaurant$/i.test(String(item?.category ?? "")) &&
    /^(?:reservations?\s+)?order\s+pickup\/?delivery\s+buy\s+a\s+gift\s+card$/i.test(description)
  ) {
    return { kind: "navigation/legal", reasons: ["ordering-shell-card"] };
  }

  if (
    /^celebrate america'?s 250th at café riggs$/i.test(name) ||
    (/\b(?:semquincentennial|semiquincentennial|EAT250|america at the table)\b/i.test(description) &&
      /\blimited-time\b/i.test(description))
  ) {
    return { kind: "promo", reasons: ["marketing-or-event-card"] };
  }

  if (/^koupit\s+cialis\b/i.test(String(item?.category ?? ""))) {
    return { kind: "promo", reasons: ["spam-category-row"] };
  }

  if (/^(?:takeout|take out)$/i.test(name) && !description) {
    return { kind: "navigation/legal", reasons: ["takeout-navigation-row"] };
  }

  if (isNonFoodCategoryRow(name, String(item?.category ?? ""), description)) {
    return { kind: "promo", reasons: ["non-food-category-row"] };
  }

  if (
    /^(?:welcome|welcome to .+|best family-owned .+ restaurant|join our .+ chef|our main dining room|.+an adams morgan institution)$/i.test(name) &&
    /\b(?:reservations?|virtually here|social visit|destination|family-owned|mission|introducing you to our cuisine|communal space|private events?|floor-to-ceiling|neighborhood)\b/i.test(
      description.replace(/[()]/g, ""),
    )
  ) {
    return { kind: "promo", reasons: ["venue-or-marketing-description"] };
  }

  if (/^welcome to .+$/i.test(name) && !description) {
    return { kind: "promo", reasons: ["venue-or-marketing-description"] };
  }

  if (/^.+restaurant(?:\s*&\s*bar)?$/i.test(name) && /^welcome to restaurant$/i.test(String(item?.category ?? ""))) {
    return { kind: "promo", reasons: ["venue-or-marketing-description"] };
  }

  if (/^bottomless beverage policy$/i.test(name)) {
    return { kind: "source-note", reasons: ["menu-policy-or-legend-name"] };
  }

  if (ingredientFragmentNamePatterns.some((pattern) => pattern.test(name))) {
    return { kind: "source-note", reasons: ["ingredient-or-disclosure-fragment-name"] };
  }

  if (nutritionTableBlobPattern.test(`${name} ${description}`)) {
    return { kind: "source-note", reasons: ["nutrition-table-blob"] };
  }

  if (/[\u0080-\u009f\ufffd]/.test(name) && (description.length > 80 || textBleedReasons({ name, description }).length > 0)) {
    return { kind: "source-note", reasons: ["pdf-ocr-heading-bleed"] };
  }

  if (addressNamePatterns.some((pattern) => pattern.test(name))) {
    return { kind: "navigation/legal", reasons: ["address-location-row"] };
  }

  if (addressDescriptionPattern.test(description) && !hasDishSpecificName(`${name} ${description}`)) {
    return { kind: "navigation/legal", reasons: ["address-location-description"] };
  }

  if (compactAddressDescriptionPattern.test(description) && /^(?:college park|locations?|restaurant|store)$/i.test(String(item?.category ?? ""))) {
    return { kind: "navigation/legal", reasons: ["address-location-description"] };
  }

  if (/^(?:cad|usd)$/i.test(name) && /\bcontains?\s+(?:dairy|milk|gluten|wheat|soy|sesame|nuts?|peanuts?|tree nuts?)\b/i.test(description)) {
    return { kind: "source-note", reasons: ["currency-boundary-artifact"] };
  }

  if (/^category\s+.+\s+(?:cad|usd)$/i.test(name)) {
    return { kind: "source-note", reasons: ["category-currency-boundary-artifact"] };
  }

  if (/^showing\s+all\s+\d+\s+results?$/i.test(name)) {
    return { kind: "navigation/legal", reasons: ["search-results-count-row"] };
  }

  if (/^(?:out of stock|sold out|unavailable)$/i.test(name)) {
    return { kind: "promo", reasons: ["availability-row"] };
  }

  if (/^view details$/i.test(description) && !hasDishSpecificName(name)) {
    return { kind: "navigation/legal", reasons: ["details-link-row"] };
  }

  if (isGenericSectionHeaderWithMenuListDescription(name, description)) {
    return { kind: "source-note", reasons: ["packed-section-header-row"] };
  }

  if (/^(?:reservation\s+)?cancellation\s*\/?\s*no\s+show\s+policy$/i.test(name)) {
    return { kind: "navigation/legal", reasons: ["reservation-policy-row"] };
  }

  if (/^fried$/i.test(name) && (!description || /^view details$/i.test(description))) {
    return { kind: "option-group", reasons: ["preparation-option-row"] };
  }

  if (/^(?:deep\s+fried|baked|deep\s+fried\s*\/\s*baked|煎炸焗\s*deep\s+fried\s*\/\s*baked)$/i.test(name)) {
    return { kind: "option-group", reasons: ["preparation-option-row"] };
  }

  if (/^(?:your\s+)?choice\s+of(?::|\s*\()/i.test(name)) {
    return { kind: "option-group", reasons: ["choice-of-option-row"] };
  }

  if (/^level\s+\d+\s+.+\b(?:buffet|package)\b/i.test(name) && /^per person$/i.test(description)) {
    return { kind: "source-note", reasons: ["package-price-row"] };
  }

  if (/^\$?\d+(?:\.\d{2})?\s+per\s+person\b/i.test(name)) {
    return { kind: "source-note", reasons: ["package-price-row"] };
  }

  if (
    /^substitute\s+(?:to|with|for)\b/i.test(description) &&
    /\b(?:gluten[- ]free|soy|sauce|pack|substitute|option|add[- ]?on)\b/i.test(`${name} ${description}`)
  ) {
    return { kind: "modifier", reasons: ["substitute-option-description"] };
  }

  if (/^\d+\.\s*add\s+\d+\s+\w+/i.test(name)) {
    return { kind: "modifier", reasons: ["numbered-add-on-row"] };
  }

  if (
    /^choice of$/i.test(name) &&
    /\b(?:chicken|shrimp|ribeye|carrots?|cauliflower|protein|side|sauce)\b/i.test(description)
  ) {
    return { kind: "option-group", reasons: ["choice-of-option-row"] };
  }

  if (/^choice of soft drink$/i.test(name) && /sandwich only/i.test(description)) {
    return { kind: "option-group", reasons: ["choice-of-option-row"] };
  }

  if (
    /^(?:extra|add(?:ed)?|add[-\s]?on)\s+(?:side\s+)?(?:sauce|protein|cheese|dressing|dip|aioli|mayo|beef|chicken|pork|shrimp|tofu)\b/i.test(
      name,
    ) &&
    !/\b(?:sandwich|burger|burrito|bowl|salad|pizza|pasta|taco|toast|plate|platter|meal|entree|entrée)\b/i.test(name)
  ) {
    return { kind: "modifier", reasons: ["add-on-modifier-row"] };
  }

  if (
    /^(?:chicken|lump crab meat|salmon|shrimp|steak)\s+add\s*[-–—]?\s*on$/i.test(name) ||
    /^(?:whole steak|stuffed shrimp|lamb chops)\s+only$/i.test(name)
  ) {
    return { kind: "modifier", reasons: ["add-on-modifier-row"] };
  }

  if (
    /^substitute\b/i.test(name) &&
    /\b(?:side|salad|fries|crispy|brussels?|cauliflower|sauce|dressing|gluten[- ]free|bun|bread)\b/i.test(
      `${name} ${description}`,
    )
  ) {
    return { kind: "modifier", reasons: ["substitute-option-row"] };
  }

  if (/^american$/i.test(name) && /^(?:breakfast|cuisines?)$/i.test(String(item?.category ?? ""))) {
    return { kind: "source-note", reasons: ["generic-cuisine-row"] };
  }

  if (/^red$/i.test(name) && /\b(?:w\s*i\s*n\s*e|m\s*e\s*r\s*l\s*o\s*t|wine company|merlot)\b/i.test(description)) {
    return { kind: "source-note", reasons: ["wine-list-row"] };
  }

  if (/^(?:red|white|reds|whites)$/i.test(name) && /\b(?:wine|wines|beer-wine)\b/i.test(evidenceUrlsForItem(item).join(" "))) {
    return { kind: "source-note", reasons: ["wine-list-row"] };
  }

  if (
    /\b(?:chardonnay|cabernet|pinot|merlot|sauvignon|riesling|ros[ée]|barolo|chianti|prosecco|champagne)\b/i.test(name) &&
    /\b(?:wine|variet(?:y|al)|vintage|vineyard|grape|winery|sommelier|paired with)\b/i.test(description) &&
    !hasFoodDishForAlcoholRow(`${name} ${description}`)
  ) {
    return { kind: "source-note", reasons: ["wine-list-row"] };
  }

  if (/^(?:casual|college students|drive-through|groups|seating|table service|takeout|tourists)$/i.test(name) && /^dining options$/i.test(String(item?.category ?? ""))) {
    return { kind: "navigation/legal", reasons: ["dining-options-row"] };
  }

  if (/^(?:taqueria\s+xochi\s+-\s+arlington|arlington\s+-\s+xochi hour|philadelphia|centre street)$/i.test(name)) {
    return { kind: "navigation/legal", reasons: ["location-or-venue-card"] };
  }

  if (/^(?:until\s+)?sold out!?$/i.test(name) || /^sold out\b/i.test(name)) {
    return { kind: "promo", reasons: ["availability-name"] };
  }

  if (isSimpleDrinkOnlyRow(name, String(item?.category ?? ""), description, item)) {
    return { kind: "source-note", reasons: ["simple-drink-only-row"] };
  }

  if (/^\d+\s+o\s+z\s+\w+/i.test(name)) {
    return { kind: "modifier", reasons: ["pdf-table-modifier-fragment"] };
  }

  if (/^(?:earthy|fruity|crisp|refreshing|sparkling)$/i.test(name) && alcoholOnlyDescriptionPattern.test(description)) {
    return { kind: "source-note", reasons: ["alcohol-list-row"] };
  }

  if (/\b\d+(?:\.\d+)?%\s*(?:\/[^)]{0,40})?\/\s*(?:250|330|355|375|500|750)\s*ml\b/i.test(description)) {
    return { kind: "source-note", reasons: ["alcohol-list-row"] };
  }

  if (/^elixir$/i.test(name) && /\b(?:soda water|cordial|q mixers)\b/i.test(description)) {
    return { kind: "source-note", reasons: ["simple-drink-only-row"] };
  }

  if (!isOfficialAllergenMatrixRow(item) && isAlcoholDrinkNameOnlyRow(name, String(item?.category ?? ""), description)) {
    return { kind: "source-note", reasons: ["alcohol-name-only-row"] };
  }

  if (!isOfficialAllergenMatrixRow(item) && isDrinkOnlyCategoryRow(name, String(item?.category ?? ""), description)) {
    return { kind: "source-note", reasons: ["drink-only-category-row"] };
  }

  if (isPriceCalorieCardName(name, description)) {
    return { kind: "source-note", reasons: ["price-calorie-card-name"] };
  }

  if (optionGroupNamePatterns.some((pattern) => pattern.test(name))) {
    return { kind: "option-group", reasons: ["option-group-name"] };
  }

  if (/^great add[- ]ons$/i.test(name) && /\b(?:bacon|cheese|onions?|mayonnaise|ketchup|mustard|sauce)\b/i.test(description)) {
    return { kind: "option-group", reasons: ["option-group-name"] };
  }

  if (toppingHeaderNamePatterns.some((pattern) => pattern.test(name))) {
    return { kind: "option-group", reasons: ["topping-header-name"] };
  }

  if (
    !description &&
    /^(?:pizza|sandwiches?)$/i.test(String(item?.category ?? "")) &&
    nameOnlyPizzaOrSandwichModifierPatterns.some((pattern) => pattern.test(name))
  ) {
    return { kind: "modifier", reasons: ["name-only-pizza-sandwich-modifier-row"] };
  }

  if (/^extra\s+\w[\w\s-]{1,35}$/i.test(name) && !hasDishSpecificName(name)) {
    return { kind: "modifier", reasons: ["extra-modifier-row"] };
  }

  if (
    /\bpreparation\s+(?:choice|option)(?:\s+\(required\))?$/i.test(name) ||
    (/^required$/i.test(description) && /\bpreparation\s+(?:choice|option)\b/i.test(name))
  ) {
    return { kind: "option-group", reasons: ["preparation-choice-option-row"] };
  }

  if (/^please allow for \d{1,3}[-\s]?minute preparation$/i.test(name)) {
    return { kind: "source-note", reasons: ["preparation-time-note-row"] };
  }

  if (
    /\bwith[,]?$/i.test(name) &&
    !(item?.isConfigurable && /^restaurant-linked-ordering-menu$/i.test(String(item?.sourceType ?? "")))
  ) {
    return { kind: "source-note", reasons: ["incomplete-row-boundary-name"] };
  }

  if (/^all sandwiches served with\b/i.test(name) && /(?:\s*\.\s*){4,}|\$\d/.test(description)) {
    return { kind: "source-note", reasons: ["section-header-grouped-description"] };
  }

  if (/^served with\b/i.test(name)) {
    return { kind: "source-note", reasons: ["description-fragment-as-name"] };
  }

  if (/^with\b/i.test(name)) {
    return { kind: "source-note", reasons: ["description-fragment-as-name"] };
  }

  if (/^fried\s*&\s*served\s+with\b/i.test(name)) {
    return { kind: "source-note", reasons: ["description-fragment-as-name"] };
  }

  if (isDietaryLegendBleedRow(name, description)) {
    return { kind: "source-note", reasons: ["dietary-legend-bleed-row"] };
  }

  if (isCondimentFragmentWithBleed(name, description)) {
    return { kind: "source-note", reasons: ["condiment-fragment-with-bleed"] };
  }

  if (
    /\b(?:open mic|poetry reading|hosted by|live music|author talk|book talk)\b/i.test(`${name} ${description}`) &&
    /\b(?:jul|jan|feb|mar|apr|may|jun|aug|sep|oct|nov|dec|\d{1,2}:\d{2}\s*(?:am|pm)|event)\b/i.test(description)
  ) {
    return { kind: "promo", reasons: ["event-schedule-card"] };
  }

  if (
    promoNamePatterns.some((pattern) => pattern.test(name)) &&
    !hasDishSpecificName(name)
  ) {
    return { kind: "promo", reasons: ["promo-name"] };
  }

  if (isPrivateDiningChoiceHeader(name, description)) {
    return { kind: "option-group", reasons: ["private-dining-choice-header"] };
  }

  if (description && venueSelfDescriptionPatterns.some((pattern) => pattern.test(description))) {
    return { kind: "promo", reasons: ["venue-or-marketing-description"] };
  }

  if (isNutritionPdfModifierVariant(name, description)) {
    return { kind: "modifier", reasons: ["nutrition-pdf-modifier-variant"] };
  }

  if (isPdfBulletModifierOrAddon(name, description, item)) {
    return { kind: "modifier", reasons: ["pdf-bullet-modifier-or-addon"] };
  }

  if (isBareGenericProteinOption(name, description, item)) {
    return { kind: "modifier", reasons: ["bare-generic-protein-option"] };
  }

  if (/^tossed with\b/i.test(name) && (!description || isPriceOnlyDescription(description))) {
    return { kind: "source-note", reasons: ["description-fragment-as-name"] };
  }

  if (!isOfficialAllergenMatrixRow(item) && isAlcoholOnlyBleedRow(name, category, description)) {
    return { kind: "source-note", reasons: ["alcohol-only-menu-bleed"] };
  }

  if (isStrongAlcoholOnlyDescriptionRow(name, description)) {
    return { kind: "source-note", reasons: ["strong-alcohol-only-description"] };
  }

  if (/^espresso classico$/i.test(name) && /\b(?:absolut|caff[eè]\s+borghetti)\b/i.test(description)) {
    return { kind: "source-note", reasons: ["alcohol-only-menu-bleed"] };
  }

  if (isLikelyAlcoholListRow(name, String(item?.category ?? ""), description)) {
    return { kind: "source-note", reasons: ["alcohol-list-row"] };
  }

  if (!isOfficialAllergenMatrixRow(item) && isAlcoholOnlyCategoryRow(name, String(item?.category ?? ""), description)) {
    return { kind: "source-note", reasons: ["alcohol-only-category-row"] };
  }

  if (isDocumentLinkCard(name, description, item)) {
    return { kind: "source-note", reasons: ["document-link-card"] };
  }

  if (/^nutrition\b/i.test(name) && /\bnutrition\b/i.test(String(item?.category ?? "")) && !hasDishSpecificName(name)) {
    return { kind: "source-note", reasons: ["nutrition-document-card"] };
  }

  if (isNutritionDocumentCard(name, description, item)) {
    return { kind: "source-note", reasons: ["nutrition-document-card"] };
  }

  if (isOfficialMatrixCategoryOnlyArtifact(name, description, item)) {
    return { kind: "source-note", reasons: ["official-matrix-category-artifact"] };
  }

  if (isRecoveredGenericOfficialMatrixRow(item)) {
    return { kind: "source-note", reasons: ["recovered-generic-official-matrix-row"] };
  }

  if (isPdfExtractionHeaderBleed(name, description)) {
    return { kind: "source-note", reasons: ["pdf-header-bleed"] };
  }

  if (/^valet parking$/i.test(name)) {
    return { kind: "navigation/legal", reasons: ["parking-row"] };
  }

  if (sectionHeaderNamePatterns.some((pattern) => pattern.test(name)) && !description) {
    return { kind: "source-note", reasons: ["section-header-name"] };
  }

  if (
    !description &&
    /^(?:sandwiches?\s*&\s*wraps?|snacks?\s*&\s*sweet treats?|yogurt\s*&\s*pret pots?)$/i.test(name)
  ) {
    return { kind: "source-note", reasons: ["section-header-name"] };
  }

  if (
    /^(?:shareables?|sides?|favorites?|crispy favorites?)$/i.test(name) &&
    /^(?:elevated\s+)?crispy favorites\b|^\s*sides\s*\d+\s+each\b/i.test(description) &&
    !hasDishSpecificName(description)
  ) {
    return { kind: "source-note", reasons: ["section-header-with-marketing-description"] };
  }

  if (
    sectionHeaderNamePatterns.some((pattern) => pattern.test(name)) &&
    /(?:\b(?:restaurant|kitchen|cafe|bar)\b|^\s*A\s+Next\s+Door\b)/i.test(description) &&
    !/\b(?:burger|burrito|bowl|cake|cheese|chicken|crab|curry|fish|fries|lobster|noodles?|pasta|pizza|rice|salad|sandwich|shrimp|soup|steak|taco|toast|wings?|wrap)\b/i.test(
      description,
    )
  ) {
    return { kind: "source-note", reasons: ["section-header-with-venue-tagline"] };
  }

  if (/^(?:weekly|weekly specials|brunch items|dinner items|small plates|large format|bone[- ]in signature prime steaks|artisan dogs)$/i.test(name)) {
    return { kind: "source-note", reasons: ["section-header-name"] };
  }

  if (
    sectionHeaderNamePatterns.some((pattern) => pattern.test(name)) &&
    /\.{5,}/.test(description) &&
    /\b(?:fries|chips|pickle|cookie|drink|sides?)\b/i.test(description)
  ) {
    return { kind: "source-note", reasons: ["section-header-dotted-menu-fragment"] };
  }

  if (/^menu category$/i.test(String(item?.category ?? "")) && sectionHeaderNamePatterns.some((pattern) => pattern.test(name))) {
    return { kind: "source-note", reasons: ["menu-category-section-header"] };
  }

  if (/^.+\bmenu section\.?$/i.test(description)) {
    return { kind: "source-note", reasons: ["menu-section-placeholder-description"] };
  }

  if (
    /\b(?:appetizers?|sandwiches?|burgers?|favorites?)\b/i.test(name) &&
    /\b(?:menu section|favorites? on (?:the )?.+ menu)\b/i.test(description)
  ) {
    return { kind: "source-note", reasons: ["menu-section-placeholder-description"] };
  }

  if (
    sectionHeaderNamePatterns.some((pattern) => pattern.test(name)) &&
    /\bmenu section\b/i.test(description)
  ) {
    return { kind: "source-note", reasons: ["section-header-menu-section-description"] };
  }

  if (sectionHeaderNamePatterns.some((pattern) => pattern.test(name)) && legalDescriptionPatterns.some((pattern) => pattern.test(description))) {
    return { kind: "source-note", reasons: ["section-header-with-legal-description"] };
  }

  if (
    /^from the (?:grill|land|sea)$/i.test(name) &&
    (!description ||
      /^(?:entr[ée]es?|[A-Z][A-Z\s&'-]{3,35})$/i.test(description) ||
      /[\uf000-\uf8ff]/.test(description))
  ) {
    return { kind: "source-note", reasons: ["section-header-name"] };
  }

  if (
    sectionHeaderNamePatterns.some((pattern) => pattern.test(name)) &&
    /^\*?\s*all\s+(?:bread|buns?|rolls?)\s+contains?\b/i.test(description)
  ) {
    return { kind: "source-note", reasons: ["section-header-with-allergen-note"] };
  }

  if (
    sectionHeaderNamePatterns.some((pattern) => pattern.test(name)) &&
    /\$\d/.test(description) &&
    /\b(?:contains?|gluten free|serves?|baos?|wraps?|kebabs?|sushi box)\b/i.test(description)
  ) {
    return { kind: "source-note", reasons: ["section-header-grouped-description"] };
  }

  if (
    sectionHeaderNamePatterns.some((pattern) => pattern.test(name)) &&
    /\b[A-Z][A-Z'’&() -]{3,}\s+\$?\d{1,2}(?:\.\d{2})?\b/.test(description)
  ) {
    return { kind: "source-note", reasons: ["section-header-grouped-priced-items"] };
  }

  if (/^(?:signatures serves|sushithe\s+sushi\s+box)/i.test(name)) {
    return { kind: "source-note", reasons: ["section-header-grouped-description"] };
  }

  if (isSectionHeaderWithGroupedDescription(name, description)) {
    return { kind: "source-note", reasons: ["section-header-grouped-description"] };
  }

  if (isGenericSectionHeaderWithMenuListDescription(name, description)) {
    return { kind: "source-note", reasons: ["generic-section-header-menu-list-description"] };
  }

  if (
    /\*please note\b/i.test(description) &&
    !/\b(?:cake flavor|frosting|ombre|vanilla frosting)\b/i.test(description) &&
    (description.match(/\b\d+(?:\.\d{1,2})?\b/g) ?? []).length >= 3 &&
    /\b(?:bagel|toast|bread|muffin|cake|cream cheese)\b/i.test(description)
  ) {
    return { kind: "source-note", reasons: ["hard-text-bleed-legal-note"] };
  }

  if (sectionHeaderNamePatterns.some((pattern) => pattern.test(name)) && isSourceBoilerplateDescription(description)) {
    return { kind: "source-note", reasons: ["section-header-with-source-boilerplate"] };
  }

  if (isSourceBoilerplateDescription(description)) {
    if (/^(?:glass|bubbly blanc)$/i.test(name)) {
      return { kind: "source-note", reasons: ["source-boilerplate-drink-artifact"] };
    }

    reasons.push("source-boilerplate-description");
  }

  if (description && isPriceOnlyDescription(description)) {
    reasons.push("price-only-description");
  }

  const bleedReasons = textBleedReasons(item);

  if (bleedReasons.length > 0) {
    reasons.push(...bleedReasons);
  }

  if (bleedReasons.some((reason) => reason.startsWith("hard-"))) {
    return { kind: "source-note", reasons };
  }

  if (bleedReasons.length > 0) {
    return { kind: "menu-item", reasons };
  }

  return { kind: "menu-item", reasons };
}

function hasDishSpecificName(value) {
  return /\b(?:taco|burger|sandwich|salad|bowl|pizza|pasta|soup|fries|wings|steak|filet|wagyu|caviar|meatballs?|chicken|shrimp|crab|lobster|mussel|clam|scallop|fish|salmon|tuna|cookie|cake|pie|brownie|bagel|toast|pita|wrap|naan|rice|beans|falafel|hummus|quesadilla|empanada|arepa|sushi|ramen|udon|noodle|dumpling|roll|rib|ribs|short rib|cheese|cream|smoothie|juice|coffee|tea|kimchi|tteok|ddeok|tteokbokki|ddeok[- ]?bokki|rice cake|tiramisu|tres leches|rarebit|trout|greens?|tomatoes|mushrooms?|potatoes?|asparagus|sauce|butter)\b/i.test(
    value ?? "",
  );
}

function isMarketingOrEventCard(name, description, item) {
  if (/^when:\s*\d/i.test(name)) {
    return true;
  }

  if (
    /\bread more\b/i.test(description) &&
    (
      /\b(?:articles?|press|news|reviews?|testimonials?|restaurant|stores?|the taste of|pizza|barbecue|mediterranean)\b/i.test(String(item?.category ?? "")) ||
      !hasDishSpecificName(name)
    )
  ) {
    return true;
  }

  if (
    /^(?:a hidden gem|food is delicious|highly recommend|highly recommend .+|outstanding flavors|plan to return|very authentic and delicious|you won'?t be dissapointed|you won'?t be disappointed)$/i.test(name) &&
    /\b(?:service|staff|atmosphere|experience|anniversary|family|restaurant|recommend|delicious|disappointed|return)\b/i.test(description)
  ) {
    return true;
  }

  if (
    /^(?:authentic|best)\s+.+\b(?:in|near|on)\b/i.test(name) &&
    /\b(?:order|delivery|takeout|online|straight to your door|convenient)\b/i.test(description)
  ) {
    return true;
  }

  if (/\bseo keyword\b/i.test(description)) {
    return true;
  }

  if (
    /^(?:fresh|wood[- ]fired|authentic|best)\s+.+(?:pizza|italian|neapolitan)\b/i.test(name) &&
    /\b(?:order|delivery|takeout|online|pickup|straight to your door|convenient)\b/i.test(description)
  ) {
    return true;
  }

  if (
    /^(?:crust pizza|crust pizzeria|crust pizzeria napoletana|italian|elenden street)$/i.test(name) &&
    /\b(?:order|delivery|takeout|online|pickup)\b/i.test(description)
  ) {
    return true;
  }

  if (
    /^[a-z][a-z ,&().'-]{8,80}$/i.test(name) &&
    /[,]/.test(name) &&
    /\b(?:order|delivery|takeout|online|pickup|straight to your door|convenient)\b/i.test(description)
  ) {
    return true;
  }

  if (
    /\b(?:stands out as the ultimate choice|unique flavor combination|best pizza near me)\b/i.test(`${name} ${description}`) &&
    /\b(?:order|choice|indulge|crust pizza|neapolitan pizza)\b/i.test(description)
  ) {
    return true;
  }

  if (
    /^(?:happy hour|bottomless brunch|.+golden hour\b)/i.test(name) &&
    /\b(?:join us|dj|drinks?|bubbles|bloody marys|happy hour|read more)\b/i.test(description)
  ) {
    return true;
  }

  if (
    /^(?:aaron watson|we buy fresh & local|south indian|steaks seafood and rotisserie favorites)$/i.test(name) &&
    /\b(?:looking for the best|reinvented the diner experience|ultimate veg restaurant|quality of an elevated dining destination|our menu is rooted)\b/i.test(description)
  ) {
    return true;
  }

  if (
    /\b(?:testimonial|reviews?|stores?|oby\.\d+)\b/i.test(String(item?.category ?? "")) &&
    /\b(?:read more|looking for the best|highly recommend|our menu features|our menu is rooted)\b/i.test(description)
  ) {
    return true;
  }

  return false;
}

function isPriceCalorieCardName(name, description) {
  return (
    /^\$?\d+(?:\.\d{2})?\s*[•-]\s*\d+\s*cal$/i.test(name) &&
    hasDishSpecificName(description)
  );
}

function isSentenceFragmentDisclosureRow(name, description) {
  if (!description) {
    return false;
  }

  if (hasDishSpecificName(name)) {
    return false;
  }

  const text = `${name} ${description}`;

  return (
    /^(?:the|this|that|these|those|our|its)\s+[a-z][a-z\s-]{6,80}\s+(?:is|are|was|were|contains?|includes?|may|can)\b/i.test(name) &&
    /\b(?:contains?|includes?|only|approximately|may contain|allergens?)\b/i.test(text)
  );
}

function isAllergenDisclosurePrefixName(name, description) {
  if (
    !/^(?:contains?|may contain)\s+(?:dairy|milk|egg|eggs|gluten|wheat|soy|sesame|sesame seeds|fis|fish|shellfish|nuts?|tree nuts?|peanuts?)\b/i.test(
      name,
    )
  ) {
    return false;
  }

  return (
    /\b(?:contains?|allergens?)\b/i.test(description) ||
    /\b[A-Z]{1,2}\s*=\s*Contains\b/i.test(description) ||
    /^(?:contains?|may contain)\s+(?:dairy|milk|egg|eggs|gluten|wheat|soy|sesame|sesame seeds|fis|fish|shellfish|nuts?|tree nuts?|peanuts?)\s+[A-Z][a-z]/i.test(
      name,
    )
  );
}

function allergenMatrixCueCount(value) {
  return (
    String(value ?? "").match(
      /\b(?:X\s+Contains|Contains\s+(?:Milk|Egg|Soy|Wheat|Fish|Shellfish|Tree Nuts?|Peanuts?|Sesame)|(?:Milk|Egg|Soy|Wheat|Fish|Shellfish|Tree Nuts?|Peanuts?|Sesame)\s+Contains)\b/gi,
    ) ?? []
  ).length;
}

function isAllergenMatrixBleedName(name, description) {
  const text = `${name} ${description}`;

  if (isLeadingAllergenMatrixCellName(name)) {
    return true;
  }

  if (allergenMatrixCueCount(name) < 2) {
    return false;
  }

  const tableDashCount = (text.match(/\s-\s/g) ?? []).length;
  const numericCellCount = (text.match(/\b\d{1,4}\b/g) ?? []).length;
  const namedAllergenCount = (
    text.match(/\b(?:Milk|Egg|Soy|Wheat|Fish|Shellfish|Tree Nuts?|Peanuts?|Sesame)\b/gi) ?? []
  ).length;

  return (
    allergenMatrixBlobPattern.test(text) &&
    (tableDashCount >= 3 || numericCellCount >= 8 || namedAllergenCount >= 4)
  );
}

function isOfficialAllergenIngredientFragmentRow(name, description, item) {
  const sourceSummary = String(item?.sourceSummary ?? "");
  const category = String(item?.category ?? "");
  const text = `${name} ${category} ${description} ${sourceSummary}`;

  if (
    /\b(?:partial official (?:menu )?ingredient evidence|official menu ingredient review|not treated as a complete allergen matrix)\b/i.test(
      sourceSummary,
    )
  ) {
    return false;
  }

  if (!/\bofficial\b.+\ballergen\b.+\b(?:matrix|guide|note)\b/i.test(sourceSummary)) {
    return false;
  }

  const punctuationCount = (name.match(/[,;:()]/g) ?? []).length;

  if (
    (hasDishSpecificName(name) ||
      /\b(?:dumplings?|wontons?|ramen|noodles?|bao|buns?|rolls?|sandwich(?:es)?|salad|soup|tacos?|pizza|burger|pasta)\b/i.test(
        name,
      )) &&
    punctuationCount === 0
  ) {
    return false;
  }

  const ingredientCueCount = (
    text.match(
      /\b(?:acid|benzoate|cellulose|citric|dextrose|distilled vinegar|flavor|gum|mononitrate|natural flavor|niacin|oil|preservatives?|riboflavin|sorbate|soybean oil|spices?|thiamine|vinegar|whey|xanthan)\b/gi,
    ) ?? []
  ).length;
  const upperIngredientFragmentName =
    /^[A-Z0-9\s,():;'’.-]{10,}$/.test(name) &&
    /\b(?:ACID|BENZOATE|DEXTROSE|FLAVOR|GUM|MILK|MONONITRATE|NATURAL|OIL|PRESERVATIVES|RIBOFLAVIN|SORBATE|SOYBEAN|SPICES|VINEGAR|XANTHAN)\b/.test(
      name,
    );
  const strongIngredientFragmentName = /\b(?:ANTI-DUSTING|SOYBEAN OIL)\b/i.test(name);

  return (
    (ingredientCueCount >= 2 || strongIngredientFragmentName) &&
    (punctuationCount >= 1 || upperIngredientFragmentName || strongIngredientFragmentName) &&
    (name.length >= 24 ||
      /[,;:]$/.test(name) ||
      /[,;:]$/.test(category) ||
      upperIngredientFragmentName ||
      strongIngredientFragmentName)
  );
}

function isOfficialMatrixDanglingBoundaryRow(name, description, item) {
  const sourceSummary = String(item?.sourceSummary ?? "");
  const sourceKind = String(item?.sourceKind ?? "");
  const allergenSourceType = String(item?.allergenSourceType ?? "");
  const hasOfficialMatrixEvidence =
    /\bofficial\b.+\b(?:allergen|nutrition)\b.+\b(?:matrix|guide|pdf|information)\b/i.test(sourceSummary) ||
    /pdf-matrix|nutrition/i.test(sourceKind) ||
    /^official-/i.test(allergenSourceType);

  if (/^restaurant-linked-ordering-menu$/i.test(String(item?.sourceType ?? ""))) {
    return false;
  }

  if (!hasOfficialMatrixEvidence) {
    return false;
  }

  if (!/(?:&|\b(?:and|or|with))$/i.test(name.trim())) {
    return false;
  }

  return (
    (item?.allergens?.length ?? 0) > 0 ||
    (item?.mayContain?.length ?? 0) > 0 ||
    /\bofficial\b/i.test(sourceSummary)
  );
}

function isLeadingAllergenMatrixCellName(name) {
  const text = String(name ?? "").trim();

  if (!/^(?:Almond|Anchovy|Tuna|Milk|Egg|Soy|Wheat|Fish|Shellfish|Tree Nuts?|Peanuts?|Sesame)\b/i.test(text)) {
    return false;
  }

  const tableCellCount = (text.match(/(?:\s-\s|\bX\s+Contains\b|\bContains\s+[A-Z][A-Za-z: ]{1,30})/g) ?? []).length;

  return tableCellCount >= 2 && /\b(?:burger|char|sandwich|salad|cobb|crunch|sourdough|wrap|bowl)\b/i.test(text);
}

function isAllergenNutritionTableBleedDescription(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return false;
  }

  const cueCount = allergenMatrixCueCount(text);
  const numericCellCount = (text.match(/\b\d{1,4}\b/g) ?? []).length;
  const tableDashCount = (text.match(/\s-\s/g) ?? []).length;
  const startsWithTablePlaceholders = /^(?:-\s*){3,}[A-Z]/.test(text);

  return (
    (cueCount >= 2 || (cueCount >= 1 && startsWithTablePlaceholders)) &&
    allergenMatrixBlobPattern.test(text) &&
    (numericCellCount >= 8 || tableDashCount >= 5 || nutritionTableBlobPattern.test(text))
  );
}

function isDietaryLegendBleedRow(name, description) {
  if (!description || description.length < 100) {
    return false;
  }

  if (!/\b(?:contains dairy|contains nuts|gluten free|vegetarian|allergen key|food truck menu)\b/i.test(description)) {
    return false;
  }

  return /^[A-Z][A-Z '&-]{2,60}\s+(?:V|N|D|G|GF)(?:\s+(?:V|N|D|G|GF))*$/i.test(name);
}

function isLocationOrVenueCard(name, category, description) {
  const locationCategory = /^(?:[A-Z][A-Za-z .'-]+\s+)?(?:d\.?c\.?|dc|md|va|washington|arlington|alexandria|bethesda|fairfax|falls church|herndon|mclean|reston|tysons|vienna)\b/i.test(
    category ?? "",
  );

  if (description && !/^(?:eat|offers?)$/i.test(name)) {
    return false;
  }

  if (/^(?:eat|offers?)$/i.test(name) && locationCategory) {
    return true;
  }

  if (/^non[- ]alcoholic$/i.test(name)) {
    return true;
  }

  if (/^red$/i.test(name) && /^(?:national harbor|navy yard)$/i.test(category)) {
    return true;
  }

  return (
    /^(?:denver|houston|minneapolis|pittsburgh)$/i.test(name) &&
    /^(?:menu|national harbor|navy yard|denver coors field)$/i.test(category)
  );
}

function isOrderingShellCard(name, category, description) {
  if (!description) {
    return false;
  }

  if (
    /^order online from\b.+\bincluding\b.+\bget the best prices and service by ordering direct!?$/i.test(
      description.trim(),
    )
  ) {
    return true;
  }

  if (
    /^check the status of your order online\b/i.test(description) &&
    /^(?:lookup|account|orders?)$/i.test(category)
  ) {
    return true;
  }

  const hasOrderingShell =
    /\bOrders through Toast are commission free\b/i.test(description) ||
    /\b(?:Call|Hours|Directions|Gift Cards)\b[\s\S]{0,80}\b(?:Pickup|Delivery|Opens at|ASAP)\b/i.test(description);
  const hasLocationCue =
    addressDescriptionPattern.test(description) ||
    /\b(?:Pickup from|Delivery Pickup|Pickup Only|Only•Pickup)\b/i.test(description);

  if (hasOrderingShell && hasLocationCue) {
    return true;
  }

  if (
    /^restaurant$/i.test(category) &&
    /\b(?:Call|Hours|Directions|Gift Cards|Pickup from|Only•Pickup)\b/i.test(description) &&
    !hasDishSpecificName(name)
  ) {
    return true;
  }

  return false;
}

function isSimpleDrinkOnlyRow(name, category, description, item) {
  if (!simpleDrinkOnlyNamePattern.test(name) || hasDishSpecificName(description)) {
    return false;
  }

  if (item?.allergenSourceType && item.allergenSourceType !== "unavailable") {
    return true;
  }

  return !/\b(?:beverages?|drinks?|sodas?|soft drinks?|cans?|bottles?|mocktails?|zero proof|non[- ]?alcoholic)\b/i.test(category ?? "");
}

function isAlcoholDrinkNameOnlyRow(name, category, description) {
  if (description) {
    return false;
  }

  if (simpleDrinkOnlyNamePattern.test(name)) {
    return false;
  }

  const text = `${name} ${category}`;

  return (
    (alcoholOnlyNamePattern.test(text) || alcoholOnlyCategoryPattern.test(category ?? "")) &&
    !isAlcoholFoodPreparationText(text) &&
    !hasFoodDishForAlcoholRow(text)
  );
}

function isCondimentFragmentWithBleed(name, description) {
  if (!description || description.length < 90) {
    return false;
  }

  const foodTransitionCount = (description.match(/\b(?:brunch|chicken|dessert|eggs?|grits?|pancake|shrimp|steak|waffles?)\b/gi) ?? []).length;

  return (
    /^(?:tartar sauce|onions?,?\s+chimichurri sauce|choice(?: of)?|choice of two sides)$/i.test(name) &&
    (textBleedReasons({ name, description }).length > 0 || foodTransitionCount >= 3)
  );
}

function isNutritionPdfModifierVariant(name, description) {
  return (
    /^(?:beef|chicken|steak|shrimp|fish|pork|vegetable|veggie|tofu)$/i.test(name) &&
    (/^official\s+nutrition\s+pdf\.\s+serving size:/i.test(description) || isPriceOnlyDescription(description))
  );
}

function isBareGenericProteinOption(name, description, item) {
  if (!/^(?:beef|chicken|steak|shrimp|fish|pork|vegetable|veggie|tofu)$/i.test(name)) {
    return false;
  }

  if (isOfficialAllergenMatrixRow(item)) {
    return false;
  }

  if (description) {
    return false;
  }

  const evidenceTexts = (item?.evidence ?? [])
    .map((entry) => String(entry?.text ?? "").trim())
    .filter(Boolean);

  return evidenceTexts.length === 0 || evidenceTexts.every((text) => text.toLowerCase() === name.toLowerCase());
}

function isAlcoholOnlyBleedRow(name, category, description) {
  const rowText = `${name} ${category} ${description}`;

  if (/\b(?:mocktails?|zero proof|non[- ]?alcoholic)\b/i.test(category)) {
    return false;
  }

  if (
    /\b(?:bakery|desserts?|sweet temptations|sweets?)\b/i.test(category) &&
    /\b(?:bread|cake|chocolate|cookies?|desserts?|dough|ice ?cream|milk solids?|pastr(?:y|ies)|pudding|syrup)\b/i.test(rowText)
  ) {
    return false;
  }

  if (
    hasFoodDishForAlcoholRow(rowText) ||
    /\b(?:smoothie|juice|cold[- ]pressed|pressed juice|daiquiri ice|root beer|raw bar|oysters?|mussels?|cozze|calamari|shrimp|scallops?|seafood|spinach|bacon|cabbage)\b/i.test(rowText)
  ) {
    return false;
  }

  const nameIsAlcohol = alcoholOnlyNamePattern.test(name) || /\bspritz\b/i.test(name) || /^\d{2}\s*spritz$/i.test(name);
  const descriptionIsGlobalAllergyWarning =
    /\ballergy warning\b|\bmay contain or have come in contact with\b/i.test(description);
  const swedishFishCocktail =
    /\bswedish fish\b/i.test(description) && alcoholOnlyDescriptionPattern.test(description);

  return (
    swedishFishCocktail ||
    (nameIsAlcohol && isPriceOnlyDescription(description)) ||
    (nameIsAlcohol || alcoholOnlyDescriptionPattern.test(description)) &&
    !hasFoodDishForAlcoholRow(name) &&
    (descriptionIsGlobalAllergyWarning || !hasFoodDishForAlcoholRow(description)) &&
    !isAlcoholFoodPreparationText(rowText)
  );
}

function isOfficialAllergenMatrixRow(item) {
  return (
    /official-allergen-(?:menu|guide|widget)/i.test(String(item?.allergenSourceType ?? "")) &&
    /(?:official-api|pdf-matrix|html-allergen-matrix|embedded-flavor-nutrition|official-allergen-widget|everybite-widget-graphql|official-pdf-allergen-matrix)/i.test(
      `${item?.sourceType ?? ""} ${item?.sourceKind ?? ""}`,
    )
  );
}

function isStrongAlcoholOnlyDescriptionRow(name, description) {
  if (!description || hasFoodDishForAlcoholRow(name)) {
    return false;
  }

  const text = `${name} ${description}`;
  const descriptionWithoutVenueNames = String(description ?? "").replace(/\bFish Shop\b/gi, " ");
  const alcoholCueCount = (text.match(
    /\b(?:ketel|tanqueray|vermouth|olive brine|vodka|gin|tequila|mezcal|bourbon|whiskey|rum|brandy|amaro|campari|aperol)\b/gi,
  ) ?? []).length;

  return (
    alcoholCueCount >= 2 &&
    !hasFoodDishForAlcoholRow(descriptionWithoutVenueNames) &&
    !isAlcoholFoodPreparationText(text)
  );
}

function isLikelyAlcoholListRow(name, category, description) {
  if (!description) {
    return false;
  }

  if (hasFoodDishForAlcoholRow(name)) {
    return false;
  }

  const text = `${name} ${category} ${description}`;
  const alcoholCueCount = (text.match(
    /\b(?:anejo|bourbon|brandy|blanton|conejo|espad[ií]n|gin|jameson|mezcal|montelobos|rye|tequila|vago|vodka|whiskey)\b/gi,
  ) ?? []).length;
  const priceOrPourCount = (text.match(/\$\s?\d+|\b(?:\.75|1|1\.5|2)\s*oz\b|\b\d+\s*\/\s*\d+\b/gi) ?? []).length;

  return (
    (alcoholCueCount >= 2 && priceOrPourCount >= 1) ||
    (/^martinis?$/i.test(name) && alcoholCueCount >= 3) ||
    (/^a(?:ñ|n)ejo$/i.test(name) && /\baged\b.+\boak\b/i.test(description))
  );
}

function isAlcoholOnlyCategoryRow(name, category, description) {
  if (!alcoholOnlyCategoryPattern.test(category ?? "")) {
    return false;
  }

  const text = `${name} ${category} ${description}`;
  const wineListVintageRow =
    /\|\s*[^|]{2,60}\s*\|\s*[^|]{2,90}\b(?:19|20)\d{2}\b/i.test(description) ||
    /\b(?:marsala|passito|sauternes|port|recioto)\b.+\b(?:19|20)\d{2}\b/i.test(description);

  return (
    (wineListVintageRow || alcoholOnlyNamePattern.test(text) || alcoholOnlyDescriptionPattern.test(text)) &&
    !hasFoodDishForAlcoholRow(text) &&
    !isAlcoholFoodPreparationText(text)
  );
}

function isDrinkOnlyCategoryRow(name, category, description) {
  if (!drinkOnlyCategoryPattern.test(category ?? "")) {
    return false;
  }

  const text = `${name} ${category} ${description}`;

  return (
    !hasFoodDishForAlcoholRow(text) &&
    !/\b(?:smoothie|shake|coffee|tea|lassi)\b/i.test(text)
  );
}

function isNonFoodCategoryRow(name, category, description) {
  if (!nonFoodCategoryPattern.test(category ?? "")) {
    return false;
  }

  const text = `${name} ${description}`;

  if (/^(?:store|media|visit|analytics|testimonial|take out|private banquet events|give the gift of well-being|labor day)$/i.test(name)) {
    return true;
  }

  if (/^(?:newsletter|gift cards?|events?|banquet events?)$/i.test(category) && !hasDishSpecificName(text)) {
    return true;
  }

  if (/^(?:taqueria\s+xochi\s+-\s+arlington|philadelphia)$/i.test(name)) {
    return true;
  }

  if (/^punch bowl serves\b/i.test(name) && alcoholOnlyDescriptionPattern.test(description)) {
    return true;
  }

  if (/^red$/i.test(name) && /\b(?:w\s*i\s*n\s*e|m\s*e\s*r\s*l\s*o\s*t|wine company|merlot)\b/i.test(description)) {
    return true;
  }

  if (/\b(?:newsletter|gift cards?|event|banquet|analytics|customers are searching|restaurant offers authentic|come celebrate|open daily|no-calorie taste of topo chico)\b/i.test(text)) {
    return true;
  }

  return false;
}

function isSectionHeaderWithGroupedDescription(name, description) {
  if (!description || !sectionHeaderNamePatterns.some((pattern) => pattern.test(name))) {
    return false;
  }

  if (/^(?:hot beverages?|drinks?|beverages?|cocktails?|wine|beer)$/i.test(name)) {
    return true;
  }

  const separatorCount = (description.match(/\s(?:•|\||;)\s/g) ?? []).length;
  const priceCount = (description.match(/\$\s?\d+(?:\.\d{2})?|\bMP\b|\+\s?\d+|\badditional\s+\d+(?:\.\d{2})?/gi) ?? []).length;
  const marketPriceCount = (description.match(/\b(?:market\s+price|mkt\s+price|mp)\b/gi) ?? []).length;
  const dishTransitionCount = (description.match(/\b(?:catch of the day|crispy whole fish|prawn|shrimp|crab|lobster|salmon|tuna|steak|chicken|pork|burger|sandwich|salad|soup|pasta|pizza|taco)\b/gi) ?? []).length;

  return (
    separatorCount >= 2 ||
    priceCount >= 2 ||
    (marketPriceCount >= 1 && dishTransitionCount >= 2) ||
    /^served with your choice of\b/i.test(description)
  );
}

function hasFoodDishForAlcoholRow(value) {
  if (nutritionTableBlobPattern.test(value ?? "")) {
    return false;
  }

  const text = String(value ?? "").replace(/\bvanilla beans?\b/gi, " ");

  return /\b(?:taco|burger|sandwich|salad|bowl|pizza|pasta|soup|fries|wings|steak|filet|wagyu|wellington|caviar|meatballs?|chicken|shrimp|crab|lobster|mussel|clam|oysters?|scallop|fish|salmon|tuna|cookie|cake|pie|tart|brownie|muffin|croissant|bagel|toast|pita|wrap|naan|rice|beans|falafel|hummus|quesadilla|empanada|arepa|sushi|ramen|udon|noodle|dumpling|roll|rib|ribs|short rib|cheese|cream|butter|crisps?|spinach|bacon|cabbage|kimchi|tteok|ddeok|tteokbokki|ddeok[- ]?bokki|rice cake|mushrooms?|potatoes?|vegetables?|asparagus|smoothie|milkshake|shake|soft serve|latte|coffee|tea|kombucha|agua fresca|baklawa|baklava|ma[’']?amoul|qatayef|namoura|halawa|knafeh)\b/i.test(
    text,
  );
}

function isAlcoholFoodPreparationText(value) {
  const text = String(value ?? "");

  return /\b(?:vodka|wine|bourbon|whiskey|rum|tequila|gin)[-\s]+(?:sauce|braised|glaze|glace|demi|demi[-\s]?glace|reduction|marinated|marinade|vinegar|caramel|cream)\b/i.test(
    text,
  );
}

function isNutritionTableHeaderCategory(value) {
  return /^(?:cals?|calories|fat|sat\s*fat|trans\s*fat|chol|sod|carb|fib|sug|prot)$/i.test(
    String(value ?? "").trim(),
  );
}

function shouldInferDisplayCategory(item) {
  const category = String(item?.category ?? "").trim();
  const name = String(item?.name ?? "").trim();

  if (isNutritionTableHeaderCategory(category)) {
    return true;
  }

  return (
    /^sauces? (?:&|and) dressings?$/i.test(category) &&
    /\b(?:mozzarella sticks?|potato skins?|green bean fries?|table[- ]?tizer)\b/i.test(name)
  );
}

function inferDisplayCategoryFromItem(item) {
  const name = String(item?.name ?? "");

  if (/\b(?:mozzarella sticks?|potato skins?|green bean fries?|table[- ]?tizer|appetizers?|starters?)\b/i.test(name)) {
    return "Appetizers";
  }

  if (/\b(?:burger|cheeseburger|philly|sandwich|fr?rib)\b/i.test(name)) {
    return "Burgers & Sandwiches";
  }

  if (/\b(?:pasta|fettuccine|alfredo|shrimp|salmon|chicken fingers?|ribs?|steak|sirloin)\b/i.test(name)) {
    return "Entrees";
  }

  if (/\b(?:salad|soup|bowl)\b/i.test(name)) {
    return "Salads, Soups & Bowls";
  }

  if (/\b(?:brownie|cake|cheesecake|dessert|pretzel bites?)\b/i.test(name)) {
    return "Desserts";
  }

  if (/\b(?:fries|potato|coleslaw|rice|broccoli|mac|cheese)\b/i.test(name)) {
    return "Sides";
  }

  if (/\b(?:wings?|sauce|glaze|dressing|ranch|vinaigrette)\b/i.test(name)) {
    return "Sauces & Dressings";
  }

  return null;
}

function isDocumentLinkCard(name, description, item) {
  if (description) {
    return false;
  }

  const urls = item?.sourceUrls ?? [];
  const hasPdfUrl = Array.isArray(urls) && urls.some((url) => /\.pdf(?:$|[?#])/i.test(String(url ?? "")));
  if (!hasPdfUrl) {
    return false;
  }

  return /^(?:all[- ]night happy hour|father[’']?s day brunch|happy hour|brunch|lunch|dinner|menu)$/i.test(name);
}

function isNutritionDocumentCard(name, description, item) {
  if (!nutritionDocumentCardNamePattern.test(name)) {
    return false;
  }

  const category = String(item?.category ?? "");
  const sourceSummary = String(item?.sourceSummary ?? "");
  const sourceUrls = Array.isArray(item?.sourceUrls) ? item.sourceUrls.join(" ") : "";
  const mangledNutritionHeading = /^nutrition informa/i.test(name);

  return (
    !hasDishSpecificName(name) &&
    (
      mangledNutritionHeading ||
      !description ||
      nutritionDocumentCardNamePattern.test(description) ||
      /\b(?:nutrition|allergen)\b/i.test(`${category} ${sourceSummary} ${sourceUrls}`)
    )
  );
}

function isOfficialMatrixCategoryOnlyArtifact(name, description, item) {
  if (description) {
    return false;
  }

  const sourceSummary = String(item?.sourceSummary ?? "");
  const directAllergens = Array.isArray(item?.allergens) ? item.allergens : [];
  const mayContain = Array.isArray(item?.mayContain) ? item.mayContain : [];

  if (directAllergens.length > 0 || mayContain.length > 0) {
    return false;
  }

  if (!/\bofficial\b.+\b(?:allergen|nutrition).+\b(?:guide|matrix|pdf)\b/i.test(sourceSummary)) {
    return false;
  }

  return /^(?:BEEF\s*&\s*CHICKEN|CLASSIC SELECTIONS|FEASTS|LOBSTER\s*&\s*SEAFOOD SPECIALTIES|PASTAS|PREMIUM SELECTIONS|SALADS\s*&\s*BOWLS|SHRIMP AND SAUCE|SHRIMP YOUR WAY|Airport|onions\s*\))$/i.test(
    name,
  );
}

function isRecoveredGenericOfficialMatrixRow(item) {
  const sourceSummary = String(item?.sourceSummary ?? "").trim();
  const evidence = Array.isArray(item?.evidence) ? item.evidence : [];

  const hasGenericOfficialMatrixEvidence = evidence.some((entry) =>
    /^Official .+ allergen matrix\.?$/i.test(String(entry?.text ?? "").trim()),
  );
  const hasRecoveryEvidence = evidence.some((entry) => entry?.source === "reviewed-portfolio-row-recovery");

  if (!/^Official .+ allergen matrix\.?$/i.test(sourceSummary) && !(hasGenericOfficialMatrixEvidence && hasRecoveryEvidence)) {
    return false;
  }

  if (!hasRecoveryEvidence) {
    return false;
  }

  return !evidence.some((entry) =>
    /\bofficial allergen row:\s*.+:/i.test(String(entry?.text ?? "")),
  );
}

function isPdfExtractionHeaderBleed(name, description) {
  return (
    /^[A-Z]{2,4}$/i.test(name) &&
    /\.pdf\b/i.test(description) &&
    /\b(?:starters?|salads?|entrees?|mains?|toppings?)\b/i.test(description)
  );
}

function isPrivateDiningChoiceHeader(name, description) {
  return (
    /^(?:classic\s+)?(?:appetizers?|sides?|enhanced side options|enhanced entr[ée]e options|entr[ée]e course|entr[ée]e selections|entr[ée]e enhancements?|dessert course|salad course|salad\/soup course|soup\s*&\s*salad course|signature appetizers)$/i.test(
      name,
    ) &&
    /\b(?:host selects|priced per person|not a substitution|served family[- ]style)\b/i.test(description)
  );
}

function isGenericSectionHeaderWithMenuListDescription(name, description) {
  if (!sectionHeaderNamePatterns.some((pattern) => pattern.test(name)) || !description) {
    return false;
  }

  const text = String(description ?? "").trim();
  const foodCueCount = (
    text.match(
      /\b(?:aioli|almond|bagel|bread|butter|cake|cheese|chicken|crab|cream|curry|fish|fries|garlic|lamb|lobster|mussel|oxtail|oysters?|pasta|patties|pizza|pork|rice|salad|sandwich|shrimp|snapper|sorbet|steak|taco|tuna|wagyu)\b/gi,
    ) ?? []
  ).length;
  const likelyMenuTitleCount = (
    text.match(
      /\b[A-Z][a-z'’]+(?:\s+(?:&\s+)?[A-Z][a-z'’]+){1,4}\b/g,
    ) ?? []
  ).length;
  const transitionCueCount = (
    text.match(/\b(?:snacks?|small share|large share|sweet|with bread|desserts?|starters?|sides?)\b/gi) ?? []
  ).length;
  const priceOrMarkerCount = (text.match(/(?:\$?\d{1,3}(?:\.\d{2})?|\*)/g) ?? []).length;

  return (
    text.length >= 90 &&
    foodCueCount >= 4 &&
    (likelyMenuTitleCount >= 3 || transitionCueCount >= 1 || priceOrMarkerCount >= 2)
  );
}

export function textBleedReasons(item) {
  const name = String(item?.name ?? "").trim();
  const description = String(item?.description ?? "").trim();
  const reasons = [];

  if (!description) {
    return reasons;
  }

  const pricingDescription = description.replace(/[()]/g, "");
  const priceCount = (description.match(/\$\s?\d+(?:\.\d{2})?/g) ?? []).length;
  const dottedMenuLeaderCount = (description.match(/\.{5,}/g) ?? []).length;
  const sentenceLikeSeparatorCount = (description.match(/\s(?:\||•|;)\s/g) ?? []).length;
  const foodTransitionCount = (description.match(/\b(?:burger|sandwich|tacos?|pizza|pasta|salad|soup|fries|muffins?|lobster|shrimp|crab|fish|steak|chicken|dessert)\b/gi) ?? []).length;
  const transitionTerms = new Set(
    (description.match(/\b(?:appetizers?|starters?|salads?|soups?|sandwiches?|burgers?|entrees?|mains?|sides?|desserts?|drinks?|beverages?|cocktails?|wine|beer)\b/gi) ?? [])
      .map((term) => term.toLowerCase().replace(/s$/, ""))
      .filter((term) => !(term === "side" && /\bside\s+(?:salad|soup|fries|dish)\b/i.test(description))),
  );
  const hasUsefulServedWithPhrase = /\b(?:served with|choice of|topped with|comes with|includes)\b/i.test(description);
  const isBundleOrComboRow =
    /\b(?:bento|box|charola|combo|combination|package|bundle|meal\s+deal|family\s+meal|feast|platter|sampler|assortment|set|tray|for\s+(?:two|three|four|\d+))\b/i.test(
      `${name} ${description}`,
    );
  const isAddOnPricingRow =
    /\b(?:add(?:\s+a)?\s+(?:protein|chicken|shrimp|steak|salmon|tofu)|add\s+(?:grilled|crispy|blackened)|choose\s+\d+|choice\s+of|your\s+choice|topped\s+with\s+your\s+preference|(?:chicken|shrimp|salmon|steak|tofu|beef|pork|seafood|combo)\s*\+?\$?\d)\b/i.test(
      pricingDescription,
    );
  const isProteinVariantPricingRow =
    /\b(?:chicken|beef|steak|shrimp|salmon|tofu|vege|vegetable|pork|seafood|combo)\s+\$?\d/i.test(pricingDescription) &&
    /\b(?:chicken|beef|steak|shrimp|salmon|tofu|vege|vegetable|pork|seafood|combo)\s+\$?\d[\s\S]{0,80}\b(?:chicken|beef|steak|shrimp|salmon|tofu|vege|vegetable|pork|seafood|combo)\s+\$?\d/i.test(
      pricingDescription,
    );
  const isPartySizePricingRow = /\b(?:quarter\s+pan|half\s+pan|full\s+pan|small\s+\$|large\s+\$|for\s+\d+|serves?\s+\d+|minimum\s+\d+|party\s+sizes?)\b/i.test(
    `${name} ${description}`,
  );
  const hasExplicitSectionTail = /\b(?:STARTERS|ESSAN MENU|DELUXE|Soup\s*&\s*Salad|Soup\s+Main\s+Dishes|SOUP DUMPLINGS)\b/.test(description);

  if (
    description.length > 520 &&
    (priceCount >= 2 ||
      foodTransitionCount >= 5 ||
      legalDescriptionPatterns.some((pattern) => pattern.test(description)) ||
      venueSelfDescriptionPatterns.some((pattern) => pattern.test(description)))
  ) {
    reasons.push("possible-text-bleed-long-description");
  }

  if (
    priceCount >= 3 &&
    foodTransitionCount >= 2 &&
    !isAddOnPricingRow &&
    !isPartySizePricingRow &&
    !isProteinVariantPricingRow
  ) {
    reasons.push("possible-text-bleed-multiple-prices");
  }

  if (
    /\[[^\]]+\d+(?:\.\d{2})?[^\]]*\]\s+[A-Z][A-Za-z '&-]{2,40}\s+•\s*\d/i.test(description) ||
    /\b(?:Lunch|Dinner|Entrees|Starters|Sides|Desserts)\b[\s\S]{0,80}\b[A-Z][A-Za-z '&-]{2,40}\s+•\s*\d/i.test(description) ||
    /\b[A-Z][A-Za-z0-9 '&"()./-]{3,70}\s+\[(?:MKT\s+Price|Market\s+Price|\$?\d+(?:\.\d{2})?)\]\s+[A-Z][A-Za-z]/i.test(description)
  ) {
    reasons.push("hard-text-bleed-adjacent-priced-item");
  }

  if (priceCount >= 4 && foodTransitionCount >= 4) {
    reasons.push("hard-text-bleed-many-prices-and-foods");
  }

  if (dottedMenuLeaderCount >= 2) {
    reasons.push("hard-text-bleed-dotted-menu-list");
  }

  if (
    (hasExplicitSectionTail ||
      (menuTransitionPatterns.some((pattern) => pattern.test(description)) &&
        transitionTerms.size >= 2 &&
        description.length >= 140)) &&
    foodTransitionCount >= 3 &&
    !isBundleOrComboRow &&
    !hasUsefulServedWithPhrase
  ) {
    reasons.push("possible-text-bleed-section-transition");
  }

  if (menuTransitionPatterns.some((pattern) => pattern.test(description)) && priceCount >= 2) {
    reasons.push("hard-text-bleed-section-transition-with-prices");
  }

  if (legalDescriptionPatterns.some((pattern) => pattern.test(description)) && foodTransitionCount >= 2) {
    reasons.push("possible-text-bleed-legal-note");
  }

  if (
    sentenceLikeSeparatorCount >= 8 &&
    foodTransitionCount >= 5 &&
    (priceCount >= 2 || menuTransitionPatterns.some((pattern) => pattern.test(description)))
  ) {
    reasons.push("possible-text-bleed-many-separators");
  }

  if (hasUsefulServedWithPhrase && reasons.length === 0) {
    return [];
  }

  if (name.length > 80 && foodTransitionCount >= 3) {
    reasons.push("possible-text-bleed-long-name");
  }

  return Array.from(new Set(reasons));
}

function trimDescriptionAtDottedLeader(value) {
  const description = String(value ?? "").trim();
  const index = description.search(/\.{5,}/);

  if (index === -1) {
    return description;
  }

  const before = description
    .slice(0, index)
    .replace(/\s+/g, " ")
    .replace(/[,\s;:-]+$/g, "")
    .trim();

  if (before.length === 0) {
    return "";
  }

  if (/^(?:best\s+blt|h\s*c\s*b\s*l\s*t|yellowtail\*?|pulled\s+pork|gyro)$/i.test(before)) {
    return "";
  }

  if (/^plain$/i.test(before)) {
    return before;
  }

  if (before.length < 12 && !/\b(?:egg|eggs|cheese|cream|bread|pita|rice|sauce|fries|chicken|shrimp|salmon|tuna|yellowtail|cod|crab|lobster|mussel|clam|oyster|pasta|noodle|mayo|aioli)\b/i.test(before)) {
    return description;
  }

  return before;
}

function stripMenuLegalTail(value) {
  const description = String(value ?? "").trim();
  const legalTailPatterns = [
    /\s*\(?\*?\s*(?:contains?\s+\(or may contain\)\s+raw|consuming\s+raw|consuming,\s*under\s+cooked|consuming\s+under\s*cooked|this item may be ordered raw|this item may contain raw|items? marked with an \* may contain raw|food items are cooked to order|these items may be cooked to order|may contain raw or undercooked ingredients)[\s\S]*$/i,
    /\s*\*?\s*(?:raw or undercooked|contains raw or uncooked fish or shellfish|contains raw or undercooked|may contain raw or undercooked|are served raw or undercooked|this item may be served undercooked|these items? may be served undercooked|guest may request this item to be served undercooked|consumption of raw or undercooked|the above items may be served undercooked)[\s\S]*$/i,
    /\s*\*\s*these items with your request can be served undercooked[\s\S]*$/i,
    /\s*(?:\(\s*initiative\s*82\s*\)|initiative\s*82)[\s\S]*$/i,
    /\s*(?:\d{1,3}%\s+of\s+this\s+service\s+charge|a\s+gratuity\s+of\s+\d{1,2}%)[\s\S]*$/i,
    /\s*(?:\+\+?)?(?:a\s+)?\d{1,2}(?:\.\d+)?%\s+(?:service\s+fee|service\s+charge|gratuity)[\s\S]*$/i,
    /\s*(?:we impose a surcharge|to offset increasing labor costs|as a way to offset rising costs|we have added a \d+(?:\.\d+)?% surcharge|added a \d+(?:\.\d+)?% surcharge)[\s\S]*$/i,
    /\s*(?:\*?\s*)?taxes?\s*\(?\d{1,2}%\)?\s+and\s+gratuity[\s\S]*$/i,
    /\s*(?:thank you for supporting local|all menu items are subject to daily changes|menu is seasonal and subject to change)[\s\S]*$/i,
    /\s*(?:for parties of|parties of)\s+\d+\s+(?:or more|persons or more)[\s\S]*$/i,
    /\s*(?:parties|party)\s+of\s+\d+\s+or\s+more\s+subject\s+to[\s\S]*$/i,
    /\s*gratuity\s+will\s+be\s+added[\s\S]*$/i,
    /\s*(?:please (?:let us know|notify|inform)[\s\S]*?(?:allergies|allergy)[\s\S]*)$/i,
  ];

  for (const pattern of legalTailPatterns) {
    if (!pattern.test(description)) {
      continue;
    }

    const trimmed = description
      .replace(pattern, "")
      .replace(/\s+/g, " ")
      .replace(/[,\s;:([*-]+$/g, "")
      .trim();

    return trimmed;
  }

  return description;
}

function stripMenuOperationalTail(value) {
  const description = String(value ?? "").trim();
  const cleaned = description
    .replace(/\s*(?:\(?\s*)?(?:out of stock|sold out|currently unavailable|unavailable)(?:\s*\)?)\s*$/i, "")
    .replace(/\s*(?:please\s+allow\s+)?(?:\d+\s*(?:hr|hrs|hour|hours)|\d+\s*-\s*\d+\s*(?:hr|hrs|hour|hours))\s+notice\b[\s\S]*$/i, "")
    .replace(/\s*\b(?:hr|hrs|hour|hours)\s+notice\b[\s\S]*$/i, "")
    .replace(/\s*(?:please\s+call\s+ahead\s+)?\d{3}[-.\s]\d{3}[-.\s]\d{4}\.?\s*$/i, "")
    .replace(/[,\s;:-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(?:hr|hour|hours?|notice|please allow)$/i.test(cleaned)) {
    return "";
  }

  return cleaned;
}

function isOperationalOnlyText(value) {
  return /^(?:out of stock|sold out|currently unavailable|unavailable|(?:\d+\s*)?(?:hr|hrs|hour|hours)\s+notice|notice)$/i.test(
    String(value ?? "").replace(/\s+/g, " ").trim(),
  );
}

export function isPriceOnlyDescription(value) {
  return /^(?:[•·]\s*)?\$?\s?\d+(?:\.\d{2})?(?:\s*(?:\/|-|–)\s*\$?\s?\d+(?:\.\d{2})?)*$/.test(
    String(value ?? "").trim(),
  );
}

function isPollutedStructuredBlob(value) {
  const text = String(value ?? "");

  return (
    text.length > 500 &&
    (/(?:^|[,{]\s*)"?[a-z0-9_]{3,}"?\s*:\s*"/i.test(text) ||
      /\b(?:crumbl_drinks_|download_the_app|seo_privacy_title|initialI18nStore|nextI18Next|all_rights_reserved|cookie_preferences)\b/i.test(
        text,
      ))
  );
}

function isDietaryLegendContactBlob(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();

  if (!dietaryLegendBlobPattern.test(text)) {
    return false;
  }

  const legendTermCount =
    (text.match(/\b(?:GF\s+Gluten[- ]Friendly|DF\s+Dairy[- ]Free|V\s+Vegetarian|N\s+Contains\s+Nuts|S\s+Spicy)\b/gi) ?? [])
      .length;
  const hasContactOrMenuTransition =
    /\b\d{3,5}\s+[A-Za-z0-9.' -]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|place|pl|drive|dr|waterfront)\b/i.test(
      text,
    ) ||
    /\b(?:HANDHELDS|APPETIZERS|STARTERS|SALADS|ENTREES|DESSERTS|BEVERAGES)\b/i.test(text) ||
    /\b(?:National Harbor|Washington,\s*DC|Arlington,\s*VA|Alexandria,\s*VA|Bethesda,\s*MD)\b/i.test(text);

  return legendTermCount >= 2 && hasContactOrMenuTransition;
}

export function categoryCollapseSummary(items) {
  const counts = new Map();
  const total = (items ?? []).length;

  for (const item of items ?? []) {
    const category = String(item?.category ?? "").trim() || "(missing)";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  const [topCategory = "", topCount = 0] = Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0] ?? [];
  const ratio = total > 0 ? topCount / total : 0;
  const generic =
    /^(?:items?|menu|restaurant|restaurants?|food|american|asian|italian|mexican|pizza|seafood|sushi|vegan|vegetarian)$/i.test(
      topCategory,
    );

  return {
    collapsed: total >= 20 && ratio >= 0.75 && generic,
    topCategory,
    topCategoryCount: topCount,
    topCategoryRatio: Number(ratio.toFixed(3)),
    uniqueCategoryCount: counts.size,
  };
}

export function officialEvidenceClassification(restaurant) {
  const counts = {
    officialFullMatrixOrApi: 0,
    officialIngredientDisclosure: 0,
    officialProductSection: 0,
    globalCrossContactNote: 0,
    unavailable: 0,
    suspiciousOfficialParserFragments: 0,
  };

  for (const item of restaurant?.items ?? []) {
    const sourceType = String(item?.sourceType ?? "");
    const allergenSourceType = String(item?.allergenSourceType ?? "unavailable");
    const description = String(item?.description ?? "");
    const name = String(item?.name ?? "");
    const official = /official/i.test(allergenSourceType) || item?.officialSource === true;

    if (allergenSourceType === "unavailable" || !official) {
      counts.unavailable += 1;
      continue;
    }

    if (
      /official-allergen-(?:menu|guide|widget)/i.test(allergenSourceType) &&
      /(?:official-api|pdf-matrix|html-allergen-matrix|embedded-flavor-nutrition|official-allergen-widget|everybite-widget-graphql)/i.test(sourceType)
    ) {
      counts.officialFullMatrixOrApi += 1;
    } else if (allergenSourceType === "official-ingredients") {
      counts.officialIngredientDisclosure += 1;
    } else if (allergenSourceType === "official-product-allergen-section") {
      counts.officialProductSection += 1;
    } else {
      counts.officialIngredientDisclosure += 1;
    }

    if (isGlobalCrossContactNoteItem(item)) {
      counts.globalCrossContactNote += 1;
    }

    const bleedReasons = textBleedReasons(item);
    const officialFragmentLooksSuspicious =
      bleedReasons.some((reason) => reason.startsWith("hard-text-bleed")) ||
      bleedReasons.includes("possible-text-bleed-long-description") ||
      bleedReasons.includes("possible-text-bleed-legal-note") ||
      bleedReasons.includes("possible-text-bleed-section-transition") ||
      bleedReasons.includes("possible-text-bleed-many-separators");
    if (
      (name.length > 120 && bleedReasons.length > 0) ||
      sectionHeaderNamePatterns.some((pattern) => pattern.test(name)) ||
      isSourceBoilerplateDescription(description) ||
      officialFragmentLooksSuspicious
    ) {
      counts.suspiciousOfficialParserFragments += 1;
    }
  }

  const officialTotal =
    counts.officialFullMatrixOrApi +
    counts.officialIngredientDisclosure +
    counts.officialProductSection;
  const total = restaurant?.items?.length ?? 0;
  let bucket = "source-found-unparsed";

  if (officialTotal === 0) {
    bucket = "source-found-unparsed";
  } else if (counts.suspiciousOfficialParserFragments > 0) {
    bucket = "likely-official-parser-error";
  } else if (counts.officialFullMatrixOrApi >= Math.max(20, Math.ceil(total * 0.7))) {
    bucket = "official-full";
  } else if (counts.officialFullMatrixOrApi > 0) {
    bucket = "official-partial";
  } else if (counts.globalCrossContactNote > 0 && counts.officialIngredientDisclosure + counts.officialProductSection <= 1) {
    bucket = "official-global-note-only";
  } else {
    bucket = "official-disclosure-only";
  }

  return {
    ...counts,
    officialTotal,
    totalItemCount: total,
    officialCoverageRatio: total > 0 ? Number((officialTotal / total).toFixed(3)) : 0,
    bucket,
  };
}

function isGlobalCrossContactNoteItem(item) {
  const allergenSourceType = String(item?.allergenSourceType ?? "");
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const sourceSummary = String(item?.sourceSummary ?? "");
  const evidenceText = (item?.evidence ?? [])
    .map((entry) => `${entry?.sourceKind ?? ""} ${entry?.text ?? ""}`)
    .join(" ");
  const text = `${name} ${description} ${sourceSummary} ${evidenceText}`;

  if (/official-global-cross-contact-note/i.test(allergenSourceType)) {
    return true;
  }

  if (/\b(?:allergen|allergy|kitchen|cross[- ]?contact|cross[- ]?contamination|notice|warning|disclaimer)\b/i.test(name)) {
    return /\b(?:cross[- ]?contamination|cross[- ]?contact|prepared here may contain|menu items may contain|shared (?:fryer|equipment|prep|preparation)|come into contact)\b/i.test(
      text,
    );
  }

  return /\b(?:official .*global allergen notice|menu items may contain or come into contact|prepared here may contain traces|shared (?:fryer|equipment|prep|preparation).*(?:allergen|cross)|cross[- ]?contact.*(?:all menu|menu items|kitchen|facility))\b/i.test(
    text,
  );
}
