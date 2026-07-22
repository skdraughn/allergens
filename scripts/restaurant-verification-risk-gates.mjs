import { domainToASCII } from "node:url";

export const SCOUT_RISK_GATE_IDS = Object.freeze({
  STRUCTURAL_INVALID: "structural_invalid",
  BASELINE_COVERAGE_INCOMPLETE: "baseline_coverage_incomplete",
  MULTI_SERVICE: "multi_service",
  PDF_OR_IMAGE: "pdf_or_image",
  INACCESSIBLE_SOURCE: "inaccessible_source",
  SCOPE_INCOMPLETE: "scope_incomplete",
  UNRESOLVED_SURFACE: "unresolved_surface",
  COUNT_DRIFT: "count_drift",
  CURRENT_ONLY: "current_only",
  BASELINE_ONLY: "baseline_only",
  DUPLICATE_PRESENTATIONS: "duplicate_presentations",
  NAME_COLLISION: "name_collision",
  AUTHORITY_AMBIGUITY: "authority_ambiguity",
  DIFFERENT_DOMAIN: "different_domain",
  NON_EXACT_RECONCILIATION: "non_exact_reconciliation",
  ALLERGEN_MISMATCH: "allergen_mismatch",
  CROSS_CONTACT: "cross_contact",
  PARSER_OR_REPAIR_FINDING: "parser_or_repair_finding",
  MISSING_ANCHORS: "missing_anchors",
  VALIDATION_WARNINGS: "validation_warnings",
  LOW_CONFIDENCE: "low_confidence",
  SCOUT_FLAGGED_RISK: "scout_flagged_risk",
});

// Short alias for callers that do not need the scout-specific name.
export const RISK_GATE_IDS = SCOUT_RISK_GATE_IDS;

const G = SCOUT_RISK_GATE_IDS;
const ACCESSIBLE_STATUSES = new Set(["accessible", "captured", "ok", "success"]);
const INACCESSIBLE_STATUSES = new Set(["blocked", "error", "not_found", "inaccessible", "timeout"]);
const COMPLETE_SCOPE_STATUSES = new Set(["complete", "fully_enumerated", "excluded", "not_applicable"]);
const UNRESOLVED_SCOPE_STATUSES = new Set(["unresolved", "unknown", "pending"]);
const BASELINE_ONLY_DISPOSITIONS = new Set([
  "missing_from_source",
  "stale_extra",
  "location_mismatch",
  "baseline_only",
]);
const PARSER_FINDING_KINDS = new Set([
  "extraction",
  "menu_extraction",
  "parser",
  "parser_repair",
  "repair",
]);
const RISK_OUTCOMES = new Set(["discrepancy_found", "blocked_unverifiable", "low_confidence"]);
const STRONG_REVIEW_GATES = new Set([
  G.MULTI_SERVICE,
  G.PDF_OR_IMAGE,
  G.INACCESSIBLE_SOURCE,
  G.SCOPE_INCOMPLETE,
  G.UNRESOLVED_SURFACE,
  G.COUNT_DRIFT,
  G.CURRENT_ONLY,
  G.BASELINE_ONLY,
  G.DUPLICATE_PRESENTATIONS,
  G.NAME_COLLISION,
  G.AUTHORITY_AMBIGUITY,
  G.DIFFERENT_DOMAIN,
  G.NON_EXACT_RECONCILIATION,
  G.ALLERGEN_MISMATCH,
  G.CROSS_CONTACT,
  G.PARSER_OR_REPAIR_FINDING,
  G.MISSING_ANCHORS,
  G.VALIDATION_WARNINGS,
  G.LOW_CONFIDENCE,
  G.SCOUT_FLAGGED_RISK,
]);
const RETRY_GATES = new Set([
  G.STRUCTURAL_INVALID,
  G.BASELINE_COVERAGE_INCOMPLETE,
]);

/**
 * Evaluate mechanically checkable scout output. A clean result still requires a
 * Terra review; this function only determines whether the packet is incomplete
 * and must be retried, or carries signals that require full/strong review.
 */
export function evaluateScoutRisk({ job = {}, result = {}, validation = {} } = {}) {
  const restaurant = job.restaurant ?? {};
  const baselineItemCount = integer(restaurant.baselineItemCount);
  const menuSurfaces = array(result.menuSurfaces);
  const currentProducts = array(result.currentProducts);
  const itemCheckGroups = array(result.itemCheckGroups);
  const sources = array(result.sources);
  const sourceAttempts = array(result.sourceAttempts);
  const findings = array(result.findings);

  const reconciledKeys = itemCheckGroups.flatMap((group) => array(group.auditItemKeys));
  const uniqueReconciledKeys = new Set(reconciledKeys);
  const duplicateReconciledKeyCount = reconciledKeys.length - uniqueReconciledKeys.size;
  const baselineCoverageIncomplete =
    baselineItemCount === null ||
    reconciledKeys.length !== baselineItemCount ||
    uniqueReconciledKeys.size !== baselineItemCount ||
    duplicateReconciledKeyCount > 0;

  const activeSurfaces = menuSurfaces.filter((surface) => !isExcludedOrSuperseded(surface));
  const accessibleSurfaces = activeSurfaces.filter((surface) => isAccessible(surface.accessStatus ?? surface.status));
  const serviceKeys = new Set(
    activeSurfaces
      .map(serviceKey)
      .filter((key) => key && !["all_day", "primary", "menu", "general"].includes(key)),
  );
  const pdfImageSurfaces = activeSurfaces.filter(isPdfOrImage);
  const inaccessibleSurfaces = activeSurfaces.filter((surface) =>
    isInaccessible(surface.accessStatus ?? surface.status)
  );
  const inaccessiblePrimaryAttempts = sourceAttempts.filter((attempt) =>
    ["official_site", "linked_source", "ordering_vendor"].includes(attempt.kind) &&
    isInaccessible(attempt.status)
  );
  const incompleteSurfaces = accessibleSurfaces.filter((surface) => !isSurfaceComplete(surface));
  const unresolvedSurfaces = activeSurfaces.filter(isSurfaceUnresolved);

  const currentOnlyProducts = currentProducts.filter(isCurrentOnlyProduct);
  const baselineOnlyGroups = itemCheckGroups.filter((group) =>
    BASELINE_ONLY_DISPOSITIONS.has(group.disposition) || group.baselineOnly === true
  );
  const baselineOnlyItemCount = baselineOnlyGroups.reduce(
    (total, group) => total + array(group.auditItemKeys).length,
    0,
  );
  const nonExactGroups = itemCheckGroups.filter((group) => group.disposition !== "exact_match");
  const nonExactItemCount = nonExactGroups.reduce(
    (total, group) => total + array(group.auditItemKeys).length,
    0,
  );
  const allergenMismatchGroups = itemCheckGroups.filter((group) =>
    group.allergenVerdict === "mismatch" || group.allergenMismatch === true
  );
  const allergenMismatchItemCount = allergenMismatchGroups.reduce(
    (total, group) => total + array(group.auditItemKeys).length,
    0,
  );

  const presentationIds = [];
  let multiPresentationProductCount = 0;
  for (const product of currentProducts) {
    const productPresentationIds = presentations(product);
    presentationIds.push(...productPresentationIds);
    const declaredPresentationCount = integer(product.presentationCount) ?? productPresentationIds.length;
    if (
      declaredPresentationCount > 1 ||
      integer(product.duplicatePresentationCount) > 0 ||
      product.duplicatePresentation === true
    ) {
      multiPresentationProductCount += 1;
    }
  }
  const duplicatePresentationIdCount = presentationIds.length - new Set(presentationIds).size;
  const duplicatePresentationCount = multiPresentationProductCount + Math.max(0, duplicatePresentationIdCount);

  const normalizedNames = currentProducts
    .map((product) => normalizeName(product.name ?? product.productName ?? ""))
    .filter(Boolean);
  const nameCollisionCount = duplicateValueCount(normalizedNames) + currentProducts.filter((product) =>
    product.nameCollision === true || product.normalizedNameCollision === true
  ).length;

  const officialDomains = officialDomainSet(restaurant);
  const ambiguousSources = sources.filter((source) => isAuthorityAmbiguous(source));
  const ambiguousProducts = currentProducts.filter((product) =>
    product.authorityAmbiguous === true ||
    ["ambiguous", "unverified", "mismatch"].includes(
      product.authorityVerdict ?? product.sourceAuthorityVerdict
    )
  );
  const authorityAmbiguityCount = ambiguousSources.length + ambiguousProducts.length;
  const differentDomainSources = sources.filter((source) =>
    isDifferentOfficialDomain(source, officialDomains, restaurant.sourceUrls)
  );
  const differentDomainProducts = currentProducts.filter((product) =>
    product.differentDomain === true ||
    product.baselineSourceDomainMismatch === true ||
    product.baselineSourceDomainMatches === false
  );
  const differentDomainCount = differentDomainSources.length + differentDomainProducts.length;

  const crossContactProductCount = currentProducts.filter(hasCrossContact).length;
  const crossContactFindingCount = findings.filter((finding) =>
    finding.kind === "cross_contact" || crossContactText(finding.summary)
  ).length;
  const crossContactSourceCount = sources.filter((source) => crossContactText(source.excerpt)).length;
  const crossContactCount = crossContactProductCount + crossContactFindingCount + crossContactSourceCount;

  const parserRepairFindingCount = findings.filter((finding) =>
    PARSER_FINDING_KINDS.has(finding.kind) ||
    /\b(parser|repair|under[- ]?extract|omit(?:ted|sion)?|artifact|concat(?:enat)?|duplicate)\b/i.test(
      String(finding.summary ?? "")
    )
  ).length;

  const missingAnchorCount = sources.filter((source) => !hasReproducibilityAnchor(source)).length;
  const validationWarnings = array(validation.warnings);
  const validationErrors = array(validation.errors);
  const structuralInvalid = validation.valid === false || validationErrors.length > 0;
  const scopeIncomplete =
    menuSurfaces.length === 0 ||
    (baselineItemCount > 0 && currentProducts.length === 0) ||
    incompleteSurfaces.length > 0;
  const countDrift = baselineItemCount !== null && currentProducts.length !== baselineItemCount;
  const lowConfidence = isLowConfidence(result.confidence);

  const triggered = new Set();
  addGate(triggered, G.STRUCTURAL_INVALID, structuralInvalid);
  addGate(triggered, G.BASELINE_COVERAGE_INCOMPLETE, baselineCoverageIncomplete);
  addGate(triggered, G.MULTI_SERVICE, serviceKeys.size > 1);
  addGate(triggered, G.PDF_OR_IMAGE, pdfImageSurfaces.length > 0);
  addGate(
    triggered,
    G.INACCESSIBLE_SOURCE,
    inaccessibleSurfaces.length > 0 || inaccessiblePrimaryAttempts.length > 0,
  );
  addGate(triggered, G.SCOPE_INCOMPLETE, scopeIncomplete);
  addGate(triggered, G.UNRESOLVED_SURFACE, unresolvedSurfaces.length > 0);
  addGate(triggered, G.COUNT_DRIFT, countDrift);
  addGate(triggered, G.CURRENT_ONLY, currentOnlyProducts.length > 0);
  addGate(triggered, G.BASELINE_ONLY, baselineOnlyItemCount > 0);
  addGate(triggered, G.DUPLICATE_PRESENTATIONS, duplicatePresentationCount > 0);
  addGate(triggered, G.NAME_COLLISION, nameCollisionCount > 0);
  addGate(triggered, G.AUTHORITY_AMBIGUITY, authorityAmbiguityCount > 0);
  addGate(triggered, G.DIFFERENT_DOMAIN, differentDomainCount > 0);
  addGate(triggered, G.NON_EXACT_RECONCILIATION, nonExactItemCount > 0);
  addGate(triggered, G.ALLERGEN_MISMATCH, allergenMismatchItemCount > 0);
  addGate(triggered, G.CROSS_CONTACT, crossContactCount > 0);
  addGate(triggered, G.PARSER_OR_REPAIR_FINDING, parserRepairFindingCount > 0);
  addGate(triggered, G.MISSING_ANCHORS, missingAnchorCount > 0);
  addGate(triggered, G.VALIDATION_WARNINGS, validationWarnings.length > 0);
  addGate(triggered, G.LOW_CONFIDENCE, lowConfidence);
  addGate(triggered, G.SCOUT_FLAGGED_RISK, RISK_OUTCOMES.has(result.outcome));

  const triggeredGates = Object.values(G).filter((gateId) => triggered.has(gateId));
  return {
    triggeredGates,
    requiresStrongReview: triggeredGates.some((gateId) => STRONG_REVIEW_GATES.has(gateId)),
    retryRequired: triggeredGates.some((gateId) => RETRY_GATES.has(gateId)),
    metrics: {
      baselineItemCount,
      reconciledItemCount: reconciledKeys.length,
      uniqueReconciledItemCount: uniqueReconciledKeys.size,
      duplicateReconciledKeyCount,
      menuSurfaceCount: menuSurfaces.length,
      activeMenuSurfaceCount: activeSurfaces.length,
      accessibleMenuSurfaceCount: accessibleSurfaces.length,
      serviceCount: serviceKeys.size,
      pdfImageSurfaceCount: pdfImageSurfaces.length,
      inaccessibleSurfaceCount: inaccessibleSurfaces.length,
      inaccessiblePrimaryAttemptCount: inaccessiblePrimaryAttempts.length,
      incompleteSurfaceCount: incompleteSurfaces.length,
      unresolvedSurfaceCount: unresolvedSurfaces.length,
      currentProductCount: currentProducts.length,
      currentOnlyCount: currentOnlyProducts.length,
      baselineOnlyCount: baselineOnlyItemCount,
      countDrift,
      duplicatePresentationCount,
      nameCollisionCount,
      authorityAmbiguityCount,
      differentDomainCount,
      nonExactItemCount,
      allergenMismatchItemCount,
      crossContactCount,
      parserRepairFindingCount,
      missingAnchorCount,
      validationWarningCount: validationWarnings.length,
      validationErrorCount: validationErrors.length,
      lowConfidence,
    },
  };
}

function addGate(gates, gateId, condition) {
  if (condition) gates.add(gateId);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function integer(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function normalizeToken(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function serviceKey(surface) {
  return normalizeToken(
    surface.servicePeriod ?? surface.service ?? surface.menuKind ?? surface.menuType ?? surface.label
  );
}

function isExcludedOrSuperseded(surface) {
  return surface.inScope === false ||
    surface.current === false ||
    surface.excluded === true ||
    surface.superseded === true ||
    ["excluded", "superseded", "not_applicable"].includes(
      normalizeToken(surface.scopeStatus ?? surface.resolutionStatus)
    );
}

function isAccessible(status) {
  return ACCESSIBLE_STATUSES.has(normalizeToken(status));
}

function isInaccessible(status) {
  return INACCESSIBLE_STATUSES.has(normalizeToken(status));
}

function isSurfaceComplete(surface) {
  if (surface.fullyEnumerated === true || surface.scopeComplete === true) return true;
  return COMPLETE_SCOPE_STATUSES.has(normalizeToken(surface.scopeStatus ?? surface.enumerationStatus));
}

function isSurfaceUnresolved(surface) {
  if (surface.unresolved === true) return true;
  // A blocked source needs stronger review, but repeating the same scout is not
  // useful unless the scout explicitly says its discovery resolution is pending.
  if (isInaccessible(surface.accessStatus ?? surface.status)) {
    return normalizeToken(surface.resolutionStatus) === "unresolved";
  }
  return UNRESOLVED_SCOPE_STATUSES.has(
    normalizeToken(surface.resolutionStatus ?? surface.scopeStatus ?? surface.enumerationStatus)
  );
}

function isPdfOrImage(surface) {
  const mediaType = normalizeToken(surface.mediaType ?? surface.format ?? surface.contentType);
  if (["pdf", "image", "ocr", "image_pdf", "scanned_pdf"].includes(mediaType)) return true;
  return /\.(?:pdf|png|jpe?g|webp)(?:$|[?#])/i.test(String(surface.url ?? ""));
}

function productBaselineKeys(product) {
  return array(product.baselineAuditItemKeys ?? product.matchedBaselineAuditItemKeys ?? product.auditItemKeys);
}

function isCurrentOnlyProduct(product) {
  if (product.currentOnly === true || product.baselineMatch === false) return true;
  if (["current_only", "new_current", "unmatched_current"].includes(product.disposition)) return true;
  return productBaselineKeys(product).length === 0;
}

function presentations(product) {
  const values = product.presentationIds ?? product.sourcePresentationIds ?? product.presentations;
  return array(values).map((value) =>
    typeof value === "string" ? value : String(value?.presentationId ?? value?.id ?? "")
  ).filter(Boolean);
}

function normalizeName(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function duplicateValueCount(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
}

function officialDomainSet(restaurant) {
  const domains = new Set();
  addDomain(domains, restaurant.domain);
  addDomain(domains, restaurant.guideUrl);
  for (const url of array(restaurant.sourceUrls)) addDomain(domains, url);
  return domains;
}

function addDomain(domains, value) {
  const hostname = hostnameOf(value);
  if (hostname) domains.add(hostname);
}

function hostnameOf(value) {
  if (!value) return null;
  try {
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(String(value))
      ? String(value)
      : `https://${value}`;
    return domainToASCII(new URL(candidate).hostname.toLowerCase().replace(/^www\./, ""));
  } catch {
    return null;
  }
}

function sameOrSubdomain(left, right) {
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

function isAuthorityAmbiguous(source) {
  const tier = source.authorityTier;
  if (!["restaurant_issued", "restaurant_linked_vendor", "third_party", "ingredient_intelligence"].includes(tier)) {
    return true;
  }
  if (source.authorityAmbiguous === true || source.authorityVerified === false) return true;
  return (
    ["allergen", "ingredients", "cross_contact"].includes(source.purpose) &&
    source.authorityTier === "third_party"
  );
}

function isDifferentOfficialDomain(source, officialDomains, baselineSourceUrls) {
  if (source.differentDomain === true || source.baselineSourceDomainMismatch === true) return true;
  if (source.authorityTier !== "restaurant_issued") return false;
  if (source.ownerLinked === true || source.linkedFromOfficial === true) return false;
  const sourceHost = hostnameOf(source.url);
  if (!sourceHost || officialDomains.size === 0) return false;
  if (officialDomains.size > 0 && [...officialDomains].some((domain) => sameOrSubdomain(sourceHost, domain))) {
    return false;
  }
  if (array(baselineSourceUrls).includes(source.url)) return false;
  return true;
}

function hasCrossContact(product) {
  return product.crossContact === true ||
    array(product.crossContactAllergens).length > 0 ||
    array(product.mayContainAllergens ?? product.mayContain).length > 0 ||
    crossContactText(product.crossContactText ?? product.notes ?? product.description);
}

function crossContactText(value) {
  return /\b(?:cross[- ]?contact|cross[- ]?contaminat|may contain|shared (?:fryer|equipment|facility))\b/i.test(
    String(value ?? "")
  );
}

function hasReproducibilityAnchor(source) {
  return [source.excerpt, source.stableRowId, source.contentHash, source.artifactSuggested].some(Boolean);
}

function isLowConfidence(confidence) {
  if (!confidence || typeof confidence !== "object") return true;
  if (confidence.level === "low") return true;
  const scores = [
    confidence.overall,
    confidence.menu,
    confidence.allergenSource,
    confidence.extraction,
    confidence.score,
  ].filter((score) => typeof score === "number");
  return scores.length > 0 && Math.min(...scores) < 0.75;
}
