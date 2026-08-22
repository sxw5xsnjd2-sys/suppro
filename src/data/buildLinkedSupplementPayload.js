import {
  buildProductEvidenceScoreData,
  scoreMatchedIngredientsForProduct,
} from "@/features/supplements/recommendedDoseScoring";
import { selectProductBenefitDriver } from "@/features/supplements/benefits";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTextKey(value) {
  return trimString(value).replace(/\s+/g, " ").toLowerCase();
}

function normalizeEvidenceSourceUrl(value) {
  const raw = trimString(value);
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.pathname = url.pathname.replace(/\/{2,}/g, "/");
    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    if (!url.searchParams.toString()) {
      url.search = "";
    }
    const normalized = url.toString();
    return normalized.endsWith("/") && url.pathname === "/"
      ? normalized.slice(0, -1)
      : normalized;
  } catch {
    return "";
  }
}

function sourcePriority(url) {
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return "";
    }
  })();

  if (host === "pubmed.ncbi.nlm.nih.gov") return 0;
  if (host === "pmc.ncbi.nlm.nih.gov") return 1;
  if (host === "doi.org" || host === "dx.doi.org") return 2;
  if (
    [
      "clinicaltrials.gov",
      "fda.gov",
      "ema.europa.eu",
      "efsa.europa.eu",
      "nccih.nih.gov",
      "ncbi.nlm.nih.gov",
      "nhs.uk",
      "nih.gov",
      "ods.od.nih.gov",
      "who.int",
    ].some((domain) => host === domain || host.endsWith(`.${domain}`))
  ) {
    return 3;
  }
  return 4;
}

function getEvidenceSourceLabel(url) {
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return "";
    }
  })();

  if (host === "pubmed.ncbi.nlm.nih.gov") return "PubMed";
  if (host === "pmc.ncbi.nlm.nih.gov") return "PubMed Central";
  if (host === "doi.org" || host === "dx.doi.org") return "DOI";
  if (host === "ods.od.nih.gov") return "NIH Office of Dietary Supplements";
  if (host === "nccih.nih.gov") return "NCCIH";
  if (host === "nih.gov") return "NIH";
  if (host === "nhs.uk") return "NHS";
  if (host === "who.int") return "WHO";
  if (host === "clinicaltrials.gov") return "ClinicalTrials.gov";
  if (!host) return null;

  return host;
}

function collectBenefitEvidenceSources(benefit) {
  const rawUrls = [
    benefit?.evidence_source,
    ...(Array.isArray(benefit?.evidence_source_urls)
      ? benefit.evidence_source_urls
      : []),
    ...(Array.isArray(benefit?.source_urls) ? benefit.source_urls : []),
  ];

  return Array.from(
    new Set(rawUrls.map((url) => normalizeEvidenceSourceUrl(url)).filter(Boolean))
  ).sort((left, right) => sourcePriority(left) - sourcePriority(right));
}

function getBenefitReferenceEvidenceText(benefit) {
  const directEvidence = trimString(benefit?.evidence);
  if (directEvidence) {
    return directEvidence;
  }

  const evidenceSummary = trimString(benefit?.evidence_summary);
  if (evidenceSummary) {
    return evidenceSummary;
  }

  if (Array.isArray(benefit?.evidenceItems)) {
    return (
      benefit.evidenceItems.find(
        (item) => typeof item === "string" && item.trim().length > 0
      ) ?? ""
    );
  }

  return "";
}

function parseBenefitReferenceMetadata(benefit, url) {
  const evidenceText = getBenefitReferenceEvidenceText(benefit);
  const titleMatch = evidenceText.match(/["“]([^"”]+)["”]/);
  const sourceMatch = evidenceText.match(/\)\s*,\s*([^:]+):/);
  const yearMatch = evidenceText.match(/\((\d{4})\)/);

  return {
    citationTitle: trimString(titleMatch?.[1]).replace(/\.\s*$/, "") || null,
    sourceLabel:
      trimString(sourceMatch?.[1]).replace(/[.,:]\s*$/, "") ||
      getEvidenceSourceLabel(url),
    year: yearMatch ? Number.parseInt(yearMatch[1], 10) : null,
  };
}

function mergeReferenceItems(referenceItems) {
  const mergedByUrl = new Map();

  (referenceItems ?? []).forEach((item) => {
    const url = normalizeEvidenceSourceUrl(item?.url);
    if (!url) {
      return;
    }

    const existing =
      mergedByUrl.get(url) ??
      {
        url,
        benefitLabels: [],
        citationTitle: null,
        sourceLabel: null,
        year: null,
      };

    const benefitLabels = Array.isArray(item?.benefitLabels)
      ? item.benefitLabels
      : [item?.benefitLabel];

    benefitLabels
      .map((label) => trimString(label))
      .filter(Boolean)
      .forEach((label) => {
        if (!existing.benefitLabels.includes(label)) {
          existing.benefitLabels.push(label);
        }
      });

    if (!existing.citationTitle) {
      existing.citationTitle = trimString(item?.citationTitle) || null;
    }

    if (!existing.sourceLabel) {
      existing.sourceLabel = trimString(item?.sourceLabel) || null;
    }

    if (!Number.isFinite(existing.year) && Number.isFinite(item?.year)) {
      existing.year = Number(item.year);
    }

    mergedByUrl.set(url, existing);
  });

  return Array.from(mergedByUrl.values()).sort((left, right) => {
    const priorityDelta = sourcePriority(left.url) - sourcePriority(right.url);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return String(left.citationTitle ?? left.url).localeCompare(
      String(right.citationTitle ?? right.url)
    );
  });
}

export function buildBenefitReferenceItems(benefit) {
  if (Array.isArray(benefit?.referenceItems) && benefit.referenceItems.length) {
    return mergeReferenceItems(benefit.referenceItems);
  }

  const benefitLabel = trimString(benefit?.label);

  return collectBenefitEvidenceSources(benefit).map((url) => {
    const metadata = parseBenefitReferenceMetadata(benefit, url);

    return {
      url,
      benefitLabels: benefitLabel ? [benefitLabel] : [],
      citationTitle: metadata.citationTitle,
      sourceLabel: metadata.sourceLabel,
      year: metadata.year,
    };
  });
}

export function buildSupplementReferenceItems(benefits) {
  return mergeReferenceItems(
    (benefits ?? []).flatMap((benefit) => buildBenefitReferenceItems(benefit))
  );
}

function getRawActiveIngredientBenefitScore(benefit) {
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

function buildProductBenefitDriver(
  match,
  supplement,
  benefitScore,
  benefit
) {
  if (!Number.isFinite(benefitScore)) {
    return null;
  }

  const ingredientName =
    trimString(match?.ingredientName) ||
    trimString(match?.ingredientRaw) ||
    trimString(match?.catalogName) ||
    trimString(supplement?.name) ||
    "Matched ingredient";
  const benefitEvidenceSourceUrls = collectBenefitEvidenceSources(benefit);

  return {
    canonicalIngredientId: trimString(match?.catalogId) || null,
    catalogId: trimString(match?.catalogId) || null,
    ingredientName,
    rawActiveIngredientBenefitScore: benefitScore,
    benefitScore,
    validatedDoseFactor: Number.isFinite(match?.validatedDoseFactor)
      ? match.validatedDoseFactor
      : null,
    doseFactor: Number.isFinite(match?.doseFactor) ? match.doseFactor : null,
    doseComparisonStatus: trimString(match?.doseComparisonStatus) || null,
    doseComparisonValid: match?.doseComparisonValid === true,
    doseBand: trimString(match?.doseBand) || null,
    hasBenefitStudy: benefitEvidenceSourceUrls.length > 0,
    benefitEvidenceSourceUrls,
  };
}

function serializeProductBenefitDriver(driver, productBenefitScore = null) {
  return {
    canonicalIngredientId: driver?.canonicalIngredientId ?? null,
    catalogId: driver?.catalogId ?? null,
    ingredientName: driver?.ingredientName ?? "Matched ingredient",
    productBenefitScore: Number.isFinite(productBenefitScore)
      ? productBenefitScore
      : null,
    rawActiveIngredientBenefitScore:
      driver?.rawActiveIngredientBenefitScore ?? null,
    benefitScore: driver?.benefitScore ?? null,
    validatedDoseFactor: driver?.validatedDoseFactor ?? null,
    doseFactor: driver?.doseFactor ?? null,
    doseComparisonStatus: driver?.doseComparisonStatus ?? null,
    doseComparisonValid: driver?.doseComparisonValid === true,
    doseBand: driver?.doseBand ?? null,
    hasBenefitStudy: driver?.hasBenefitStudy === true,
    benefitEvidenceSourceUrls: Array.isArray(
      driver?.benefitEvidenceSourceUrls
    )
      ? driver.benefitEvidenceSourceUrls
      : [],
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
          productBenefitDrivers: [],
          evidenceItems: [],
          evidenceKeys: new Set(),
          evidenceSourceUrls: [],
          evidenceSourceKeys: new Set(),
          referenceItems: [],
        };

      const nextScore = getRawActiveIngredientBenefitScore(benefit);

      if (
        Number.isFinite(nextScore) &&
        (!Number.isFinite(existing.score) || nextScore > existing.score)
      ) {
        existing.score = nextScore;
        existing.icon = benefit?.icon ?? existing.icon;
      } else if (!existing.icon && benefit?.icon) {
        existing.icon = benefit.icon;
      }

      const nextDriver = buildProductBenefitDriver(
        match,
        supplement,
        nextScore,
        benefit
      );
      if (nextDriver) {
        existing.productBenefitDrivers.push(nextDriver);
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

      collectBenefitEvidenceSources(benefit).forEach((url) => {
        if (existing.evidenceSourceKeys.has(url)) {
          return;
        }

        existing.evidenceSourceKeys.add(url);
        existing.evidenceSourceUrls.push(url);
      });

      existing.referenceItems = mergeReferenceItems([
        ...existing.referenceItems,
        ...buildBenefitReferenceItems(benefit),
      ]);

      benefitsByLabel.set(label, existing);
    });
  });

  return Array.from(benefitsByLabel.values()).map((benefit) => {
    const evidenceSourceUrls = benefit.evidenceSourceUrls
      .slice()
      .sort((left, right) => sourcePriority(left) - sourcePriority(right));
    const selectedProductBenefitDriver = selectProductBenefitDriver(
      benefit.productBenefitDrivers
    );
    const productBenefitDrivers = benefit.productBenefitDrivers.map(
      (driver) => {
        const scoredDriver = selectProductBenefitDriver([driver]);
        return serializeProductBenefitDriver(
          driver,
          scoredDriver?.productBenefitScore
        );
      }
    );
    const productBenefitDriver = selectedProductBenefitDriver
      ? serializeProductBenefitDriver(
          selectedProductBenefitDriver,
          selectedProductBenefitDriver.productBenefitScore
        )
      : null;

    return {
      id: benefit.id,
      label: benefit.label,
      icon: benefit.icon,
      activeIngredientBenefitScore: Number.isFinite(benefit.score)
        ? benefit.score
        : null,
      productBenefitScore: productBenefitDriver?.productBenefitScore ?? null,
      score: Number.isFinite(benefit.score) ? benefit.score : null,
      evidenceItems: benefit.evidenceItems,
      evidence_source: evidenceSourceUrls[0] ?? null,
      evidence_source_urls: evidenceSourceUrls,
      referenceItems: mergeReferenceItems(benefit.referenceItems),
      ...(productBenefitDrivers.length ? { productBenefitDrivers } : {}),
      ...(productBenefitDriver
        ? {
            productBenefitDriver,
            // Compatibility alias for locally persisted Phase 1 payloads.
            scanSupportDriver: productBenefitDriver,
          }
        : {}),
    };
  });
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
        trimString(match?.normalizedDose?.ingredientName) ||
        trimString(match?.ingredientName) ||
        trimString(match?.ingredientRaw) ||
        catalogName ||
        "Matched ingredient",
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
  const compatibleScoredIngredients = scoredMatchedIngredients.filter(
    (match) => match?.canonicalIdentityCompatible !== false,
  );
  const productScore = buildProductEvidenceScoreData(
    compatibleScoredIngredients,
  );
  const mergedBenefits = mergeBenefits(
    compatibleScoredIngredients,
    supplementsByCatalogId
  );

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
      compatibleScoredIngredients,
      supplementsByCatalogId
    ),
    supplement_benefits: mergedBenefits,
    referenceItems: buildSupplementReferenceItems(mergedBenefits),
    matchedIngredients: buildMatchedIngredientsPayload(
      scoredDisplayIngredients,
      supplementsByCatalogId
    ),
    serving_size_text: trimString(servingSizeText) || null,
    how_to_use: buildSectionBody(
      compatibleScoredIngredients,
      supplementsByCatalogId,
      "how_to_use"
    ),
    what_is_it: buildSectionBody(
      compatibleScoredIngredients,
      supplementsByCatalogId,
      "what_is_it"
    ),
    why_use_it: buildSectionBody(
      compatibleScoredIngredients,
      supplementsByCatalogId,
      "why_use_it"
    ),
    risks_and_interactions: buildSectionBody(
      compatibleScoredIngredients,
      supplementsByCatalogId,
      "risks_and_interactions"
    ),
  };
}
