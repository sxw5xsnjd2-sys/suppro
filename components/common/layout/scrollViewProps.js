const KEYBOARD_SHOULD_PERSIST_TAPS_VALUES = new Set([
  "always",
  "handled",
  "never",
]);

const KEYBOARD_DISMISS_MODE_VALUES = new Set([
  "interactive",
  "none",
  "on-drag",
]);

export function normalizeKeyboardShouldPersistTaps(value) {
  return KEYBOARD_SHOULD_PERSIST_TAPS_VALUES.has(value) ? value : undefined;
}

export function normalizeKeyboardDismissMode(value) {
  return KEYBOARD_DISMISS_MODE_VALUES.has(value) ? value : undefined;
}
