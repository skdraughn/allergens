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
  isOwn?: boolean;
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
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  country?: string | null;
  createdAt?: string | null;
  displayAddress?: string | null;
  googleMapsUri?: string | null;
  googlePlaceId?: string | null;
  id: string;
  lat?: number | null;
  lng?: number | null;
  locationHint?: string | null;
  name: string;
  notes?: string | null;
  postalCode?: string | null;
  region?: string | null;
  status: CommunityStatus;
  website?: string | null;
};

export class DuplicateRestaurantRequestError extends Error {
  requestId: string;

  constructor(requestId: string) {
    super("You already submitted this restaurant.");
    this.name = "DuplicateRestaurantRequestError";
    this.requestId = requestId;
  }
}

export type MyAllergyReviewSummary = CommunityAllergyReview;

export type CommunitySubmissionKind =
  | "comment"
  | "menu-item"
  | "report"
  | "restaurant-request";

type CommunityModels = {
  BlockedCommunityUser?: CommunityModel;
  CommunityAllergyReview?: CommunityModel;
  CommunityComment?: CommunityModel;
  CommunityMenuItem?: CommunityModel;
  CommunityReviewReport?: CommunityModel;
  MenuItemReport?: CommunityModel;
  PublishedCommunityAllergyReview?: CommunityModel;
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
  update?: (input: Record<string, unknown>) => Promise<{ data?: unknown; errors?: unknown }>;
  [queryField: string]: unknown;
};

export type CreateRestaurantRequestInput = {
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

  if (!userId || !models.CommunityAllergyReview || !models.PublishedCommunityAllergyReview) {
    return emptyCommunitySnapshot();
  }

  const [publishedResult, ownResult, blockedResult, materializedSummary] = await Promise.all([
    listModelByIndex(
      models.PublishedCommunityAllergyReview,
      "publishedAllergyReviewsByRestaurantId",
      { restaurantId },
    ),
    listModelByIndex(
      models.CommunityAllergyReview,
      "communityAllergyReviewsByCreatedBy",
      { createdBy: userId },
    ),
    models.BlockedCommunityUser?.list() ?? Promise.resolve({ data: [] }),
    fetchRestaurantAllergyRatingSummary(models, restaurantId),
  ]);
  const blockedUserIds = new Set(
    (blockedResult.data ?? [])
      .map((value) => asNullableString((value as Record<string, unknown>).blockedUserId))
      .filter((value): value is string => Boolean(value)),
  );
  const publishedReviews = (publishedResult.data ?? [])
    .map((value) => mapPublishedCommunityAllergyReview(value, userId))
    .filter((review) => !review.createdBy || !blockedUserIds.has(review.createdBy));
  const ownReviews = (ownResult.data ?? [])
    .map((value) => mapCommunityAllergyReview(value, userId))
    .filter((review) => review.restaurantId === restaurantId);
  const reviews = mergeReviews(publishedReviews, ownReviews).sort(sortReviewsNewestFirst);

  return {
    reviews,
    summary:
      blockedUserIds.size > 0
        ? summarizeAllergyReviews(reviews)
        : materializedSummary ?? summarizeAllergyReviews(reviews),
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

  return (result.data ?? []).map((value) => mapCommunityAllergyReview(value, userId)).sort(sortReviewsNewestFirst);
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

  const models = communityModels();
  assertModel(models.RestaurantRequest, "Restaurant requests");
  const createdBy = await getCurrentUserId();
  const fingerprint = restaurantRequestFingerprint(input);
  const duplicate = await findDuplicateRestaurantRequest(
    models.RestaurantRequest,
    createdBy,
    fingerprint,
  );

  if (duplicate) {
    throw new DuplicateRestaurantRequestError(duplicate);
  }

  await assertThrottle("restaurant-request");

  const result = await models.RestaurantRequest.create(
    {
      ...validation.values,
      createdBy,
      lat: input.lat,
      lng: input.lng,
    },
    createdBy ? undefined : { authMode: "apiKey" },
  );

  const requestId = String((result.data as { id?: unknown } | undefined)?.id ?? "");
  if (!requestId) {
    throw new Error("Restaurant request could not be created.");
  }

  await rememberRestaurantRequest(createdBy, fingerprint, requestId);

  return { id: requestId };
}

export async function updateRestaurantRequest(
  id: string,
  input: CreateRestaurantRequestInput,
) {
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
    { allowUrlFields: ["googleMapsUri", "website"] },
  );
  assertValidation(validation);
  await assertSignedInAndThrottle(`restaurant-request-update:${id}`);

  const models = communityModels();
  assertModel(models.RestaurantRequest, "Restaurant requests");

  if (!models.RestaurantRequest.update) {
    throw new Error("Restaurant request editing is not available yet.");
  }

  const result = await models.RestaurantRequest.update({
    ...validation.values,
    id,
    lat: input.lat,
    lng: input.lng,
  });

  if (!result.data) {
    throw new Error("Restaurant request could not be updated.");
  }

  return mapRestaurantRequestSummary(result.data);
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

export async function reportCommunityReview(review: CommunityAllergyReview) {
  const models = communityModels();
  assertModel(models.CommunityReviewReport, "Review reporting");
  const createdBy = await getCurrentUserId();

  if (!createdBy) {
    throw new Error("Please sign in before reporting a review.");
  }

  if (review.isOwn) {
    throw new Error("You cannot report your own review.");
  }

  await assertThrottle(`review-report:${review.id}`);
  return models.CommunityReviewReport.create({
    comment: "Reported from the community review menu.",
    createdBy,
    reason: "offensive-or-abusive-content",
    restaurantId: review.restaurantId,
    reviewId: review.id,
    status: "pending",
  });
}

export async function blockCommunityReviewer(review: CommunityAllergyReview) {
  const blockedUserId = review.createdBy?.trim();
  const models = communityModels();
  assertModel(models.BlockedCommunityUser, "User blocking");
  const createdBy = await getCurrentUserId();

  if (!createdBy) {
    throw new Error("Please sign in before blocking a reviewer.");
  }

  if (!blockedUserId || review.isOwn || blockedUserId === createdBy) {
    throw new Error("This reviewer cannot be blocked.");
  }

  const existing = await models.BlockedCommunityUser.list({
    filter: { blockedUserId: { eq: blockedUserId } },
  });
  if ((existing.data ?? []).length > 0) {
    return existing.data?.[0];
  }

  return models.BlockedCommunityUser.create({ blockedUserId, createdBy });
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

function mapCommunityAllergyReview(
  value: unknown,
  userId?: string | null,
): CommunityAllergyReview {
  const record = value as Record<string, unknown>;
  const rating = Number(record.rating);

  return {
    allergyContext: asNullableString(record.allergyContext),
    body: String(record.body ?? ""),
    communityStatus: statusFromValue(record.status),
    createdAt: asNullableString(record.createdAt),
    createdBy: asNullableString(record.createdBy),
    id: String(record.id ?? Math.random()),
    isOwn: Boolean(userId && asNullableString(record.createdBy) === userId),
    menuItemId: asNullableString(record.menuItemId),
    menuItemName: asNullableString(record.menuItemName),
    rating: Number.isFinite(rating) ? Math.max(1, Math.min(5, Math.round(rating))) : 3,
    restaurantId: String(record.restaurantId ?? ""),
  };
}

function mapPublishedCommunityAllergyReview(
  value: unknown,
  userId: string,
): CommunityAllergyReview {
  const record = value as Record<string, unknown>;
  const rating = Number(record.rating);
  const authorId = asNullableString(record.authorId);

  return {
    allergyContext: asNullableString(record.allergyContext),
    body: String(record.body ?? ""),
    communityStatus: "approved",
    createdAt: asNullableString(record.originalCreatedAt) ?? asNullableString(record.createdAt),
    createdBy: authorId,
    id: String(record.id ?? Math.random()),
    isOwn: Boolean(authorId && authorId === userId),
    menuItemId: asNullableString(record.menuItemId),
    menuItemName: asNullableString(record.menuItemName),
    rating: Number.isFinite(rating) ? Math.max(1, Math.min(5, Math.round(rating))) : 3,
    restaurantId: String(record.restaurantId ?? ""),
  };
}

function mergeReviews(
  publishedReviews: CommunityAllergyReview[],
  ownReviews: CommunityAllergyReview[],
) {
  const reviews = new Map(publishedReviews.map((review) => [review.id, review]));

  for (const review of ownReviews) {
    reviews.set(review.id, review);
  }

  return [...reviews.values()];
}

function mapRestaurantRequestSummary(value: unknown): RestaurantRequestSummary {
  const record = value as Record<string, unknown>;

  return {
    addressLine1: asNullableString(record.addressLine1),
    addressLine2: asNullableString(record.addressLine2),
    city: asNullableString(record.city),
    country: asNullableString(record.country),
    createdAt: asNullableString(record.createdAt),
    displayAddress: asNullableString(record.displayAddress),
    googleMapsUri: asNullableString(record.googleMapsUri),
    googlePlaceId: asNullableString(record.googlePlaceId),
    id: String(record.id ?? Math.random()),
    lat: asNullableNumber(record.lat),
    lng: asNullableNumber(record.lng),
    locationHint: asNullableString(record.locationHint),
    name: String(record.name ?? "Restaurant request"),
    notes: asNullableString(record.notes),
    postalCode: asNullableString(record.postalCode),
    region: asNullableString(record.region),
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

function asNullableNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  return null;
}

async function findDuplicateRestaurantRequest(
  model: CommunityModel,
  createdBy: string | null,
  fingerprint: string,
) {
  const localId = createdBy
    ? null
    : await recalledRestaurantRequest(createdBy, fingerprint);

  if (localId) {
    return localId;
  }

  if (!createdBy) {
    return null;
  }

  const result = await listModelByIndex(
    model,
    "restaurantRequestsByCreatedBy",
    { createdBy },
  );
  const match = (result.data ?? []).find((value) => {
    const record = value as Record<string, unknown>;

    return (
      statusFromValue(record.status) !== "rejected" &&
      restaurantRequestFingerprint({
        displayAddress: String(record.displayAddress ?? ""),
        googlePlaceId: String(record.googlePlaceId ?? ""),
        locationHint: String(record.locationHint ?? ""),
        name: String(record.name ?? ""),
        website: String(record.website ?? ""),
      }) === fingerprint
    );
  }) as Record<string, unknown> | undefined;

  return match ? String(match.id ?? "") || null : null;
}

function restaurantRequestFingerprint(
  input: Pick<
    CreateRestaurantRequestInput,
    "displayAddress" | "googlePlaceId" | "locationHint" | "name" | "website"
  >,
) {
  const placeId = normalizeFingerprintPart(input.googlePlaceId ?? "");

  if (placeId) {
    return `place:${placeId}`;
  }

  const name = normalizeFingerprintPart(input.name);
  const location = normalizeFingerprintPart(
    input.locationHint || input.displayAddress || input.website,
  );

  return `name:${name}|location:${location}`;
}

function normalizeFingerprintPart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function restaurantRequestMemoryKey(
  createdBy: string | null,
  fingerprint: string,
) {
  return `community/restaurant-request/${createdBy ?? "anonymous"}/${fingerprint}`;
}

async function rememberRestaurantRequest(
  createdBy: string | null,
  fingerprint: string,
  requestId: string,
) {
  await AsyncStorage.setItem(
    restaurantRequestMemoryKey(createdBy, fingerprint),
    JSON.stringify({ requestId, savedAt: Date.now() }),
  );
}

async function recalledRestaurantRequest(
  createdBy: string | null,
  fingerprint: string,
) {
  const value = await AsyncStorage.getItem(
    restaurantRequestMemoryKey(createdBy, fingerprint),
  );

  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as { requestId?: unknown; savedAt?: unknown };
    const savedAt = Number(parsed.savedAt);
    const requestId = String(parsed.requestId ?? "");

    if (requestId && Number.isFinite(savedAt) && Date.now() - savedAt < 1000 * 60 * 60 * 24 * 30) {
      return requestId;
    }
  } catch {
    // Ignore malformed local request memory and fall back to the backend query.
  }

  return null;
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
