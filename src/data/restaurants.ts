import type { AllergyOption } from "@/constants/allergies";

export type AllergenId = AllergyOption["id"];

export type InferredAllergenSignal = {
  id: AllergenId;
  c: "low" | "medium" | "high";
  e: string[];
};

export type InferenceSuppression = {
  id: AllergenId;
  reasons: string[];
};

export type ExtractedIngredientMention = {
  ingredientId: string;
  label: string;
  sourceField: string;
  text: string;
};

export type OfficialAllergenProfile = {
  coveredAllergenIds: AllergenId[];
};

export type OfficialAllergenProfiles = Record<string, OfficialAllergenProfile>;

export type MenuItem = {
  id: string;
  name: string;
  category: string;
  description: string;
  imageUrl?: string | null;
  ingredientsText?: string | null;
  nutritionFacts?: Record<string, string | number | null>;
  allergenSourceType?:
    | "official-allergen-menu"
    | "official-ingredients"
    | "official-product-allergen-section"
    | "official-global-cross-contact-note"
    | "ingredient_intelligence"
    | "restaurant-linked-menu-ingredients"
    | "restaurant-linked-product-allergen-section"
    | "restaurant-ingredient-disclosure"
    | "restaurant_allergen_document"
    | "restaurant_ingredients"
    | "restaurant_issued"
    | "restaurant_issued_ingredients"
    | "restaurant_issued_product_name"
    | "restaurant_issued_positive"
    | "restaurant_linked_vendor"
    | "linked_vendor_ingredients"
    | "unavailable";
  allergenAuthorityTier?:
    | "restaurant_issued"
    | "restaurant_linked_vendor"
    | "third_party"
    | "ingredient_intelligence"
    | null;
  officialAllergenProfileId?: string;
  evidence?: {
    sourceKind?: string;
    sourceUrl?: string;
    text?: string | null;
  }[];
  extractedIngredientMentions?: ExtractedIngredientMention[];
  inferredAllergenSignals?: InferredAllergenSignal[];
  inferredIngredients?: string[];
  ingredientIntelligenceReviewed?: boolean;
  ingredientIntelligenceBasis?: "title-description" | "title";
  inferenceQuestions?: string[];
  inferenceSuppressions?: InferenceSuppression[];
  inferenceSummary?: string;
  inferenceVersion?: string;
  allergens: AllergenId[];
  /** Allergen dimensions explicitly emitted by an official matrix/API, including false values. */
  officialAllergenCoveredIds?: AllergenId[];
  isConfigurable?: boolean;
  isOptionVariant?: boolean;
  mayContain?: AllergenId[];
  notes?: string;
  optionGroupName?: string;
  optionLabel?: string;
  optionParentId?: string;
  optionParentName?: string;
  sourceType?: string;
  sourceUrls?: string[];
  variantGroup?: string | null;
};

export type AllergyAccommodationPolicy = {
  status:
    | "can-accommodate"
    | "partial-accommodation"
    | "cannot-accommodate"
    | "unknown";
  scope?: "restaurant" | "experience" | "menu" | "location";
  summary: string;
  advanceNotice?: string | null;
  supported?: string[];
  notSupported?: string[];
  notes?: string[];
  sourceLabel: string;
  sourceType: "official-site" | "official-booking" | "third-party-community" | "manual-review";
  sourceUrl: string;
  sourceRetrievedAt: string;
};

export type Restaurant = {
  id: string;
  rank: number;
  name: string;
  category: string;
  address?: {
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    country?: string | null;
    displayAddress?: string | null;
    postalCode?: string | null;
    region?: string | null;
  } | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  country?: string | null;
  displayAddress?: string | null;
  guideUrl: string;
  guideLabel: string;
  lat?: number | null;
  lng?: number | null;
  locationId?: string | null;
  postalCode?: string | null;
  region?: string | null;
  type?: string;
  updated: string;
  coveragePercent?: number;
  coverageStatus?: "complete" | "blocked" | "kept-previous";
  brandKey?: string | null;
  domain?: string | null;
  lastKnownGoodAt?: string | null;
  logoAspectRatio?: number | null;
  logoMonogram?: string | null;
  logoSvgUrl?: string | null;
  logoUrl?: string | null;
  regionalScope?: string;
  sourceUpdatedAt?: string;
  sourceStatus?: {
    failed: number;
    ok: number;
    total: number;
  };
  snapshotPath?: string | null;
  allergyAccommodationPolicy?: AllergyAccommodationPolicy;
  allergenDataStatus?: {
    officialItemCount: number;
  };
  officialAllergenProfiles?: OfficialAllergenProfiles;
  sourceUrls?: string[];
  totalItemCount?: number;
  items: MenuItem[];
};
