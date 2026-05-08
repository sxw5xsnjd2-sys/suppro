import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadQueueMissingActiveIngredientsPolicyModule() {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/_shared/queue-missing-active-ingredients-policy.js",
      import.meta.url
    ),
    "utf8"
  );

  const transformed = source.replace(/export function /g, "function ");

  const factory = new Function(
    `${transformed}
return {
  validateQueueMissingActiveIngredientsRequest,
};`
  );

  return factory();
}

test("queue request validator normalizes and deduplicates ingredient names", () => {
  const { validateQueueMissingActiveIngredientsRequest } =
    loadQueueMissingActiveIngredientsPolicyModule();

  const result = validateQueueMissingActiveIngredientsRequest(
    JSON.stringify({
      productId: "prod_123",
      ingredients: [
        "Vitamin D3 1000 IU",
        { name: "vit. d3 (1000 IU)" },
        { canonicalName: "Magnesium glycinate 200mg" },
      ],
    })
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    productId: "prod_123",
    ingredients: [
      {
        normalized_name: "vitamin d3",
        display_name: "Vitamin D3 1000 IU",
      },
      {
        normalized_name: "magnesium glycinate",
        display_name: "Magnesium glycinate 200mg",
      },
    ],
  });
});

test("queue request validator rejects forbidden trusted fields", () => {
  const { validateQueueMissingActiveIngredientsRequest } =
    loadQueueMissingActiveIngredientsPolicyModule();

  const result = validateQueueMissingActiveIngredientsRequest(
    JSON.stringify({
      productId: "prod_123",
      ingredients: ["Ashwagandha"],
      trusted: true,
    })
  );

  assert.deepEqual(result, {
    ok: false,
    status: 400,
    body: {
      error: "Request contains unsupported fields.",
      code: "invalid_request_payload",
    },
  });
});

test("queue request validator rejects oversized payloads", () => {
  const { validateQueueMissingActiveIngredientsRequest } =
    loadQueueMissingActiveIngredientsPolicyModule();

  const longIngredient = "A".repeat(13_000);
  const result = validateQueueMissingActiveIngredientsRequest(
    JSON.stringify({
      productId: "prod_123",
      ingredients: [longIngredient],
    })
  );

  assert.deepEqual(result, {
    ok: false,
    status: 413,
    body: {
      error: "Request payload is too large.",
      code: "payload_too_large",
    },
  });
});
