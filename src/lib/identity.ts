import type { Review, Role } from "./onbrand";

export function roleLabel(role: Role) {
  switch (role) {
    case "creator": return "Content creator";
    case "maintainer": return "Knowledge maintainer";
    default: return "Workspace reviewer";
  }
}

export function roleInitials(role: Role) {
  switch (role) {
    case "creator": return "CC";
    case "maintainer": return "KM";
    default: return "WR";
  }
}

function attributionLabel(value: string | undefined) {
  if (/creator/i.test(value ?? "")) return "Content creator";
  if (/maintainer/i.test(value ?? "")) return "Knowledge maintainer";
  return "Workspace reviewer";
}

/** Migrate old browser-saved demo reviews to role-only public attribution. */
export function sanitizeReviewAttribution(review: Review): Review {
  return {
    ...review,
    assignedTo: review.assignedTo ? "Workspace reviewer" : undefined,
    decision: review.decision ? { ...review.decision, by: "Workspace reviewer" } : undefined,
    decisionHistory: review.decisionHistory?.map((event) => ({ ...event, by: "Workspace reviewer" })),
    comments: review.comments.map((comment) => ({ ...comment, author: attributionLabel(comment.author) })),
  };
}
