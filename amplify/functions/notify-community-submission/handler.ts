type DynamoDbAttribute =
  | { S: string }
  | { N: string }
  | { BOOL: boolean }
  | { NULL: true }
  | { M: Record<string, DynamoDbAttribute> }
  | { L: DynamoDbAttribute[] }
  | { SS: string[] }
  | { NS: string[] };

type DynamoDbStreamRecord = {
  dynamodb?: {
    NewImage?: Record<string, DynamoDbAttribute>;
  };
  eventName?: string;
  eventSourceARN?: string;
};

type DynamoDbStreamEvent = {
  Records?: DynamoDbStreamRecord[];
};

type SubmissionRecord = Record<string, unknown>;

const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL ?? "";

export const handler = async (event: DynamoDbStreamEvent) => {
  if (!discordWebhookUrl) {
    throw new Error("Missing DISCORD_WEBHOOK_URL");
  }

  let posted = 0;

  for (const record of event.Records ?? []) {
    if (record.eventName !== "INSERT" || !record.dynamodb?.NewImage) {
      continue;
    }

    const payload = decodeImage(record.dynamodb.NewImage);
    const message = buildMessage(payload, record.eventSourceARN ?? "");

    if (!message) {
      continue;
    }

    await postDiscordMessage(message);
    posted += 1;
  }

  return { ok: true, posted };
};

function buildMessage(payload: SubmissionRecord, sourceArn: string) {
  const model = modelNameFromArn(sourceArn);

  if (model === "MenuItemReport" || hasMenuItemReportShape(payload)) {
    return truncateDiscordMessage(formatMenuItemReport(payload));
  }

  if (model === "RestaurantRequest" || hasRestaurantRequestShape(payload)) {
    return truncateDiscordMessage(formatRestaurantRequest(payload));
  }

  return null;
}

function formatMenuItemReport(payload: SubmissionRecord) {
  const lines = [
    "🥜 🚩 Allergy App report",
    `Restaurant: ${text(payload.restaurantId, "Unknown restaurant")}`,
    `Menu item: ${text(payload.menuItemId, "Restaurant-level report")}`,
    `Reason: ${formatReason(text(payload.reason, "Other"))}`,
  ];

  const comment = text(payload.comment);
  if (comment) {
    lines.push("", "Comment:", quote(comment));
  }

  const sourceUrl = text(payload.sourceUrl);
  if (sourceUrl) {
    lines.push(`Source URL: ${sourceUrl}`);
  }

  addFooter(lines, payload);
  return lines.join("\n");
}

function formatRestaurantRequest(payload: SubmissionRecord) {
  const lines = [
    "🥜 🍽️ Allergy App restaurant request",
    `Name: ${text(payload.name, "Unknown restaurant")}`,
  ];

  const location = text(payload.displayAddress) || text(payload.locationHint);
  if (location) {
    lines.push(`Location: ${location.replace(/\s*\n\s*/g, ", ")}`);
  }

  const website = text(payload.website);
  if (website) {
    lines.push(`Website: ${website}`);
  }

  const notes = text(payload.notes);
  if (notes) {
    lines.push("", "Notes:", quote(notes));
  }

  addFooter(lines, payload);
  return lines.join("\n");
}

function addFooter(lines: string[], payload: SubmissionRecord) {
  const createdBy = text(payload.createdBy);
  if (createdBy) {
    lines.push(`User: ${createdBy}`);
  }

  const createdAt = text(payload.createdAt);
  if (createdAt) {
    lines.push(`When: ${createdAt}`);
  }

  const id = text(payload.id);
  if (id) {
    lines.push(`ID: ${id}`);
  }
}

function decodeImage(image: Record<string, DynamoDbAttribute>) {
  return Object.fromEntries(
    Object.entries(image).map(([key, value]) => [key, decodeAttribute(value)]),
  );
}

function decodeAttribute(attribute: DynamoDbAttribute): unknown {
  if ("S" in attribute) {
    return attribute.S;
  }

  if ("N" in attribute) {
    return Number(attribute.N);
  }

  if ("BOOL" in attribute) {
    return attribute.BOOL;
  }

  if ("NULL" in attribute) {
    return null;
  }

  if ("M" in attribute) {
    return decodeImage(attribute.M);
  }

  if ("L" in attribute) {
    return attribute.L.map(decodeAttribute);
  }

  if ("SS" in attribute) {
    return attribute.SS;
  }

  if ("NS" in attribute) {
    return attribute.NS.map(Number);
  }

  return null;
}

function modelNameFromArn(sourceArn: string) {
  const match = /table\/([^/]+)/.exec(sourceArn);
  const tableName = match?.[1] ?? "";

  if (tableName.startsWith("MenuItemReport-")) {
    return "MenuItemReport";
  }

  if (tableName.startsWith("RestaurantRequest-")) {
    return "RestaurantRequest";
  }

  return "";
}

function hasMenuItemReportShape(payload: SubmissionRecord) {
  return Boolean(payload.restaurantId && ("reason" in payload || "comment" in payload));
}

function hasRestaurantRequestShape(payload: SubmissionRecord) {
  return Boolean(payload.name && ("locationHint" in payload || "displayAddress" in payload));
}

function formatReason(reason: string) {
  return reason
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function quote(value: string) {
  return value
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function truncateDiscordMessage(message: string, limit = 1900) {
  if (message.length <= limit) {
    return message;
  }

  return `${message.slice(0, limit - 24)}\n... (truncated)`;
}

async function postDiscordMessage(content: string) {
  const response = await fetch(discordWebhookUrl, {
    body: JSON.stringify({ content }),
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "allergy-app-community-notifier/1.0",
    },
    method: "POST",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord webhook failed (${response.status}): ${body}`);
  }
}
