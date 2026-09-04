const allergenFieldToId = new Map([
  ["gluten", "gluten"],
  ["milk", "milk"],
  ["eggs", "egg"],
  ["fish", "fish"],
  ["shellfish", "shellfish"],
  ["crustaceanShellfish", "shellfish"],
  ["molluscanShellfish", "shellfish"],
  ["treeNuts", "tree-nut"],
  ["peanuts", "peanut"],
  ["wheat", "wheat"],
  ["soy", "soy"],
  ["sesame", "sesame"],
]);

const rejectedGroupPattern =
  /\b(?:add[ -]?ons?|choose any|customi[sz]e|dippings?|dressings?|extras?|hold|mix[- ]?ins?|remove|substitut|toppings?)\b/i;
const identityGroupPattern =
  /\b(?:choose (?:a |an |your )?(?:flavou?r|product|size|style|type|variety)|flavou?rs?|products?|sizes?|styles?|types?|varieties)\b/i;
const hiddenGroupPattern =
  /\b(?:api mapping|do not remove|hidden|internal only|system)\b/i;

function values(value) {
  return Array.isArray(value) ? value : Object.values(value ?? {});
}

export function cleanNutritionixText(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&eacute;/gi, "é")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&copy;/gi, "©")
    .replace(/&(?:reg|trade);/gi, "")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

export function nutritionixNameKey(value) {
  return cleanNutritionixText(value)
    .normalize("NFKD")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

export function nutritionixHasResolvedAllergenRow(allergens = {}) {
  return [...allergenFieldToId].some(([field]) =>
    [0, 1, 2].includes(allergens?.[field]?.presence),
  );
}

export function nutritionixVariantAllergenFacts(
  availableFields = {},
  allergens = {},
) {
  const allergensPresent = new Set();
  const mayContain = new Set();
  const coveredAllergenIds = new Set();

  for (const [field, allergenId] of allergenFieldToId) {
    if (
      availableFields?.[field] !== 1 &&
      availableFields?.[field] !== true
    ) {
      continue;
    }

    const presence = allergens?.[field]?.presence;

    if (![0, 1, 2].includes(presence)) {
      continue;
    }

    coveredAllergenIds.add(allergenId);

    if (presence === 1) {
      allergensPresent.add(allergenId);
    } else if (presence === 2) {
      mayContain.add(allergenId);
    }
  }

  return {
    allergens: [...allergensPresent].sort(),
    mayContain: [...mayContain].sort(),
    officialAllergenCoveredIds: [...coveredAllergenIds].sort(),
  };
}

function cleanOptionLabel(value) {
  return cleanNutritionixText(value)
    .replace(/^\*+/, "")
    .replace(/\s*\(1\)\s*$/i, "")
    .trim();
}

function groupLabel(group) {
  return cleanNutritionixText(
    group?.displayName ?? group?.display_name ?? group?.name ?? group?.description,
  );
}

function referencedRecords(references, recordsById) {
  return values(references)
    .map((reference) =>
      typeof reference === "object" && reference !== null
        ? recordsById.get(String(reference.id)) ?? reference
        : recordsById.get(String(reference)),
    )
    .filter(Boolean);
}

function scoreVariantGroup({ candidateCount, group, label, parentName }) {
  const parentKey = nutritionixNameKey(parentName);
  const labelKey = nutritionixNameKey(label);
  let score = 0;

  if (candidateCount === 1) score += 4;
  if (group?.multipleSelect === 0 || group?.multiple_select === 0) score += 4;
  if (identityGroupPattern.test(label)) score += 6;
  if (parentKey && labelKey === parentKey) score += 8;
  else if (parentKey && labelKey && (parentKey.includes(labelKey) || labelKey.includes(parentKey))) {
    score += 4;
  }

  return score;
}

export function nutritionixPrimaryOptionVariantGroup(parsed, item) {
  if (!item || nutritionixHasResolvedAllergenRow(item.allergens)) {
    return null;
  }

  const templatesById = new Map(
    values(parsed?.templates).map((template) => [String(template.id), template]),
  );
  const groupsById = new Map(
    values(parsed?.groups).map((group) => [String(group.id), group]),
  );
  const modifiersById = new Map(
    values(parsed?.modifiers).map((modifier) => [String(modifier.id), modifier]),
  );
  const template = templatesById.get(String(item.templateId));
  const groupReferences =
    template?.groups ?? template?.groupIds ?? item?.groups ?? item?.groupIds ?? [];
  const visibleGroups = referencedRecords(groupReferences, groupsById).filter(
    (group) => {
      const label = groupLabel(group);

      return (
        group?.isActive !== 0 &&
        group?.disallowUserChange !== 1 &&
        group?.disallow_user_change !== 1 &&
        label &&
        !hiddenGroupPattern.test(`${label} ${group?.description ?? ""}`)
      );
    },
  );
  const candidates = visibleGroups
    .map((group) => {
      const label = groupLabel(group);

      if (
        rejectedGroupPattern.test(label) &&
        !nutritionixNameKey(item.name).includes(nutritionixNameKey(label))
      ) {
        return null;
      }

      const modifiers = referencedRecords(
        group?.modifiers ?? group?.modifierIds ?? [],
        modifiersById,
      ).filter(
        (modifier) =>
          modifier?.isActive !== 0 &&
          cleanOptionLabel(modifier?.name) &&
          nutritionixHasResolvedAllergenRow(modifier?.allergens),
      );

      if (modifiers.length < 2 || modifiers.length > 40) {
        return null;
      }

      return { group, label, modifiers };
    })
    .filter(Boolean);

  const ranked = candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreVariantGroup({
        candidateCount: candidates.length,
        group: candidate.group,
        label: candidate.label,
        parentName: item.name,
      }),
    }))
    .sort((left, right) => right.score - left.score);

  if (!ranked[0] || ranked[0].score < 4) {
    return null;
  }

  return ranked[0];
}

export function nutritionixOptionVariantRecords(parsed, item) {
  const selected = nutritionixPrimaryOptionVariantGroup(parsed, item);

  if (!selected) {
    return [];
  }

  const parentName = cleanNutritionixText(item.name);
  const parentId = String(item.id ?? item.itemId ?? item.templateId ?? parentName);

  return selected.modifiers
    .map((modifier) => {
      const optionLabel = cleanOptionLabel(modifier.name);
      const allergenFacts = nutritionixVariantAllergenFacts(
        parsed?.availableAllergenFields,
        modifier.allergens,
      );

      if (!optionLabel || allergenFacts.officialAllergenCoveredIds.length === 0) {
        return null;
      }

      return {
        ...allergenFacts,
        modifier,
        name: `${parentName} — ${optionLabel}`,
        optionGroupName: selected.label,
        optionLabel,
        optionParentId: parentId,
        optionParentName: parentName,
      };
    })
    .filter(Boolean);
}
