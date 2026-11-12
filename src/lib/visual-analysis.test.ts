import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  computePerceptualHash,
  hammingDistance,
  matchLogo,
  calculateWcagContrast,
  checkBrandPalette,
  inspectDocxXmlAccessibility,
  createVisualFinding,
  sampleBoundingBoxContrast,
  extractDominantPalette,
  createContrastFinding,
  createPaletteFinding,
  calculateDeltaE,
  visualAnalysisEngine,
} from "./visual-analysis";
import type { AssetRecord } from "./types";

describe("Visual Intelligence & Accessibility Engine", () => {
  const mockAsset: AssetRecord = {
    id: "AST-001",
    organizationId: "00000000-0000-0000-0000-000000000001",
    name: "Sample Foods Official Brandmark",
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    phash: "f0f0f0f0f0f0f0f0",
    mimeType: "image/png",
    byteSize: 1024,
    approvalState: "APPROVED",
    uploadedBy: "maintainer",
    createdAt: new Date().toISOString(),
  };

  describe("Logo Matching", () => {
    it("identifies EXACT match when binary SHA-256 matches registered asset", () => {
      const buffer = new Uint8Array([1, 2, 3, 4]);
      const result = matchLogo(mockAsset.sha256, buffer, [mockAsset]);
      expect(result.matchType).toBe("EXACT");
      expect(result.confidence).toBe(1.0);
      expect(result.matchedAsset?.name).toBe("Sample Foods Official Brandmark");
    });

    it("identifies NOT_IN_REGISTRY when hash and pHash differ significantly", () => {
      const buffer = new Uint8Array(128).fill(128);
      const result = matchLogo("different-sha256", buffer, [mockAsset]);
      expect(["NOT_IN_REGISTRY", "NEAR_VARIANT"]).toContain(result.matchType);
    });

    it("calculates accurate bitwise Hamming distances", () => {
      expect(hammingDistance("0000000000000000", "0000000000000000")).toBe(0);
      expect(hammingDistance("ffffffffffffffff", "0000000000000000")).toBe(64);
      expect(hammingDistance("f000000000000000", "0000000000000000")).toBe(4);
    });
  });

  describe("WCAG Luminance & Contrast", () => {
    it("calculates maximum contrast for black and white (21.0:1)", () => {
      const contrast = calculateWcagContrast("#000000", "#FFFFFF");
      expect(contrast).not.toBeNull();
      expect(contrast!.ratio).toBe(21.0);
      expect(contrast!.meetsAANormal).toBe(true);
      expect(contrast!.meetsAALarge).toBe(true);
    });

    it("detects insufficient contrast below AA target (4.5:1)", () => {
      const contrast = calculateWcagContrast("#CCCCCC", "#FFFFFF");
      expect(contrast).not.toBeNull();
      expect(contrast!.ratio).toBeLessThan(4.5);
      expect(contrast!.meetsAANormal).toBe(false);
    });

    it("handles 3-digit shorthand hex colors", () => {
      const contrast = calculateWcagContrast("#000", "#FFF");
      expect(contrast).not.toBeNull();
      expect(contrast!.ratio).toBe(21.0);
    });
  });

  describe("Pixel Contrast via sampleBoundingBoxContrast (Task T4.3)", () => {
    it("evaluates white text on black background to 21.0:1 passing WCAG AA", async () => {
      const blackBg = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
      })
        .png()
        .toBuffer();

      const whiteText = await sharp({
        create: { width: 40, height: 20, channels: 3, background: { r: 255, g: 255, b: 255 } },
      })
        .png()
        .toBuffer();

      const composite = await sharp(blackBg)
        .composite([{ input: whiteText, top: 20, left: 20 }])
        .png()
        .toBuffer();

      const sample = await sampleBoundingBoxContrast(composite, {
        x: 10,
        y: 10,
        width: 60,
        height: 40,
      });

      expect(sample.ratio).toBe(21.0);
      expect(sample.bgHex).toBe("#000000");
      expect(sample.fgHex).toBe("#FFFFFF");
      expect(sample.meetsAA).toBe(true);
      expect(sample.isEstimate).toBe(true);

      const finding = createContrastFinding(sample);
      expect(finding.category).toBe("VISUAL");
      expect(finding.blocking_for_review).toBe(false);
      expect(finding.explanation).toContain("[ESTIMATE]");
      expect(finding.explanation).toContain("meets 4.5:1 threshold");
    });

    it("detects pixel contrast failure for #777777 on #666666 with [ESTIMATE] label", async () => {
      const greyBg = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 102, g: 102, b: 102 } }, // #666666
      })
        .png()
        .toBuffer();

      const greyText = await sharp({
        create: { width: 40, height: 20, channels: 3, background: { r: 119, g: 119, b: 119 } }, // #777777
      })
        .png()
        .toBuffer();

      const composite = await sharp(greyBg)
        .composite([{ input: greyText, top: 20, left: 20 }])
        .png()
        .toBuffer();

      const sample = await sampleBoundingBoxContrast(composite, {
        x: 10,
        y: 10,
        width: 60,
        height: 40,
      });

      expect(sample.ratio).toBeLessThan(4.5);
      expect(sample.bgHex).toBe("#666666");
      expect(sample.fgHex).toBe("#777777");
      expect(sample.meetsAA).toBe(false);
      expect(sample.isEstimate).toBe(true);

      const finding = createContrastFinding(sample);
      expect(finding.category).toBe("VISUAL");
      expect(finding.blocking_for_review).toBe(true);
      expect(finding.evidence_status).toBe("CONFLICT");
      expect(finding.explanation).toContain("[ESTIMATE]");
      expect(finding.explanation).toContain("#777777");
      expect(finding.explanation).toContain("#666666");
      expect(finding.explanation).toContain("below 4.5:1 threshold");
    });
  });

  describe("Dominant Palette & Delta-E Extractor (Task T4.3)", () => {
    const brandTokens = [
      { name: "BrandPrimary", hex: "#0055FF" },
      { name: "BrandSecondary", hex: "#FF5500" },
    ];

    it("extracts dominant brand colors and computes 0 Delta-E for exact token match", async () => {
      const image = await sharp({
        create: { width: 60, height: 60, channels: 3, background: { r: 0, g: 85, b: 255 } }, // #0055FF
      })
        .png()
        .toBuffer();

      const result = await extractDominantPalette(image, brandTokens);
      expect(result.dominantColors.length).toBeGreaterThan(0);
      expect(result.dominantColors[0].hex).toBe("#0055FF");
      expect(result.dominantColors[0].percentage).toBeGreaterThanOrEqual(95);

      expect(result.deviations.length).toBeGreaterThan(0);
      expect(result.deviations[0].nearestToken).toBe("BrandPrimary");
      expect(result.deviations[0].deltaE).toBe(0);

      const findings = createPaletteFinding(result, 15);
      expect(findings).toHaveLength(0);
    });

    it("detects off-palette color deviation and emits blocking finding", async () => {
      // Hot pink (#FF00FF)
      const image = await sharp({
        create: { width: 60, height: 60, channels: 3, background: { r: 255, g: 0, b: 255 } },
      })
        .png()
        .toBuffer();

      const result = await extractDominantPalette(image, brandTokens);
      expect(result.deviations[0].deltaE).toBeGreaterThan(40);

      const findings = createPaletteFinding(result, 15);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].category).toBe("VISUAL");
      expect(findings[0].blocking_for_review).toBe(true);
      expect(findings[0].explanation).toContain("Delta-E");
      expect(findings[0].explanation).toContain("#FF00FF");
    });

    it("calculates accurate CIE76 Delta-E distances", () => {
      expect(calculateDeltaE("#0055FF", "#0055FF")).toBe(0);
      expect(calculateDeltaE("#FFFFFF", "#000000")).toBe(100);
      expect(calculateDeltaE("#0055FF", "#0050EE")).toBeCloseTo(6.5, 0);
    });
  });

  describe("Brand Palette Analysis (Legacy checkBrandPalette)", () => {
    const approvedBrandTokens = ["#183f35", "#f2ead9", "#6b4434"];

    it("validates compliant dominant brand colors", () => {
      const result = checkBrandPalette(["#183f35", "#f2ead9"], approvedBrandTokens);
      expect(result.compliant).toBe(true);
      expect(result.deviations.length).toBe(0);
    });

    it("identifies out-of-palette deviations and recommends nearest approved token", () => {
      const result = checkBrandPalette(["#FF00FF"], approvedBrandTokens);
      expect(result.compliant).toBe(false);
      expect(result.deviations.length).toBe(1);
      expect(result.deviations[0].foundColor).toBe("#FF00FF");
      expect(approvedBrandTokens).toContain(result.deviations[0].nearestApproved);
      expect(result.deviations[0].distance).toBeGreaterThan(45);
    });
  });

  describe("DOCX Document Accessibility AST", () => {
    it("flags missing alt text in drawing properties", () => {
      const sampleXml = `
        <w:document>
          <wp:docPr id="1" name="Picture 1" descr=""/>
        </w:document>
      `;
      const issues = inspectDocxXmlAccessibility(sampleXml);
      expect(issues.some((i) => i.label.includes("missing descriptive alternative text"))).toBe(true);
    });

    it("flags placeholder filename alternative text", () => {
      const sampleXml = `
        <w:document>
          <wp:docPr id="1" name="Picture 1" descr="hero-banner-final.png"/>
        </w:document>
      `;
      const issues = inspectDocxXmlAccessibility(sampleXml);
      expect(issues.some((i) => i.explanation.includes("filename-like text"))).toBe(true);
    });

    it("flags skipped heading hierarchy levels", () => {
      const sampleXml = `
        <w:document>
          <w:pStyle w:val="Heading1"/>
          <w:pStyle w:val="Heading3"/>
        </w:document>
      `;
      const issues = inspectDocxXmlAccessibility(sampleXml);
      expect(issues.some((i) => i.label.includes("heading hierarchy skipped"))).toBe(true);
    });

    it("accepts sequential heading hierarchy (H1 -> H2 -> H3)", () => {
      const sampleXml = `
        <w:document>
          <w:pStyle w:val="Heading1"/>
          <w:pStyle w:val="Heading2"/>
          <w:pStyle w:val="Heading3"/>
        </w:document>
      `;
      const issues = inspectDocxXmlAccessibility(sampleXml);
      expect(issues.filter((i) => i.label.includes("heading hierarchy"))).toHaveLength(0);
    });
  });

  describe("Unified Finding Contract Compliance", () => {
    it("creates findings matching the exact Finding interface without schema drift", () => {
      const finding = createVisualFinding({
        reviewId: "REV-VIS-001",
        draftId: "DR-001",
        version: 1,
        draftHash: "abc123hash",
        findingId: "F-LOGO-NOT-IN-REGISTRY",
        label: "Unapproved logo mark detected",
        explanation: "The logo in this document does not match any registered approved asset.",
        severity: "HIGH",
        blocking: true,
      });

      expect(finding.category).toBe("VISUAL");
      expect(finding.evidence_status).toBe("CONTRADICTED");
      expect(finding.blocking_for_review).toBe(true);
      expect(finding.finding_id).toBe("F-LOGO-NOT-IN-REGISTRY");
      expect(finding.source_evidence).toEqual([]);
    });

    it("verifies VisualAnalysisEngine interface conformance", () => {
      expect(visualAnalysisEngine).toHaveProperty("matchLogo");
      expect(visualAnalysisEngine).toHaveProperty("sampleBoundingBoxContrast");
      expect(visualAnalysisEngine).toHaveProperty("extractDominantPalette");
      expect(visualAnalysisEngine).toHaveProperty("inspectDocxAccessibility");
      expect(visualAnalysisEngine).toHaveProperty("inspectPdfTagStructure");
    });
  });
});
