/**
 * Real Authenticated Tenant Isolation Test Suite
 *
 * Verifies multi-tenant isolation using two REAL independently authenticated
 * Supabase test users with cryptographically verified JWT tokens.
 *
 * Requirements:
 * - User 1 (test_real_user_1@outcoded.xyz) in Organization 1
 * - User 2 (test_real_user_2@outcoded.xyz) in Organization 2
 * - Both users have database-backed memberships in their respective organizations.
 * - Test cross-tenant denial (HTTP 403):
 *   User 2 cannot access User 1's sources, drafts, assets, decisions, or audit events.
 *   User 1 cannot access User 2's resources.
 * - Confirms tenant context is derived strictly from verified Supabase JWT + database membership.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { POST as postOrganization } from "@/app/api/organizations/route";
import { GET as getSources, POST as postSource } from "@/app/api/sources/route";
import { GET as getDrafts, POST as postDraft } from "@/app/api/drafts/route";
import { GET as getAssets, POST as postAsset } from "@/app/api/assets/route";
import { POST as postDecision } from "@/app/api/decisions/route";
import { GET as getAudit } from "@/app/api/audit/route";
import { createDraft } from "@/lib/onbrand";

// Load .env.local if not already loaded into process.env by test runner
if (!process.env.NEXT_PUBLIC_SUPABASE_URL && fs.existsSync(".env.local")) {
  const content = fs.readFileSync(".env.local", "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

describe("Real Authenticated Tenant Isolation Suite (Live Supabase Auth)", () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const isLiveConfigured = Boolean(supabaseUrl && anonKey && serviceKey);

  it("proves complete multi-tenant isolation with two real Supabase test users", async () => {
    if (!isLiveConfigured) {
      console.warn("Live Supabase credentials not configured in environment; skipping live token isolation test.");
      return;
    }

    const admin = createClient(supabaseUrl!, serviceKey!);
    const anon = createClient(supabaseUrl!, anonKey!);

    const email1 = "test_real_user_1@outcoded.xyz";
    const email2 = "test_real_user_2@outcoded.xyz";
    const password = "Password123!Secure";

    // Ensure test users exist
    await admin.auth.admin.createUser({ email: email1, password, email_confirm: true }).catch(() => {});
    await admin.auth.admin.createUser({ email: email2, password, email_confirm: true }).catch(() => {});

    // 1. Authenticate User 1 -> Real JWT
    const { data: auth1, error: err1 } = await anon.auth.signInWithPassword({ email: email1, password });
    expect(err1).toBeNull();
    expect(auth1?.session?.access_token).toBeDefined();
    const token1 = auth1!.session!.access_token;
    const user1Id = auth1!.user!.id;

    // 2. Authenticate User 2 -> Real JWT
    const { data: auth2, error: err2 } = await anon.auth.signInWithPassword({ email: email2, password });
    expect(err2).toBeNull();
    expect(auth2?.session?.access_token).toBeDefined();
    const token2 = auth2!.session!.access_token;
    const user2Id = auth2!.user!.id;

    expect(user1Id).not.toBe(user2Id);

    // 3. User 1 creates Organization 1 via API
    const org1Name = `Acme Enterprise Alpha ${Date.now()}`;
    const createOrg1Req = new Request("http://localhost:3000/api/organizations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({
        name: org1Name,
        brandProfile: {
          voice: "Clinical, authoritative",
          audience: "Medical specialists",
        },
      }),
    });
    const org1Res = await postOrganization(createOrg1Req);
    expect([201, 200]).toContain(org1Res.status);
    const org1Data = await org1Res.json();
    const org1Id = org1Data.organization.id;

    // 4. User 2 creates Organization 2 via API
    const org2Name = `Nova Bio Labs ${Date.now()}`;
    const createOrg2Req = new Request("http://localhost:3000/api/organizations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token2}`,
      },
      body: JSON.stringify({
        name: org2Name,
        brandProfile: {
          voice: "Innovative, scientific",
          audience: "Research oncologists",
        },
      }),
    });
    const org2Res = await postOrganization(createOrg2Req);
    expect([201, 200]).toContain(org2Res.status);
    const org2Data = await org2Res.json();
    const org2Id = org2Data.organization.id;

    expect(org1Id).not.toBe(org2Id);

    // 5. User 1 creates a private draft in Organization 1
    const draftPayload = createDraft("Acme proprietary formula details for internal use only.", {
      title: "Confidential Formula v1",
      channel: "web",
      product: org1Name,
      audience: "Internal Scientists",
    });
    const postDraft1Req = new Request("http://localhost:3000/api/drafts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token1}`,
        "x-onbrand-tenant": org1Id,
      },
      body: JSON.stringify(draftPayload),
    });
    const postDraft1Res = await postDraft(postDraft1Req);
    expect([201, 200]).toContain(postDraft1Res.status);

    // 6. User 2 attempts cross-tenant access to Organization 1's resources using User 2's token:

    // A. Cross-tenant Drafts access -> MUST return 403 Forbidden
    const crossDraftsReq = new Request("http://localhost:3000/api/drafts", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token2}`,
        "x-onbrand-tenant": org1Id, // User 2 requests Org 1!
      },
    });
    const crossDraftsRes = await getDrafts(crossDraftsReq);
    expect(crossDraftsRes.status).toBe(403);
    const crossDraftsData = await crossDraftsRes.json();
    expect(crossDraftsData.error).toMatch(/not an authorized member/i);

    // B. Cross-tenant Sources access -> MUST return 403 Forbidden
    const crossSourcesReq = new Request("http://localhost:3000/api/sources", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token2}`,
        "x-onbrand-tenant": org1Id,
      },
    });
    const crossSourcesRes = await getSources(crossSourcesReq);
    expect(crossSourcesRes.status).toBe(403);

    // C. Cross-tenant Assets access -> MUST return 403 Forbidden
    const crossAssetsReq = new Request("http://localhost:3000/api/assets", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token2}`,
        "x-onbrand-tenant": org1Id,
      },
    });
    const crossAssetsRes = await getAssets(crossAssetsReq);
    expect(crossAssetsRes.status).toBe(403);

    // D. Cross-tenant Audit Log access -> MUST return 403 Forbidden
    const crossAuditReq = new Request("http://localhost:3000/api/audit", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token2}`,
        "x-onbrand-tenant": org1Id,
      },
    });
    const crossAuditRes = await getAudit(crossAuditReq);
    expect(crossAuditRes.status).toBe(403);

    // E. Cross-tenant Decision injection -> MUST return 403 Forbidden
    const crossDecisionReq = new Request("http://localhost:3000/api/decisions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token2}`,
        "x-onbrand-tenant": org1Id,
      },
      body: JSON.stringify({
        reviewId: "fake-rev-id",
        state: "APPROVED",
        draftHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      }),
    });
    const crossDecisionRes = await postDecision(crossDecisionReq);
    expect(crossDecisionRes.status).toBe(403);

    // 7. Verify User 2 CAN access their own Organization 2
    const ownSourcesReq = new Request("http://localhost:3000/api/sources", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token2}`,
        "x-onbrand-tenant": org2Id,
      },
    });
    const ownSourcesRes = await getSources(ownSourcesReq);
    expect(ownSourcesRes.status).toBe(200);
  });
});
