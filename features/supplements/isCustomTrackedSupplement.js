function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function isCustomTrackedSupplement(supplement) {
  if (!supplement || typeof supplement !== "object") {
    return false;
  }

  if (
    trimString(supplement.customSupplementId) ||
    trimString(supplement.custom_supplement_id)
  ) {
    return true;
  }

  if (trimString(supplement.catalogType) === "custom") {
    return true;
  }

  return [supplement.catalogId, supplement.id].some((value) =>
    trimString(value).startsWith("custom:")
  );
}
