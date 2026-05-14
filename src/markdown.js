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
    ifHeadingMissing = "create"
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
    next.push(content);
    return joinLines(next);
  }

  let insertAt = section.start + 1;
  for (let index = section.start + 1; index < section.end; index += 1) {
    if (regex.test(lines[index].slice(0, 1000))) {
      insertAt = index + 1;
    }
  }

  const next = [...lines];
  next.splice(insertAt, 0, content);
  return joinLines(next);
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
