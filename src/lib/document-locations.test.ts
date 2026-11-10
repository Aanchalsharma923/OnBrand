import { describe, expect, it } from "vitest";
import { mapSequentialTextLocations, splitTextAtFindings } from "./document-locations";

describe("document source location mapping", () => {
  it("maps repeated page phrases in order and keeps page indices", () => {
    expect(mapSequentialTextLocations([
      { index: 1, text: "Same phrase" },
      { index: 3, text: "Same phrase" },
    ], "Same phrase\n\nSame phrase", "\n\n")).toEqual([
      { index: 1, text: "Same phrase", start: 0, end: 11 },
      { index: 3, text: "Same phrase", start: 13, end: 24 },
    ]);
  });

  it("splits Unicode spans and represents overlapping findings", () => {
    expect(splitTextAtFindings("A 🥣 claim", 0, [
      { id: "one", start: 2, end: 5 },
      { id: "two", start: 4, end: 7 },
    ])).toEqual([
      { text: "A ", findingIds: [] },
      { text: "🥣", findingIds: ["one"] },
      { text: " ", findingIds: ["one", "two"] },
      { text: "cl", findingIds: ["two"] },
      { text: "aim", findingIds: [] },
    ]);
  });
});
