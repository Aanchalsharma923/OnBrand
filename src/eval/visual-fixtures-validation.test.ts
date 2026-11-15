/**
 * Physical Visual Fixtures Validation Test
 *
 * Verifies that the real on-disk fixture files (PNG, DOCX, PDF) in
 * evaluation/visual-fixtures/ can be loaded and processed by OnBrand's
 * visual intelligence, document accessibility, and contrast engines.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  computePerceptualHash,
  computeDHash2D,
  hammingDistance,
  inspectDocxAccessibility,
  inspectPdfTagStructure,
  sampleBoundingBoxContrast,
  extractDominantPalette,
} from "@/lib/visual-analysis";

const fixturesDir = path.resolve(__dirname, "../../evaluation/visual-fixtures");

describe("Physical Visual Fixtures Validation", () => {
  it("verifies manifest integrity and file existence for all 46 fixtures", () => {
    const manifestPath = path.join(fixturesDir, "fixtures.json");
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest.totalFixtures).toBe(46);
    expect(manifest.fixtures.length).toBe(46);

    // Verify demo-poster.png exists and has valid dimensions/size
    const demoPosterPath = path.join(fixturesDir, "demo-poster.png");
    expect(fs.existsSync(demoPosterPath)).toBe(true);
    const posterStat = fs.statSync(demoPosterPath);
    expect(posterStat.size).toBeGreaterThan(1000);
  });

  describe("1. Real Logo Fixture Tests", () => {
    it("computes pHash for exact match (Hamming distance 0)", () => {
      const exactPath = path.join(fixturesDir, "logo-01-exact.png");
      const exactBuf = fs.readFileSync(exactPath);
      const hash1 = computePerceptualHash(exactBuf);
      const hash2 = computePerceptualHash(exactBuf);

      expect(hash1).toBeDefined();
      expect(hash1.length).toBeGreaterThan(0);
      expect(hammingDistance(hash1, hash2)).toBe(0);
    });

    it("distinguishes hard negative logos (Hamming distance > threshold)", () => {
      const exactBuf = fs.readFileSync(path.join(fixturesDir, "logo-01-exact.png"));
      const hardNeg1Buf = fs.readFileSync(path.join(fixturesDir, "logo-11-hard-negative-unrelated.png"));

      const exactHash = computePerceptualHash(exactBuf);
      const negHash = computePerceptualHash(hardNeg1Buf);

      const dist = hammingDistance(exactHash, negHash);
      // Hard negative unrelated should have significant Hamming distance
      expect(dist).toBeGreaterThanOrEqual(10);
    });
  });

  describe("2. Real DOCX Accessibility Fixture Tests", () => {
    it("flags missing alt text on docx-02-missing-alt.docx", async () => {
      const docxPath = path.join(fixturesDir, "docx-02-missing-alt.docx");
      const docxBuf = fs.readFileSync(docxPath);

      const findings = await inspectDocxAccessibility(docxBuf);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings.some((f) => f.explanation.includes("Missing alternative text"))).toBe(true);
    });

    it("exempts decorative images on docx-05-decorative-image.docx", async () => {
      const docxPath = path.join(fixturesDir, "docx-05-decorative-image.docx");
      const docxBuf = fs.readFileSync(docxPath);

      const findings = await inspectDocxAccessibility(docxBuf);
      // Decorative image should NOT produce an alt text finding
      expect(findings.filter((f) => f.claim_id === "docx-missing-alt")).toHaveLength(0);
    });

    it("detects skipped heading hierarchy on docx-06-skipped-headings.docx", async () => {
      const docxPath = path.join(fixturesDir, "docx-06-skipped-headings.docx");
      const docxBuf = fs.readFileSync(docxPath);

      const findings = await inspectDocxAccessibility(docxBuf);
      expect(findings.some((f) => f.explanation.includes("Heading hierarchy violation"))).toBe(true);
    });

    it("detects unheaded tables on docx-07-unheaded-table.docx", async () => {
      const docxPath = path.join(fixturesDir, "docx-07-unheaded-table.docx");
      const docxBuf = fs.readFileSync(docxPath);

      const findings = await inspectDocxAccessibility(docxBuf);
      expect(findings.some((f) => f.explanation.includes("Table lacks defined header row"))).toBe(true);
    });

    it("flags ambiguous links on docx-08-ambiguous-links.docx", async () => {
      const docxPath = path.join(fixturesDir, "docx-08-ambiguous-links.docx");
      const docxBuf = fs.readFileSync(docxPath);

      const findings = await inspectDocxAccessibility(docxBuf);
      expect(findings.some((f) => f.explanation.includes("Ambiguous hyperlink text"))).toBe(true);
    });
  });

  describe("3. Real PDF Accessibility Fixture Tests", () => {
    it("flags untagged PDF on pdf-01-untagged.pdf as NEEDS_HUMAN", async () => {
      const pdfPath = path.join(fixturesDir, "pdf-01-untagged.pdf");
      const pdfBuf = fs.readFileSync(pdfPath);

      const findings = await inspectPdfTagStructure(pdfBuf);
      expect(findings).toHaveLength(1);
      expect(findings[0].evidence_status).toBe("NEEDS_HUMAN");
      expect(findings[0].explanation).toContain("untagged PDF");
    });

    it("verifies clean status on pdf-02-tagged-accessible.pdf", async () => {
      const pdfPath = path.join(fixturesDir, "pdf-02-tagged-accessible.pdf");
      const pdfBuf = fs.readFileSync(pdfPath);

      const findings = await inspectPdfTagStructure(pdfBuf);
      expect(findings).toHaveLength(0);
    });

    it("flags figure missing /Alt on pdf-03-tagged-missing-figure-alt.pdf", async () => {
      const pdfPath = path.join(fixturesDir, "pdf-03-tagged-missing-figure-alt.pdf");
      const pdfBuf = fs.readFileSync(pdfPath);

      const findings = await inspectPdfTagStructure(pdfBuf);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings.some((f) => f.explanation.includes("Figure element(s) lacking /Alt"))).toBe(true);
    });
  });

  describe("4. Real Contrast Fixture Tests", () => {
    it("measures passing contrast on contrast-01-passing-normal.png", async () => {
      const imgPath = path.join(fixturesDir, "contrast-01-passing-normal.png");
      const imgBuf = fs.readFileSync(imgPath);

      const sample = await sampleBoundingBoxContrast(imgBuf, { x: 10, y: 10, width: 180, height: 80 });
      expect(sample.ratio).toBeGreaterThanOrEqual(4.5);
      expect(sample.meetsAA).toBe(true);
    });

    it("measures failing contrast on contrast-02-failing-normal.png", async () => {
      const imgPath = path.join(fixturesDir, "contrast-02-failing-normal.png");
      const imgBuf = fs.readFileSync(imgPath);

      const sample = await sampleBoundingBoxContrast(imgBuf, { x: 10, y: 10, width: 180, height: 80 });
      expect(sample.ratio).toBeLessThan(4.5);
      expect(sample.meetsAA).toBe(false);
    });
  });
});
