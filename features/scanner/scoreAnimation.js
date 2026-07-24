function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildScoreAnimationKey({
  hydrationKey,
  source,
  productId,
}) {
  const scanKey = trimString(hydrationKey);
  if (scanKey) {
    return scanKey;
  }

  const entityId = trimString(productId);
  if (!entityId) {
    return "";
  }

  return `${trimString(source) || "supplement"}:${entityId}`;
}

export function getScoreAnimationDecision({
  animationKey,
  previousAnimationKey,
  score,
  loaded,
}) {
  if (!loaded || !animationKey || !Number.isFinite(score)) {
    return "wait";
  }

  return animationKey === previousAnimationKey ? "ignore" : "start";
}

export function getAnimatedScoreState(score, progress) {
  const finalScore = Number.isFinite(score)
    ? Math.round(Math.max(0, Math.min(100, score)))
    : 0;
  const normalizedProgress = Number.isFinite(progress)
    ? Math.max(0, Math.min(1, progress))
    : 0;

  return {
    displayedScore: Math.round(finalScore * normalizedProgress),
    barProgress: (finalScore / 100) * normalizedProgress,
  };
}
