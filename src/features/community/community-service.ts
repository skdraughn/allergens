import AsyncStorage from "@react-native-async-storage/async-storage";
import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";

import { normalizeAllergyIds, type AllergyOption } from "@/constants/allergies";
import type { MenuItem } from "@/data/restaurants";
import { isAmplifyConfigured } from "@/lib/amplify";
import { validateCommunityFields } from "@/lib/community-moderation";

import type { Schema } from "../../../amplify/data/resource";

export type CommunityStatus = "pending" | "approved" | "rejected";

export type CommunityMenuItem = MenuItem & {
  communityStatus: CommunityStatus;
  createdBy?: string | null;
};

export type CommunityComment = {
  allergyContext?: string | null;
  body: string;
  communityStatus: CommunityStatus;
  createdAt?: string | null;
  createdBy?: string | null;
  id: string;
  menuItemId?: string | null;
  restaurantId: string;
};

export type CommunityAllergyReview = {
  allergyContext?: string | null;
  body: string;
  communityStatus: CommunityStatus;
  createdAt?: string | null;
  createdBy?: string | null;
  id: string;
  menuItemId?: string | null;
  menuItemName?: string | null;
  rating: number;
  restaurantId: string;
};

export type MenuItemReportSummary = {
  comment?: string | null;
  createdAt?: string | null;
  id: string;
  menuItemId?: string | null;
  reason?: string | null;
  restaurantId: string;
  status: CommunityStatus;
};

export type AllergyReviewSummary = {
  averageRating: number | null;
  count: number;
};

export type CommunitySnapshot = {
  reviews: CommunityAllergyReview[];
  summary: AllergyReviewSummary;
};

export type RestaurantRequestSummary = {
  createdAt?: string | null;
  displayAddress?: string | null;
  id: string;
  locationHint?: string | null;
  name: string;
  status: CommunityStatus;
  website?: string | null;
};

export type MyAllergyReviewSummary = CommunityAllergyReview;

export type CommunitySubmissionKind =
  | "comment"
  | "menu-item"
  | "report"
  | "restaurant-request";

type CommunityModels = {
  CommunityAllergyReview?: CommunityModel;
  CommunityComment?: CommunityModel;
  CommunityMenuItem?: CommunityModel;
  MenuItemReport?: CommunityModel;
  RestaurantAllergyRatingSummary?: CommunityModel;
  RestaurantRequest?: CommunityModel;
};

type CommunityModel = {
  create: (
    input: { [key: string]: unknown },
    options?: { authMode?: "apiKey" | "userPool" | "identityPool" },
  ) => Promise<{ data?: unknown; errors?: unknown }>;
  list: (input?: { filter?: Record<string, unknown> }) => Promise<{ data?: unknown[] }>;
  get?: (input: Record<string, unknown>) => Promise<{ data?: unknown }>;
  [queryField: string]: unknown;
};

type CreateRestaurantRequestInput = {
  addressLine1: string;
  addressLine2: string;
  city: string;
  country: string;
  displayAddress: string;
  googleMapsUri?: string;
  googlePlaceId?: string;
  lat?: number;
  lng?: number;
  locationHint: string;
  name: string;
  notes: string;
  postalCode: string;
  region: string;
  website: string;
};

type CreateCommunityMenuItemInput = {
  allergens: string[];
  category: string;
  description: string;
  mayContain: string[];
  name: string;
  restaurantId: string;
  sourceUrl: string;
};

type CreateMenuItemReportInput = {
  comment: string;
  menuItemId?: string | null;
  reason: string;
  restaurantId: string;
  sourceUrl?: string;
};

type CreateCommunityCommentInput = {
  allergyContext: string;
  body: string;
  menuItemId?: string | null;
  restaurantId: string;
};

export type CreateCommunityAllergyReviewInput = {
  allergyContext: string;
  body: string;
  menuItemId?: string | null;
  menuItemName?: string | null;
  rating: number;
  restaurantId: string;
};

const communityClient = generateClient<Schema>();
const throttleWindowMs = 15_000;

export async function fetchRestaurantCommunity(restaurantId: string): Promise<CommunitySnapshot> {
  const userId = await getCurrentUserId();
  const models = communityModels();

  if (!models.CommunityAllergyReview) {
    return emptyCommunitySnapshot();
  }

  const [reviewResult, materializedSummary] = await Promise.all([
    listModelByIndex(models.CommunityAllergyReview, "communityAllergyReviewsByRestaurantId", {
      restaurantId,
    }),
    fetchRestaurantAllergyRatingSummary(models, restaurantId),
  ]);
  const reviews = (reviewResult.data ?? [])
    .map(mapCommunityAllergyReview)
    .filter((review) => isVisibleCommunityRecord(review.communityStatus, review.createdBy, userId))
    .sort(sortReviewsNewestFirst);

  return {
    reviews,
    summary: materializedSummary ?? summarizeAllergyReviews(reviews),
  };
}

export async function fetchMyRestaurantRequests(): Promise<RestaurantRequestSummary[]> {
  const userId = await getCurrentUserId();

  if (!userId) {
    return [];
  }

  const models = communityModels();

  if (!models.RestaurantRequest) {
    return [];
  }

  const result = await listModelByIndex(models.RestaurantRequest, "restaurantRequestsByCreatedBy", {
    createdBy: userId,
  });

  return (result.data ?? []).map(mapRestaurantRequestSummary).sort(sortRequestsNewestFirst);
}

export async function fetchMyMenuItemReports(): Promise<MenuItemReportSummary[]> {
  const userId = await getCurrentUserId();

  if (!userId) {
    return [];
  }

  const models = communityModels();

  if (!models.MenuItemReport) {
    return [];
  }

  const result = await listModelByIndex(models.MenuItemReport, "menuItemReportsByCreatedBy", {
    createdBy: userId,
  });

  return (result.data ?? []).map(mapMenuItemReportSummary).sort(sortCreatedNewestFirst);
}

export async function fetchMyAllergyReviews(): Promise<MyAllergyReviewSummary[]> {
  const userId = await getCurrentUserId();

  if (!userId) {
    return [];
  }

  const models = communityModels();

  if (!models.CommunityAllergyReview) {
    return [];
  }

  const result = await listModelByIndex(
    models.CommunityAllergyReview,
    "communityAllergyReviewsByCreatedBy",
    { createdBy: userId },
  );

  return (result.data ?? []).map(mapCommunityAllergyReview).sort(sortReviewsNewestFirst);
}

export async function submitRestaurantRequest(input: CreateRestaurantRequestInput) {
  const validation = validateCommunityFields(
    {
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      country: input.country,
      displayAddress: input.displayAddress,
      googleMapsUri: input.googleMapsUri,
      googlePlaceId: input.googlePlaceId,
      locationHint: input.locationHint,
      name: input.name,
      notes: input.notes,
      postalCode: input.postalCode,
      region: input.region,
      website: input.website,
    },
    ["name"],
    {
      allowUrlFields: ["googleMapsUri", "website"],
    },
  );
  assertValidation(validation);
  await assertThrottle("restaurant-request");

  const models = communityModels();
  assertModel(models.RestaurantRequest, "Restaurant requests");
  const createdBy = await getCurrentUserId();

  return models.RestaurantRequest.create(
    {
      ...validation.values,
      createdBy,
      lat: input.lat,
      lng: input.lng,
      status: "pending",
    },
    createdBy ? undefined : { authMode: "apiKey" },
  );
}

export async function submitCommunityMenuItem(input: CreateCommunityMenuItemInput) {
  const validation = validateCommunityFields(
    {
      category: input.category,
      description: input.description,
      name: input.name,
      restaurantId: input.restaurantId,
      sourceUrl: input.sourceUrl,
    },
    ["restaurantId", "name", "category"],
    {
      allowUrlFields: ["sourceUrl"],
    },
  );
  assertValidation(validation);
  await assertSignedInAndThrottle(`menu-item:${input.restaurantId}`);

  const models = communityModels();
  assertModel(models.CommunityMenuItem, "Community menu items");
  const createdBy = await getCurrentUserId();

  return models.CommunityMenuItem.create({
    ...validation.values,
    allergens: normalizeAllergyIds(input.allergens),
    createdBy,
    mayContain: normalizeAllergyIds(input.mayContain),
    status: "pending",
  });
}

export async function submitMenuItemReport(input: CreateMenuItemReportInput) {
  const validation = validateCommunityFields(input, ["restaurantId", "reason", "comment"], {
    allowUrlFields: ["sourceUrl"],
  });
  assertValidation(validation);
  await assertSignedInAndThrottle(`report:${input.restaurantId}:${input.menuItemId ?? "restaurant"}`);

  const models = communityModels();
  assertModel(models.MenuItemReport, "Menu item reports");
  const createdBy = await getCurrentUserId();

  return models.MenuItemReport.create({
    ...validation.values,
    createdBy,
    menuItemId: input.menuItemId ?? null,
    status: "pending",
  });
}

export async function submitCommunityComment(input: CreateCommunityCommentInput) {
  const validation = validateCommunityFields(input, ["restaurantId", "body"]);
  assertValidation(validation);
  await assertSignedInAndThrottle(`comment:${input.restaurantId}:${input.menuItemId ?? "restaurant"}`);

  const models = communityModels();
  assertModel(models.CommunityComment, "Community comments");
  const createdBy = await getCurrentUserId();

  return models.CommunityComment.create({
    ...validation.values,
    createdBy,
    menuItemId: input.menuItemId ?? null,
    status: "pending",
  });
}

export async function submitCommunityAllergyReview(input: CreateCommunityAllergyReviewInput) {
  const rating = Math.max(1, Math.min(5, Math.round(input.rating)));
  const validation = validateCommunityFields(
    {
      allergyContext: input.allergyContext,
      body: input.body,
      menuItemId: input.menuItemId,
      menuItemName: input.menuItemName,
      restaurantId: input.restaurantId,
    },
    ["restaurantId"],
  );
  assertValidation(validation);
  await assertSignedInAndThrottle(`allergy-review:${input.restaurantId}:${input.menuItemId ?? "restaurant"}`);

  const models = communityModels();
  assertModel(models.CommunityAllergyReview, "Allergy reviews");
  const createdBy = await getCurrentUserId();

  return models.CommunityAllergyReview.create({
    ...validation.values,
    body: validation.values.body ?? "",
    createdBy,
    menuItemId: validation.values.menuItemId || null,
    menuItemName: validation.values.menuItemName || null,
    rating,
    status: "pending",
  });
}

export function allergenIdsFromOptions(options: AllergyOption[], selectedIds: string[]) {
  return options.filter((option) => selectedIds.includes(option.id)).map((option) => option.id);
}

async function assertSignedInAndThrottle(scope: string) {
  await assertSignedIn();
  await assertThrottle(scope);
}

async function assertThrottle(scope: string) {
  const key = `community-submit/${scope}`;
  const now = Date.now();
  const previous = Number(await AsyncStorage.getItem(key));

  if (Number.isFinite(previous) && now - previous < throttleWindowMs) {
    throw new Error("Please wait a few seconds before submitting again.");
  }

  await AsyncStorage.setItem(key, String(now));
}

async function assertSignedIn() {
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error("Please sign in before contributing.");
  }
}

async function getCurrentUserId() {
  if (!isAmplifyConfigured) {
    return null;
  }

  try {
    const user = await getCurrentUser();
    return user.userId ?? user.username ?? null;
  } catch {
    return null;
  }
}

function communityModels() {
  return (communityClient.models ?? {}) as unknown as CommunityModels;
}

function assertValidation(
  validation: ReturnType<typeof validateCommunityFields>,
): asserts validation is { ok: true; values: Record<string, string> } {
  if (!validation.ok) {
    throw new Error(validation.message);
  }
}

function assertModel(model: CommunityModel | undefined, label: string): asserts model is CommunityModel {
  if (!model) {
    throw new Error(`${label} are not available until the backend is deployed.`);
  }
}

async function listModelByIndex(
  model: CommunityModel,
  queryField: string,
  input: Record<string, unknown>,
) {
  const query = model[queryField];

  if (typeof query === "function") {
    return (await query(input)) as { data?: unknown[] };
  }

  const [[field, value]] = Object.entries(input);
  return model.list({ filter: { [field]: { eq: value } } });
}

async function fetchRestaurantAllergyRatingSummary(
  models: CommunityModels,
  restaurantId: string,
): Promise<AllergyReviewSummary | null> {
  const model = models.RestaurantAllergyRatingSummary;

  if (!model?.get) {
    return null;
  }

  const result = await model.get({ restaurantId });
  const record = result.data as Record<string, unknown> | null | undefined;

  if (!record) {
    return null;
  }

  const count = Math.max(0, Math.round(Number(record.reviewCount ?? 0)));
  const averageRating = Number(record.averageRating);

  return {
    averageRating: count > 0 && Number.isFinite(averageRating) ? averageRating : null,
    count,
  };
}

function isVisibleCommunityRecord(
  status: CommunityStatus,
  createdBy: string | null | undefined,
  userId: string | null,
) {
  return status === "approved" || Boolean(userId && createdBy === userId);
}

function mapCommunityAllergyReview(value: unknown): CommunityAllergyReview {
  const record = value as Record<string, unknown>;
  const rating = Number(record.rating);

  return {
    allergyContext: asNullableString(record.allergyContext),
    body: String(record.body ?? ""),
    communityStatus: statusFromValue(record.status),
    createdAt: asNullableString(record.createdAt),
    createdBy: asNullableString(record.createdBy),
    id: String(record.id ?? Math.random()),
    menuItemId: asNullableString(record.menuItemId),
    menuItemName: asNullableString(record.menuItemName),
    rating: Number.isFinite(rating) ? Math.max(1, Math.min(5, Math.round(rating))) : 3,
    restaurantId: String(record.restaurantId ?? ""),
  };
}

function mapRestaurantRequestSummary(value: unknown): RestaurantRequestSummary {
  const record = value as Record<string, unknown>;

  return {
    createdAt: asNullableString(record.createdAt),
    displayAddress: asNullableString(record.displayAddress),
    id: String(record.id ?? Math.random()),
    locationHint: asNullableString(record.locationHint),
    name: String(record.name ?? "Restaurant request"),
    status: statusFromValue(record.status),
    website: asNullableString(record.website),
  };
}

function mapMenuItemReportSummary(value: unknown): MenuItemReportSummary {
  const record = value as Record<string, unknown>;

  return {
    comment: asNullableString(record.comment),
    createdAt: asNullableString(record.createdAt),
    id: String(record.id ?? Math.random()),
    menuItemId: asNullableString(record.menuItemId),
    reason: asNullableString(record.reason),
    restaurantId: String(record.restaurantId ?? ""),
    status: statusFromValue(record.status),
  };
}

function statusFromValue(value: unknown): CommunityStatus {
  return value === "approved" || value === "rejected" ? value : "pending";
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sortReviewsNewestFirst(left: CommunityAllergyReview, right: CommunityAllergyReview) {
  return String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? ""));
}

function summarizeAllergyReviews(reviews: CommunityAllergyReview[]): AllergyReviewSummary {
  const approvedReviews = reviews.filter((review) => review.communityStatus === "approved");

  if (approvedReviews.length === 0) {
    return { averageRating: null, count: 0 };
  }

  const total = approvedReviews.reduce((sum, review) => sum + review.rating, 0);

  return {
    averageRating: Math.round((total / approvedReviews.length) * 10) / 10,
    count: approvedReviews.length,
  };
}

function emptyCommunitySnapshot(): CommunitySnapshot {
  return {
    reviews: [],
    summary: {
      averageRating: null,
      count: 0,
    },
  };
}

function sortRequestsNewestFirst(left: RestaurantRequestSummary, right: RestaurantRequestSummary) {
  return String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? ""));
}

function sortCreatedNewestFirst<T extends { createdAt?: string | null }>(left: T, right: T) {
  return String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? ""));
}
