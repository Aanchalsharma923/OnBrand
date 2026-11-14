import { describe, expect, it } from "vitest";
import { createDemoSessionToken, verifyDemoSessionToken } from "./demo-session";
import { POST as postDemoAuth } from "@/app/api/auth/demo/route";
import { resolveTenantContext, resolveAuthenticatedUser, ForbiddenError, UnauthorizedError, DEMO_ORGS } from "./auth";

describe("Phase 1 — Judge Access & Demo Isolation (Part C)", () => {
  it("generates and verifies tamper-evident demo session tokens for all 3 demo roles", () => {
    const roles = ["creator", "reviewer", "maintainer"] as const;

    for (const role of roles) {
      const token = createDemoSessionToken(role, DEMO_ORGS.ALPHA.id);
      expect(token.startsWith(`demo.${role}.${DEMO_ORGS.ALPHA.id}`)).toBe(true);

      const verified = verifyDemoSessionToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.role).toBe(role);
      expect(verified?.organizationId).toBe(DEMO_ORGS.ALPHA.id);
      expect(verified?.userId).toBe(`user-alpha-${role}`);
      expect(verified?.displayName).toContain(role.charAt(0).toUpperCase() + role.slice(1));
    }
  });

  it("rejects tampered demo session tokens", () => {
    const validToken = createDemoSessionToken("reviewer", DEMO_ORGS.ALPHA.id);

    // Tamper with the role in payload
    const tamperedToken = validToken.replace(".reviewer.", ".maintainer.");
    const result = verifyDemoSessionToken(tamperedToken);
    expect(result).toBeNull();

    // Tamper with signature
    const corruptedSig = validToken.slice(0, -6) + "000000";
    const corruptedResult = verifyDemoSessionToken(corruptedSig);
    expect(corruptedResult).toBeNull();
  });

  it("POST /api/auth/demo provides 1-click server-verified judge access", async () => {
    const req = new Request("http://localhost/api/auth/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "creator", org: "alpha" }),
    });

    const res = await postDemoAuth(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.user.role).toBe("creator");
    expect(body.user.id).toBe("user-alpha-creator");
    expect(body.organization.id).toBe(DEMO_ORGS.ALPHA.id);
    expect(body.organization.slug).toBe("acme-foods");
    expect(body.token).toBeDefined();
    expect(body.token.startsWith("demo.creator.")).toBe(true);
  });

  it("server enforces strict demo isolation: demo accounts CANNOT access customer organizations", async () => {
    const demoToken = createDemoSessionToken("creator", DEMO_ORGS.ALPHA.id);
    const privateCustomerOrgId = "99999999-8888-7777-6666-555555555555";

    // Demo user attempts to supply a private customer organization header
    const req = new Request("http://localhost/api/drafts", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${demoToken}`,
        "x-onbrand-tenant": privateCustomerOrgId, // Customer organization
      },
    });

    await expect(resolveTenantContext(req)).rejects.toThrow(ForbiddenError);
  });

  it("server resolves demo user identity and role from verified demo token", async () => {
    const demoToken = createDemoSessionToken("reviewer", DEMO_ORGS.ALPHA.id);

    const req = new Request("http://localhost/api/reviews", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${demoToken}`,
      },
    });

    const ctx = await resolveTenantContext(req);
    expect(ctx.role).toBe("reviewer");
    expect(ctx.organizationId).toBe(DEMO_ORGS.ALPHA.id);
    expect(ctx.userId).toBe("user-alpha-reviewer");

    const authUser = await resolveAuthenticatedUser(req);
    expect(authUser.id).toBe("user-alpha-reviewer");
    expect(authUser.metadata?.isDemo).toBe(true);
  });
});
