import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const TARGET_URL = "https://outcoded.xyz";
const SCREENSHOT_DIR = path.resolve(process.cwd(), "walkthrough-screenshots");

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const posterPath = path.resolve(process.cwd(), "evaluation/visual-fixtures/demo-poster.png");
const pdfPath = path.resolve(process.cwd(), "evaluation/visual-fixtures/pdf-02-tagged-accessible.pdf");
const docxPath = path.resolve(process.cwd(), "evaluation/visual-fixtures/docx-01-accessible.docx");

async function pause(ms = 1200) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTour() {
  console.log("=== STARTING ONBRAND INTERACTIVE BROWSER TOUR ===");
  console.log("Target:", TARGET_URL);

  const browser = await chromium.launch({
    headless: false,
    channel: "chrome",
    slowMo: 400,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  try {
    // -------------------------------------------------------------------------
    // STEP 1: Landing Page & Workspace Onboarding Modal
    // -------------------------------------------------------------------------
    console.log("Step 1: Navigating to landing page & inspecting onboarding modal...");
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await pause(1500);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01-welcome-onboarding.png") });

    // Click "Sign in as Demo Reviewer →" or "Launch Acme Workspace →" to enter cleanly
    const enterBtn = page.locator('button.judge-role-btn:has-text("Sign in as Demo Reviewer"), button.welcome-option:has-text("Launch Acme Workspace"), button:has-text("Launch Acme Workspace")').first();
    if (await enterBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await enterBtn.click({ force: true });
      await pause(1000);
    } else {
      const closeBtn = page.locator(".welcome-close-btn").first();
      if (await closeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await closeBtn.click({ force: true });
        await pause(500);
      }
    }

    await page.evaluate(() => {
      document.querySelectorAll(".welcome-backdrop, .welcome-modal, .auth-modal-overlay").forEach((el) => {
        el.style.display = "none";
        el.remove();
      });
    });

    // -------------------------------------------------------------------------
    // STEP 2: Application Shell, Sidebar Navigation & Workspace Switcher
    // -------------------------------------------------------------------------
    console.log("Step 2: Exploring Sidebar, Compact Workspace Switcher & Roles...");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03-application-shell.png") });

    // Open Workspace Switcher
    const wsSwitcher = page.locator(".workspace-switcher-compact").first();
    if (await wsSwitcher.isVisible({ timeout: 2000 }).catch(() => false)) {
      await wsSwitcher.click();
      await pause(800);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04-workspace-switcher-dropdown.png") });
      // Click again or click body to close dropdown
      await page.locator("body").click({ position: { x: 400, y: 100 } });
      await pause(400);
    }

    // Inspect Role Selector at bottom-left
    const roleSelect = page.locator("select.role-selector-compact").first();
    if (await roleSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await roleSelect.selectOption("reviewer");
      await pause(600);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05-role-selector-reviewer.png") });
    }

    // -------------------------------------------------------------------------
    // STEP 3: Reviews & Drafting Workspace Tour
    // -------------------------------------------------------------------------
    console.log("Step 3: Touring Reviews & Drafting Workspace...");
    const reviewsNav = page.locator('button.nav-item:has-text("Reviews")').first();
    if (await reviewsNav.isVisible({ timeout: 2000 }).catch(() => false)) {
      await reviewsNav.click({ force: true });
      await pause(800);
    }

    // Switch to Edit Copy Tab
    const editCopyTab = page.locator('button[role="tab"]:has-text("Edit Copy"), .tab:has-text("Edit Copy"), button:has-text("Edit Copy")').first();
    if (await editCopyTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await editCopyTab.click({ force: true });
      await pause(600);
    }

    // Enter draft copy with known claim patterns
    const textarea = page.locator(".draft-editor-textarea, textarea#draft-content, .draft-textarea, textarea").first();
    if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await textarea.fill(
        "Snack without guilt! Sample Foods Oat Bites are our miracle snack guaranteed to give you sustained energy all day. " +
        "Produced in a certified 100% nut-free facility with zero risk of peanut cross-contamination. " +
        "Each 30g serving delivers 6g protein and 4g natural sugar."
      );
      await pause(1000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06-draft-editor-content.png") });
    }

    // Run Compliance Review
    console.log("Running compliance review...");
    const runReviewBtn = page.locator(".run-review-primary-btn, button:has-text('Run review')").first();
    if (await runReviewBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await runReviewBtn.click({ force: true });
      await pause(2500);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07-findings-overview.png") });

    // Switch to Document View / Reading View to show Passage Highlighting
    console.log("Inspecting exact finding-to-document highlighting...");
    const docViewTab = page.locator('button[role="tab"]:has-text("Document View"), button[role="tab"]:has-text("Reading View"), button:has-text("Document View")').first();
    if (await docViewTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await docViewTab.click({ force: true });
      await pause(1000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "08-document-view-highlighting.png") });
    }

    // Click on a finding highlight to open the Evidence Drawer / Dossier
    console.log("Opening Evidence Drawer & Dossier...");
    const highlightMark = page.locator('.document-finding-mark, [aria-label^="Finding:"], mark').first();
    if (await highlightMark.isVisible({ timeout: 2000 }).catch(() => false)) {
      await highlightMark.click({ force: true });
      await pause(1200);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "09-evidence-drawer-dossier.png") });
    }

    // -------------------------------------------------------------------------
    // STEP 4: Visual Intelligence & Poster Inspection
    // -------------------------------------------------------------------------
    console.log("Step 4: Touring Visual Intelligence & Poster Review...");
    const fileInput = page.locator('input[type="file"]').first();
    if ((await fileInput.count()) > 0 && fs.existsSync(posterPath)) {
      await fileInput.setInputFiles(posterPath);
      await pause(2500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "10-visual-poster-review.png") });

      // Navigate between findings
      const nextBtn = page.locator('button:has-text("›"), button[aria-label*="next" i]').first();
      if (await nextBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await nextBtn.click();
        await pause(800);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "11-visual-finding-navigation.png") });
      }
    }

    // -------------------------------------------------------------------------
    // STEP 5: Knowledge Base & Fact Register
    // -------------------------------------------------------------------------
    console.log("Step 5: Touring Knowledge Base & Fact Register...");
    // Switch to maintainer role
    if (await roleSelect.isVisible({ timeout: 1500 }).catch(() => false)) {
      await roleSelect.selectOption("maintainer");
      await pause(500);
    }

    const kbNav = page.locator('button.nav-item:has-text("Knowledge Base")').first();
    if (await kbNav.isVisible({ timeout: 2000 }).catch(() => false)) {
      await kbNav.click({ force: true });
      await pause(1200);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "12-knowledge-base-sources.png") });

      // Upload accessible document fixture
      const kbFileInput = page.locator('input[type="file"]').first();
      if ((await kbFileInput.count()) > 0 && fs.existsSync(pdfPath)) {
        await kbFileInput.setInputFiles(pdfPath);
        await pause(2000);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "13-knowledge-base-ingestion.png") });
      }
    }

    // -------------------------------------------------------------------------
    // STEP 6: Governance Telemetry & Insights
    // -------------------------------------------------------------------------
    console.log("Step 6: Touring Governance Telemetry & Insights...");
    const insightsNav = page.locator('button.nav-item:has-text("Insights")').first();
    if (await insightsNav.isVisible({ timeout: 2000 }).catch(() => false)) {
      await insightsNav.click({ force: true });
      await pause(1500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "14-insights-telemetry-charts.png") });

      // Scroll down to show immutable audit trail
      await page.evaluate(() => window.scrollBy(0, 500));
      await pause(800);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "15-insights-audit-trail.png") });
      await page.evaluate(() => window.scrollTo(0, 0));
    }

    // -------------------------------------------------------------------------
    // STEP 7: Independent Evaluation Benchmark & Ablation Study
    // -------------------------------------------------------------------------
    console.log("Step 7: Touring Independent Evaluation Benchmark...");
    const evalNav = page.locator('button.nav-item:has-text("Evaluation")').first();
    if (await evalNav.isVisible({ timeout: 2000 }).catch(() => false)) {
      await evalNav.click({ force: true });
      await pause(1500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "16-evaluation-benchmark-matrix.png") });

      // Scroll down to show Confusion Matrix & Ablation Study
      await page.evaluate(() => window.scrollBy(0, 600));
      await pause(800);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "17-evaluation-ablation-study.png") });
      await page.evaluate(() => window.scrollTo(0, 0));
    }

    // -------------------------------------------------------------------------
    // STEP 8: Human-in-the-Loop Pre-Publication Approval Gate
    // -------------------------------------------------------------------------
    console.log("Step 8: Touring Human-in-the-Loop Approval Decision Gate...");
    if (await reviewsNav.isVisible({ timeout: 2000 }).catch(() => false)) {
      await reviewsNav.click({ force: true });
      await pause(1000);
      // Scroll to footer decision bar
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await pause(800);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "18-approval-decision-gate.png") });
    }

    console.log("=== TOUR COMPLETED SUCCESSFULLY! ===");
    await pause(3000); // Leave browser visible for user to see the completed state
  } catch (err) {
    console.error("Tour error:", err);
  } finally {
    await browser.close();
  }
}

runTour().catch(console.error);
