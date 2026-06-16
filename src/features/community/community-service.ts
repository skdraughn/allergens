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

export type CommunitySnapshot = {
  comments: CommunityComment[];
  items: CommunityMenuItem[];
};

export type CommunitySubmissionKind =
  | "comment"
  | "menu-item"
  | "report"
  | "restaurant-request";

type CommunityModels = {
  CommunityComment?: CommunityModel;
  CommunityMenuItem?: CommunityModel;
  MenuItemReport?: CommunityModel;
  RestaurantRequest?: CommunityModel;
};

type CommunityModel = {
  create: (input: { [key: string]: unknown }) => Promise<{ data?: unknown; errors?: unknown }>;
  list: (input?: { filter?: Record<string, unknown> }) => Promise<{ data?: unknown[] }>;
};

type CreateRestaurantRequestInput = {
  locationHint: string;
  name: string;
  notes: string;
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
  sourceUrl: string;
};

type CreateCommunityCommentInput = {
  allergyContext: string;
  body: string;
  menuItemId?: string | null;
  restaurantId: string;
};

const communityClient = generateClient<Schema>();
const throttleWindowMs = 15_000;

export async function fetchRestaurantCommunity(restaurantId: string): Promise<CommunitySnapshot> {
  const userId = await getCurrentUserId();
  const models = communityModels();

  if (!models.CommunityMenuItem || !models.CommunityComment) {
    return { comments: [], items: [] };
  }

  const [itemResult, commentResult] = await Promise.all([
    models.CommunityMenuItem.list({ filter: { restaurantId: { eq: restaurantId } } }),
    models.CommunityComment.list({ filter: { restaurantId: { eq: restaurantId } } }),
  ]);

  return {
    comments: (commentResult.data ?? [])
      .map(mapCommunityComment)
      .filter((comment) => isVisibleCommunityRecord(comment.communityStatus, comment.createdBy, userId))
      .sort(sortNewestFirst),
    items: (itemResult.data ?? [])
      .map(mapCommunityMenuItem)
      .filter((item) => isVisibleCommunityRecord(item.communityStatus, item.createdBy, userId))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export async function submitRestaurantRequest(input: CreateRestaurantRequestInput) {
  const validation = validateCommunityFields(input, ["name"], {
    allowUrlFields: ["website"],
  });
  assertValidation(validation);
  await assertSignedInAndThrottle("restaurant-request");

  const models = communityModels();
  assertModel(models.RestaurantRequest, "Restaurant requests");
  const createdBy = await getCurrentUserId();

  return models.RestaurantRequest.create({
    ...validation.values,
    createdBy,
    status: "pending",
  });
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

export function allergenIdsFromOptions(options: AllergyOption[], selectedIds: string[]) {
  return options.filter((option) => selectedIds.includes(option.id)).map((option) => option.id);
}

async function assertSignedInAndThrottle(scope: string) {
  await assertSignedIn();

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

function isVisibleCommunityRecord(
  status: CommunityStatus,
  createdBy: string | null | undefined,
  userId: string | null,
) {
  return status === "approved" || Boolean(userId && createdBy === userId);
}

function mapCommunityMenuItem(value: unknown): CommunityMenuItem {
  const record = value as Record<string, unknown>;
  const name = String(record.name ?? "Community item");
  const category = String(record.category ?? "Community");

  return {
    allergens: normalizeAllergyIds(asStringArray(record.allergens)),
    category,
    communityStatus: statusFromValue(record.status),
    createdBy: asNullableString(record.createdBy),
    description:
      asNullableString(record.description) ??
      "Community-submitted item. Not verified by official allergen source.",
    id: String(record.id ?? `community-${name}`),
    mayContain: normalizeAllergyIds(asStringArray(record.mayContain)),
    name,
    notes: "Community submitted. Not verified by official allergen source.",
    sourceUrls: asNullableString(record.sourceUrl) ? [String(record.sourceUrl)] : [],
  };
}

function mapCommunityComment(value: unknown): CommunityComment {
  const record = value as Record<string, unknown>;

  return {
    allergyContext: asNullableString(record.allergyContext),
    body: String(record.body ?? ""),
    communityStatus: statusFromValue(record.status),
    createdAt: asNullableString(record.createdAt),
    createdBy: asNullableString(record.createdBy),
    id: String(record.id ?? Math.random()),
    menuItemId: asNullableString(record.menuItemId),
    restaurantId: String(record.restaurantId ?? ""),
  };
}

function statusFromValue(value: unknown): CommunityStatus {
  return value === "approved" || value === "rejected" ? value : "pending";
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function sortNewestFirst(left: CommunityComment, right: CommunityComment) {
  return String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? ""));
}
