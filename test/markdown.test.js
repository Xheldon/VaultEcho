import assert from "node:assert/strict";
import test from "node:test";
import { appendToHeading, createSafeLineRegex, insertAfterLastMatchingLine } from "../src/markdown.js";

test("insertAfterLastMatchingLine inserts below the final timestamp in a heading", () => {
  const input = "# Daily\n\n## 中午\n[12:01] A\n[12:20] B\n\n## 晚上\nLater\n";
  const output = insertAfterLastMatchingLine(input, {
    heading: "中午",
    headingLevel: 2,
    linePattern: "^\\[\\d{2}:\\d{2}\\]",
    content: "[12:34] C"
  });

  assert.equal(output, "# Daily\n\n## 中午\n[12:01] A\n[12:20] B\n[12:34] C\n\n## 晚上\nLater\n");
});

test("insertAfterLastMatchingLine inserts directly below heading when no match exists", () => {
  const input = "# Daily\n\n## 中午\nNo timestamp yet\n";
  const output = insertAfterLastMatchingLine(input, {
    heading: "中午",
    linePattern: "^\\[\\d{2}:\\d{2}\\]",
    content: "[12:34] First"
  });

  assert.equal(output, "# Daily\n\n## 中午\n[12:34] First\nNo timestamp yet\n");
});

test("appendToHeading creates the heading when it is missing", () => {
  const output = appendToHeading("# Daily\n", {
    heading: "中午",
    content: "[12:34] New"
  });

  assert.equal(output, "# Daily\n\n## 中午\n[12:34] New\n");
});

test("createSafeLineRegex rejects nested repetition patterns", () => {
  assert.throws(() => createSafeLineRegex("(a+)+$"), /nested repetition/);
});
