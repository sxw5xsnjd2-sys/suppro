const RANKING_TABLE_REFERENCE_PATTERNS = [
  /\s*For more information,\s*find our [^.?!\n]*? ranking table(?: here)?(?::\s*\S+)?[.?!]?/gi,
  /\s*Find our [^.?!\n]*? ranking table(?: here)?(?::\s*\S+)?[.?!]?/gi,
  /\s*\/benefit-ranking\?label=[^\s)]+/gi,
  /\s*https?:\/\/[^\s]*benefit-ranking[^\s]*/gi,
];

export function stripBasicMarkdown(value) {
  if (typeof value !== "string" || !value) {
    return "";
  }

  return value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

export function sanitizeAiChatReply(value) {
  let next = stripBasicMarkdown(value);

  if (!next) {
    return "";
  }

  RANKING_TABLE_REFERENCE_PATTERNS.forEach((pattern) => {
    next = next.replace(pattern, "");
  });

  return next
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}
