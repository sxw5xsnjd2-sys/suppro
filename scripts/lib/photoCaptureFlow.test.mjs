import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [
  photoScreen,
  photoPage,
  rootLayout,
  scannerScreen,
  supplementInfoScreen,
  analyzerSource,
] =
  await Promise.all([
    readFile(
      new URL("../../app/scanner/photo-rescue.jsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../../app/photo-rescue.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/_layout.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/scanner/index.jsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../../app/(modals)/modal/supplement-info.jsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../../src/lib/analyzeIngredientPhoto.js", import.meta.url),
      "utf8",
    ),
  ]);

test("Improve with photos and Add with photos route through one capture screen", () => {
  assert.match(scannerScreen, /pathname:\s*"\/photo-rescue"/u);
  assert.match(scannerScreen, /entry:\s*"scanner_not_found"/u);
  assert.match(supplementInfoScreen, /pathname:\s*"\/photo-rescue"/u);
  assert.match(supplementInfoScreen, /entry:\s*"supplement_info"/u);
  assert.match(photoPage, /ScannerPhotoRescueScreen/u);
  assert.match(photoScreen, /getPhotoCaptureCameraConfig\(step\)/u);
  assert.match(photoScreen, /analyzeIngredientPhoto\(photo\)/u);
});

test("a barcode miss exposes Add with photos without AI-search loading copy", () => {
  assert.match(scannerScreen, /scannerStatus === "not_found"/u);
  assert.match(scannerScreen, /pathname:\s*"\/photo-rescue"/u);
  assert.match(scannerScreen, /entry:\s*"scanner_not_found"/u);
  assert.doesNotMatch(scannerScreen, /searching[^\n]*(?:openai|\bai\b|web)/iu);
});

test("photo capture is presented by the root navigator as a full page", () => {
  assert.match(
    rootLayout,
    /name="photo-rescue"[\s\S]*presentation: "fullScreenModal"/u,
  );
  assert.match(
    rootLayout,
    /name="photo-rescue"[\s\S]*gestureEnabled: false/u,
  );
});

test("quality rejection stays on the ingredient step before accepting photo", () => {
  const rejectionIndex = photoScreen.indexOf("if (!qualityResult.accepted)");
  const acceptanceIndex = photoScreen.indexOf("setIngredientsPhoto(nextPhoto)");

  assert.ok(rejectionIndex >= 0);
  assert.ok(acceptanceIndex > rejectionIndex);
  assert.match(
    photoScreen.slice(rejectionIndex, acceptanceIndex),
    /setQualityMessage[\s\S]*return;/u,
  );
});

test("accepted ingredient and product photos continue through existing workflow", () => {
  assert.match(photoScreen, /setIngredientsPhoto\(nextPhoto\)/u);
  assert.match(photoScreen, /enhanceScanWithPhotos\(\{/u);
  assert.match(photoScreen, /ingredientsPhoto,/u);
  assert.match(photoScreen, /productPhoto:\s*nextPhoto/u);
});

test("quality analysis uses only a temporary derivative and uploads originals", () => {
  assert.match(
    analyzerSource,
    /context\.resize\(\{ width: ANALYSIS_THUMBNAIL_WIDTH \}\)/u,
  );
  assert.match(analyzerSource, /image\?\.release\(\)/u);
  assert.match(analyzerSource, /context\.release\(\)/u);
  assert.match(photoScreen, /const nextPhoto = buildPhotoDataUrl\(photo\)/u);
  assert.doesNotMatch(photoScreen, /buildPhotoDataUrl\(thumbnail/u);
  assert.doesNotMatch(analyzerSource, /console\./u);
});

test("quality telemetry contains categories but no captured payload", () => {
  const timingStart = photoScreen.indexOf(
    'latencyTrace.start(\n          "ingredient_photo_quality_check"',
  );
  const imagePreparation = photoScreen.indexOf(
    'latencyTrace.start(\n        "client_image_preparation"',
  );
  const timingBlock = photoScreen.slice(timingStart, imagePreparation);

  assert.ok(timingStart >= 0);
  assert.ok(imagePreparation > timingStart);
  assert.match(timingBlock, /resultStatus/u);
  assert.doesNotMatch(timingBlock, /base64|uri|ocr|pixels|metrics/iu);
});

test("barcode preview resumes by remounting and never calls a stale native tag", () => {
  assert.doesNotMatch(scannerScreen, /resumePreview/u);
  assert.match(scannerScreen, /onCameraReady=\{handleScannerCameraReady\}/u);
  assert.match(
    scannerScreen,
    /key=\{isProcessingScan \? "scanner-paused" : "scanner-live"\}/u,
  );
});

test("barcode camera does not inherit photo-rescue zoom", () => {
  const cameraStart = scannerScreen.indexOf("<CameraView");
  const cameraEnd = scannerScreen.indexOf("/>", cameraStart);
  const scannerCamera = scannerScreen.slice(cameraStart, cameraEnd);

  assert.doesNotMatch(scannerCamera, /zoom=/u);
  assert.match(scannerCamera, /barcodeScannerSettings=/u);
});

test("photo controls and title reserve vertical separation", () => {
  assert.match(photoScreen, /paddingTop: safeAreaInsets\.top,/u);
  assert.match(
    photoScreen,
    /paddingBottom: safeAreaInsets\.bottom \+ spacing\.xl,/u,
  );
  assert.match(photoScreen, /numberOfLines=\{1\}/u);
  assert.match(photoScreen, /minimumFontScale=\{0\.78\}/u);
});
