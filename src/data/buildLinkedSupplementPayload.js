import {
  buildProductEvidenceScoreData,
  scoreMatchedIngredientsForProduct,
} from "@/features/supplements/recommendedDoseScoring";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTextKey(value) {
  return trimString(value).replace(/\s+/g, " ").toLowerCase();
}

function getBenefitNumericScore(benefit) {
  if (typeof benefit?.score === "number" && Number.isFinite(benefit.score)) {
    return benefit.score;
  }

  if (
    typeof benefit?.benefit_score === "number" &&
    Number.isFinite(benefit.benefit_score)
  ) {
    return benefit.benefit_score;
  }

  return null;
}

function buildDisplayHeading(match, supplement) {
  return (
    trimString(supplement?.name) ||
    trimString(match?.catalogName) ||
    trimString(match?.ingredientRaw) ||
    "Matched ingredient"
  );
}

function buildSectionBody(matchedIngredients, supplementsByCatalogId, fieldName) {
  const seenBodies = new Set();
  const blocks = [];

  (matchedIngredients ?? []).forEach((match) => {
    const supplement = supplementsByCatalogId.get(match.catalogId);
    const body = trimString(supplement?.[fieldName]);
    const bodyKey = normalizeTextKey(body);

    if (!bodyKey || seenBodies.has(bodyKey)) {
      return;
    }

    seenBodies.add(bodyKey);
    blocks.push(`${buildDisplayHeading(match, supplement)}\n${body}`);
  });

  return blocks.join("\n\n") || null;
}

function getScanSupportDriverSelectionScore(driver) {
  if (!Number.isFinite(driver?.benefitScore)) {
    return null;
  }

  const doseFactor = Number.isFinite(driver?.doseFactor) ? driver.doseFactor : 1;
  return driver.benefitScore * doseFactor;
}

function shouldReplaceScanSupportDriver(currentDriver, nextDriver) {
  const currentSelectionScore =
    getScanSupportDriverSelectionScore(currentDriver);
  const nextSelectionScore = getScanSupportDriverSelectionScore(nextDriver);

  if (!Number.isFinite(nextSelectionScore)) {
    return false;
  }

  if (!Number.isFinite(currentSelectionScore)) {
    return true;
  }

  if (nextSelectionScore !== currentSelectionScore) {
    return nextSelectionScore > currentSelectionScore;
  }

  if (nextDriver.benefitScore !== currentDriver?.benefitScore) {
    return nextDriver.benefitScore > currentDriver?.benefitScore;
  }

  const nextDoseFactor = Number.isFinite(nextDriver.doseFactor)
    ? nextDriver.doseFactor
    : 1;
  const currentDoseFactor = Number.isFinite(currentDriver?.doseFactor)
    ? currentDriver.doseFactor
    : 1;

  if (nextDoseFactor !== currentDoseFactor) {
    return nextDoseFactor > currentDoseFactor;
  }

  return String(nextDriver.ingredientName ?? "").localeCompare(
    String(currentDriver?.ingredientName ?? "")
  ) < 0;
}

function buildScanSupportDriver(match, supplement, benefitScore) {
  if (!Number.isFinite(benefitScore)) {
    return null;
  }

  const ingredientName =
    trimString(match?.ingredientName) ||
    trimString(match?.ingredientRaw) ||
    trimString(match?.catalogName) ||
    trimString(supplement?.name) ||
    "Matched ingredient";

  return {
    catalogId: trimString(match?.catalogId) || null,
    ingredientName,
    benefitScore,
    doseFactor: Number.isFinite(match?.doseFactor) ? match.doseFactor : 1,
    doseBand: trimString(match?.doseBand) || null,
  };
}

function mergeBenefits(scoredMatchedIngredients, supplementsByCatalogId) {
  const benefitsByLabel = new Map();

  (scoredMatchedIngredients ?? []).forEach((match) => {
    const supplement = supplementsByCatalogId.get(match.catalogId);
    const benefits = Array.isArray(supplement?.supplement_benefits)
      ? supplement.supplement_benefits
      : [];

    benefits.forEach((benefit) => {
      const label = trimString(benefit?.label);
      if (!label) {
        return;
      }

      const existing =
        benefitsByLabel.get(label) ??
        {
          id: `linked-benefit:${normalizeTextKey(label).replace(/\s+/g, "-")}`,
          label,
          icon: benefit?.icon ?? null,
          score: null,
          scanSupportDriver: null,
          evidenceItems: [],
          evidenceKeys: new Set(),
        };

      const nextScore = getBenefitNumericScore(benefit);

      if (
        Number.isFinite(nextScore) &&
        (!Number.isFinite(existing.score) || nextScore > existing.score)
      ) {
        existing.score = nextScore;
        existing.icon = benefit?.icon ?? existing.icon;
      } else if (!existing.icon && benefit?.icon) {
        existing.icon = benefit.icon;
      }

      const nextDriver = buildScanSupportDriver(match, supplement, nextScore);
      if (shouldReplaceScanSupportDriver(existing.scanSupportDriver, nextDriver)) {
        existing.scanSupportDriver = nextDriver;
      }

      [benefit?.evidence, benefit?.evidence_summary].forEach((item) => {
        const evidence = trimString(item);
        const evidenceKey = normalizeTextKey(evidence);

        if (!evidenceKey || existing.evidenceKeys.has(evidenceKey)) {
          return;
        }

        existing.evidenceKeys.add(evidenceKey);
        existing.evidenceItems.push(evidence);
      });

      benefitsByLabel.set(label, existing);
    });
  });

  return Array.from(benefitsByLabel.values()).map((benefit) => ({
    id: benefit.id,
    label: benefit.label,
    icon: benefit.icon,
    score: Number.isFinite(benefit.score) ? benefit.score : null,
    evidenceItems: benefit.evidenceItems,
    ...(benefit.scanSupportDriver
      ? {
          scanSupportDriver: {
            catalogId: benefit.scanSupportDriver.catalogId,
            ingredientName: benefit.scanSupportDriver.ingredientName,
            benefitScore: benefit.scanSupportDriver.benefitScore,
            doseFactor: benefit.scanSupportDriver.doseFactor,
            doseBand: benefit.scanSupportDriver.doseBand,
          },
        }
      : {}),
  }));
}

function buildSupplementEvidence(matchedIngredients, supplementsByCatalogId) {
  const evidenceItems = [];
  const seenEvidence = new Set();

  (matchedIngredients ?? []).forEach((match) => {
    const evidence = trimString(
      supplementsByCatalogId.get(match.catalogId)?.evidence
    );
    const evidenceKey = normalizeTextKey(evidence);

    if (!evidenceKey || seenEvidence.has(evidenceKey)) {
      return;
    }

    seenEvidence.add(evidenceKey);
    evidenceItems.push(evidence);
  });

  return evidenceItems.join("\n\n") || null;
}

function buildMatchedIngredientsPayload(matchedIngredients, supplementsByCatalogId) {
  return (matchedIngredients ?? []).map((match) => {
    const supplement = supplementsByCatalogId.get(match.catalogId);
    const catalogName =
      trimString(supplement?.name) || trimString(match?.catalogName);

    return {
      ...match,
      ingredientName:
        trimString(match?.ingredientRaw) || catalogName || "Matched ingredient",
      catalogName,
    };
  });
}

export function buildLinkedSupplementPayload({
  id = null,
  name,
  verified = false,
  catalogType = null,
  matchedIngredients = [],
  displayIngredients = null,
  servingSizeText = null,
  supplementsByCatalogId,
}) {
  const scoredMatchedIngredients = scoreMatchedIngredientsForProduct({
    matchedIngredients,
    supplementsByCatalogId,
    servingSizeText,
  });
  const scoredDisplayIngredients =
    displayIngredients === matchedIngredients
      ? scoredMatchedIngredients
      : scoreMatchedIngredientsForProduct({
          matchedIngredients: displayIngredients ?? matchedIngredients,
          supplementsByCatalogId,
          servingSizeText,
        });
  const productScore = buildProductEvidenceScoreData(scoredMatchedIngredients);

  return {
    id,
    name,
    verified,
    catalogType,
    evidence_score: productScore.evidenceScore,
    base_evidence_score: productScore.baseEvidenceScore,
    score_adjustment_summary: productScore.scoreAdjustmentSummary,
    score_adjustment_reason_code: productScore.scoreAdjustmentReasonCode,
    evidence: buildSupplementEvidence(
      scoredMatchedIngredients,
      supplementsByCatalogId
    ),
    supplement_benefits: mergeBenefits(
      scoredMatchedIngredients,
      supplementsByCatalogId
    ),
    matchedIngredients: buildMatchedIngredientsPayload(
      scoredDisplayIngredients,
      supplementsByCatalogId
    ),
    serving_size_text: trimString(servingSizeText) || null,
    how_to_use: buildSectionBody(
      scoredMatchedIngredients,
      supplementsByCatalogId,
      "how_to_use"
    ),
    what_is_it: buildSectionBody(
      scoredMatchedIngredients,
      supplementsByCatalogId,
      "what_is_it"
    ),
    why_use_it: buildSectionBody(
      scoredMatchedIngredients,
      supplementsByCatalogId,
      "why_use_it"
    ),
    risks_and_interactions: buildSectionBody(
      scoredMatchedIngredients,
      supplementsByCatalogId,
      "risks_and_interactions"
    ),
  };
}
