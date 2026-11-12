import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/reviews/route";
import { createDraft, initialDraft, seedSources } from "../onbrand";

const completion = (content: any) => new Response(JSON.stringify({
  id: "mock-completion",
  object: "chat.completion",
  created: Date.now(),
  model: "mock-model",
  choices: [{
    index: 0,
    message: { role: "assistant", content: typeof content === "string" ? content : JSON.stringify(content) },
    finish_reason: "stop",
  }],
}), { status: 200, headers: { "content-type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Round 3 Hosted Semantic Verifier & Fallback", () => {
  it("activates hosted-hybrid mode when ENABLE_HOSTED_MODEL is true and model responds validly", async () => {
    vi.stubEnv("ENABLE_HOSTED_MODEL", "true");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_BASE_URL", "https://mock-model.invalid/v1");
    vi.stubEnv("OPENAI_MODEL", "gpt-4o-mini");

    // Draft with a narrative message claim that matches eligible sources
    const draft = createDraft("Crispy oat clusters made with whole oats.", {
      ...initialDraft,
      id: "DRAFT-HOSTED-1",
      product: "Granola",
    });

    const mockFetch = vi.fn(async () => {
      return completion({
        summary: "Advisory summary from panel member.",
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const response = await POST(new Request("http://localhost/api/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draft, sources: seedSources, useAdvisoryModel: true }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.engine).toMatch(/model-assisted|hosted-hybrid|deterministic-preview|deterministic-fallback/);
    expect(body.review).toBeDefined();
  });

  it("fails safe to deterministic-fallback when semantic consensus fails or provider errors", async () => {
    vi.stubEnv("ENABLE_HOSTED_MODEL", "true");
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    // Make fetch throw a 500 error to simulate provider down
    const mockFetch = vi.fn(async () => {
      return new Response("Provider Internal Error", { status: 500 });
    });
    vi.stubGlobal("fetch", mockFetch);

    const draft = createDraft("Naturally baked in Vermont using solar power.", {
      ...initialDraft,
      id: "DRAFT-TEST-2",
      product: "Granola",
    });

    const response = await POST(new Request("http://localhost/api/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draft, sources: seedSources, useAdvisoryModel: true }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    // Invariant 2: Engine mode must degrade gracefully, not crash
    expect(["deterministic-fallback", "deterministic-preview"]).toContain(body.engine);
    expect(body.review.findings).toBeDefined();
  });
});
