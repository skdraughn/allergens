const blockedTerms = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "cunt",
  "dick",
  "pussy",
  "kill yourself",
  "kys",
];

const maxLengths: Record<string, number> = {
  allergyContext: 160,
  body: 600,
  category: 80,
  comment: 700,
  description: 700,
  locationHint: 160,
  name: 120,
  notes: 700,
  reason: 80,
  reviewNotes: 700,
  sourceUrl: 260,
  website: 260,
};

export type ModerationResult =
  | { ok: true; values: Record<string, string> }
  | { field?: string; message: string; ok: false };

export function validateCommunityFields(
  fields: Record<string, string | null | undefined>,
  requiredFields: string[],
  options: { allowUrlFields?: string[] } = {},
): ModerationResult {
  const values: Record<string, string> = {};
  const allowUrlFields = new Set(options.allowUrlFields ?? []);

  for (const [field, value] of Object.entries(fields)) {
    const trimmed = String(value ?? "").trim().replace(/\s+/g, " ");
    const maxLength = maxLengths[field] ?? 700;

    if (trimmed.length > maxLength) {
      return {
        field,
        message: `${fieldLabel(field)} is too long.`,
        ok: false,
      };
    }

    if (trimmed && containsBlockedText(trimmed)) {
      return {
        field,
        message: "Please keep submissions respectful and useful.",
        ok: false,
      };
    }

    if (trimmed && hasExcessiveCaps(trimmed)) {
      return {
        field,
        message: "Please avoid all-caps submissions.",
        ok: false,
      };
    }

    if (trimmed && hasExcessiveRepetition(trimmed)) {
      return {
        field,
        message: "Please remove repeated characters or words.",
        ok: false,
      };
    }

    if (trimmed && containsUrl(trimmed) && !allowUrlFields.has(field)) {
      return {
        field,
        message: "Put links in the source URL field only.",
        ok: false,
      };
    }

    if (trimmed && allowUrlFields.has(field) && !isValidOptionalUrl(trimmed)) {
      return {
        field,
        message: "Enter a valid URL, including https://.",
        ok: false,
      };
    }

    values[field] = trimmed;
  }

  for (const field of requiredFields) {
    if (!values[field]) {
      return {
        field,
        message: `${fieldLabel(field)} is required.`,
        ok: false,
      };
    }
  }

  return { ok: true, values };
}

function containsBlockedText(value: string) {
  const normalized = value.toLowerCase();

  return blockedTerms.some((term) => normalized.includes(term));
}

function containsUrl(value: string) {
  return /\b(?:https?:\/\/|www\.)\S+/i.test(value);
}

function hasExcessiveCaps(value: string) {
  const letters = value.replace(/[^A-Za-z]/g, "");

  if (letters.length < 16) {
    return false;
  }

  const uppercase = letters.replace(/[^A-Z]/g, "");
  return uppercase.length / letters.length > 0.82;
}

function hasExcessiveRepetition(value: string) {
  return /(.)\1{6,}/i.test(value) || /\b(\w+)(?:\s+\1){4,}\b/i.test(value);
}

function isValidOptionalUrl(value: string) {
  if (!value) {
    return true;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function fieldLabel(field: string) {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase())
    .toLowerCase();
}
