/**
 * OnBrand Multimodal Interactive Content Review Workspace
 * Core Types, Contracts, Coordinate Mappers, and Annotation Engine
 */

import { type Finding, codePointToUtf16Offset, stableHash } from "./onbrand";

// ============================================================================
// 1. Common Annotation Contract (Section 3)
// ============================================================================

export type BoundingBox = {
  x: number;      // 0 to 100 (% of container width) or absolute pixels
  y: number;      // 0 to 100 (% of container height) or absolute pixels
  width: number;  // 0 to 100 (% of container width) or absolute pixels
  height: number; // 0 to 100 (% of container height) or absolute pixels
  unit?: "percent" | "pixel";
};

export type ContentLocationType =
  | "TEXT_OFFSET"
  | "PDF_PAGE"
  | "DOCX_PARAGRAPH"
  | "IMAGE_BBOX"
  | "PPTX_SLIDE"
  | "XLSX_CELL"
  | "VIDEO_TIMESTAMP"
  | "AUDIO_TIMESTAMP"
  | "STRUCTURED_ROW";

export interface ContentAnnotation {
  id: string;
  findingId: string;
  locationType: ContentLocationType;
  category: "BRAND_IDENTITY" | "PROHIBITED_CLAIM" | "FACT_CONFLICT" | "VISUAL" | "ACCESSIBILITY" | "SOURCE_SECURITY" | "MESSAGE" | string;
  severity: "HIGH" | "MEDIUM" | "LOW" | "REVIEW";
  evidenceStatus: import("./onbrand").EvidenceStatus;
  isActionable: boolean; // True for violations, conflicts, unverified claims, and human review items; false for compliant/informational

  // Location Targets
  startOffset?: number;
  endOffset?: number;
  pageNumber?: number;
  paragraphIndex?: number;
  blockId?: string;
  boundingBox?: BoundingBox;
  slideNumber?: number;
  elementId?: string;
  sheetRef?: string;       // e.g. "Worksheet 1" or "Q3 Financials"
  cellRef?: string;        // e.g. "B4", "C12"
  videoTimestamp?: { startSeconds: number; endSeconds: number };
  frameId?: string;
  audioTimestamp?: { startSeconds: number; endSeconds: number };
  transcriptSegmentId?: string;
  rowNumber?: number;

  // Rich Explanation & Governance Data
  claimText: string;
  previewText?: string;
  explanation: string;
  whyItMatters?: string;
  evidenceQuote?: string;
  evidenceSourceId?: string;
  confidence?: number;
  suggestedCorrection?: string;
}

// ============================================================================
// 2. Unified Content Ingestion Architecture (Section 1)
// ============================================================================

export type IngestionProcessingStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type ExtractionStatus = "RELIABLE" | "NEEDS_PROOFREAD" | "UNREADABLE" | "DIRECT" | "FAILED";

export interface PageData {
  pageNumber: number;
  text: string;
  wordBoxes?: Array<{ text: string; bbox: BoundingBox }>;
  lineBoxes?: Array<{ text: string; bbox: BoundingBox }>;
}

export interface SlideData {
  slideNumber: number;
  title?: string;
  text: string;
  elements: Array<{ id: string; type: "text" | "shape" | "image"; content: string }>;
}

export interface SheetData {
  sheetIndex: number;
  sheetName: string;
  rows: Array<{
    rowIndex: number;
    cells: Array<{ colIndex: number; colLetter: string; cellRef: string; value: string; formula?: string }>;
  }>;
}

export interface TranscriptSegment {
  id: string;
  startSeconds: number;
  endSeconds: number;
  speaker?: string;
  text: string;
}

export interface MediaFrameData {
  frameId: string;
  timestampSeconds: number;
  thumbnailUrl?: string;
  ocrText?: string;
  wordBoxes?: Array<{ text: string; bbox: BoundingBox }>;
  lineBoxes?: Array<{ text: string; bbox: BoundingBox }>;
  dominantColors?: string[];
}

export interface StructuralDocumentData {
  pages?: PageData[];
  slides?: SlideData[];
  sheets?: SheetData[];
  transcriptSegments?: TranscriptSegment[];
  frames?: MediaFrameData[];
  paragraphs?: Array<{ index: number; text: string; headingLevel?: number }>;
}

export interface UnifiedContentIngestion {
  id: string;
  organizationId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
  uploadedAt: string;
  storageRef: string;
  processingStatus: IngestionProcessingStatus;
  extractionStatus: ExtractionStatus;
  qualityMetadata: {
    ocrConfidence?: number;
    readableTokenRatio?: number;
    noisyCharacterRatio?: number;
    durationSeconds?: number;
    frameCount?: number;
    isSampled?: boolean;
    samplingNote?: string;
    codec?: string;
  };
  extractedText: string;
  structuralData: StructuralDocumentData;
  annotations: ContentAnnotation[];
}

// ============================================================================
// 3. Selective Highlighting Filter (Section 4)
// ============================================================================

/**
 * Filter findings to only highlight confirmed violations, unsupported claims,
 * and material issues requiring human judgement. Compliant and purely informational text
 * remains clean and unhighlighted.
 */
export function isActionableFinding(finding: Finding): boolean {
  if (finding.evidence_status === "SUPPORTED") return false;
  if (finding.category === "INFORMATIONAL" && !finding.blocking_for_review) return false;
  return (
    finding.evidence_status === "CONTRADICTED" ||
    finding.evidence_status === "CONFLICT" ||
    finding.evidence_status === "NO_APPROVED_EVIDENCE" ||
    finding.evidence_status === "NEEDS_HUMAN" ||
    finding.blocking_for_review === true
  );
}

export function getAnnotationVisualClass(evidenceStatus: string, severity: string): string {
  if (evidenceStatus === "CONTRADICTED" || evidenceStatus === "CONFLICT" || severity === "HIGH") {
    return "annotation-violation";
  }
  if (evidenceStatus === "NO_APPROVED_EVIDENCE" || severity === "MEDIUM") {
    return "annotation-unsupported";
  }
  if (evidenceStatus === "NEEDS_HUMAN" || severity === "REVIEW") {
    return "annotation-needshuman";
  }
  return "annotation-informational";
}

// ============================================================================
// 4. Dynamic Offset Re-anchoring & Annotation Recalculation (Section 3 & 7)
// ============================================================================

/**
 * When the user edits document text or applies a suggested correction,
 * recalculate and re-anchor affected annotations so highlights stay synchronized
 * and never point to stale or mismatched text offsets.
 */
export function recalculateAnnotationsOnTextEdit(
  annotations: ContentAnnotation[],
  previousText: string,
  updatedText: string,
  appliedFindingId?: string,
  _replacementText?: string
): ContentAnnotation[] {
  if (previousText === updatedText && !appliedFindingId) return annotations;

  const remainingAnnotations: ContentAnnotation[] = [];

  for (const ann of annotations) {
    // If this specific finding was resolved/applied, remove its highlight
    if (ann.findingId === appliedFindingId) continue;

    // For text-offset-based annotations, re-locate the claim text verbatim in the updated text
    if (ann.startOffset !== undefined && ann.endOffset !== undefined) {
      const claimText = ann.claimText.trim();
      if (!claimText) continue;

      // First check if claim text is still present around the expected position
      let newStart = updatedText.indexOf(claimText, Math.max(0, (ann.startOffset || 0) - 50));
      if (newStart < 0) {
        // Fall back to searching entire text
        newStart = updatedText.indexOf(claimText);
      }

      if (newStart >= 0) {
        remainingAnnotations.push({
          ...ann,
          startOffset: newStart,
          endOffset: newStart + claimText.length,
        });
      } else {
        // Text was edited/removed; keep annotation as an unanchored finding note
        remainingAnnotations.push({
          ...ann,
          startOffset: undefined,
          endOffset: undefined,
          previewText: `${ann.claimText} (edited)`,
        });
      }
    } else {
      // Non-offset annotations (e.g. image bbox, slide number, sheet cell, video timestamp) remain anchored to their structural container
      remainingAnnotations.push(ann);
    }
  }

  return remainingAnnotations;
}

// ============================================================================
// 5. Mapping Findings to Multimodal Annotations
// ============================================================================

/**
 * Transforms a list of engine findings and structural document data into
 * format-aware ContentAnnotations for interactive rendering.
 */
export function mapFindingsToAnnotations(
  findings: Finding[],
  content: string,
  structuralData?: StructuralDocumentData,
  extension?: string
): ContentAnnotation[] {
  const annotations: ContentAnnotation[] = [];
  const ext = extension?.toLowerCase().replace(/^\./, "") ?? "";

  for (const finding of findings) {
    const actionable = isActionableFinding(finding);
    const baseAnn: ContentAnnotation = {
      id: `ann-${finding.finding_id}-${stableHash(finding.claim_text).slice(0, 6)}`,
      findingId: finding.finding_id,
      locationType: "TEXT_OFFSET",
      category: finding.category,
      severity: finding.severity,
      evidenceStatus: finding.evidence_status,
      isActionable: actionable,
      claimText: finding.claim_text,
      previewText: finding.claim_text,
      explanation: finding.explanation,
      confidence: (finding as { confidence?: number }).confidence,
      suggestedCorrection: finding.suggestion,
      startOffset: codePointToUtf16Offset(content, finding.start),
      endOffset: codePointToUtf16Offset(content, finding.end),
    };

    // Extract evidence details if present
    if (finding.source_evidence && finding.source_evidence.length > 0) {
      baseAnn.evidenceSourceId = finding.source_evidence[0].source_id;
      baseAnn.evidenceQuote = finding.source_evidence[0].quote;
    }

    // 1. PDF page mapping
    if (structuralData?.pages && structuralData.pages.length > 0) {
      baseAnn.locationType = "PDF_PAGE";
      for (const page of structuralData.pages) {
        if (page.text.includes(finding.claim_text)) {
          baseAnn.pageNumber = page.pageNumber;
          // Check for word bounding boxes if available
          if (page.wordBoxes) {
            const matchedBox = page.wordBoxes.find((b) => finding.claim_text.includes(b.text));
            if (matchedBox) baseAnn.boundingBox = matchedBox.bbox;
          }
          break;
        }
      }
    }

    // 2. PPTX slide mapping
    else if (structuralData?.slides && structuralData.slides.length > 0) {
      baseAnn.locationType = "PPTX_SLIDE";
      for (const slide of structuralData.slides) {
        if (slide.text.includes(finding.claim_text)) {
          baseAnn.slideNumber = slide.slideNumber;
          break;
        }
      }
    }

    // 3. XLSX spreadsheet cell mapping
    else if (structuralData?.sheets && structuralData.sheets.length > 0) {
      baseAnn.locationType = "XLSX_CELL";
      for (const sheet of structuralData.sheets) {
        for (const row of sheet.rows) {
          const matchCell = row.cells.find((c) => c.value && (c.value.includes(finding.claim_text) || finding.claim_text.includes(c.value)));
          if (matchCell) {
            baseAnn.sheetRef = sheet.sheetName;
            baseAnn.cellRef = matchCell.cellRef;
            break;
          }
        }
        if (baseAnn.cellRef) break;
      }
    }

    // 4. Audio timestamp mapping
    else if (["mp3", "wav", "m4a"].includes(ext)) {
      baseAnn.locationType = "AUDIO_TIMESTAMP";
      if (structuralData?.transcriptSegments) {
        const seg = structuralData.transcriptSegments.find((s) => s.text.includes(finding.claim_text) || finding.claim_text.includes(s.text));
        if (seg) {
          baseAnn.audioTimestamp = { startSeconds: seg.startSeconds, endSeconds: seg.endSeconds };
          baseAnn.transcriptSegmentId = seg.id;
        }
      }
    }

    // 5. Image bounding box mapping
    else if (["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"].includes(ext)) {
      const frame = structuralData?.frames?.[0];
      if (frame) {
        // First check lineBoxes for exact or substring matches
        if (frame.lineBoxes && frame.lineBoxes.length > 0) {
          const matchedLine = frame.lineBoxes.find((l) => {
            const cleanL = l.text.toLowerCase().replace(/[^\w\s]/g, "").trim();
            const cleanClaim = finding.claim_text.toLowerCase().replace(/[^\w\s]/g, "").trim();
            return cleanL.length > 2 && (cleanL.includes(cleanClaim) || cleanClaim.includes(cleanL));
          });
          if (matchedLine) {
            baseAnn.locationType = "IMAGE_BBOX";
            baseAnn.boundingBox = matchedLine.bbox;
          }
        }

        // If not matched to a single line, match constituent words in wordBoxes and compute union bounding box
        if (!baseAnn.boundingBox && frame.wordBoxes && frame.wordBoxes.length > 0) {
          const claimWords = finding.claim_text
            .toLowerCase()
            .replace(/[^\w\s-]/g, "")
            .split(/\s+/)
            .filter((w) => w.length > 2);

          const matchedBoxes = frame.wordBoxes.filter((wb) => {
            const cleanWord = wb.text.toLowerCase().replace(/[^\w\s-]/g, "");
            return claimWords.some((cw) => cleanWord === cw || cleanWord.includes(cw) || cw.includes(cleanWord));
          });

          if (matchedBoxes.length === 1) {
            baseAnn.locationType = "IMAGE_BBOX";
            baseAnn.boundingBox = matchedBoxes[0].bbox;
          } else if (matchedBoxes.length > 1) {
            const minX = Math.max(0, Math.min(...matchedBoxes.map((b) => b.bbox.x)));
            const minY = Math.max(0, Math.min(...matchedBoxes.map((b) => b.bbox.y)));
            const maxX = Math.min(100, Math.max(...matchedBoxes.map((b) => b.bbox.x + b.bbox.width)));
            const maxY = Math.min(100, Math.max(...matchedBoxes.map((b) => b.bbox.y + b.bbox.height)));
            baseAnn.locationType = "IMAGE_BBOX";
            baseAnn.boundingBox = {
              x: Math.round(minX * 10) / 10,
              y: Math.round(minY * 10) / 10,
              width: Math.round((maxX - minX) * 10) / 10,
              height: Math.round((maxY - minY) * 10) / 10,
              unit: "percent",
            };
          }
        }
      }

      // If coordinates cannot be established reliably, do NOT fabricate fake highlights.
      // Leave boundingBox undefined and keep locationType as TEXT_OFFSET.
      if (!baseAnn.boundingBox) {
        baseAnn.locationType = "TEXT_OFFSET";
      }
    }

    // 6. Video & Reel timestamp mapping
    else if (["mp4", "webm", "mov"].includes(ext) || (structuralData?.frames && structuralData.frames.length > 0) || (structuralData?.transcriptSegments && structuralData.transcriptSegments.length > 0)) {
      baseAnn.locationType = "VIDEO_TIMESTAMP";
      if (structuralData?.transcriptSegments) {
        const seg = structuralData.transcriptSegments.find((s) => s.text.includes(finding.claim_text) || finding.claim_text.includes(s.text));
        if (seg) {
          baseAnn.videoTimestamp = { startSeconds: seg.startSeconds, endSeconds: seg.endSeconds };
          baseAnn.transcriptSegmentId = seg.id;
        }
      }
      if (!baseAnn.videoTimestamp && structuralData?.frames) {
        const frame = structuralData.frames.find((f) => f.ocrText && f.ocrText.includes(finding.claim_text));
        if (frame) {
          baseAnn.videoTimestamp = { startSeconds: frame.timestampSeconds, endSeconds: frame.timestampSeconds + 2 };
          baseAnn.frameId = frame.frameId;
        }
      }
    }

    annotations.push(baseAnn);
  }

  return annotations;
}
