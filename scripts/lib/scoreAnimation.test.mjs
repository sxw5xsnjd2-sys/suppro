import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadScoreAnimationModule() {
  const source = readFileSync(
    new URL("../../features/scanner/scoreAnimation.js", import.meta.url),
    "utf8",
  );
  const transformed = source.replace(/export function /gu, "function ");

  return new Function(
    `${transformed}\nreturn {
      buildScoreAnimationKey,
      getAnimatedScoreState,
      getScoreAnimationDecision,
    };`,
  )();
}

const detailSource = readFileSync(
  new URL("../../app/(modals)/modal/supplement-info.jsx", import.meta.url),
  "utf8",
);

test("hydration rerenders do not restart the same scan animation", () => {
  const { getScoreAnimationDecision } = loadScoreAnimationModule();
  const animationKey = "scan-request-1:product-1";

  assert.equal(
    getScoreAnimationDecision({
      animationKey,
      previousAnimationKey: "",
      score: 73,
      loaded: true,
    }),
    "start",
  );
  assert.equal(
    getScoreAnimationDecision({
      animationKey,
      previousAnimationKey: animationKey,
      score: 73,
      loaded: true,
    }),
    "ignore",
  );
});

test("background ingredient matching does not reset or restart the animation", () => {
  const { getScoreAnimationDecision } = loadScoreAnimationModule();
  const animationKey = "scan-request-1:product-1";

  assert.equal(
    getScoreAnimationDecision({
      animationKey,
      previousAnimationKey: animationKey,
      score: 73,
      loaded: true,
    }),
    "ignore",
  );
  assert.match(
    detailSource,
    /const isRepeatedLiveHydration =\s+isLiveScanSource &&\s+displayedHydrationKeyRef\.current === liveHydrationKey;\s+if \(!isRepeatedLiveHydration\)/u,
  );
});

test("animation waits for a hydrated finite score", () => {
  const { getScoreAnimationDecision } = loadScoreAnimationModule();

  assert.equal(
    getScoreAnimationDecision({
      animationKey: "scan-request-1:product-1",
      previousAnimationKey: "",
      score: null,
      loaded: false,
    }),
    "wait",
  );
  assert.equal(
    getScoreAnimationDecision({
      animationKey: "scan-request-1:product-1",
      previousAnimationKey: "",
      score: 73,
      loaded: true,
    }),
    "start",
  );
});

test("bar progress and displayed number share the same final score", () => {
  const { getAnimatedScoreState } = loadScoreAnimationModule();

  assert.deepEqual(getAnimatedScoreState(72.6, 1), {
    displayedScore: 73,
    barProgress: 0.73,
  });
});

test("a genuinely new product gets a new animation key", () => {
  const { buildScoreAnimationKey, getScoreAnimationDecision } =
    loadScoreAnimationModule();
  const firstKey = buildScoreAnimationKey({
    hydrationKey: "scan-request-1:product-1",
    source: "scanned",
    productId: "product-1",
  });
  const secondKey = buildScoreAnimationKey({
    hydrationKey: "scan-request-2:product-2",
    source: "scanned",
    productId: "product-2",
  });

  assert.notEqual(firstKey, secondKey);
  assert.equal(
    getScoreAnimationDecision({
      animationKey: secondKey,
      previousAnimationKey: firstKey,
      score: 81,
      loaded: true,
    }),
    "start",
  );
});

test("modal uses one UI-thread progress value and respects reduced motion", () => {
  assert.doesNotMatch(detailSource, /setDisplayedRating/u);
  assert.doesNotMatch(detailSource, /requestAnimationFrame\(tick\)/u);
  assert.match(detailSource, /const scoreAnimationProgress = useSharedValue\(0\)/u);
  assert.match(
    detailSource,
    /<ActiveIngredientSummaryHeader\s+progressValue=\{scoreAnimationProgress\}/u,
  );
  assert.match(
    detailSource,
    /<EvidenceRatingGauge\s+progressValue=\{scoreAnimationProgress\}/u,
  );
  assert.match(detailSource, /reduceMotion: ReduceMotion\.System/u);
  assert.match(detailSource, /score_became_ready/u);
  assert.match(detailSource, /score_animation_started/u);
  assert.match(detailSource, /score_animation_completed/u);
  assert.match(detailSource, /score_animation_duplicate_start_ignored/u);
});

test("gauge keeps its palette gradient but leaves the remainder grey", () => {
  assert.match(
    detailSource,
    /<Stop offset="0%" stopColor=\{palette\.accentColor\} \/>/u,
  );
  assert.match(
    detailSource,
    /<Stop offset="34%" stopColor=\{palette\.startColor\} \/>/u,
  );
  assert.match(
    detailSource,
    /<Stop offset="100%" stopColor=\{palette\.progressColor\} \/>/u,
  );
  assert.match(
    detailSource,
    /<Path\s+d=\{EVIDENCE_GAUGE_PATH\}\s+fill="none"\s+stroke=\{palette\.trackColor\}/u,
  );
  assert.match(
    detailSource,
    /<ReanimatedGaugePath\s+animatedProps=\{progressPathProps\}[\s\S]*?stroke="url\(#supplementGaugeGradient\)"[\s\S]*?strokeDasharray=/u,
  );
});
