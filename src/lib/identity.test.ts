import { describe, expect, it } from "vitest";
import { initialDraft, reviewDraft } from "./onbrand";
import { roleInitials, roleLabel, sanitizeReviewAttribution } from "./identity";

describe("public demo identity labels", () => {
  it("uses neutral labels and initials for each demo role", () => {
    expect(roleLabel("creator")).toBe("Content creator");
    expect(roleLabel("maintainer")).toBe("Knowledge maintainer");
    expect(roleLabel("reviewer")).toBe("Workspace reviewer");
    expect([roleInitials("creator"), roleInitials("maintainer"), roleInitials("reviewer")]).toEqual(["CC", "KM", "WR"]);
  });

  it("removes previously saved personal names from review attribution", () => {
    const review = reviewDraft({ draft: initialDraft });
    const sanitized = sanitizeReviewAttribution({
      ...review,
      assignedTo: "Aanchal Sharma",
      decision: { state: "APPROVED", by: "Aanchal Sharma · Reviewer", at: "2026-11-10T00:00:00.000Z", draftHash: review.draftHash },
      decisionHistory: [{ action: "DECISION_RECORDED", state: "APPROVED", by: "Aanchal Sharma · Reviewer", at: "2026-11-10T00:00:00.000Z", draftHash: review.draftHash, sourceSnapshotHash: review.sourceSnapshotHash }],
      comments: [
        { id: "c1", author: "Siddhesh Songare · Creator", text: "Please recheck this claim.", resolved: false, at: "2026-11-10T00:00:00.000Z" },
        { id: "c2", author: "Aanchal Sharma · Reviewer", text: "Evidence reviewed.", resolved: false, at: "2026-11-10T00:00:00.000Z" },
      ],
    });

    expect(JSON.stringify(sanitized)).not.toMatch(/Aanchal Sharma|Siddhesh Songare/);
    expect(sanitized.assignedTo).toBe("Workspace reviewer");
    expect(sanitized.comments.map((comment) => comment.author)).toEqual(["Content creator", "Workspace reviewer"]);
    expect(sanitized.decision?.by).toBe("Workspace reviewer");
    expect(sanitized.decisionHistory?.[0].by).toBe("Workspace reviewer");
  });
});
