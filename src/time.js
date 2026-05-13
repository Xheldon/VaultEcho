export function buildDailyWrite(operation, dailyNote) {
  const parts = getDateTimeParts(operation.at || new Date(), dailyNote.timeZone);
  const slot = pickTimeSlot(dailyNote.slots, parts.minutesOfDay);
  const content = normalizeContent(operation.content);
  const templateVars = { ...parts, content };

  return {
    path: renderTemplate(operation.pathTemplate || dailyNote.pathTemplate, templateVars),
    heading: operation.heading || slot.heading,
    headingLevel: operation.headingLevel || dailyNote.headingLevel,
    linePattern: operation.linePattern || dailyNote.linePattern,
    content: renderTemplate(operation.lineFormat || dailyNote.lineFormat, templateVars),
    timestamp: `${parts.HH}:${parts.mm}`,
    slot: slot.heading,
    at: parts.isoLike
  };
}

export function getDateTimeParts(input, timeZone) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${input}`);
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );

  const yyyy = parts.year;
  const MM = parts.month;
  const dd = parts.day;
  const HH = parts.hour;
  const mm = parts.minute;

  return {
    yyyy,
    MM,
    dd,
    HH,
    mm,
    "yyyy-MM-dd": `${yyyy}-${MM}-${dd}`,
    "HH:mm": `${HH}:${mm}`,
    minutesOfDay: Number(HH) * 60 + Number(mm),
    isoLike: `${yyyy}-${MM}-${dd}T${HH}:${mm}:00`
  };
}

export function pickTimeSlot(slots, minutesOfDay) {
  for (const slot of slots) {
    const start = parseMinutes(slot.start);
    const end = parseMinutes(slot.end);
    if (start <= end && minutesOfDay >= start && minutesOfDay <= end) {
      return slot;
    }
    if (start > end && (minutesOfDay >= start || minutesOfDay <= end)) {
      return slot;
    }
  }

  throw new Error("No daily note slot matches the current time");
}

export function renderTemplate(template, values) {
  return template.replace(/\{\{\s*([\w:-]+)\s*\}\}/g, (match, key) => {
    if (values[key] === undefined) return match;
    return String(values[key]);
  });
}

function parseMinutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function normalizeContent(value) {
  if (typeof value !== "string") return String(value ?? "").trim();
  const content = value.trim();
  if (!content) {
    throw new Error("content is required");
  }
  return content;
}
