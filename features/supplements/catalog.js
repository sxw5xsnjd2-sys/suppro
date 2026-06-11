export const CATALOG_TYPES = {
  ACTIVE_INGREDIENT: "active_ingredient",
  SUPPLEMENT_PRODUCT: "supplement_product",
  CUSTOM: "custom",
  LEGACY_CUSTOM: "legacy_custom",
};

export const SUPPLEMENT_PRODUCT_PREFIX = "product:";
export const CUSTOM_SUPPLEMENT_PREFIX = "custom:";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function createSupplementProductCatalogId(productId) {
  const cleanId = trimString(productId);
  return cleanId ? `${SUPPLEMENT_PRODUCT_PREFIX}${cleanId}` : "";
}

export function createCustomSupplementCatalogId(customSupplementId) {
  const cleanId = trimString(customSupplementId);
  return cleanId ? `${CUSTOM_SUPPLEMENT_PREFIX}${cleanId}` : "";
}

export function isSupplementProductCatalogId(value) {
  return trimString(value).startsWith(SUPPLEMENT_PRODUCT_PREFIX);
}

export function isCustomSupplementCatalogId(value) {
  return trimString(value).startsWith(CUSTOM_SUPPLEMENT_PREFIX);
}

export function isLegacyCustomCatalogId(value) {
  const id = trimString(value);
  return Boolean(id && (id.startsWith("user-") || id.startsWith("custom-")));
}

export function isActiveIngredientCatalogId(value) {
  const id = trimString(value);
  return Boolean(
    id &&
      !isSupplementProductCatalogId(id) &&
      !isCustomSupplementCatalogId(id) &&
      !isLegacyCustomCatalogId(id)
  );
}

export function getCatalogType(value) {
  if (isSupplementProductCatalogId(value)) {
    return CATALOG_TYPES.SUPPLEMENT_PRODUCT;
  }

  if (isCustomSupplementCatalogId(value)) {
    return CATALOG_TYPES.CUSTOM;
  }

  if (isLegacyCustomCatalogId(value)) {
    return CATALOG_TYPES.LEGACY_CUSTOM;
  }

  if (isActiveIngredientCatalogId(value)) {
    return CATALOG_TYPES.ACTIVE_INGREDIENT;
  }

  return null;
}

export function getCatalogEntityId(value) {
  const id = trimString(value);

  if (!id) {
    return "";
  }

  if (isSupplementProductCatalogId(id)) {
    return id.slice(SUPPLEMENT_PRODUCT_PREFIX.length);
  }

  if (isCustomSupplementCatalogId(id)) {
    return id.slice(CUSTOM_SUPPLEMENT_PREFIX.length);
  }

  return id;
}
