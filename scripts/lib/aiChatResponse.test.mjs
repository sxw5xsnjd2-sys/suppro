import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function extractConst(source, constName) {
  const signature = `const ${constName} =`;
  const start = source.indexOf(signature);

  if (start < 0) {
    throw new Error(`Could not find const ${constName}`);
  }

  let end = source.indexOf(";\n", start);
  while (end >= 0 && source.slice(start, end).split("[").length !== source.slice(start, end).split("]").length) {
    end = source.indexOf(";\n", end + 2);
  }

  if (end < 0) {
    throw new Error(`Could not parse const ${constName}`);
  }

  return source.slice(start, end + 1);
}

function extractExportedFunction(source, functionName) {
  const signature = `export function ${functionName}`;
  const start = source.indexOf(signature);

  if (start < 0) {
    throw new Error(`Could not find exported function ${functionName}`);
  }

  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let end = -1;

  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        end = index + 1;
        break;
      }
    }
  }

  if (end < 0) {
    throw new Error(`Could not parse exported function ${functionName}`);
  }

  return source.slice(start, end);
}

function loadAiChatResponseHelpers() {
  const source = readFileSync(
    new URL("../../src/lib/aiChatResponse.js", import.meta.url),
    "utf8"
  );
  const patternsSource = extractConst(
    source,
    "RANKING_TABLE_REFERENCE_PATTERNS"
  );
  const stripBasicMarkdownSource = extractExportedFunction(
    source,
    "stripBasicMarkdown"
  ).replace("export function", "function");
  const sanitizeAiChatReplySource = extractExportedFunction(
    source,
    "sanitizeAiChatReply"
  ).replace("export function", "function");

  return new Function(
    `${patternsSource}\n${stripBasicMarkdownSource}\n${sanitizeAiChatReplySource}\nreturn { sanitizeAiChatReply, stripBasicMarkdown };`
  )();
}

const { sanitizeAiChatReply, stripBasicMarkdown } =
  loadAiChatResponseHelpers();

test("strips basic markdown formatting from chat text", () => {
  assert.equal(
    stripBasicMarkdown("**Sleep** support with `magnesium` and __glycine__"),
    "Sleep support with magnesium and glycine"
  );
});

test("removes ranking table references from assistant replies", () => {
  assert.equal(
    sanitizeAiChatReply(
      "The most evidence-backed supplements for Sleep support are magnesium and glycine. For more information, find our Sleep support ranking table here: /benefit-ranking?label=Sleep%20support"
    ),
    "The most evidence-backed supplements for Sleep support are magnesium and glycine."
  );
});
