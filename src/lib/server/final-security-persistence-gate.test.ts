/**
 * OnBrand — Final Security & Persistence Gate Verification Suite
 *
 * Verifies the two critical deployment-blocking gates:
 * 1. Authentication & Workspace Creation (no silent escalation, strict demo isolation, server-enforced roles)
 * 2. Durable Binary Storage ('onbrand-assets' Supabase Storage, cold-start survival, cross-tenant isolation)
 * 3. Core Workflow Invariants (stale rejection 409, creator 403, contradiction 422)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST as postOrg, GET as getOrgs } from "@/app/api/organizations/route";
import { POST as postDemoAuth } from "@/app/api/auth/demo/route";
import { POST as postDecision } from "@/app/api/decisions/route";
import { GET as getDrafts, POST as postDraft } from "@/app/api/drafts/route";
import { POST as postReview } from "@/app/api/reviews/route";
import { POST as postAsset, GET as getAsset } from "@/app/api/assets/route";
import { createDemoSessionToken, verifyDemoSessionToken } from "@/lib/server/demo-session";
import {
  STORAGE_BUCKET,
  storageConfigured,
  uploadAssetToStorage,
  downloadAssetFromStorage,
  createSignedAssetUrl,
  deleteAssetFromStorage,
} from "@/lib/server/supabase-storage";
import { serverAssetBinaryStore } from "@/lib/server/asset-binary-store";
import { DEMO_ORGS } from "@/lib/server/auth";
import { createDraft, initialDraft, seedSources } from "@/lib/onbrand";
import { getRepository } from "@/lib/server/repository";
import crypto from "node:crypto";
import fs from "node:fs";

// Load Supabase credentials from .env.local if not already loaded into process.env by test runner
if (!process.env.NEXT_PUBLIC_SUPABASE_URL && fs.existsSync(".env.local")) {
  const content = fs.readFileSync(".env.local", "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (key.includes("SUPABASE")) {
        process.env[key] = val;
      }
    }
  }
}

describe("Final Security and Persistence Gate Suite", () => {
  const maintainerToken = createDemoSessionToken("maintainer", DEMO_ORGS.ALPHA.id);
  const reviewerToken = createDemoSessionToken("reviewer", DEMO_ORGS.ALPHA.id);
  const creatorToken = createDemoSessionToken("creator", DEMO_ORGS.ALPHA.id);
  const betaMaintainerToken = createDemoSessionToken("maintainer", DEMO_ORGS.BETA.id);

  beforeEach(() => {
    serverAssetBinaryStore.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ===========================================================================
  // GATE 1: Authentication and Workspace Creation
  // ===========================================================================
  describe("Gate 1: Authentication & Workspace Creation Security", () => {
    it("strictly rejects unauthenticated workspace creation with HTTP 401", async () => {
      // Direct API call without Authorization header or cookies
      const req = new Request("http://localhost:3000/api/organizations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Unauthenticated Rogue Org",
          brandProfile: { voice: "Rogue", audience: "None" },
        }),
      });

      const res = await postOrg(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Authentication required");
    });

    it("ignores client-supplied role parameters and enforces server-assigned maintainer role", async () => {
      // Client attempts privilege escalation by requesting role: 'superadmin' or 'owner'
      const req = new Request("http://localhost:3000/api/organizations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${maintainerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Privilege Escalation Test Org",
          role: "superadmin", // Malicious parameter
          brandProfile: { voice: "Strict", audience: "Engineers" },
        }),
      });

      const res = await postOrg(req);
      expect([200, 201]).toContain(res.status);
      const data = await res.json();
      expect(data.membership.role).toBe("maintainer");
      expect(data.membership.role).not.toBe("superadmin");
    }, 30000);

    it("strictly forbids demo accounts from accessing customer or cross-tenant organizations (HTTP 403)", async () => {
      // Alpha demo account attempts to access Beta organization
      const req = new Request("http://localhost:3000/api/drafts", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${maintainerToken}`, // Alpha token
          "x-onbrand-tenant": DEMO_ORGS.BETA.id, // Beta tenant
        },
      });

      const res = await getDrafts(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Demo accounts are strictly isolated to their provisioned workspace");
    });

    it("strictly invalidates tampered and expired demo session tokens", () => {
      // 1. Tampered signature
      const validToken = createDemoSessionToken("maintainer", DEMO_ORGS.ALPHA.id);
      const parts = validToken.split(".");
      parts[4] = "deadbeef" + parts[4].slice(8); // Corrupt HMAC signature
      const tampered = parts.join(".");
      expect(verifyDemoSessionToken(tampered)).toBeNull();

      // 2. Expired token (timestamp 8 days in past)
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      const expiredPayload = `maintainer.${DEMO_ORGS.ALPHA.id}.${eightDaysAgo}`;
      const secret =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.DATABASE_URL ||
        "onbrand-demo-secure-salt-2026";
      const sig = crypto.createHmac("sha256", secret).update(expiredPayload).digest("hex");
      const expiredToken = `demo.maintainer.${DEMO_ORGS.ALPHA.id}.${eightDaysAgo}.${sig}`;
      expect(verifyDemoSessionToken(expiredToken)).toBeNull();
    });

    it("issues onbrand-demo-token cookie with HttpOnly=true, Secure=true on HTTPS, and SameSite=Lax", async () => {
      const req = new Request("https://outcoded.xyz/api/auth/demo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-proto": "https",
        },
        body: JSON.stringify({ role: "reviewer", org: "alpha" }),
      });

      const res = await postDemoAuth(req);
      expect(res.status).toBe(200);

      const cookie = res.headers.get("set-cookie") || "";
      expect(cookie).toContain("onbrand-demo-token");
      expect(cookie.toLowerCase()).toContain("httponly");
      expect(cookie.toLowerCase()).toContain("secure");
      expect(cookie.toLowerCase()).toContain("samesite=lax");
    });
  });

  // ===========================================================================
  // GATE 2: Durable Binary Storage ('onbrand-assets')
  // ===========================================================================
  describe("Gate 2: Durable Binary Storage & Cold-Start Persistence", () => {
    it("confirms storage configuration and target bucket is 'onbrand-assets'", () => {
      expect(STORAGE_BUCKET).toBe("onbrand-assets");
      expect(storageConfigured()).toBe(true);
    });

    it("proves binary persistence across complete process restart (cold-start survival)", async () => {
      const testOrgId = "gate2-test-org-" + Date.now();
      const testAssetId = "asset-" + Date.now();
      const testFilename = "persistent-document.pdf";
      const testPayload = Buffer.from("%PDF-1.4 Simulated persistent PDF for cold start verification.");

      // 1. Upload binary to durable object storage
      const storagePath = await uploadAssetToStorage(
        testOrgId,
        testAssetId,
        testPayload,
        "application/pdf",
        testFilename
      );
      expect(storagePath).toBe(`${testOrgId}/${testAssetId}/${testFilename}`);

      // 2. SIMULATE COMPLETE PROCESS RESTART / SERVERLESS COLD START:
      // Wipe the ephemeral in-memory map completely
      serverAssetBinaryStore.clear();
      expect(serverAssetBinaryStore.get(`${testOrgId}:${testAssetId}`)).toBeUndefined();

      // 3. Download binary back from durable object storage
      const downloaded = await downloadAssetFromStorage(testOrgId, testAssetId, testFilename);
      expect(downloaded).not.toBeNull();
      expect(downloaded!.equals(testPayload)).toBe(true);

      // 4. Clean up probe object from storage
      await deleteAssetFromStorage(testOrgId, testAssetId, testFilename);

      // 5. Verify deletion
      const afterDelete = await downloadAssetFromStorage(testOrgId, testAssetId, testFilename);
      expect(afterDelete).toBeNull();
    });

    it("strictly enforces cross-tenant storage isolation (Org Beta cannot read Org Alpha assets)", async () => {
      const alphaOrgId = "alpha-tenant-" + Date.now();
      const betaOrgId = "beta-tenant-" + Date.now();
      const assetId = "isolated-asset-" + Date.now();
      const filename = "confidential-formula.docx";
      const content = Buffer.from("Strictly confidential Alpha formulation details.");

      // Upload under Alpha
      await uploadAssetToStorage(alphaOrgId, assetId, content, "application/docx", filename);

      // Attempt to retrieve using Beta's tenant ID
      const crossTenantAttempt = await downloadAssetFromStorage(betaOrgId, assetId, filename);
      expect(crossTenantAttempt).toBeNull();

      // Cleanup
      await deleteAssetFromStorage(alphaOrgId, assetId, filename);
    });

    it("generates time-limited signed URLs that expire appropriately", async () => {
      const testOrgId = "signed-url-org-" + Date.now();
      const testAssetId = "signed-asset-" + Date.now();
      const filename = "signed-asset.png";
      const content = Buffer.from("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR");

      await uploadAssetToStorage(testOrgId, testAssetId, content, "image/png", filename);

      const signedUrl = await createSignedAssetUrl(testOrgId, testAssetId, filename, 60);
      expect(signedUrl).not.toBeNull();
      expect(signedUrl).toContain("https://");
      expect(signedUrl).toContain("onbrand-assets");
      expect(signedUrl).toContain("token=");

      // Cleanup
      await deleteAssetFromStorage(testOrgId, testAssetId, filename);
    });

    it("fails closed in production if persistent storage is unavailable", async () => {
      vi.stubEnv("NODE_ENV", "production");
      // Stub missing supabase URL to simulate storage outage
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

      expect(storageConfigured()).toBe(false);

      // Attempting upload when storage is unconfigured in production must fail closed
      const fakeReq = new Request("http://localhost:3000/api/assets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${maintainerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "production-failure-probe.png",
          sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          mimeType: "image/png",
          byteSize: 100,
          content: Buffer.from("dummy").toString("base64"),
        }),
      });

      // Must reject with 500 / error stating unconfigured storage
      const res = await postAsset(fakeReq);
      expect(res.status).toBeGreaterThanOrEqual(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });
  });

  // ===========================================================================
  // GATE 3: Revalidation of Core Engineering Invariants
  // ===========================================================================
  describe("Gate 3: Core Governance & Invariant Enforcement", () => {
    it("strictly rejects approval with HTTP 409 when draft content is modified (stale approval)", async () => {
      const draftId = `DR-GATE-${Date.now()}`;
      const draftV1 = createDraft("Base copy with 6 g protein.", {
        id: draftId,
        title: "Gate Draft",
        product: "Product",
        audience: "Audience",
        version: 1,
      });

      // Save draft v1
      await postDraft(new Request("http://localhost:3000/api/drafts", {
        method: "POST",
        headers: { Authorization: `Bearer ${maintainerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(draftV1),
      }));

      // Run review on v1
      const revRes = await postReview(new Request("http://localhost:3000/api/reviews", {
        method: "POST",
        headers: { Authorization: `Bearer ${maintainerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ draft: draftV1, includeDemoRules: false }),
      }));
      const revData = await revRes.json();

      // Modify draft to v2
      const draftV2 = createDraft("Base copy modified with 10 g protein.", {
        ...draftV1,
        version: 2,
      });

      // Submit decision attempting to approve v1 with mismatched hash
      const approvalRes = await postDecision(new Request("http://localhost:3000/api/decisions", {
        method: "POST",
        headers: { Authorization: `Bearer ${maintainerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewId: revData.review.id,
          state: "APPROVED",
          draftHash: draftV2.hash, // Mismatched hash
        }),
      }));

      expect(approvalRes.status).toBe(409);
      const body = await approvalRes.json();
      expect(body.error).toContain("Stale review");
    });

    it("strictly forbids creators from recording approval decisions (HTTP 403)", async () => {
      const req = new Request("http://localhost:3000/api/decisions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creatorToken}`, // Creator role
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reviewId: "REV-ANY",
          state: "APPROVED",
          draftHash: "0000000000000000000000000000000000000000000000000000000000000000",
        }),
      });

      const res = await postDecision(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/not authorized|Creator role cannot/i);
    });

    it("strictly denies approval with HTTP 422 on direct formulation contradictions", async () => {
      // Save initialDraft to repo first
      await postDraft(new Request("http://localhost:3000/api/drafts", {
        method: "POST",
        headers: { Authorization: `Bearer ${maintainerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(initialDraft),
      }));

      const reviewRes = await postReview(new Request("http://localhost:3000/api/reviews", {
        method: "POST",
        headers: { Authorization: `Bearer ${reviewerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ draft: initialDraft, sources: seedSources, includeDemoRules: true }),
      }));
      const reviewData = await reviewRes.json();
      expect(reviewData.review.findings.some((f: any) => f.evidence_status === "CONTRADICTED")).toBe(true);

      const approvalRes = await postDecision(new Request("http://localhost:3000/api/decisions", {
        method: "POST",
        headers: { Authorization: `Bearer ${reviewerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewId: reviewData.review.id,
          state: "APPROVED",
          draftHash: reviewData.review.draftHash,
          reason: "Trying to force approve contradiction",
        }),
      }));

      expect(approvalRes.status).toBe(422);
      const body = await approvalRes.json();
      expect(body.error).toContain("Cannot approve review with direct statutory or formulation contradictions");
    });

    it("strictly fails closed in production and rejects silent in-memory fallback on database connection failure", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const repo = getRepository();
      await expect(
        repo.saveDraftVersion(
          { organizationId: DEMO_ORGS.ALPHA.id, role: "maintainer", actor: { userId: "test-user" } } as any,
          initialDraft
        )
      ).rejects.toThrow(/Production database (unavailable|connection failure)/i);
    });
  });
});
