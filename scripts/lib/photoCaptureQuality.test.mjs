import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL(
  "../../src/lib/photoCaptureQuality.js",
  import.meta.url,
);
const source = await readFile(sourceUrl, "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const {
  evaluateIngredientPhotoPixels,
  getIngredientCaptureGuideDimensions,
  getPhotoCaptureCameraConfig,
  getPhotoQualityRetakeMessage,
} = await import(moduleUrl);

function createRgbaImage(width, height, getLuminance) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = Math.max(
        0,
        Math.min(255, Math.round(getLuminance(x, y))),
      );
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { data, width, height };
}

function createClearLabel(width = 96, height = 128) {
  return createRgbaImage(width, height, (x, y) => {
    if (x < 7 || x >= width - 7 || y < 7 || y >= height - 7) return 205;
    const isTextRow = y % 8 === 2 || y % 8 === 3;
    const lineEnd = width - 12 - ((y * 7) % 23);
    return isTextRow && x >= 11 && x <= lineEnd ? 38 : 238;
  });
}

function boxBlur(image, radius, passes = 1) {
  let current = image;
  for (let pass = 0; pass < passes; pass += 1) {
    const { data, width, height } = current;
    current = createRgbaImage(width, height, (x, y) => {
      let total = 0;
      let count = 0;
      for (let sampleY = y - radius; sampleY <= y + radius; sampleY += 1) {
        for (let sampleX = x - radius; sampleX <= x + radius; sampleX += 1) {
          const boundedX = Math.max(0, Math.min(width - 1, sampleX));
          const boundedY = Math.max(0, Math.min(height - 1, sampleY));
          total += data[(boundedY * width + boundedX) * 4];
          count += 1;
        }
      }
      return total / count;
    });
  }
  return current;
}

test("ingredient and product camera configurations keep zoom scoped", () => {
  const ingredient = getPhotoCaptureCameraConfig("ingredients");
  const product = getPhotoCaptureCameraConfig("product");

  assert.equal(ingredient.facing, "back");
  assert.ok(ingredient.zoom >= 0.08 && ingredient.zoom <= 0.12);
  assert.equal(ingredient.zoomStrategy, "conservative_normalized_10_percent");
  assert.equal(product.zoom, 0);
  assert.equal(product.zoomStrategy, "unzoomed");
});

test("ingredient guide uses 88% of standard iPhone width and safe height", () => {
  const guide = getIngredientCaptureGuideDimensions({
    windowWidth: 393,
    windowHeight: 852,
    safeAreaTop: 59,
    safeAreaBottom: 34,
  });

  assert.equal(guide.width, 346);
  assert.equal(guide.height, 495);
  assert.equal(guide.safeHeight, 759);
  assert.ok(guide.width / 393 >= 0.85 && guide.width / 393 <= 0.9);
  assert.ok(guide.height / guide.safeHeight >= 0.65);
  assert.ok(guide.height / guide.safeHeight <= 0.7);
});

test("guide remains inside compact safe-area and control capacity", () => {
  const guide = getIngredientCaptureGuideDimensions({
    windowWidth: 320,
    windowHeight: 568,
    safeAreaTop: 20,
    safeAreaBottom: 0,
  });

  assert.ok(guide.width <= 320 - 32);
  assert.ok(guide.height <= guide.safeHeight - 244);
  assert.ok(guide.width > 0);
  assert.ok(guide.height > 0);
});

test("clear ingredient label pixels pass the conservative quality gate", () => {
  const result = evaluateIngredientPhotoPixels(createClearLabel());
  assert.equal(result.accepted, true);
  assert.equal(result.rejectionCategory, null);
});

test("clearly blurred ingredient label pixels fail", () => {
  const result = evaluateIngredientPhotoPixels(
    boxBlur(createClearLabel(), 5, 2),
  );
  assert.equal(result.accepted, false);
  assert.equal(result.rejectionCategory, "blur");
  assert.equal(
    getPhotoQualityRetakeMessage(result.rejectionCategory),
    "Photo is too blurry — please retake",
  );
});

test("severely underexposed ingredient pixels fail", () => {
  const result = evaluateIngredientPhotoPixels(
    createRgbaImage(96, 128, () => 11),
  );
  assert.equal(result.accepted, false);
  assert.equal(result.rejectionCategory, "underexposed");
});

test("severely overexposed ingredient pixels fail", () => {
  const result = evaluateIngredientPhotoPixels(
    createRgbaImage(96, 128, () => 252),
  );
  assert.equal(result.accepted, false);
  assert.equal(result.rejectionCategory, "overexposed");
});

test("high-contrast text on bright packaging is not mistaken for overexposure", () => {
  const result = evaluateIngredientPhotoPixels(
    createRgbaImage(96, 128, (x, y) => {
      const sparseText = y % 16 === 2 && x >= 10 && x <= 78;
      return sparseText ? 32 : 252;
    }),
  );
  assert.equal(result.accepted, true);
});

test("high-contrast text on dark packaging is not mistaken for underexposure", () => {
  const result = evaluateIngredientPhotoPixels(
    createRgbaImage(96, 128, (x, y) => {
      const sparseText = y % 16 === 2 && x >= 10 && x <= 78;
      return sparseText ? 238 : 14;
    }),
  );
  assert.equal(result.accepted, true);
});

test("borderline mild softness remains accepted", () => {
  const result = evaluateIngredientPhotoPixels(
    boxBlur(createClearLabel(), 1, 1),
  );
  assert.equal(result.accepted, true);
  assert.equal(result.rejectionCategory, null);
});
