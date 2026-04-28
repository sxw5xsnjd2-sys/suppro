import { searchSupplementCatalog } from "@src/data/searchSupplementCatalog";

const MIN_MATCH_SCORE = 0.62;
const MAX_TOKEN_SEARCHES = 4;
const ACTIVE_INGREDIENT_CATALOG_TYPE = "active_ingredient";
const SUPPLEMENT_PRODUCT_CATALOG_TYPE = "supplement_product";
const PRODUCT_SCORE_MARGIN = 0.05;

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeCatalogMatchText(value) {
  return trimString(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function catalogTokens(value) {
  return normalizeCatalogMatchText(value)
    .split(" ")
    .filter((token) => token.length > 1);
}

function uniqueCandidates(sections) {
  const byKey = new Map();

  (sections ?? []).forEach((section) => {
    (section?.data ?? []).forEach((item) => {
      const key = `${item.catalogType}:${item.id}`;
      if (!item?.id || !item?.name || byKey.has(key)) return;
      byKey.set(key, item);
    });
  });

  return Array.from(byKey.values());
}

function tokenMatches(inputToken, candidateToken) {
  if (inputToken === candidateToken) return true;
  if (inputToken.length >= 3 && candidateToken.startsWith(inputToken)) {
    return true;
  }
  return candidateToken.length >= 3 && inputToken.startsWith(candidateToken);
}

function getMatchedInputTokens(inputName, candidateName) {
  const candidateTokens = catalogTokens(candidateName);
  return catalogTokens(inputName).filter((token) =>
    candidateTokens.some((candidateToken) => tokenMatches(token, candidateToken))
  );
}

function isSimpleActiveIngredientMatch(inputName, candidate) {
  if (candidate?.catalogType !== ACTIVE_INGREDIENT_CATALOG_TYPE) return false;

  const input = normalizeCatalogMatchText(inputName);
  const candidateName = normalizeCatalogMatchText(candidate?.name);
  if (!input || !candidateName) return false;
  if (input === candidateName) return true;

  const inputTokens = catalogTokens(input);
  if (inputTokens.length === 0 || inputTokens.length > 2) return false;

  const matchedInputTokens = getMatchedInputTokens(input, candidateName);
  return (
    matchedInputTokens.length === inputTokens.length &&
    candidate.matchScore >= 0.9
  );
}

function hasProductSpecificInputToken(inputName, activeIngredient) {
  const activeTokens = catalogTokens(activeIngredient?.name);
  if (!activeTokens.length) return true;

  return catalogTokens(inputName).some(
    (token) =>
      !activeTokens.some((activeToken) => tokenMatches(token, activeToken))
  );
}

function compareRankedCandidates(inputName, left, right) {
  if (right.matchScore !== left.matchScore) {
    return right.matchScore - left.matchScore;
  }

  const leftIsSimpleActive = isSimpleActiveIngredientMatch(inputName, left);
  const rightIsSimpleActive = isSimpleActiveIngredientMatch(inputName, right);
  if (leftIsSimpleActive !== rightIsSimpleActive) {
    return leftIsSimpleActive ? -1 : 1;
  }

  if (left.catalogType !== right.catalogType) {
    if (left.catalogType === ACTIVE_INGREDIENT_CATALOG_TYPE) return -1;
    if (right.catalogType === ACTIVE_INGREDIENT_CATALOG_TYPE) return 1;
  }

  return String(left.name).localeCompare(String(right.name));
}

export function scoreSupplementCatalogCandidate(inputName, candidateName) {
  const input = normalizeCatalogMatchText(inputName);
  const candidate = normalizeCatalogMatchText(candidateName);
  if (!input || !candidate) return 0;
  if (input === candidate) return 1;

  const inputTokens = catalogTokens(input);
  const candidateTokens = catalogTokens(candidate);
  if (!inputTokens.length || !candidateTokens.length) return 0;

  const matchedTokens = inputTokens.filter((token) =>
    candidateTokens.some((candidateToken) => tokenMatches(token, candidateToken))
  );
  const tokenCoverage = matchedTokens.length / inputTokens.length;
  const reverseCoverage = matchedTokens.length / candidateTokens.length;
  const orderedContains =
    candidate.includes(input) || input.includes(candidate) ? 0.22 : 0;
  const prefixBoost = candidate.startsWith(input) || input.startsWith(candidate)
    ? 0.08
    : 0;

  return Math.min(
    0.99,
    tokenCoverage * 0.62 + reverseCoverage * 0.2 + orderedContains + prefixBoost
  );
}

export function selectSupplementCatalogMatch(inputName, candidates) {
  const ranked = (candidates ?? [])
    .map((candidate) => ({
      ...candidate,
      matchScore: scoreSupplementCatalogCandidate(inputName, candidate.name),
    }))
    .filter((candidate) => candidate.matchScore >= MIN_MATCH_SCORE)
    .sort((left, right) => compareRankedCandidates(inputName, left, right));

  const bestActive = ranked.find(
    (candidate) => candidate.catalogType === ACTIVE_INGREDIENT_CATALOG_TYPE
  );
  const bestProduct = ranked.find(
    (candidate) => candidate.catalogType === SUPPLEMENT_PRODUCT_CATALOG_TYPE
  );

  if (
    bestActive &&
    isSimpleActiveIngredientMatch(inputName, bestActive) &&
    (!bestProduct ||
      bestProduct.matchScore <= bestActive.matchScore + PRODUCT_SCORE_MARGIN)
  ) {
    return bestActive;
  }

  if (
    bestProduct &&
    (!bestActive ||
      bestProduct.matchScore > bestActive.matchScore + PRODUCT_SCORE_MARGIN ||
      (bestProduct.matchScore >= bestActive.matchScore &&
        hasProductSpecificInputToken(inputName, bestActive)))
  ) {
    return bestProduct;
  }

  return ranked[0] ?? null;
}

async function searchCatalogForName(name) {
  const normalizedTokens = catalogTokens(name)
    .filter((token) => token.length > 2)
    .slice(0, MAX_TOKEN_SEARCHES);
  const searchTerms = Array.from(new Set([trimString(name), ...normalizedTokens]))
    .filter(Boolean);

  const results = await Promise.all(
    searchTerms.map((term) =>
      searchSupplementCatalog(term).catch((error) => {
        console.error("Failed to search supplement catalog", error);
        return [];
      })
    )
  );

  return uniqueCandidates(results.flat());
}

export async function matchSupplementCatalogName(name) {
  const trimmedName = trimString(name);
  if (!trimmedName) return null;

  const candidates = await searchCatalogForName(trimmedName);
  return selectSupplementCatalogMatch(trimmedName, candidates);
}
