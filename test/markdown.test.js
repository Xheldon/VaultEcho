import assert from "node:assert/strict";
import test from "node:test";
import { appendToHeading, createSafeLineRegex, insertAfterLastMatchingLine } from "../src/markdown.js";

test("insertAfterLastMatchingLine inserts below the final timestamp in a heading", () => {
  const input = "# Daily\n\n## Noon\n[12:01] A\n[12:20] B\n\n## Evening\nLater\n";
  const output = insertAfterLastMatchingLine(input, {
    heading: "Noon",
    headingLevel: 2,
    linePattern: "^\\[\\d{2}:\\d{2}\\]",
    content: "[12:34] C"
  });

  assert.equal(output, "# Daily\n\n## Noon\n[12:01] A\n[12:20] B\n[12:34] C\n\n## Evening\nLater\n");
});

test("insertAfterLastMatchingLine inserts directly below heading when no match exists", () => {
  const input = "# Daily\n\n## Noon\nNo timestamp yet\n";
  const output = insertAfterLastMatchingLine(input, {
    heading: "Noon",
    linePattern: "^\\[\\d{2}:\\d{2}\\]",
    content: "[12:34] First"
  });

  assert.equal(output, "# Daily\n\n## Noon\n[12:34] First\nNo timestamp yet\n");
});

test("appendToHeading creates the heading when it is missing", () => {
  const output = appendToHeading("# Daily\n", {
    heading: "Noon",
    content: "[12:34] New"
  });

  assert.equal(output, "# Daily\n\n## Noon\n[12:34] New\n");
});

test("insertAfterLastMatchingLine can keep blank lines around timestamp entries", () => {
  const input = "# Daily\n\n## Afternoon\n[16:18] A\n";
  const output = insertAfterLastMatchingLine(input, {
    heading: "Afternoon",
    linePattern: "^\\[\\d{2}:\\d{2}\\]",
    content: "[16:21] B",
    blankLineBetweenEntries: true
  });

  assert.equal(output, "# Daily\n\n## Afternoon\n[16:18] A\n\n[16:21] B\n");
});

test("createSafeLineRegex rejects nested repetition patterns", () => {
  assert.throws(() => createSafeLineRegex("(a+)+$"), /nested repetition/);
});
