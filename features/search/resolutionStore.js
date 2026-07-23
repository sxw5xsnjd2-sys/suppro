import { create } from "zustand";
import { CATALOG_TYPES } from "@/features/supplements/catalog";

const MAX_TRANSIENT_RESOLUTIONS = 8;

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildIncompleteSearchResolutionPayload(product) {
  const name = trimString(product?.name);
  if (!name) return null;

  return {
    id: null,
    name,
    brand: trimString(product?.brand) || null,
    barcode: trimString(product?.barcode) || null,
    verified: false,
    catalogType: CATALOG_TYPES.SUPPLEMENT_PRODUCT,
    evidence_score: null,
    evidence: null,
    supplement_benefits: [],
    matchedIngredients: [],
    referenceItems: [],
    how_to_use: null,
    what_is_it: null,
    why_use_it: null,
    risks_and_interactions: null,
    verificationStatus:
      trimString(product?.verificationStatus) || "unverified",
    verification_status:
      trimString(product?.verificationStatus) || "unverified",
    scanDetailsIncomplete: true,
    searchResolutionIncomplete: true,
    sources: Array.isArray(product?.sources) ? product.sources : [],
  };
}

export const useSearchResolutionStore = create((set, get) => ({
  sessions: {},
  createSession(product) {
    const payload = buildIncompleteSearchResolutionPayload(product);
    if (!payload) return null;
    const sessionId = `search-resolution-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 9)}`;
    const current = get().sessions;
    const nextEntries = [
      [sessionId, { id: sessionId, createdAt: Date.now(), payload }],
      ...Object.entries(current),
    ].slice(0, MAX_TRANSIENT_RESOLUTIONS);
    set({ sessions: Object.fromEntries(nextEntries) });
    return sessionId;
  },
  getSession(sessionId) {
    return get().sessions[trimString(sessionId)] ?? null;
  },
  clearSession(sessionId) {
    const normalizedId = trimString(sessionId);
    if (!normalizedId) return;
    const sessions = { ...get().sessions };
    delete sessions[normalizedId];
    set({ sessions });
  },
}));
