import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const detailSource = readFileSync(
  new URL("../../app/(modals)/modal/supplement-info.jsx", import.meta.url),
  "utf8",
);
const scannedPayloadSource = readFileSync(
  new URL(
    "../../features/scanner/buildScannedSupplementPayload.js",
    import.meta.url,
  ),
  "utf8",
);
const incompleteResolutionSource = readFileSync(
  new URL("../../features/search/resolutionStore.js", import.meta.url),
  "utf8",
);
const scannerSource = readFileSync(
  new URL("../../app/scanner/index.jsx", import.meta.url),
  "utf8",
);

test("product detail bars and labels use only canonical product-benefit helpers", () => {
  assert.match(detailSource, /function ProductBenefitScoreBar/u);
  assert.match(
    detailSource,
    /getProductBenefitScoreProgress\(productBenefitScore\)/u,
  );
  assert.match(
    detailSource,
    /formatProductBenefitScoreValue\(productBenefitScore\)/u,
  );
  assert.match(detailSource, /width: `\$\{progress \* 100\}%`/u);
  assert.match(
    detailSource,
    /\{scoreText\}[\s\S]*styles\.productBenefitScoreTrack/u,
  );
  assert.match(
    detailSource,
    /productBenefitScoreWrap: \{[\s\S]*gap: 4,/u,
  );
  assert.doesNotMatch(
    detailSource,
    /formatProductBenefitScoreText\(productBenefitScore\)/u,
  );
  assert.doesNotMatch(detailSource, /getScanBenefitProgress/u);
  assert.doesNotMatch(detailSource, /getScanBenefitDisplayScore/u);
  assert.doesNotMatch(detailSource, /compareScanBenefits/u);
});

test("product detail exposes canonical driver accessibility and deterministic ordering", () => {
  assert.match(
    detailSource,
    /getProductDetailBenefitAccessibilityLabel\(benefit\)/u,
  );
  assert.match(
    detailSource,
    /getProductDetailBenefitDriver\(benefit\)/u,
  );
  assert.match(
    detailSource,
    /return compareProductDetailBenefits\(left, right\)/u,
  );
  assert.match(
    detailSource,
    /getProductDetailBenefitContributors\(benefit\)[\s\S]*\.join\(", "\)/u,
  );
  assert.doesNotMatch(
    detailSource,
    /Driven by \$\{productBenefitDriver\.ingredientName\}/u,
  );
  assert.match(detailSource, /if \(snippets\.length\) \{\s*return snippets;/u);
  assert.match(detailSource, /return blocks\.length \? blocks : \[body\]/u);
  assert.doesNotMatch(detailSource, /snippets\.slice\(0, 3\)/u);
  assert.doesNotMatch(detailSource, /blocks\.slice\(0, 3\)/u);
  assert.match(
    detailSource,
    /\{open \? \([\s\S]*productBenefitContributorNames[\s\S]*evidenceSnippets\.map/u,
  );
});

test("overall evidence remains separate from product-benefit display", () => {
  assert.match(detailSource, /const rating = data\?\.evidence_score/u);
  assert.match(detailSource, /<EvidenceRatingGauge/u);
  assert.match(
    detailSource,
    /productBenefitDriver\?\.productBenefitScore \?\? null/u,
  );
});

test("missing product images use the muted pill placeholder", () => {
  assert.match(detailSource, /MaterialCommunityIcons/u);
  assert.match(detailSource, /name="pill"/u);
  assert.match(detailSource, /styles\.productImagePlaceholder/u);
  assert.match(
    detailSource,
    /productImagePlaceholder: \{[\s\S]*?backgroundColor: appTheme\.colors\.surfaceMuted,[\s\S]*?borderWidth: 0,/u,
  );
  assert.doesNotMatch(detailSource, /name="cube-outline"/u);
});

test("incomplete and no-ingredients payloads preserve unknown ratings as null", () => {
  assert.match(incompleteResolutionSource, /evidence_score: null/u);
  assert.match(incompleteResolutionSource, /supplement_benefits: \[\]/u);
  assert.match(scannedPayloadSource, /evidence_score: null/u);
  assert.doesNotMatch(scannedPayloadSource, /evidence_score: 0/u);
});

test("canonical detail hydration renders before non-blocking history persistence", () => {
  assert.match(
    detailSource,
    /async function persistHydratedCanonicalProductEvidence\(payload\)/u,
  );
  assert.match(
    detailSource,
    /await recordCanonicalProductEvidenceHistory\(\{[\s\S]*score: payload\.evidence_score,[\s\S]*calculatedAt: Date\.now\(\),[\s\S]*calculationVersion:/u,
  );
  assert.doesNotMatch(
    detailSource,
    /await persistHydratedCanonicalProductEvidence\(nextData\)/u,
  );
  const liveResultBlock = detailSource.slice(
    detailSource.indexOf("const loadLiveScanData"),
    detailSource.indexOf("if (isTrackedScannedSource)"),
  );
  assert.ok(liveResultBlock.indexOf("setData(result)") >= 0);
  assert.ok(
    liveResultBlock.indexOf("setData(result)") <
      liveResultBlock.indexOf("persistScanResultHistoryOnce(hydrationKey"),
  );
  assert.match(
    liveResultBlock,
    /persistScanResultHistoryOnce\(hydrationKey,[\s\S]*persistHydratedCanonicalProductEvidence\(nextData\)[\s\S]*\.catch\(/u,
  );
  assert.match(
    detailSource,
    /catch \(error\) \{\s*console\.warn\("Failed to update canonical product History evidence", error\);\s*\}/u,
  );
});

test("incomplete scanner results keep the warning and photo-rescue route", () => {
  assert.match(detailSource, /const SHOW_PROVISIONAL_DATA_WARNING = true;/u);
  assert.match(
    detailSource,
    /data\?\.scanDetailsIncomplete[\s\S]*SHOW_PROVISIONAL_DATA_WARNING && hasIncompleteDetailsWarning/u,
  );
  assert.match(
    detailSource,
    /const canImproveScanWithPhotos = Boolean\(\s*isLiveScanSource && isCurrentScanSession/u,
  );
  assert.match(detailSource, /pathname: "\/scanner\/photo-rescue"/u);
  assert.match(detailSource, /label="Improve with photos"/u);
});

test("scan-history persistence is detached from navigation and catches failures", () => {
  assert.doesNotMatch(scannerSource, /await saveUsableScanHistory\(/u);
  assert.equal(
    scannerSource.match(/saveUsableScanHistory\(\{[\s\S]*?\}\)\.catch\(/gu)
      ?.length,
    2,
  );
  assert.equal(scannerSource.match(/router\.push\(\{/gu)?.length >= 2, true);
});
