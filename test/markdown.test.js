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

test("insertAfterLastMatchingLine reuses empty template spacing for the first timestamp", () => {
  const input = "# Daily\n\n## 上午\n\n\n## 下午\n";
  const first = insertAfterLastMatchingLine(input, {
    heading: "上午",
    linePattern: "^\\[\\d{2}:\\d{2}\\]",
    content: "[07:57] First",
    blankLineBetweenEntries: true
  });
  const second = insertAfterLastMatchingLine(first, {
    heading: "上午",
    linePattern: "^\\[\\d{2}:\\d{2}\\]",
    content: "[10:28] Second",
    blankLineBetweenEntries: true
  });

  assert.equal(first, "# Daily\n\n## 上午\n\n[07:57] First\n\n## 下午\n");
  assert.equal(second, "# Daily\n\n## 上午\n\n[07:57] First\n\n[10:28] Second\n\n## 下午\n");
});

test("insertAfterLastMatchingLine normalizes extra blank separators after existing timestamps", () => {
  const input = "# Daily\n\n## 上午\n\n[07:57] First\n\n\n## 下午\n";
  const output = insertAfterLastMatchingLine(input, {
    heading: "上午",
    linePattern: "^\\[\\d{2}:\\d{2}\\]",
    content: "[10:28] Second",
    blankLineBetweenEntries: true
  });

  assert.equal(output, "# Daily\n\n## 上午\n\n[07:57] First\n\n[10:28] Second\n\n## 下午\n");
});

test("insertAfterLastMatchingLine inserts after a multiline timestamp entry", () => {
  const input = "# Daily\n\n## Evening\n[23:22] First line\ncontinued line\nfinal line\n";
  const output = insertAfterLastMatchingLine(input, {
    heading: "Evening",
    linePattern: "^\\[\\d{2}:\\d{2}\\]",
    content: "[23:40] Next entry",
    blankLineBetweenEntries: true
  });

  assert.equal(
    output,
    "# Daily\n\n## Evening\n[23:22] First line\ncontinued line\nfinal line\n\n[23:40] Next entry\n"
  );
});

test("insertAfterLastMatchingLine inserts below an existing blank after multiline content", () => {
  const input = "# Daily\n\n## Noon\n[12:23] 内容带换行\n换行后的内容\n\n";
  const output = insertAfterLastMatchingLine(input, {
    heading: "Noon",
    linePattern: "^\\[\\d{2}:\\d{2}\\]",
    content: "[12:45] 新内容",
    blankLineBetweenEntries: true
  });

  assert.equal(output, "# Daily\n\n## Noon\n[12:23] 内容带换行\n换行后的内容\n\n[12:45] 新内容\n");
});

test("insertAfterLastMatchingLine stops multiline entry blocks at a blank line", () => {
  const input = "# Daily\n\n## Noon\n[12:23] 内容带换行\n换行后的内容\n\n没有时间戳的后续内容\n";
  const output = insertAfterLastMatchingLine(input, {
    heading: "Noon",
    linePattern: "^\\[\\d{2}:\\d{2}\\]",
    content: "[12:45] 新内容",
    blankLineBetweenEntries: true
  });

  assert.equal(
    output,
    "# Daily\n\n## Noon\n[12:23] 内容带换行\n换行后的内容\n\n[12:45] 新内容\n\n没有时间戳的后续内容\n"
  );
});

test("insertAfterLastMatchingLine keeps multiline entries before the next heading", () => {
  const input = "# Daily\n\n## Evening\n[23:22] First line\ncontinued line\n\n## Next\nText\n";
  const output = insertAfterLastMatchingLine(input, {
    heading: "Evening",
    linePattern: "^\\[\\d{2}:\\d{2}\\]",
    content: "[23:40] Next entry",
    blankLineBetweenEntries: true
  });

  assert.equal(
    output,
    "# Daily\n\n## Evening\n[23:22] First line\ncontinued line\n\n[23:40] Next entry\n\n## Next\nText\n"
  );
});

test("insertAfterLastMatchingLine sorts a new entry between existing timestamps", () => {
  const input = "# Daily\n\n## 昨夜凌晨\n\n[01:15] 长篇日记\n\n## 上午\n";
  const output = insertAfterLastMatchingLine(input, {
    heading: "昨夜凌晨",
    linePattern: "^\\[\\d{2}:\\d{2}\\]",
    content: "[00:30] #发推特 抽时间把博客加了四种语言",
    blankLineBetweenEntries: true,
    sortByTimestamp: true
  });

  assert.equal(
    output,
    "# Daily\n\n## 昨夜凌晨\n\n[00:30] #发推特 抽时间把博客加了四种语言\n\n[01:15] 长篇日记\n\n## 上午\n"
  );
});

test("insertAfterLastMatchingLine sorts a new entry after an earlier timestamp", () => {
  const input = "# Daily\n\n## Noon\n\n[12:01] A\n\n[12:40] C\n";
  const output = insertAfterLastMatchingLine(input, {
    heading: "Noon",
    linePattern: "^\\[\\d{2}:\\d{2}\\]",
    content: "[12:20] B",
    blankLineBetweenEntries: true,
    sortByTimestamp: true
  });

  assert.equal(output, "# Daily\n\n## Noon\n\n[12:01] A\n\n[12:20] B\n\n[12:40] C\n");
});

test("insertAfterLastMatchingLine sorts after the latest timestamp when newest", () => {
  const input = "# Daily\n\n## Noon\n\n[12:01] A\n\n[12:20] B\n";
  const output = insertAfterLastMatchingLine(input, {
    heading: "Noon",
    linePattern: "^\\[\\d{2}:\\d{2}\\]",
    content: "[12:45] C",
    blankLineBetweenEntries: true,
    sortByTimestamp: true
  });

  assert.equal(output, "# Daily\n\n## Noon\n\n[12:01] A\n\n[12:20] B\n\n[12:45] C\n");
});

test("insertAfterLastMatchingLine sorts around multiline timestamp blocks", () => {
  const input = "# Daily\n\n## Evening\n\n[23:22] First line\ncontinued line\n\n[23:50] Later entry\n";
  const output = insertAfterLastMatchingLine(input, {
    heading: "Evening",
    linePattern: "^\\[\\d{2}:\\d{2}\\]",
    content: "[23:40] Middle entry",
    blankLineBetweenEntries: true,
    sortByTimestamp: true
  });

  assert.equal(
    output,
    "# Daily\n\n## Evening\n\n[23:22] First line\ncontinued line\n\n[23:40] Middle entry\n\n[23:50] Later entry\n"
  );
});

test("createSafeLineRegex rejects nested repetition patterns", () => {
  assert.throws(() => createSafeLineRegex("(a+)+$"), /nested repetition/);
});
