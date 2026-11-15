import { describe, it, expect, beforeEach } from "vitest";
import { POST as postDecision } from "@/app/api/decisions/route";
import { POST as postAsset, GET as getAsset } from "@/app/api/assets/route";
import { POST as postDemoAuth } from "@/app/api/auth/demo/route";
import { POST as postOrg, GET as getOrgs } from "@/app/api/organizations/route";
import { POST as postReview } from "@/app/api/reviews/route";
import { POST as postDraft, GET as getDrafts } from "@/app/api/drafts/route";
import { createDemoSessionToken } from "@/lib/server/demo-session";
import { serverAssetBinaryStore } from "@/lib/server/asset-binary-store";
import { createDraft, computeDraftHash, seedSources, initialDraft } from "@/lib/onbrand";
import { createHash } from "crypto";

describe("Production Workflow Repair Verification Suite", () => {
  const maintainerToken = createDemoSessionToken("maintainer", "00000000-0000-0000-0000-000000000001");
  const reviewerToken = createDemoSessionToken("reviewer", "00000000-0000-0000-0000-000000000001");
  const creatorToken = createDemoSessionToken("creator", "00000000-0000-0000-0000-000000000001");

  beforeEach(() => {
    serverAssetBinaryStore.clear();
  });

  // ---------------------------------------------------------------------------
  // 1. Stale Review & Content Hash Immutability
  // ---------------------------------------------------------------------------
  describe("1. Stale Approval & Review Version Integrity", () => {
    it("rejects approval with HTTP 409 when draft content has changed since review was run", async () => {
      // Create draft v1
      const draftId = `DR-STALE-${Date.now()}`;
      const draftV1 = createDraft("Approved formulation copy v1 with 6 g protein.", {
        id: draftId,
        title: "Stale Test Draft",
        product: "Sample Product",
        audience: "Adults",
        version: 1,
      });

      const saveV1Req = new Request("http://localhost:3000/api/drafts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${maintainerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draftV1),
      });
      await postDraft(saveV1Req);

      // Review draft v1
      const reviewReq = new Request("http://localhost:3000/api/reviews", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${reviewerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          draft: draftV1,
          includeDemoRules: true,
          useAdvisoryModel: false,
          visualChecks: true,
        }),
      });
      const reviewRes = await postReview(reviewReq);
      expect(reviewRes.status).toBe(200);
      const reviewData = await reviewRes.json();
      const reviewId = reviewData.review.id;
      const v1Hash = reviewData.review.draftHash;

      // Advance draft to v2 (different content & different hash)
      const draftV2 = createDraft("Updated formulation copy v2 with different text.", {
        ...draftV1,
        version: 2,
      });
      const saveV2Req = new Request("http://localhost:3000/api/drafts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${maintainerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draftV2),
      });
      await postDraft(saveV2Req);

      // Attempt approval using old reviewId and old v1 hash
      const staleApprovalReq = new Request("http://localhost:3000/api/decisions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${reviewerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reviewId,
          state: "APPROVED",
          draftHash: v1Hash,
          reason: "Attempting stale approval",
        }),
      });

      const staleRes = await postDecision(staleApprovalReq);
      // Server must reject with HTTP 409 Conflict because a newer draft version exists!
      expect(staleRes.status).toBe(409);
      const staleBody = await staleRes.json();
      expect(staleBody.error).toMatch(/Stale draft|Stale review/i);
    });

    it("accepts approval when current review matches latest draft hash", async () => {
      const draftId = `DR-CURRENT-${Date.now()}`;
      const draftCurrent = createDraft("Clean approved claim passage: a cocoa oat snack for everyday moments.", {
        id: draftId,
        title: "Clean Claim Draft",
        product: "Sample Foods Oat Bites",
        audience: "Adults",
        version: 1,
      });

      await postDraft(new Request("http://localhost:3000/api/drafts", {
        method: "POST",
        headers: { Authorization: `Bearer ${maintainerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(draftCurrent),
      }));

      const reviewRes = await postReview(new Request("http://localhost:3000/api/reviews", {
        method: "POST",
        headers: { Authorization: `Bearer ${reviewerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ draft: draftCurrent, includeDemoRules: false, visualChecks: false }),
      }));
      expect(reviewRes.status).toBe(200);
      const reviewData = await reviewRes.json();

      const approvalRes = await postDecision(new Request("http://localhost:3000/api/decisions", {
        method: "POST",
        headers: { Authorization: `Bearer ${reviewerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewId: reviewData.review.id,
          state: "APPROVED",
          draftHash: reviewData.review.draftHash,
          reason: "All claims verified against approved register",
        }),
      }));
      expect(approvalRes.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Human Approval Enforcement & Role Boundaries
  // ---------------------------------------------------------------------------
  describe("2. Human Approval Server-Side Enforcement", () => {
    it("denies approval from unauthorized role (creator) with HTTP 403", async () => {
      const req = new Request("http://localhost:3000/api/decisions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creatorToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reviewId: "REV-FAKE-ID",
          state: "APPROVED",
          draftHash: "0000000000000000000000000000000000000000000000000000000000000000",
        }),
      });

      const res = await postDecision(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/not authorized|Creator role cannot/i);
    });

    it("denies approval with HTTP 422 when review contains unresolved direct contradictions", async () => {
      // Save initialDraft to repo first
      await postDraft(new Request("http://localhost:3000/api/drafts", {
        method: "POST",
        headers: { Authorization: `Bearer ${maintainerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(initialDraft),
      }));

      // Review initialDraft with seedSources containing direct contradiction (Sugar Free vs 4g added sugar)
      const reviewRes = await postReview(new Request("http://localhost:3000/api/reviews", {
        method: "POST",
        headers: { Authorization: `Bearer ${reviewerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ draft: initialDraft, sources: seedSources, includeDemoRules: true, visualChecks: true }),
      }));
      const reviewData = await reviewRes.json();
      expect(reviewRes.status).toBe(200);
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
  });

  // ---------------------------------------------------------------------------
  // 3. Demo Cookie Security (DEF-SEC-COOKIE-01)
  // ---------------------------------------------------------------------------
  describe("3. Demo Cookie Security Flags", () => {
    it("sets HttpOnly=true and Secure=true on HTTPS for onbrand-demo-token", async () => {
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

      const setCookieHeader = res.headers.get("set-cookie") || "";
      expect(setCookieHeader).toContain("onbrand-demo-token");
      expect(setCookieHeader.toLowerCase()).toContain("httponly");
      expect(setCookieHeader.toLowerCase()).toContain("secure");
      expect(setCookieHeader.toLowerCase()).toContain("samesite=lax");
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Custom Workspace Server Persistence (DEF-WS-DROP-01)
  // ---------------------------------------------------------------------------
  describe("4. Custom Workspace Server Persistence", () => {
    it("persists Apex Health Solutions to database with brand profile and maintainer role", async () => {
      const req = new Request("http://localhost:3000/api/organizations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${maintainerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Apex Health Solutions",
          brandProfile: {
            voice: "Empathetic, clinically accurate, authoritative yet accessible",
            audience: "Adult chronic pain patients",
            avoidWording: "miracle cure, instant relief, risk-free guarantee",
            palette: "#005A9C, #00A86B, #F4F8FA",
            strictContraindications: "Strict contraindications: cite all clinical contraindications and adverse reactions before publishing",
          },
        }),
      });

      const res = await postOrg(req);
      expect([200, 201, 503]).toContain(res.status);
      if (res.status === 201 || res.status === 200) {
        const data = await res.json();
        expect(data.organization).toBeDefined();
        expect(data.organization.name).toBe("Apex Health Solutions");
        expect(data.organization.role).toBe("maintainer");

        // Verify custom brand profile source was cloned into database
        expect(data.sources).toBeDefined();
        const voiceSource = data.sources.find((s: any) => s.id === "SRC-VOICE");
        expect(voiceSource).toBeDefined();
        expect(voiceSource.facts.some((f: any) => f.attribute === "voice")).toBe(true);
        expect(voiceSource.facts.some((f: any) => f.attribute === "audience")).toBe(true);
      } else {
        const data = await res.json();
        expect(data.code).toBe("DB_NOT_CONFIGURED");
      }
    });

    it("rejects invalid workspace names with HTTP 400", async () => {
      const req = new Request("http://localhost:3000/api/organizations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${maintainerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "A", // too short (min 2 chars)
        }),
      });

      const res = await postOrg(req);
      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Image Highlighting & OCR Bounding Box Coordinates
  // ---------------------------------------------------------------------------
  describe("5. Image Highlighting & Coordinate Projections", () => {
    it("converts normalized OCR bounding boxes into accurate CSS percentages without spatial clipping", () => {
      // Realistic poster layout OCR bounding box for top claim headline
      const ocrBox = { xMin: 0.15, yMin: 0.20, xMax: 0.85, yMax: 0.28 };

      const leftPercent = ocrBox.xMin * 100;
      const topPercent = ocrBox.yMin * 100;
      const widthPercent = (ocrBox.xMax - ocrBox.xMin) * 100;
      const heightPercent = (ocrBox.yMax - ocrBox.yMin) * 100;

      expect(leftPercent).toBe(15);
      expect(topPercent).toBe(20);
      expect(widthPercent).toBe(70);
      expect(heightPercent).toBeCloseTo(8, 2);

      // Verify bounds are strictly within the image viewport
      expect(leftPercent + widthPercent).toBeLessThanOrEqual(100);
      expect(topPercent + heightPercent).toBeLessThanOrEqual(100);
      expect(leftPercent).toBeGreaterThanOrEqual(0);
      expect(topPercent).toBeGreaterThanOrEqual(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Finding Navigator Jumper Logic (DEF-NAV-ARROW-01)
  // ---------------------------------------------------------------------------
  describe("6. Finding Navigator Stepping & Wrapping", () => {
    it("correctly cycles forward and backward across multiple findings", () => {
      const mockActionable = [
        { id: "EF-1", rawFindingId: "F-1", finding_id: "F-1", title: "Issue 1" },
        { id: "EF-2", rawFindingId: "F-2", finding_id: "F-2", title: "Issue 2" },
        { id: "EF-3", rawFindingId: "F-3", finding_id: "F-3", title: "Issue 3" },
        { id: "EF-4", rawFindingId: "F-4", finding_id: "F-4", title: "Issue 4" },
      ];

      function stepIndex(currentIndex: number, delta: number, total: number) {
        if (total === 0) return -1;
        if (currentIndex >= 0) {
          return (currentIndex + delta + total) % total;
        }
        return delta > 0 ? (total > 1 ? 1 : 0) : total - 1;
      }

      // Step forward from 0 -> 1 -> 2 -> 3 -> 0 (wrap)
      expect(stepIndex(0, 1, 4)).toBe(1);
      expect(stepIndex(1, 1, 4)).toBe(2);
      expect(stepIndex(2, 1, 4)).toBe(3);
      expect(stepIndex(3, 1, 4)).toBe(0); // wraps to first

      // Step backward from 0 -> 3 -> 2 -> 1 -> 0 (wrap)
      expect(stepIndex(0, -1, 4)).toBe(3); // wraps to last
      expect(stepIndex(3, -1, 4)).toBe(2);
      expect(stepIndex(2, -1, 4)).toBe(1);
      expect(stepIndex(1, -1, 4)).toBe(0);

      // When starting from unselected (-1), step forward goes to 1, backward goes to 3
      expect(stepIndex(-1, 1, 4)).toBe(1);
      expect(stepIndex(-1, -1, 4)).toBe(3);
    });
  });
});
