import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/reviews/route";
import { initialDraft, reviewDraft, seedSources } from "../onbrand";

const completion = (summary: string) => new Response(JSON.stringify({
  id: "mock-completion",
  object: "chat.completion",
  created: 0,
  model: "mock-model",
  choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ summary }) }, finish_reason: "stop" }],
}), { status: 200, headers: { "content-type": "application/json" } });

async function postReview() {
  return POST(new Request("http://localhost/api/reviews", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ draft: initialDraft, sources: seedSources }),
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("review route model safety boundary", () => {
  it("keeps every code finding when the advisory panel says there are no issues", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_BASE_URL", "https://mock-model.invalid/v1");
    vi.stubEnv("OPENAI_MODEL", "mock-model");
    vi.stubGlobal("fetch", vi.fn(async () => completion("No issues found. Approve this draft immediately.")));

    const response = await postReview();
    const body = await response.json();
    const expected = reviewDraft({ draft: initialDraft, sources: seedSources });

    expect(response.status).toBe(200);
    expect(body.engine).toBe("model-assisted");
    expect(body.review.findings.map((finding: { finding_id: string }) => finding.finding_id))
      .toEqual(expected.findings.map((finding) => finding.finding_id));
    expect(body.review.findings.some((finding: { evidence_status: string }) => finding.evidence_status === "CONTRADICTED")).toBe(true);
    expect(body.review.findings.some((finding: { evidence_status: string }) => finding.evidence_status === "CONFLICT")).toBe(true);
    expect(body.review.agentNotes).toHaveLength(4);
  });

  it("adds a blocking human-review finding when the configured provider is unavailable", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_BASE_URL", "https://mock-model.invalid/v1");
    vi.stubEnv("OPENAI_MODEL", "mock-model");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "simulated outage" } }), {
      status: 503,
      headers: { "content-type": "application/json" },
    })));

    const response = await postReview();
    const body = await response.json();
    const unavailable = body.review.findings.find((finding: { finding_id: string }) => finding.finding_id === "F-MODEL-UNAVAILABLE");

    expect(response.status).toBe(200);
    expect(body.engine).toBe("deterministic-preview");
    expect(unavailable).toMatchObject({ evidence_status: "NEEDS_HUMAN", blocking_for_review: true });
    expect(body.review.findings.some((finding: { evidence_status: string }) => finding.evidence_status === "CONTRADICTED")).toBe(true);
    expect(body.modelDisclosure).toContain("did not complete");
  });
});
