export type TextLocation = { index: number; text: string; start: number; end: number };

export function mapSequentialTextLocations(
  entries: Array<{ index: number; text: string }>,
  fullText: string,
  separator: string,
): TextLocation[] {
  const locations: TextLocation[] = [];
  let cursor = 0;
  for (const entry of entries) {
    if (!entry.text) continue;
    const start = fullText.indexOf(entry.text, cursor);
    if (start < 0) continue;
    const end = start + entry.text.length;
    locations.push({ ...entry, start, end });
    cursor = end + separator.length;
  }
  return locations;
}

export function splitTextAtFindings(
  text: string,
  absoluteStart: number,
  ranges: Array<{ id: string; start: number; end: number }>,
) {
  const relevant = ranges
    .map((range) => ({ ...range, start: Math.max(0, range.start - absoluteStart), end: Math.min(text.length, range.end - absoluteStart) }))
    .filter((range) => range.start < range.end && range.end > 0 && range.start < text.length);
  const boundaries = [...new Set([0, text.length, ...relevant.flatMap(({ start, end }) => [start, end])])].sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1];
    return {
      text: text.slice(start, end),
      findingIds: relevant.filter((range) => range.start < end && range.end > start).map((range) => range.id),
    };
  }).filter((part) => part.text.length > 0);
}
