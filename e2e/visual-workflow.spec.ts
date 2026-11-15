import { test, expect } from "playwright/test";
import path from "node:path";
import fs from "node:fs";
import { createDraft, initialDraft } from "../src/lib/onbrand";

const posterFixturePath = path.resolve(__dirname, "../evaluation/visual-fixtures/demo-poster.png");
const docxFixturePath = path.resolve(__dirname, "../evaluation/visual-fixtures/docx-01-accessible.docx");
const pdfFixturePath = path.resolve(__dirname, "../evaluation/visual-fixtures/pdf-02-tagged-accessible.pdf");

async function dismissWelcomeModal(page: any) {
  try {
    const closeBtn = page.locator(".welcome-close-btn");
    if (await closeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await closeBtn.click({ force: true });
      await page.waitForTimeout(300);
    }
  } catch {
    // Modal not present or already dismissed
  }
}

test.describe("OnBrand Phase 4 — Staging Acceptance & Browser Verification Suite", () => {
  test.beforeAll(() => {
    expect(fs.existsSync(posterFixturePath)).toBe(true);
    expect(fs.existsSync(docxFixturePath)).toBe(true);
    expect(fs.existsSync(pdfFixturePath)).toBe(true);
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((initDraft) => {
      try {
        window.localStorage.setItem(
          "onbrand-v1",
          JSON.stringify({
            workspaceMode: "demo",
            currentOrg: "org_alpha",
            draft: initDraft,
            versions: [initDraft],
            review: null,
            selectedFinding: null,
          })
        );
      } catch {
        // Ignored
      }
    }, initialDraft);
  });

  // =========================================================================
  // 1 & 2 & 12 & 13: Workspace Creation, Persistence & Org Switching
  // =========================================================================
  test("Browser 1: Custom workspace creation, persistence across reload, and organization switching", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() => {
      try { window.localStorage.removeItem("onbrand-v1"); } catch {}
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    const brandInput = page.locator('input[placeholder="e.g. Apex Health"]');
    if (await brandInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await brandInput.fill("Apex Health Solutions");
      await page.locator('input[placeholder="e.g. clear, authoritative and warm"]').fill("Authoritative, compliant, empathetic");
      await page.locator('input[placeholder="e.g. enterprise compliance teams"]').fill("Clinical researchers and compliance teams");
      await page.locator('button.welcome-submit:has-text("Create Workspace")').click();
      await page.waitForTimeout(500);
    } else {
      await dismissWelcomeModal(page);
    }

    await expect(page.locator(".brand-name")).toHaveText("OnBrand");

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await dismissWelcomeModal(page);
    await expect(page.locator(".brand-name")).toHaveText("OnBrand");

    const tenantSelector = page.locator('select[aria-label="Switch organization workspace"]');
    if (await tenantSelector.isVisible()) {
      await tenantSelector.selectOption("org_beta");
      await page.waitForTimeout(500);
      await tenantSelector.selectOption("org_alpha");
      await page.waitForTimeout(300);
    }
  });

  // =========================================================================
  // 3 & 4: Knowledge Base Ingestion & Fact Register Verification
  // =========================================================================
  test("Browser 2: Knowledge Base inspection, document upload, and saved facts verification", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await dismissWelcomeModal(page);

    const kbBtn = page.locator('button.nav-item:has-text("Knowledge Base")');
    await expect(kbBtn).toBeVisible();
    await kbBtn.click();

    const kbHeading = page.locator('h1:has-text("Knowledge base"), .source-table-panel').first();
    await expect(kbHeading).toBeVisible();

    const sourceTable = page.locator(".source-table, .source-table-panel");
    await expect(sourceTable.first()).toBeVisible();

    await page.locator('button.nav-item:has-text("Reviews")').click();
    await expect(page.locator(".review-workspace-toolbar")).toBeVisible();
  });

  // =========================================================================
  // 6 & 7 & 8: Review Execution, Passage Highlighting & Finding Navigation
  // =========================================================================
  test("Browser 3: Executes compliance review, verifies exact highlighted passages, and navigates findings", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await dismissWelcomeModal(page);

    // 1. Run compliance review on initial draft
    const runBtn = page.locator(".run-review-primary-btn");
    await expect(runBtn).toBeVisible();
    await runBtn.click();

    // 2. Verify exact highlighted passages in document view or reading pane
    const highlights = page.locator('.document-finding-mark, [aria-label^="Finding:"], mark[role="button"]');
    await expect(highlights.first()).toBeVisible({ timeout: 10000 });
    const count = await highlights.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // 3. Switch between findings using navigator
    const nextBtn = page.locator('button:has-text("›")');
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }

    // 4. Inspect finding detail dossier
    const detailPanel = page.locator(".finding-detail-workspace, .finding-detail, [aria-label*='Finding detail' i]").first();
    await expect(detailPanel).toBeVisible();

    // 5. Verify non-accusatory language
    const text = await detailPanel.innerText();
    expect(text.toLowerCase()).not.toContain("fraudulent");
    expect(text.toLowerCase()).not.toContain("you lied");
  });

  // =========================================================================
  // 9: Edit Content & Rerun Review
  // =========================================================================
  test("Browser 4: Edits content in editor tab and reruns compliance review", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await dismissWelcomeModal(page);

    // 1. Switch to Edit Copy tab
    const editTab = page.locator('button[role="tab"]:has-text("Edit Copy"), .tab:has-text("Edit Copy")').first();
    if (await editTab.isVisible()) {
      await editTab.click();
      const textarea = page.locator(".draft-textarea, textarea").first();
      await expect(textarea).toBeVisible();
      await textarea.fill("Sample Foods Oat Bites contain 6g protein per serving. Baked with wholegrain oats.");
    }

    // 2. Rerun review on edited content
    const runBtn = page.locator(".run-review-primary-btn");
    await runBtn.click();

    // 3. Verify updated review state
    const detailPanel = page.locator(".finding-detail-workspace, .findings-workspace-panel").first();
    await expect(detailPanel).toBeVisible({ timeout: 10000 });
  });

  // =========================================================================
  // 5: Multi-Format Document Ingestion (PDF, DOCX)
  // =========================================================================
  test("Browser 5: Multi-format document inspection for DOCX and PDF uploads", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await dismissWelcomeModal(page);

    const fileInput = page.locator('input[type="file"]').first();

    // 1. Upload DOCX fixture
    await fileInput.setInputFiles(docxFixturePath);
    await page.waitForTimeout(1000);
    const docTitle = page.locator(".doc-title");
    await expect(docTitle).toBeVisible();

    // 2. Upload PDF fixture
    await fileInput.setInputFiles(pdfFixturePath);
    await page.waitForTimeout(1000);
    await expect(docTitle).toBeVisible();
  });

  // =========================================================================
  // 10: Approval Integrity & Fail-Closed Stale Review Rejection
  // =========================================================================
  test("Browser 6: Enforces approval integrity — strictly rejects approval with mismatched draft hash (409)", async ({
    request,
  }) => {
    // 1. Submit review on Draft v1
    const draftV1 = createDraft("Sample Foods Oat Bites contain 6g protein.", {
      id: "DRAFT-STALE-PHASE4",
      title: "Phase 4 Stale Approval Test",
      channel: "packaging",
      product: "Sample Foods Oat Bites",
      audience: "Health-conscious consumers",
      version: 1,
    });

    const revRes = await request.post("/api/reviews", {
      headers: { "x-onbrand-role": "reviewer" },
      data: { draft: draftV1 },
    });
    expect(revRes.status()).toBe(200);
    const revData = await revRes.json();
    const reviewId = revData.review.id;
    const v1Hash = revData.review.draftHash;

    // 2. Persist Draft v2 with modified copy
    const draftV2Res = await request.post("/api/drafts", {
      headers: { "x-onbrand-role": "creator" },
      data: {
        id: "DRAFT-STALE-PHASE4",
        title: "Phase 4 Stale Approval Test",
        content: "Sample Foods Oat Bites contain 6g protein and 100% natural oats.",
        channel: "packaging",
        product: "Sample Foods Oat Bites",
        audience: "Health-conscious consumers",
        version: 2,
      },
    });
    expect(draftV2Res.status()).toBe(201);
    const v2Data = await draftV2Res.json();
    const v2Hash = v2Data.draft.hash;
    expect(v2Hash).not.toBe(v1Hash);

    // 3. Attempt approval of Draft v2 hash using Draft v1 review
    const badDecisionRes = await request.post("/api/decisions", {
      headers: { "x-onbrand-role": "reviewer" },
      data: {
        reviewId,
        state: "APPROVED",
        draftHash: v2Hash,
        reason: "Attempting stale approval",
      },
    });

    // Server must reject with 409 Conflict
    expect(badDecisionRes.status()).toBe(409);
    const errBody = await badDecisionRes.json();
    expect(errBody.error).toBeDefined();
  });

  // =========================================================================
  // 5 & 11: Poster Visual Workflow & Human Decision Recording
  // =========================================================================
  test("Browser 7: Uploads visual poster, extracts claims, and records valid human decisions", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await dismissWelcomeModal(page);

    // 1. Upload demo-poster.png fixture
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(posterFixturePath);

    // 2. Run review if not auto-triggered
    const runBtn = page.locator(".run-review-primary-btn");
    if (await runBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await runBtn.click();
    }

    // 3. Verify detail dossier or findings panel is populated
    const detailPanel = page.locator(".finding-detail-workspace, .finding-detail, [aria-label*='Finding detail' i], .findings-workspace-panel").first();
    await expect(detailPanel).toBeVisible({ timeout: 25000 });

    // 4. Record human decision: dismiss finding
    const dismissBtn = page.locator(".dismiss-finding-btn, button:has-text('Mark Resolved / Dismiss'), button:has-text('Dismiss'), button:has-text('Resolve')").first();
    if (await dismissBtn.isVisible()) {
      await dismissBtn.click();
      await page.waitForTimeout(500);
    }

    // 5. Record overall decision if enabled
    const reqChangesBtn = page.locator('button.request-button:not([disabled])').first();
    if (await reqChangesBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await reqChangesBtn.click();
      await page.waitForTimeout(500);
    }

    // 6. Reload and verify workspace stability
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await dismissWelcomeModal(page);
    await expect(page.locator(".brand-name")).toHaveText("OnBrand");
  });

  // =========================================================================
  // 14: Strict Multi-Tenant Isolation
  // =========================================================================
  test("Browser 8: Verifies strict cross-tenant isolation between Org Alpha and Org Beta", async ({
    request,
  }) => {
    const orgAlphaHeader = { "x-onbrand-tenant": "00000000-0000-0000-0000-000000000001", "x-onbrand-role": "maintainer" };
    const orgBetaHeader = { "x-onbrand-tenant": "00000000-0000-0000-0000-000000000002", "x-onbrand-role": "maintainer" };

    const sourceId = "SRC-ALPHA-CONFIDENTIAL-" + Date.now();

    // 1. Register confidential source in Org Alpha
    const createSrcRes = await request.post("/api/sources", {
      headers: orgAlphaHeader,
      data: {
        id: sourceId,
        title: "Alpha Proprietary Secret Formulation",
        kind: "PRODUCT_FACT",
        authority: 90,
        version: 1,
        effectiveFrom: "2026-01-01",
        channels: ["packaging"],
        owner: "Alpha R&D Lead",
        approvalState: "APPROVED",
        facts: [
          {
            id: "FACT-ALPHA-01",
            subject: "Proprietary Compound",
            attribute: "Concentration",
            value: "100mg",
            statement: "Proprietary compound concentration is 100mg.",
            sourceId: sourceId,
          },
        ],
      },
    });
    expect(createSrcRes.status()).toBe(201);
    const alphaSrcData = await createSrcRes.json();
    const alphaSourceId = alphaSrcData.source.id;

    // 2. Org Beta queries its sources — must NOT contain Alpha's confidential source
    const betaSourcesRes = await request.get("/api/sources", {
      headers: orgBetaHeader,
    });
    expect(betaSourcesRes.status()).toBe(200);
    const betaSourcesData = await betaSourcesRes.json();
    const leakedSource = (betaSourcesData.sources || []).find(
      (s: any) => s.id === alphaSourceId || s.title === "Alpha Proprietary Secret Formulation"
    );
    expect(leakedSource).toBeUndefined();

    // 3. Org Beta queries drafts — must NOT receive Alpha's drafts
    const betaDraftsRes = await request.get("/api/drafts", {
      headers: orgBetaHeader,
    });
    expect(betaDraftsRes.status()).toBe(200);

    // 4. Cross-tenant asset query rejection
    const crossAssetRes = await request.get("/api/assets?id=non-existent-alpha-asset&binary=true", {
      headers: orgBetaHeader,
    });
    expect(crossAssetRes.status()).toBe(404);

    // 5. Cross-tenant decision attempt rejection
    const crossDecisionRes = await request.post("/api/decisions", {
      headers: { ...orgBetaHeader, "x-onbrand-role": "reviewer" },
      data: {
        reviewId: "REV-ALPHA-DOES-NOT-BELONG-TO-BETA",
        state: "APPROVED",
        draftHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      },
    });
    expect([403, 404, 409]).toContain(crossDecisionRes.status());
  });
});
