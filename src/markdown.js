export function appendToHeading(markdown, options) {
  const { heading, headingLevel = 2, content, ifHeadingMissing = "create" } = options;
  const lines = splitLines(markdown);
  const section = findHeadingSection(lines, heading, headingLevel);

  if (!section) {
    if (ifHeadingMissing !== "create") {
      throw new Error(`Heading not found: ${heading}`);
    }

    const next = ensureTrailingBlank(lines);
    next.push(`${"#".repeat(headingLevel)} ${heading}`);
    next.push(content);
    return joinLines(next);
  }

  const next = [...lines];
  const insertAt = findSectionAppendIndex(lines, section);
  next.splice(insertAt, 0, content);
  return joinLines(next);
}

export function prependToHeading(markdown, options) {
  const { heading, headingLevel = 2, content, ifHeadingMissing = "create" } = options;
  const lines = splitLines(markdown);
  const section = findHeadingSection(lines, heading, headingLevel);

  if (!section) {
    if (ifHeadingMissing !== "create") {
      throw new Error(`Heading not found: ${heading}`);
    }

    const next = ensureTrailingBlank(lines);
    next.push(`${"#".repeat(headingLevel)} ${heading}`);
    next.push(content);
    return joinLines(next);
  }

  const next = [...lines];
  next.splice(section.start + 1, 0, content);
  return joinLines(next);
}

export function replaceHeadingContent(markdown, options) {
  const { heading, headingLevel = 2, content, ifHeadingMissing = "create" } = options;
  const lines = splitLines(markdown);
  const section = findHeadingSection(lines, heading, headingLevel);

  if (!section) {
    if (ifHeadingMissing !== "create") {
      throw new Error(`Heading not found: ${heading}`);
    }

    const next = ensureTrailingBlank(lines);
    next.push(`${"#".repeat(headingLevel)} ${heading}`);
    next.push(content);
    return joinLines(next);
  }

  const next = [...lines.slice(0, section.start + 1)];
  if (content) {
    next.push(...splitLines(content).filter((line, index, array) => {
      return index < array.length - 1 || line !== "";
    }));
  }
  next.push(...lines.slice(section.end));
  return joinLines(next);
}

export function getHeadingContent(markdown, options) {
  const { heading, headingLevel = 2 } = options;
  const lines = splitLines(markdown);
  const section = findHeadingSection(lines, heading, headingLevel);
  if (!section) return null;
  return lines.slice(section.start + 1, section.end).join("\n").replace(/\n+$/g, "");
}

export function insertAfterLastMatchingLine(markdown, options) {
  const {
    heading,
    headingLevel = 2,
    linePattern,
    content,
    ifHeadingMissing = "create",
    blankLineBetweenEntries = false,
    sortByTimestamp = false
  } = options;
  const regex = createSafeLineRegex(linePattern);
  const lines = splitLines(markdown);
  let section = findHeadingSection(lines, heading, headingLevel);

  if (!section) {
    if (ifHeadingMissing !== "create") {
      throw new Error(`Heading not found: ${heading}`);
    }

    const next = ensureTrailingBlank(lines);
    next.push(`${"#".repeat(headingLevel)} ${heading}`);
    if (blankLineBetweenEntries) next.push("");
    next.push(content);
    return joinLines(next);
  }

  let insertAt = section.start + 1;
  let previousEntryAt = section.start;
  let hasPreviousEntry = false;
  let existingSeparatorBeforeInsertion = false;

  const matchingIndices = [];
  for (let index = section.start + 1; index < section.end; index += 1) {
    if (regex.test(lines[index].slice(0, 1000))) {
      matchingIndices.push(index);
    }
  }

  // When sorting, anchor below the last entry whose timestamp is <= the new one
  // so it lands in chronological order; otherwise anchor below the final entry.
  const anchorIndex = sortByTimestamp
    ? findSortedAnchorIndex(lines, matchingIndices, content)
    : matchingIndices.length ? matchingIndices[matchingIndices.length - 1] : -1;

  if (anchorIndex !== -1) {
    previousEntryAt = anchorIndex;
    hasPreviousEntry = true;
    const insertionPoint = findEntryBlockInsertionPoint(lines, previousEntryAt, section.end, regex, {
      insertAfterBlankSeparator: blankLineBetweenEntries
    });
    insertAt = insertionPoint.insertAt;
    existingSeparatorBeforeInsertion = insertionPoint.hasExistingSeparator;
  } else if (sortByTimestamp && matchingIndices.length) {
    // The new entry is earlier than every existing entry: place it before the first block.
    insertAt = matchingIndices[0];
    existingSeparatorBeforeInsertion = blankLineBetweenEntries;
  } else if (blankLineBetweenEntries && lines[insertAt]?.trim() === "") {
    insertAt += 1;
    existingSeparatorBeforeInsertion = true;
  }

  const next = [...lines];
  const insertion = buildLineInsertion(lines, insertAt, content, {
    blankLineBetweenEntries,
    needsSeparatorBefore: hasPreviousEntry || insertAt === previousEntryAt + 1,
    existingSeparatorBeforeInsertion
  });
  next.splice(insertAt, 0, ...insertion);
  return joinLines(next);
}

export function upsertSeparatedHeadingEntries(markdown, options) {
  const {
    heading,
    headingLevel = 2,
    entries,
    linePattern,
    separator = "---",
    insertAfterHeading = "",
    insertAfterHeadingLevel = headingLevel,
    replaceExisting = false
  } = options;
  const contentEntries = Array.isArray(entries)
    ? entries.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [String(options.content || "").trim()].filter(Boolean);
  if (!contentEntries.length) {
    throw new Error("entries are required");
  }

  const regex = createSafeLineRegex(linePattern);
  const lines = splitLines(markdown);
  const section = findDelimitedHeadingSection(lines, heading, headingLevel, separator);

  if (section) {
    return rewriteSeparatedHeading(lines, section, contentEntries, regex, separator, replaceExisting);
  }

  const insertionIndex = findSeparatedHeadingInsertIndex(lines, {
    insertAfterHeading,
    insertAfterHeadingLevel,
    linePattern: regex
  });
  const insertion = buildSeparatedHeadingLines(contentEntries, {
    heading,
    headingLevel,
    separator,
    includeHeading: true
  });
  const next = [...lines];
  let replaceCount = 0;
  while (insertionIndex + replaceCount < next.length && next[insertionIndex + replaceCount].trim() === "") {
    replaceCount += 1;
  }
  next.splice(insertionIndex, replaceCount, ...insertion);
  return joinLines(collapseAdjacentSeparators(next, separator));
}

// A fresh separated block carries its own leading and trailing separator. When
// two such blocks sit next to each other (e.g. a sleep block beside a workout
// block) that produces two adjacent `---` rules; keep only one.
function collapseAdjacentSeparators(lines, separator) {
  const result = [];
  let lastNonBlankIsSeparator = false;
  for (const line of lines) {
    if (line.trim() === separator) {
      if (lastNonBlankIsSeparator) {
        while (result.length && result[result.length - 1].trim() === "") result.pop();
        continue;
      }
      lastNonBlankIsSeparator = true;
      result.push(line);
      continue;
    }
    if (line.trim() !== "") lastNonBlankIsSeparator = false;
    result.push(line);
  }
  return result;
}

export function createSafeLineRegex(pattern) {
  if (typeof pattern !== "string" || !pattern) {
    throw new Error("linePattern is required");
  }
  if (pattern.length > 120) {
    throw new Error("linePattern is too long");
  }
  if (/\\[1-9]/.test(pattern) || /\(\?<[!=]/.test(pattern)) {
    throw new Error("linePattern cannot use backreferences or lookbehind");
  }
  if (/\([^)]*[+*][^)]*\)\s*(?:[+*]|\{\d+,?\d*\})/.test(pattern)) {
    throw new Error("linePattern contains nested repetition");
  }

  try {
    return new RegExp(pattern);
  } catch (error) {
    throw new Error(`Invalid linePattern: ${error.message}`);
  }
}

export function getFrontmatterField(markdown, key) {
  const frontmatter = parseFrontmatter(markdown);
  if (!frontmatter) return null;
  for (const line of frontmatter.body.split("\n")) {
    const match = /^([^:#][^:]*):\s*(.*)$/.exec(line);
    if (match && match[1].trim() === key) {
      return match[2].trim();
    }
  }
  return null;
}

export function replaceFrontmatterField(markdown, key, value) {
  const frontmatter = parseFrontmatter(markdown);
  const normalizedValue = stringifyFrontmatterValue(value);

  if (!frontmatter) {
    return `---\n${key}: ${normalizedValue}\n---\n\n${markdown || ""}`.replace(/\n+$/g, "\n");
  }

  const lines = frontmatter.body.split("\n");
  let replaced = false;
  const next = lines.map((line) => {
    const match = /^([^:#][^:]*):\s*(.*)$/.exec(line);
    if (match && match[1].trim() === key) {
      replaced = true;
      return `${key}: ${normalizedValue}`;
    }
    return line;
  });

  if (!replaced) {
    next.push(`${key}: ${normalizedValue}`);
  }

  return `---\n${next.join("\n").replace(/\n+$/g, "")}\n---${frontmatter.rest}`;
}

export function applyFrontmatterFields(markdown, fields) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new Error("yaml/frontmatter must be an object");
  }

  let next = markdown;
  for (const [key, value] of Object.entries(fields)) {
    if (!key || value === undefined) continue;
    next = replaceFrontmatterField(next, key, value);
  }
  return next;
}

export function appendFrontmatterField(markdown, key, value, options = {}) {
  if (!key) throw new Error("key is required");
  if (value === undefined) throw new Error("value is required");
  const { unique = false, position = "end" } = options;

  if (hasBlockSequence(markdown, key)) {
    throw new Error(
      `Frontmatter field "${key}" uses a block-style list, which append does not support; store it as an inline array (key: [a, b]) instead.`
    );
  }

  const existing = parseInlineFrontmatterValue(getFrontmatterField(markdown, key));
  let items;
  if (existing === undefined) items = [];
  else if (Array.isArray(existing)) items = [...existing];
  else items = [existing];

  if (position === "start") items.unshift(value);
  else items.push(value);

  if (unique) {
    const seen = new Set();
    items = items.filter((item) => {
      const fingerprint = JSON.stringify(item);
      if (seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      return true;
    });
  }

  return replaceFrontmatterField(markdown, key, items);
}

export function findHeadingSection(lines, heading, headingLevel) {
  const target = normalizeHeadingText(heading);
  const marker = "#".repeat(headingLevel);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith(`${marker} `)) continue;

    const text = normalizeHeadingText(line.slice(marker.length).trim());
    if (text !== target) continue;

    let end = lines.length;
    for (let next = index + 1; next < lines.length; next += 1) {
      const match = /^(#{1,6})\s+/.exec(lines[next]);
      if (match && match[1].length <= headingLevel) {
        end = next;
        break;
      }
    }

    return { start: index, end };
  }

  return null;
}

function findDelimitedHeadingSection(lines, heading, headingLevel, separator) {
  const baseIndex = findBaseBlockIndex(lines);
  const section = findHeadingSectionBeforeIndex(
    lines,
    heading,
    headingLevel,
    baseIndex === -1 ? lines.length : baseIndex
  );
  if (!section) return null;

  const hardEnd = section.end;
  let contentEnd = hardEnd;
  let replaceEnd = hardEnd;
  for (let index = section.start + 1; index < hardEnd; index += 1) {
    if (lines[index]?.trim() !== separator) continue;
    contentEnd = index;
    replaceEnd = index + 1;
    while (replaceEnd < hardEnd && lines[replaceEnd]?.trim() === "") replaceEnd += 1;
    break;
  }

  return {
    start: section.start,
    contentEnd,
    replaceEnd
  };
}

function rewriteSeparatedHeading(lines, section, entries, regex, separator, replaceExisting = false) {
  const existingEntries = replaceExisting
    ? []
    : lines
        .slice(section.start + 1, section.contentEnd)
        .filter((line) => regex.test(line.slice(0, 1000)));
  const allEntries = uniqueSortedEntries([...existingEntries, ...entries]);
  const replacement = buildSeparatedHeadingLines(allEntries, {
    separator,
    includeHeading: false
  });
  const next = [...lines];
  next.splice(section.start + 1, section.replaceEnd - (section.start + 1), ...replacement);
  return joinLines(next);
}

function buildSeparatedHeadingLines(entries, options = {}) {
  const { heading, headingLevel = 2, separator = "---", includeHeading = true } = options;
  const body = [
    "",
    ...interleaveBlankLines(uniqueSortedEntries(entries)),
    "",
    separator,
    ""
  ];
  if (!includeHeading) return body;
  return [
    "",
    separator,
    "",
    `${"#".repeat(headingLevel)} ${heading}`,
    ...body
  ];
}

function interleaveBlankLines(entries) {
  return entries.flatMap((entry, index) => {
    if (index === entries.length - 1) return [entry];
    return [entry, ""];
  });
}

function uniqueSortedEntries(entries) {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    const normalized = entry.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(entry);
  }
  return result.sort((left, right) => entryMinutes(left) - entryMinutes(right));
}

function entryMinutes(entry) {
  const match = /^\[(\d{2}):(\d{2})\]/.exec(entry);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]) * 60 + Number(match[2]);
}

function findSortedAnchorIndex(lines, matchingIndices, content) {
  const newMinutes = entryMinutes(content);
  let anchor = -1;
  for (const index of matchingIndices) {
    if (entryMinutes(lines[index]) <= newMinutes) anchor = index;
  }
  return anchor;
}

function findSeparatedHeadingInsertIndex(lines, options) {
  const { insertAfterHeading, insertAfterHeadingLevel, linePattern } = options;
  const baseIndex = findBaseBlockIndex(lines);
  const limit = baseIndex === -1 ? lines.length : baseIndex;
  const target = insertAfterHeading
    ? findHeadingSectionBeforeIndex(lines, insertAfterHeading, insertAfterHeadingLevel, limit)
    : findLastHeadingSectionBeforeIndex(lines, insertAfterHeadingLevel, limit);
  if (!target) return trimTrailingIndex(lines, limit);

  let lastTimestamp = -1;
  for (let index = target.start + 1; index < target.end; index += 1) {
    if (linePattern.test(lines[index].slice(0, 1000))) lastTimestamp = index;
  }
  if (lastTimestamp === -1) return target.start + 1;

  let insertAt = lastTimestamp + 1;
  while (insertAt < target.end) {
    const line = lines[insertAt] || "";
    if (line.trim() === "") break;
    if (/^(#{1,6})\s+/.test(line)) break;
    if (linePattern.test(line.slice(0, 1000))) break;
    insertAt += 1;
  }
  return insertAt;
}

function findHeadingSectionBeforeIndex(lines, heading, headingLevel, limit) {
  const target = normalizeHeadingText(heading);
  const marker = "#".repeat(headingLevel);
  for (let index = 0; index < limit; index += 1) {
    const line = lines[index];
    if (!line.startsWith(`${marker} `)) continue;

    const text = normalizeHeadingText(line.slice(marker.length).trim());
    if (text !== target) continue;

    let end = limit;
    for (let next = index + 1; next < limit; next += 1) {
      const match = /^(#{1,6})\s+/.exec(lines[next]);
      if (match && match[1].length <= headingLevel) {
        end = next;
        break;
      }
    }
    return { start: index, end };
  }
  return null;
}

function findLastHeadingSectionBeforeIndex(lines, headingLevel, limit) {
  const marker = "#".repeat(headingLevel);
  for (let index = limit - 1; index >= 0; index -= 1) {
    if (!lines[index].startsWith(`${marker} `)) continue;
    return { start: index, end: limit };
  }
  return null;
}

function findBaseBlockIndex(lines) {
  const quoteIndex = lines.findIndex((line) => line.startsWith("> 下方的 Base 汇总"));
  if (quoteIndex !== -1) return quoteIndex;
  return lines.findIndex((line) => line.includes("![[日记.base]]"));
}

function trimTrailingIndex(lines, limit = lines.length) {
  let index = limit;
  while (index > 0 && lines[index - 1].trim() === "") index -= 1;
  return index;
}

function splitLines(markdown) {
  if (!markdown) return [];
  return markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function joinLines(lines) {
  return `${lines.join("\n").replace(/\n+$/g, "")}\n`;
}

function ensureTrailingBlank(lines) {
  const next = [...lines];
  while (next.length > 0 && next[next.length - 1].trim() === "") {
    next.pop();
  }
  if (next.length > 0) next.push("");
  return next;
}

function normalizeHeadingText(text) {
  return text.replace(/\s+#+\s*$/g, "").trim();
}

function findSectionAppendIndex(lines, section) {
  let index = section.end;
  while (index > section.start + 1 && lines[index - 1]?.trim() === "") {
    index -= 1;
  }
  return index;
}

function findEntryBlockInsertionPoint(lines, entryStart, sectionEnd, regex, options = {}) {
  const { insertAfterBlankSeparator = false } = options;
  let index = entryStart + 1;
  while (index < sectionEnd) {
    const line = lines[index] || "";
    if (line.trim() === "") {
      if (!insertAfterBlankSeparator) {
        return { insertAt: index, hasExistingSeparator: false };
      }

      const insertAt = index + 1;
      return { insertAt, hasExistingSeparator: true };
    }
    if (regex.test(line.slice(0, 1000))) {
      return { insertAt: index, hasExistingSeparator: false };
    }
    index += 1;
  }
  return { insertAt: index, hasExistingSeparator: false };
}

function buildLineInsertion(lines, insertAt, content, options) {
  const {
    blankLineBetweenEntries,
    needsSeparatorBefore,
    existingSeparatorBeforeInsertion
  } = options;

  if (!blankLineBetweenEntries) return [content];
  if (!existingSeparatorBeforeInsertion && needsSeparatorBefore) return ["", content];
  if (existingSeparatorBeforeInsertion && lines[insertAt]?.trim()) return [content, ""];
  return [content];
}

function parseFrontmatter(markdown) {
  const normalized = markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.startsWith("---\n")) return null;
  const end = normalized.indexOf("\n---", 4);
  if (end === -1) return null;
  const afterEnd = normalized.slice(end + 4);
  return {
    body: normalized.slice(4, end),
    rest: afterEnd.startsWith("\n") ? afterEnd : `\n${afterEnd}`
  };
}

function stringifyFrontmatterValue(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function parseInlineFrontmatterValue(raw) {
  if (raw === null || raw === undefined || raw === "") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// Detects a YAML block-style sequence under a key, e.g. `key:` followed by
// indented `- item` lines. The line-based reader cannot round-trip these, so
// callers reject them instead of silently corrupting the list.
function hasBlockSequence(markdown, key) {
  const frontmatter = parseFrontmatter(markdown);
  if (!frontmatter) return false;
  const lines = frontmatter.body.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([^:#][^:]*):\s*(.*)$/.exec(lines[index]);
    if (!match || match[1].trim() !== key) continue;
    if (match[2].trim() !== "") return false;
    for (let next = index + 1; next < lines.length; next += 1) {
      if (lines[next].trim() === "") continue;
      return /^\s+-\s/.test(lines[next]);
    }
    return false;
  }
  return false;
}
