import { describe, expect, it } from "vitest";
import { filterFindings } from "./onbrand";

const findings = [
  { id: "supported", evidence_status: "SUPPORTED" as const, blocking_for_review: false },
  { id: "partial", evidence_status: "PARTIALLY_SUPPORTED" as const, blocking_for_review: false },
  { id: "unverified", evidence_status: "NO_APPROVED_EVIDENCE" as const, blocking_for_review: true },
  { id: "human", evidence_status: "NEEDS_HUMAN" as const, blocking_for_review: true },
];

describe("finding filters", () => {
  it("returns all and supported findings accurately", () => {
    expect(filterFindings(findings, "all")).toEqual(findings);
    expect(filterFindings(findings, "supported").map(({ id }) => id)).toEqual(["supported"]);
  });

  it("separates review attention from blockers", () => {
    expect(filterFindings(findings, "attention").map(({ id }) => id)).toEqual(["partial", "unverified", "human"]);
    expect(filterFindings(findings, "blocking").map(({ id }) => id)).toEqual(["unverified", "human"]);
  });
});
