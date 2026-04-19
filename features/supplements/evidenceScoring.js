const BLEND_CORE_INGREDIENT_LIMIT = 3;
const BLEND_CORE_WEIGHT = 0.8;
const BLEND_TAIL_WEIGHT = 0.2;

function computeMean(values) {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function computeBlendEvidenceScore(values) {
  const scores = (values ?? [])
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => right - left);

  if (!scores.length) {
    return null;
  }

  if (scores.length <= BLEND_CORE_INGREDIENT_LIMIT) {
    return computeMean(scores);
  }

  // Keep a few core actives responsible for most of the blend score.
  const coreScores = scores.slice(0, BLEND_CORE_INGREDIENT_LIMIT);
  const tailScores = scores.slice(BLEND_CORE_INGREDIENT_LIMIT);
  const coreMean = computeMean(coreScores);
  const tailMean = computeMean(tailScores);

  if (!Number.isFinite(tailMean)) {
    return coreMean;
  }

  return coreMean * BLEND_CORE_WEIGHT + tailMean * BLEND_TAIL_WEIGHT;
}
