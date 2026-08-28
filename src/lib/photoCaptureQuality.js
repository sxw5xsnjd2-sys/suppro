// Expo Camera exposes only a normalized share of each device's maximum zoom,
// not an optical multiplier. Ten percent is intentionally conservative while
// approximating the requested 1.5x view on typical multi-lens iPhones.
export const INGREDIENT_CAMERA_ZOOM = 0.1;
export const PRODUCT_CAMERA_ZOOM = 0;
export const INGREDIENT_GUIDE_WIDTH_RATIO = 0.88;
export const INGREDIENT_GUIDE_HEIGHT_RATIO = 0.67;

export const PHOTO_QUALITY_REJECTION = Object.freeze({
  blur: "blur",
  underexposed: "underexposed",
  overexposed: "overexposed",
});

const DEFAULT_THRESHOLDS = Object.freeze({
  darkLuminance: 24,
  brightLuminance: 246,
  underexposedMean: 38,
  underexposedFraction: 0.62,
  overexposedMean: 235,
  overexposedFraction: 0.62,
  minimumLaplacianVariance: 20,
  minimumEdgeFraction: 0.012,
});

const QUALITY_MESSAGES = Object.freeze({
  [PHOTO_QUALITY_REJECTION.blur]: "Photo is too blurry — please retake",
  [PHOTO_QUALITY_REJECTION.underexposed]:
    "Photo is too dark — please retake",
  [PHOTO_QUALITY_REJECTION.overexposed]:
    "Photo is too bright — please retake",
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getPhotoCaptureCameraConfig(step) {
  const isIngredients = step === "ingredients";

  return {
    facing: "back",
    zoom: isIngredients ? INGREDIENT_CAMERA_ZOOM : PRODUCT_CAMERA_ZOOM,
    zoomStrategy: isIngredients
      ? "conservative_normalized_10_percent"
      : "unzoomed",
  };
}

export function getIngredientCaptureGuideDimensions({
  windowWidth,
  windowHeight,
  safeAreaTop = 0,
  safeAreaBottom = 0,
}) {
  const width = Math.max(0, Number(windowWidth) || 0);
  const height = Math.max(0, Number(windowHeight) || 0);
  const safeHeight = Math.max(
    0,
    height -
      Math.max(0, Number(safeAreaTop) || 0) -
      Math.max(0, Number(safeAreaBottom) || 0),
  );
  const horizontalPadding = 16;
  const reservedVerticalSpace = safeHeight >= 700 ? 264 : 244;
  const availableWidth = Math.max(0, width - horizontalPadding * 2);
  const targetWidth = width * INGREDIENT_GUIDE_WIDTH_RATIO;
  const targetHeight = safeHeight * INGREDIENT_GUIDE_HEIGHT_RATIO;
  const availableHeight = Math.max(0, safeHeight - reservedVerticalSpace);

  return {
    width: Math.round(Math.min(targetWidth, availableWidth)),
    height: Math.round(Math.min(targetHeight, availableHeight)),
    safeHeight: Math.round(safeHeight),
  };
}

export function getPhotoQualityRetakeMessage(rejectionCategory) {
  return QUALITY_MESSAGES[rejectionCategory] ?? "";
}

function getPixelBounds(width, height) {
  const marginX = Math.floor(width * 0.06);
  const marginY = Math.floor(height * 0.06);

  return {
    startX: clamp(marginX, 0, Math.max(0, width - 1)),
    endX: clamp(width - marginX, 1, width),
    startY: clamp(marginY, 0, Math.max(0, height - 1)),
    endY: clamp(height - marginY, 1, height),
  };
}

function pixelLuminance(data, pixelIndex) {
  const offset = pixelIndex * 4;
  return (
    data[offset] * 0.2126 +
    data[offset + 1] * 0.7152 +
    data[offset + 2] * 0.0722
  );
}

export function evaluateIngredientPhotoPixels(
  { data, width, height },
  thresholds = DEFAULT_THRESHOLDS,
) {
  if (
    !data ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 8 ||
    height < 8 ||
    data.length < width * height * 4
  ) {
    throw new TypeError("A decoded RGBA image is required for quality checks.");
  }

  const limits = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const { startX, endX, startY, endY } = getPixelBounds(width, height);
  const analysisWidth = endX - startX;
  const analysisHeight = endY - startY;
  const luminance = new Float32Array(analysisWidth * analysisHeight);
  let luminanceTotal = 0;
  let luminanceSquaredTotal = 0;
  let darkPixels = 0;
  let brightPixels = 0;
  let sampleCount = 0;

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const value = pixelLuminance(data, y * width + x);
      luminance[(y - startY) * analysisWidth + (x - startX)] = value;
      luminanceTotal += value;
      luminanceSquaredTotal += value * value;
      darkPixels += value <= limits.darkLuminance ? 1 : 0;
      brightPixels += value >= limits.brightLuminance ? 1 : 0;
      sampleCount += 1;
    }
  }

  const meanLuminance = luminanceTotal / sampleCount;
  const luminanceVariance = Math.max(
    0,
    luminanceSquaredTotal / sampleCount - meanLuminance * meanLuminance,
  );
  const darkFraction = darkPixels / sampleCount;
  const brightFraction = brightPixels / sampleCount;

  let laplacianTotal = 0;
  let laplacianSquaredTotal = 0;
  let edgePixels = 0;
  let detailSampleCount = 0;

  for (let y = 1; y < analysisHeight - 1; y += 1) {
    for (let x = 1; x < analysisWidth - 1; x += 1) {
      const index = y * analysisWidth + x;
      const center = luminance[index];
      const laplacian =
        center * 4 -
        luminance[index - 1] -
        luminance[index + 1] -
        luminance[index - analysisWidth] -
        luminance[index + analysisWidth];
      const horizontalGradient = Math.abs(
        luminance[index + 1] - luminance[index - 1],
      );
      const verticalGradient = Math.abs(
        luminance[index + analysisWidth] -
          luminance[index - analysisWidth],
      );

      laplacianTotal += laplacian;
      laplacianSquaredTotal += laplacian * laplacian;
      edgePixels += horizontalGradient + verticalGradient >= 48 ? 1 : 0;
      detailSampleCount += 1;
    }
  }

  const laplacianMean = laplacianTotal / detailSampleCount;
  const laplacianVariance = Math.max(
    0,
    laplacianSquaredTotal / detailSampleCount -
      laplacianMean * laplacianMean,
  );
  const edgeFraction = edgePixels / detailSampleCount;
  const hasUsableExposureDetail =
    luminanceVariance >= 400 ||
    laplacianVariance >= limits.minimumLaplacianVariance ||
    edgeFraction >= limits.minimumEdgeFraction;

  let rejectionCategory = null;
  if (
    meanLuminance <= limits.underexposedMean &&
    darkFraction >= limits.underexposedFraction &&
    !hasUsableExposureDetail
  ) {
    rejectionCategory = PHOTO_QUALITY_REJECTION.underexposed;
  } else if (
    meanLuminance >= limits.overexposedMean &&
    brightFraction >= limits.overexposedFraction &&
    !hasUsableExposureDetail
  ) {
    rejectionCategory = PHOTO_QUALITY_REJECTION.overexposed;
  }

  if (
    !rejectionCategory &&
    laplacianVariance < limits.minimumLaplacianVariance &&
    edgeFraction < limits.minimumEdgeFraction
  ) {
    rejectionCategory = PHOTO_QUALITY_REJECTION.blur;
  }

  return {
    accepted: !rejectionCategory,
    rejectionCategory,
    metrics: {
      meanLuminance,
      luminanceVariance,
      darkFraction,
      brightFraction,
      laplacianVariance,
      edgeFraction,
    },
  };
}
