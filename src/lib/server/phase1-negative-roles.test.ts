import { describe, expect, it } from "vitest";
import { POST as postDecision } from "@/app/api/decisions/route";
import { POST as postSource, PATCH as patchSource } from "@/app/api/sources/route";
import { initialDraft, seedSources } from "@/lib/onbrand";

describe("Phase 1 — Negative Role Authorization Tests (Part F & I2)", () => {
  it("explicitly forbids Creator from approving content decisions", async () => {
    const req = new Request("http://localhost/api/decisions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-onbrand-role": "creator",
      },
      body: JSON.stringify({
        reviewId: "REV-PHASE1-CREATOR-FAIL",
        state: "APPROVED",
        draftHash: initialDraft.hash,
      }),
    });

    const res = await postDecision(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("is not authorized");
  });

  it("explicitly forbids Creator from importing or registering brand sources", async () => {
    const req = new Request("http://localhost/api/sources", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-onbrand-role": "creator",
      },
      body: JSON.stringify({
        ...seedSources[0],
        id: "SRC-CREATOR-ILLEGAL",
        title: "Creator Attempted Source",
      }),
    });

    const res = await postSource(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("is not authorized");
  });

  it("explicitly forbids Reviewer from importing knowledge sources", async () => {
    const req = new Request("http://localhost/api/sources", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-onbrand-role": "reviewer",
      },
      body: JSON.stringify({
        ...seedSources[0],
        id: "SRC-REVIEWER-ILLEGAL",
        title: "Reviewer Attempted Source",
      }),
    });

    const res = await postSource(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("is not authorized");
  });

  it("explicitly forbids Reviewer from approving or revoking knowledge sources", async () => {
    const req = new Request("http://localhost/api/sources", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-onbrand-role": "reviewer",
      },
      body: JSON.stringify({
        id: "SRC-PRODUCT",
        status: "REVOKED",
      }),
    });

    const res = await patchSource(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("is not authorized");
  });

  it("permits Maintainer to import and update knowledge sources", async () => {
    const req = new Request("http://localhost/api/sources", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-onbrand-role": "maintainer",
      },
      body: JSON.stringify({
        ...seedSources[0],
        id: "SRC-MAINTAINER-AUTHORIZED-1",
        title: "Authorized Packaging Standard",
      }),
    });

    const res = await postSource(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.source.id).toBe("SRC-MAINTAINER-AUTHORIZED-1");
  });

  it("ensures client-supplied role parameters in request body have zero effect on authorization", async () => {
    // Malicious user attempts privilege escalation by providing role in body
    const req = new Request("http://localhost/api/decisions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-onbrand-role": "creator",
      },
      body: JSON.stringify({
        reviewId: "REV-SPOOF-001",
        state: "APPROVED",
        draftHash: initialDraft.hash,
        role: "maintainer", // Malicious spoof in payload
        userRole: "maintainer",
      }),
    });

    const res = await postDecision(req);
    // Server rejects because server-derived role is creator
    expect(res.status).toBe(403);
  });
});
