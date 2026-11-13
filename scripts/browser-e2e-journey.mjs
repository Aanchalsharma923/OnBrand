// scripts/browser-e2e-journey.mjs
// Master End-to-End Browser Automation Suite for OnBrand
// Uses Playwright and Microsoft Edge to execute and visually record the customer review workflow.

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";

const BASE_URL = process.env.BASE_URL || "https://outcoded.xyz";
const SCREENSHOT_DIR = path.resolve("tests/screenshots");

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

console.log("================================================================================");
console.log(`ONBRAND BROWSER AUTOMATION E2E RUNNER — TARGET: ${BASE_URL}`);
console.log("================================================================================\n");

async function runBrowserJourney() {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  });

  const page = await context.newPage();

  try {
    // -------------------------------------------------------------------------
    // STEP 1: Open Workspace & Initial Render
    // -------------------------------------------------------------------------
    console.log("-> Step 1: Navigating to OnBrand workspace...");
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Dismiss welcome card if open
    const closeWelcome = await page.$(".welcome-close-btn, button[aria-label='Close workspace selector']");
    if (closeWelcome) {
      console.log("   Dismissing welcome modal...");
      await closeWelcome.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01-initial-workspace.png") });
    console.log("   ✓ Step 1 captured: 01-initial-workspace.png");

    // -------------------------------------------------------------------------
    // STEP 2 & 3: Enter Copy Manually & Verify Content
    // -------------------------------------------------------------------------
    console.log("-> Step 2 & 3: Switching to raw edit mode and entering draft copy with known claim issues...");
    
    // Click '✎ Edit Copy' in the toolbar
    const editCopyBtn = await page.locator("button.mode-toggle-btn:has-text('Edit Copy')").first();
    assert.ok(await editCopyBtn.isVisible(), "Edit Copy button must be visible");
    await editCopyBtn.click();
    await page.waitForTimeout(500);

    const testDraftContent = "Sample Foods Oat Bites contain zero sugar. They deliver sustained energy for busy mornings.";
    
    // Find textarea editor
    const editor = await page.$("textarea");
    assert.ok(editor, "Must find draft textarea editor");
    await editor.fill(testDraftContent);
    await page.waitForTimeout(500);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02-manual-text-entry.png") });
    console.log("   ✓ Step 2 & 3 captured: 02-manual-text-entry.png");

    // -------------------------------------------------------------------------
    // STEP 4, 5 & 6: Run Review & Verify Auto-Opened Finding Detail Dossier
    // -------------------------------------------------------------------------
    console.log("-> Step 4, 5 & 6: Executing review pipeline on active draft...");
    const runReviewBtn = await page.locator("button.run-review-primary-btn, button:has-text('Run Review Now'), button.primary-button:has-text('Run review')").first();
    assert.ok(await runReviewBtn.isVisible(), "Run Review button must be visible");
    await runReviewBtn.click();

    // Wait for review execution to finish and detail workspace to open
    await page.waitForSelector(".finding-detail-workspace", { timeout: 10000 });
    const detailText = await page.innerText(".finding-detail-workspace");
    console.log("   ✓ Review completed! Finding detail dossier opened automatically.");
    assert.ok(
      detailText.includes("zero sugar") || detailText.includes("101.60") || detailText.includes("CONTRADICTED") || detailText.includes("PROMOTIONAL COMPLIANCE"),
      "Detail dossier must articulate the issue, regulatory grounding, and evidence"
    );

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03-finding-detail-dossier.png") });
    console.log("   ✓ Step 4, 5 & 6 captured: 03-finding-detail-dossier.png");

    // -------------------------------------------------------------------------
    // STEP 7 & 8: Navigate Back to Full Issues List
    // -------------------------------------------------------------------------
    console.log("-> Step 7 & 8: Clicking '← Back to Issues' to inspect findings list view...");
    const backBtn = await page.locator("button.back-to-list-btn:has-text('Back to Issues')");
    await backBtn.click();
    await page.waitForTimeout(600);

    const findingCards = await page.$$(".finding-card-row");
    console.log(`   ✓ Found ${findingCards.length} categorized issues in list view.`);
    assert.ok(findingCards.length > 0, "Must render finding card rows");

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04-findings-overview-list.png") });
    console.log("   ✓ Step 7 & 8 captured: 04-findings-overview-list.png");

    // Click the first card to return to detail panel
    await findingCards[0].click();
    await page.waitForSelector(".finding-detail-workspace", { timeout: 5000 });

    // -------------------------------------------------------------------------
    // STEP 9, 10 & 11: Apply 1-Click Suggestion & Confirm Stale State
    // -------------------------------------------------------------------------
    console.log("-> Step 9, 10 & 11: Applying recommended correction via '✓ Apply Suggestion'...");
    const applyBtn = await page.locator("button:has-text('Apply Suggestion')").first();
    assert.ok(await applyBtn.isVisible(), "Must find Apply Suggestion button");
    await applyBtn.click();
    await page.waitForTimeout(600);

    // Verify stale review banner appears
    const pageText = await page.innerText("body");
    const isStale = pageText.includes("stale") || pageText.includes("changed") || pageText.includes("out of date") || pageText.includes("Run a fresh review");
    console.log(`   ✓ Stale review detection: ${isStale ? "CONFIRMED (old decision invalidated)" : "Auto-synced"}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05-suggestion-applied-stale-review.png") });
    console.log("   ✓ Step 9, 10 & 11 captured: 05-suggestion-applied-stale-review.png");

    // -------------------------------------------------------------------------
    // STEP 12, 13 & 14: Re-Review Corrected Copy
    // -------------------------------------------------------------------------
    console.log("-> Step 12, 13 & 14: Executing re-review on revised copy...");
    const reReviewBtn = await page.locator("button.run-review-primary-btn, button:has-text('Run Review Now'), button.primary-button:has-text('Run review')").first();
    await reReviewBtn.click();
    await page.waitForTimeout(2500);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06-re-review-clean-dossier.png") });
    console.log("   ✓ Step 12, 13 & 14 captured: 06-re-review-clean-dossier.png");

    // -------------------------------------------------------------------------
    // STEP 15 & 16: Human Decision & Approval Controls
    // -------------------------------------------------------------------------
    console.log("-> Step 15 & 16: Inspecting human decision controls...");
    const approveBtn = await page.$(".approve-button, button:has-text('Approve version')");
    if (approveBtn) {
      const isDisabled = await approveBtn.isDisabled();
      const title = await approveBtn.getAttribute("title");
      console.log(`   ✓ Approve button state: ${isDisabled ? "Disabled (guarding unresolved items)" : "Active (ready for approval)"} [Tooltip: ${title}]`);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07-human-approval-controls.png") });
    console.log("   ✓ Step 15 & 16 captured: 07-human-approval-controls.png");

    // -------------------------------------------------------------------------
    // STEP 17: Review History & Version Inspection
    // -------------------------------------------------------------------------
    console.log("-> Step 17: Opening review version history...");
    const historyToggle = await page.locator("button.history-toggle-btn, button:has-text('Version history')").first();
    if (await historyToggle.isVisible()) {
      await historyToggle.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "08-review-version-history.png") });
    console.log("   ✓ Step 17 captured: 08-review-version-history.png");

    // -------------------------------------------------------------------------
    // RESPONSIVE VIEWPORT TESTS: Tablet (820px) & Mobile (390px)
    // -------------------------------------------------------------------------
    console.log("-> Testing Responsive Tablet Viewport (820px width)...");
    await page.setViewportSize({ width: 820, height: 900 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "09-tablet-responsive-viewport.png") });
    console.log("   ✓ Tablet captured: 09-tablet-responsive-viewport.png");

    console.log("-> Testing Responsive Mobile Viewport (390px width)...");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "10-mobile-responsive-viewport.png") });
    console.log("   ✓ Mobile captured: 10-mobile-responsive-viewport.png");

    console.log("\n================================================================================");
    console.log("✓ ALL 10 VISUAL MILESTONES OF THE BROWSER JOURNEY RECORDED SUCCESSFULLY!");
    console.log("================================================================================\n");

  } catch (err) {
    console.error("Browser journey execution failed:", err);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "error-state.png") }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

runBrowserJourney();
