import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  assessOcrQuality,
  extractUploadedFile,
  extractUploadedFileDetailed,
  inspectDocxAccessibility,
  inspectPdfTagStructure,
  videoSampleTimestamps,
} from "./file-extraction";

describe("OCR quality gate", () => {
  it("accepts clean readable text at high confidence", () => {
    expect(assessOcrQuality("Sample Foods Oat Bites\n6g protein per serving", 92).status).toBe("RELIABLE");
  });

  it("rejects empty and symbol-heavy poster output as review-ready", () => {
    expect(assessOcrQuality("", 0).status).toBe("UNREADABLE");
    const garbled = assessOcrQuality('v i Sample Foods : Py EID ——— po 4 J OZ Oat Bites /5, Hid J — ow v - = -at 9 arter JP', 31);
    expect(garbled.status).not.toBe("RELIABLE");
    expect(assessOcrQuality("7] pr. A cocoa oat snack SA for everyday moments F 4 yc pp Py a ©_/ gtarter Made with rE 4 gundle wholegrain oats", 73).status).toBe("NEEDS_PROOFREAD");
  });
});

describe("reel frame sampling", () => {
  it("samples at least three evenly spaced frames from short reels and caps long reels at six", () => {
    const shortReel = videoSampleTimestamps(12);
    const longReel = videoSampleTimestamps(180);

    expect(shortReel).toHaveLength(3);
    expect(shortReel[0]).toBeCloseTo(2);
    expect(shortReel[2]).toBeCloseTo(10);
    expect(longReel).toHaveLength(6);
    expect(longReel[0]).toBeCloseTo(15);
    expect(longReel[5]).toBeCloseTo(165);
  });

  it("does not create sample points for invalid video durations", () => {
    expect(videoSampleTimestamps(0)).toEqual([]);
    expect(videoSampleTimestamps(Number.NaN)).toEqual([]);
  });
});

describe("browser draft text extraction", () => {
  it.each([
    ["draft.txt", "Plain text draft."],
    ["draft.md", "# Markdown draft\nA second line."],
    ["draft.html", "<html><body><h1>HTML draft</h1></body></html>"],
  ])("reads supported text format %s", async (name, content) => {
    const file = new File([content], name);
    await expect(extractUploadedFile(file)).resolves.toBe(content);
  });

  it("normalizes line endings and surrounding whitespace", async () => {
    const file = new File(["\r\n  Draft copy. \r\n"], "draft.txt");
    await expect(extractUploadedFile(file)).resolves.toBe("Draft copy.");
  });

  it("rejects an empty text document", async () => {
    const file = new File(["  \n"], "empty.txt");
    await expect(extractUploadedFile(file)).rejects.toThrow("No readable text was found");
  });

  it("rejects unsupported formats with a useful message", async () => {
    const file = new File(["binary"], "draft.doc");
    await expect(extractUploadedFile(file)).rejects.toThrow("Supported files: DOCX/PPTX");
  });

  it("enforces the 10 MB source-file limit before parsing", async () => {
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.txt");
    await expect(extractUploadedFile(file)).rejects.toThrow("Files must be 10 MB or smaller");
  });

  it("enforces the separate 50 MB limit for video uploads before decoding", async () => {
    const file = new File([new Uint8Array(50 * 1024 * 1024 + 1)], "large-reel.mp4", { type: "video/mp4" });
    await expect(extractUploadedFile(file)).rejects.toThrow("Videos must be 50 MB or smaller");
  });

  it("enforces the extracted-text limit", async () => {
    const file = new File(["x".repeat(20_001)], "long.txt");
    await expect(extractUploadedFile(file)).rejects.toThrow("more than 20,000 characters");
  });
});

describe("Document AST Accessibility (Task T4.4)", () => {
  describe("DOCX AST Accessibility", () => {
    it("flags missing alt-text for embedded drawings lacking description/title", async () => {
      const docxBytes = zipSync({
        "word/document.xml": strToU8(`
          <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
            <w:body>
              <w:p>
                <w:r><w:t>Quarterly Brand Highlights</w:t></w:r>
                <w:drawing>
                  <wp:inline>
                    <wp:docPr id="1" name="Figure 1" descr="" title=""/>
                  </wp:inline>
                </w:drawing>
              </w:p>
            </w:body>
          </w:document>
        `),
      });

      const findings = await inspectDocxAccessibility(docxBytes);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].category).toBe("ACCESSIBILITY");
      expect(findings[0].blocking_for_review).toBe(true);
      expect(findings[0].severity).toBe("HIGH");
      expect(findings[0].explanation).toBe("DOCX_ACCESSIBILITY: Missing alternative text for embedded image.");
    });

    it("flags heading hierarchy violation when Heading 3 directly follows Heading 1", async () => {
      const docxBytes = zipSync({
        "word/document.xml": strToU8(`
          <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
            <w:body>
              <w:p>
                <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
                <w:r><w:t>Main Section</w:t></w:r>
              </w:p>
              <w:p>
                <w:pPr><w:pStyle w:val="Heading3"/></w:pPr>
                <w:r><w:t>Skipped Sub-section</w:t></w:r>
              </w:p>
            </w:body>
          </w:document>
        `),
      });

      const findings = await inspectDocxAccessibility(docxBytes);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].category).toBe("ACCESSIBILITY");
      expect(findings[0].blocking_for_review).toBe(true);
      expect(findings[0].explanation).toContain("DOCX_ACCESSIBILITY: Heading hierarchy violation");
      expect(findings[0].explanation).toContain("Heading level 3 directly follows Heading level 1 without intervening Heading level 2");
    });

    it("passes compliant DOCX with sequential headings and descriptive image alt-text", async () => {
      const docxBytes = zipSync({
        "word/document.xml": strToU8(`
          <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
            <w:body>
              <w:p>
                <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
                <w:r><w:t>Title</w:t></w:r>
              </w:p>
              <w:p>
                <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
                <w:r><w:t>Subtitle</w:t></w:r>
              </w:p>
              <w:p>
                <w:drawing>
                  <wp:inline>
                    <wp:docPr id="1" name="Figure 1" descr="Company logo with green background"/>
                  </wp:inline>
                </w:drawing>
              </w:p>
            </w:body>
          </w:document>
        `),
      });

      const findings = await inspectDocxAccessibility(docxBytes);
      expect(findings).toHaveLength(0);
    });

    it("integrates DOCX accessibility inspection into extractUploadedFileDetailed", async () => {
      const docxBytes = zipSync({
        "word/document.xml": strToU8(`
          <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
            <w:body>
              <w:p>
                <w:r><w:t>Document Content Here</w:t></w:r>
                <w:drawing>
                  <wp:inline>
                    <wp:docPr id="1" name="Figure 1" descr=""/>
                  </wp:inline>
                </w:drawing>
              </w:p>
            </w:body>
          </w:document>
        `),
      });

      const file = new File([docxBytes], "annual-report.docx");
      const detailed = await extractUploadedFileDetailed(file);
      expect(detailed.method).toBe("DIRECT");
      expect(detailed.text).toBe("Document Content Here");
      expect(detailed.accessibilityFindings?.length).toBeGreaterThan(0);
      expect(detailed.disclosures).toContain("DOCX_ACCESSIBILITY: Missing alternative text for embedded image.");
    });
  });

  describe("PDF AST Tag Structure Inspection", () => {
    it("emits untagged PDF disclosure with 0 false claims of compliance", async () => {
      const untaggedPdfBytes = Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R >>
endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer
<< /Size 4 /Root 1 0 R >>
startxref
163
%%EOF`);

      const findings = await inspectPdfTagStructure(untaggedPdfBytes);
      expect(findings).toHaveLength(1);
      expect(findings[0].category).toBe("ACCESSIBILITY");
      expect(findings[0].blocking_for_review).toBe(true);
      expect(findings[0].severity).toBe("REVIEW");
      expect(findings[0].evidence_status).toBe("NEEDS_HUMAN");
      expect(findings[0].explanation).toBe("Document structure cannot be assessed (untagged PDF)");

      // 0 false claims of compliance
      const falseComplianceClaims = findings.filter((f) =>
        /compliant|accessible|valid structure/i.test(f.explanation)
      );
      expect(falseComplianceClaims).toHaveLength(0);
    });

    it("identifies tagged PDF structure containing StructTreeRoot", async () => {
      const taggedPdfBytes = Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 4 0 R /MarkInfo << /Marked true >> >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R >>
endobj
4 0 obj
<< /Type /StructTreeRoot >>
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000101 00000 n 
0000000158 00000 n 
0000000206 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
246
%%EOF`);

      const findings = await inspectPdfTagStructure(taggedPdfBytes);
      // Tagged PDF does not emit the untagged fallback disclosure
      expect(findings.some((f) => f.explanation.includes("untagged PDF"))).toBe(false);
    });
  });
});
