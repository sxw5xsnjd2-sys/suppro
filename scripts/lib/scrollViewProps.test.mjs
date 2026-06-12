import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadScrollViewPropsModule() {
  const source = readFileSync(
    new URL("../../components/common/layout/scrollViewProps.js", import.meta.url),
    "utf8"
  );

  const transformed = source.replace(/\bexport\s+/g, "");
  const factory = new Function(
    `${transformed}
return { normalizeKeyboardShouldPersistTaps, normalizeKeyboardDismissMode };`
  );

  return factory();
}

const {
  normalizeKeyboardDismissMode,
  normalizeKeyboardShouldPersistTaps,
} = loadScrollViewPropsModule();

test("keeps valid ScrollView keyboard string props", () => {
  assert.equal(normalizeKeyboardShouldPersistTaps("handled"), "handled");
  assert.equal(normalizeKeyboardShouldPersistTaps("always"), "always");
  assert.equal(normalizeKeyboardDismissMode("interactive"), "interactive");
  assert.equal(normalizeKeyboardDismissMode("on-drag"), "on-drag");
});

test("omits booleans instead of passing them to native string props", () => {
  assert.equal(normalizeKeyboardShouldPersistTaps(false), undefined);
  assert.equal(normalizeKeyboardShouldPersistTaps(true), undefined);
  assert.equal(normalizeKeyboardDismissMode(false), undefined);
  assert.equal(normalizeKeyboardDismissMode(true), undefined);
});
