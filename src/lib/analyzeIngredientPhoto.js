import {
  ImageManipulator,
  SaveFormat,
} from "expo-image-manipulator";
import { toByteArray } from "base64-js";
import { decode } from "jpeg-js";
import { evaluateIngredientPhotoPixels } from "./photoCaptureQuality";

const ANALYSIS_THUMBNAIL_WIDTH = 256;

export async function analyzeIngredientPhoto(photo) {
  if (typeof photo?.uri !== "string" || !photo.uri) {
    throw new TypeError("The captured photo URI is unavailable.");
  }

  const context = ImageManipulator.manipulate(photo.uri);
  context.resize({ width: ANALYSIS_THUMBNAIL_WIDTH });
  let image;
  let thumbnail;
  try {
    image = await context.renderAsync();
    thumbnail = await image.saveAsync({
      base64: true,
      compress: 0.82,
      format: SaveFormat.JPEG,
    });
  } finally {
    image?.release();
    context.release();
  }
  const thumbnailBase64 =
    typeof thumbnail?.base64 === "string" ? thumbnail.base64 : "";
  if (!thumbnailBase64) {
    throw new Error("The quality analysis thumbnail is unavailable.");
  }

  const decoded = decode(toByteArray(thumbnailBase64), {
    useTArray: true,
    formatAsRGBA: true,
    tolerantDecoding: true,
    maxResolutionInMP: 1,
    maxMemoryUsageInMB: 16,
  });

  return evaluateIngredientPhotoPixels(decoded);
}
