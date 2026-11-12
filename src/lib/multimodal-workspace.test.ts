import { describe, expect, it } from "vitest";
import {
  mapFindingsToAnnotations,
  isActionableFinding,
  getAnnotationVisualClass,
  recalculateAnnotationsOnTextEdit,
  type ContentAnnotation,
  type StructuralDocumentData,
  type UnifiedContentIngestion,
} from "./multimodal-workspace";
import { FORMAT_REGISTRY, resolveFormat, validateUploadFile } from "./format-registry";
import { type Finding, initialDraft, seedSources, reviewDraft } from "./onbrand";

describe("Multimodal Workspace — Format Registry & Validation", () => {
  it("resolves supported format definitions for all core file types", () => {
    expect(resolveFormat("document.pdf").formatId).toBe("pdf");
    expect(resolveFormat("report.docx").formatId).toBe("docx");
    expect(resolveFormat("pitch.pptx").formatId).toBe("pptx");
    expect(resolveFormat("budget.xlsx").formatId).toBe("xlsx");
    expect(resolveFormat("poster.png").formatId).toBe("image");
    expect(resolveFormat("promo.mp4").formatId).toBe("video");
    expect(resolveFormat("podcast.mp3").formatId).toBe("audio");
    expect(resolveFormat("data.csv").formatId).toBe("structured_text");
    expect(resolveFormat("notes.txt").formatId).toBe("structured_text");
  });

  it("enforces format-specific size limits and provides clear rejection reasons", () => {
    const validPdf = validateUploadFile({ name: "doc.pdf", size: 5 * 1024 * 1024, type: "application/pdf" });
    expect(validPdf.valid).toBe(true);

    const oversizedPdf = validateUploadFile({ name: "huge.pdf", size: 15 * 1024 * 1024, type: "application/pdf" });
    expect(oversizedPdf.valid).toBe(false);
    expect(oversizedPdf.error).toContain("PDF Document files must be 10 MB or smaller");

    const validVideo = validateUploadFile({ name: "reel.mp4", size: 45 * 1024 * 1024, type: "video/mp4" });
    expect(validVideo.valid).toBe(true);

    const oversizedVideo = validateUploadFile({ name: "huge-reel.mp4", size: 60 * 1024 * 1024, type: "video/mp4" });
    expect(oversizedVideo.valid).toBe(false);
    expect(oversizedVideo.error).toContain("Video & Reel files must be 50 MB or smaller");
  });

  it("exposes explicit capabilities and limitations for every format", () => {
    const videoFormat = FORMAT_REGISTRY.video;
    expect(videoFormat.capabilities.timestampNavigation).toBe(true);
    expect(videoFormat.capabilities.cellCoordinates).toBe(false);
    expect(videoFormat.limitations.some((l) => l.includes("sampled"))).toBe(true);

    const xlsxFormat = FORMAT_REGISTRY.xlsx;
    expect(xlsxFormat.capabilities.cellCoordinates).toBe(true);
    expect(xlsxFormat.capabilities.timestampNavigation).toBe(false);
    expect(xlsxFormat.limitations.some((l) => l.includes("Formulas are preserved"))).toBe(true);
  });
});

describe("Multimodal Workspace — Selective Highlighting & Visual Hierarchy", () => {
  const sampleFindings: Finding[] = [
    {
      finding_id: "F-VIOLATION",
      review_id: "rev-1",
      draft_id: "d-1",
      draft_version_id: "d-1-v1",
      draft_hash: "hash",
      claim_id: "C-1",
      claim_text: "cures all health conditions",
      start: 0,
      end: 27,
      category: "PROHIBITED_CLAIM",
      evidence_status: "CONTRADICTED",
      severity: "HIGH",
      blocking_for_review: true,
      explanation: "Absolute medical claim.",
      source_evidence: [{ source_id: "SRC-1", source_version: 1, quote: "No cure claims", authority: 100, score: 1 }],
      created_at: new Date().toISOString(),
    },
    {
      finding_id: "F-UNSUPPORTED",
      review_id: "rev-1",
      draft_id: "d-1",
      draft_version_id: "d-1-v1",
      draft_hash: "hash",
      claim_id: "C-2",
      claim_text: "boosts IQ by 50%",
      start: 30,
      end: 46,
      category: "MESSAGE",
      evidence_status: "NO_APPROVED_EVIDENCE",
      severity: "MEDIUM",
      blocking_for_review: true,
      explanation: "No approved trial substantiation.",
      source_evidence: [],
      created_at: new Date().toISOString(),
    },
    {
      finding_id: "F-COMPLIANT",
      review_id: "rev-1",
      draft_id: "d-1",
      draft_version_id: "d-1-v1",
      draft_hash: "hash",
      claim_id: "C-3",
      claim_text: "contains 6g protein per serving",
      start: 50,
      end: 81,
      category: "BRAND_IDENTITY",
      evidence_status: "SUPPORTED",
      severity: "LOW",
      blocking_for_review: false,
      explanation: "Verified by official product specification.",
      source_evidence: [{ source_id: "SRC-PRODUCT", source_version: 1, quote: "6g protein", authority: 100, score: 1 }],
      created_at: new Date().toISOString(),
    },
  ];

  it("highlights confirmed violations and unsupported claims while leaving compliant text unhighlighted", () => {
    expect(isActionableFinding(sampleFindings[0])).toBe(true); // CONTRADICTED -> actionable
    expect(isActionableFinding(sampleFindings[1])).toBe(true); // NO_APPROVED_EVIDENCE -> actionable
    expect(isActionableFinding(sampleFindings[2])).toBe(false); // SUPPORTED -> NOT actionable (stays clean)
  });

  it("assigns distinct visual classes based on evidence status and severity", () => {
    expect(getAnnotationVisualClass("CONTRADICTED", "HIGH")).toBe("annotation-violation");
    expect(getAnnotationVisualClass("CONFLICT", "MEDIUM")).toBe("annotation-violation");
    expect(getAnnotationVisualClass("NO_APPROVED_EVIDENCE", "MEDIUM")).toBe("annotation-unsupported");
    expect(getAnnotationVisualClass("NEEDS_HUMAN", "REVIEW")).toBe("annotation-needshuman");
    expect(getAnnotationVisualClass("SUPPORTED", "LOW")).toBe("annotation-informational");
  });
});

describe("Multimodal Workspace — Format-Aware Coordinate Mapping", () => {
  const content = "Sample Foods Oat Bites. 6g protein per serving. Cures chronic fatigue. #ad";
  const findings: Finding[] = [
    {
      finding_id: "F-CURE",
      review_id: "rev-1",
      draft_id: "d-1",
      draft_version_id: "d-1-v1",
      draft_hash: "hash",
      claim_id: "C-CURE",
      claim_text: "Cures chronic fatigue",
      start: content.indexOf("Cures chronic fatigue"),
      end: content.indexOf("Cures chronic fatigue") + "Cures chronic fatigue".length,
      category: "PROHIBITED_CLAIM",
      evidence_status: "CONTRADICTED",
      severity: "HIGH",
      blocking_for_review: true,
      explanation: "Prohibited health claim.",
      source_evidence: [],
      created_at: new Date().toISOString(),
    },
  ];

  it("maps findings to PDF page coordinates", () => {
    const structuralData: StructuralDocumentData = {
      pages: [
        { pageNumber: 1, text: "Sample Foods Oat Bites. 6g protein per serving." },
        {
          pageNumber: 2,
          text: "Cures chronic fatigue. #ad",
          wordBoxes: [{ text: "Cures chronic fatigue", bbox: { x: 15, y: 40, width: 70, height: 10, unit: "percent" } }],
        },
      ],
    };

    const annotations = mapFindingsToAnnotations(findings, content, structuralData, "pdf");
    expect(annotations).toHaveLength(1);
    expect(annotations[0].locationType).toBe("PDF_PAGE");
    expect(annotations[0].pageNumber).toBe(2);
    expect(annotations[0].boundingBox).toEqual({ x: 15, y: 40, width: 70, height: 10, unit: "percent" });
  });

  it("maps findings to PPTX slide coordinates", () => {
    const structuralData: StructuralDocumentData = {
      slides: [
        { slideNumber: 1, title: "Title Slide", text: "Sample Foods Oat Bites", elements: [] },
        { slideNumber: 2, title: "Benefits", text: "Cures chronic fatigue. #ad", elements: [] },
      ],
    };

    const annotations = mapFindingsToAnnotations(findings, content, structuralData, "pptx");
    expect(annotations).toHaveLength(1);
    expect(annotations[0].locationType).toBe("PPTX_SLIDE");
    expect(annotations[0].slideNumber).toBe(2);
  });

  it("maps findings to XLSX worksheet and cell references", () => {
    const structuralData: StructuralDocumentData = {
      sheets: [
        {
          sheetIndex: 1,
          sheetName: "Claims List",
          rows: [
            {
              rowIndex: 1,
              cells: [
                { colIndex: 1, colLetter: "A", cellRef: "A1", value: "Product Name" },
                { colIndex: 2, colLetter: "B", cellRef: "B1", value: "Promotional Claim" },
              ],
            },
            {
              rowIndex: 2,
              cells: [
                { colIndex: 1, colLetter: "A", cellRef: "A2", value: "Sample Foods Oat Bites" },
                { colIndex: 2, colLetter: "B", cellRef: "B2", value: "Cures chronic fatigue" },
              ],
            },
          ],
        },
      ],
    };

    const annotations = mapFindingsToAnnotations(findings, content, structuralData, "xlsx");
    expect(annotations).toHaveLength(1);
    expect(annotations[0].locationType).toBe("XLSX_CELL");
    expect(annotations[0].sheetRef).toBe("Claims List");
    expect(annotations[0].cellRef).toBe("B2");
  });

  it("maps findings to Video timeline timestamps and keyframes", () => {
    const structuralData: StructuralDocumentData = {
      transcriptSegments: [
        { id: "seg-1", startSeconds: 0, endSeconds: 4.5, text: "Sample Foods Oat Bites" },
        { id: "seg-2", startSeconds: 5.0, endSeconds: 9.8, text: "Cures chronic fatigue and gives instant energy" },
      ],
      frames: [
        { frameId: "f-1", timestampSeconds: 2.0, ocrText: "Sample Foods" },
        { frameId: "f-2", timestampSeconds: 7.2, ocrText: "Cures chronic fatigue" },
      ],
    };

    const annotations = mapFindingsToAnnotations(findings, content, structuralData, "mp4");
    expect(annotations).toHaveLength(1);
    expect(annotations[0].locationType).toBe("VIDEO_TIMESTAMP");
    expect(annotations[0].videoTimestamp).toEqual({ startSeconds: 5.0, endSeconds: 9.8 });
    expect(annotations[0].transcriptSegmentId).toBe("seg-2");
  });

  it("maps findings to Audio transcript segments and timestamps", () => {
    const structuralData: StructuralDocumentData = {
      transcriptSegments: [
        { id: "audio-seg-1", startSeconds: 0, endSeconds: 3.5, speaker: "Narrator", text: "Welcome to Sample Foods." },
        { id: "audio-seg-2", startSeconds: 3.6, endSeconds: 7.0, speaker: "Narrator", text: "Cures chronic fatigue in 3 days." },
      ],
    };

    const annotations = mapFindingsToAnnotations(findings, content, structuralData, "mp3");
    expect(annotations).toHaveLength(1);
    expect(annotations[0].locationType).toBe("AUDIO_TIMESTAMP");
    expect(annotations[0].audioTimestamp).toEqual({ startSeconds: 3.6, endSeconds: 7.0 });
    expect(annotations[0].transcriptSegmentId).toBe("audio-seg-2");
  });

  it("maps findings to Image bounding boxes with sensible fallback", () => {
    const structuralData: StructuralDocumentData = {
      frames: [
        {
          frameId: "poster-main",
          timestampSeconds: 0,
          ocrText: "Sample Foods. Cures chronic fatigue.",
          wordBoxes: [
            { text: "Cures chronic fatigue", bbox: { x: 20, y: 55, width: 60, height: 15, unit: "percent" } },
          ],
        },
      ],
    };

    const annotations = mapFindingsToAnnotations(findings, content, structuralData, "png");
    expect(annotations).toHaveLength(1);
    expect(annotations[0].locationType).toBe("IMAGE_BBOX");
    expect(annotations[0].boundingBox).toEqual({ x: 20, y: 55, width: 60, height: 15, unit: "percent" });
  });
});

describe("Multimodal Workspace — Dynamic Re-anchoring on Text Edit", () => {
  it("re-anchors annotations dynamically when preceding text is edited", () => {
    const initialText = "Header Title. Cures chronic fatigue. Footer.";
    const finding: Finding = {
      finding_id: "F-1",
      review_id: "rev-1",
      draft_id: "d-1",
      draft_version_id: "d-1-v1",
      draft_hash: "hash",
      claim_id: "C-1",
      claim_text: "Cures chronic fatigue",
      start: initialText.indexOf("Cures chronic fatigue"),
      end: initialText.indexOf("Cures chronic fatigue") + "Cures chronic fatigue".length,
      category: "PROHIBITED_CLAIM",
      evidence_status: "CONTRADICTED",
      severity: "HIGH",
      blocking_for_review: true,
      explanation: "Health claim",
      source_evidence: [],
      created_at: new Date().toISOString(),
    };

    const initialAnnotations = mapFindingsToAnnotations([finding], initialText, undefined, "txt");
    expect(initialAnnotations[0].startOffset).toBe(14);
    expect(initialAnnotations[0].endOffset).toBe(35);

    // Prepend text to the document
    const updatedText = "New Brand Prefix Line.\n" + initialText;
    const recalculated = recalculateAnnotationsOnTextEdit(initialAnnotations, initialText, updatedText);

    expect(recalculated).toHaveLength(1);
    expect(recalculated[0].startOffset).toBe(updatedText.indexOf("Cures chronic fatigue"));
    expect(recalculated[0].endOffset).toBe(updatedText.indexOf("Cures chronic fatigue") + "Cures chronic fatigue".length);
    expect(recalculated[0].startOffset).toBeGreaterThan(14);
  });

  it("removes resolved finding annotation when correction is applied", () => {
    const initialText = "Sample Foods cures chronic fatigue.";
    const annotations: ContentAnnotation[] = [
      {
        id: "ann-1",
        findingId: "F-APPLY",
        locationType: "TEXT_OFFSET",
        category: "PROHIBITED_CLAIM",
        severity: "HIGH",
        evidenceStatus: "CONTRADICTED",
        isActionable: true,
        claimText: "cures chronic fatigue",
        explanation: "Prohibited health promise",
        startOffset: 13,
        endOffset: 34,
      },
      {
        id: "ann-2",
        findingId: "F-OTHER",
        locationType: "TEXT_OFFSET",
        category: "BRAND_IDENTITY",
        severity: "LOW",
        evidenceStatus: "NO_APPROVED_EVIDENCE",
        isActionable: true,
        claimText: "Sample Foods",
        explanation: "Product name check",
        startOffset: 0,
        endOffset: 12,
      },
    ];

    const updatedText = "Sample Foods provides delicious daily energy.";
    const result = recalculateAnnotationsOnTextEdit(
      annotations,
      initialText,
      updatedText,
      "F-APPLY",
      "provides delicious daily energy"
    );

    // F-APPLY removed, F-OTHER retained
    expect(result).toHaveLength(1);
    expect(result[0].findingId).toBe("F-OTHER");
    expect(result[0].startOffset).toBe(0);
    expect(result[0].endOffset).toBe(12);
  });
});
