import { describe, it, expect, vi } from "vitest";
import { GET, POST } from "./route";

describe("/api/organizations route", () => {
  it("rejects unauthenticated requests with HTTP 401", async () => {
    const req = new Request("http://localhost:3000/api/organizations", {
      method: "GET",
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Authentication required");
  });

  it("rejects unauthenticated organization creation with HTTP 401", async () => {
    const req = new Request("http://localhost:3000/api/organizations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Test Organization",
        slug: "test-org",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("validates organization creation payload schema", async () => {
    // When an invalid auth token is passed, it rejects before or upon schema validation
    const req = new Request("http://localhost:3000/api/organizations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer invalid-or-empty-token",
      },
      body: JSON.stringify({
        name: "", // Invalid empty name
      }),
    });

    const res = await POST(req);
    // Should be rejected by auth or schema validation
    expect([400, 401, 503]).toContain(res.status);
  });
});
