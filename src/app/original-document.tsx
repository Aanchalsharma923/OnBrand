"use client";
/* eslint-disable @next/next/no-img-element -- Local original media is displayed without site-image transformations. */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { codePointToUtf16Offset, Finding } from "@/lib/onbrand";
import { mapSequentialTextLocations, splitTextAtFindings, TextLocation } from "@/lib/document-locations";
import { getOriginalDocument } from "@/lib/document-store";
import {
  mapFindingsToAnnotations,
  isActionableFinding,
  getAnnotationVisualClass,
  type StructuralDocumentData,
  type SlideData,
  type SheetData,
  type TranscriptSegment,
} from "@/lib/multimodal-workspace";
import { resolveFormat } from "@/lib/format-registry";
import { generateDocxBlob } from "@/lib/docx-export";

type Props = {
  fileKey: string;
  name: string;
  type: string;
  content: string;
  findings: Finding[];
  selectedFindingId: string | null;
  onSelectFinding: (findingId: string) => void;
  currentReview: boolean;
  onUpdateContent?: (updatedContent: string) => void;
  structuralData?: StructuralDocumentData;
  directFile?: File | Blob;
};

type DocBlock = { type: "paragraph"; location: TextLocation } | { type: "table"; rows: DocBlock[][][] };
const wordNamespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

// ============================================================================
// Interactive Annotation Tooltip Component (Section 3)
// ============================================================================

export function AnnotationTooltip({
  finding,
  onInspect,
}: {
  finding?: Finding;
  onInspect: () => void;
}) {
  if (!finding) return null;
  const isViolation = finding.evidence_status === "CONTRADICTED" || finding.evidence_status === "CONFLICT";
  const statusLabel = isViolation ? "Confirmed Violation" : finding.evidence_status === "NO_APPROVED_EVIDENCE" ? "Needs Evidence" : "Needs Review";

  return (
    <div className="annotation-hover-card" role="tooltip">
      <div className="annotation-hover-header">
        <span className={`annotation-badge ${finding.severity.toLowerCase()}`}>
          {finding.category.replace(/_/g, " ")} · {finding.severity}
        </span>
        <span className="annotation-status-pill">{statusLabel}</span>
      </div>
      <p className="annotation-hover-explanation">{finding.explanation}</p>
      {finding.suggestion && (
        <div className="annotation-hover-suggestion">
          <small>Recommended Action:</small>
          <span>{finding.suggestion}</span>
        </div>
      )}
      <button type="button" className="annotation-inspect-btn" onClick={onInspect}>
        Inspect finding in review panel →
      </button>
    </div>
  );
}

// ============================================================================
// Highlighted Text Component with Interactive Tooltips
// ============================================================================

export function HighlightedText({
  text,
  start,
  ranges,
  onSelect,
  selectedFindingId,
  findingsMap,
}: {
  text: string;
  start: number;
  ranges: Array<{ id: string; start: number; end: number; classification?: string }>;
  onSelect: (id: string) => void;
  selectedFindingId?: string | null;
  findingsMap?: Map<string, Finding>;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <>
      {splitTextAtFindings(text, start, ranges).map((part, index) => {
        if (!part.findingIds.length) return <span key={index}>{part.text}</span>;
        const activeRange = ranges.find((r) => part.findingIds.includes(r.id));
        const cls = activeRange?.classification ?? "unsupported";
        const isSelected = part.findingIds.includes(selectedFindingId ?? "");
        const primaryFindingId = part.findingIds[0];
        const finding = findingsMap?.get(primaryFindingId);

        return (
          <span
            key={index}
            className="highlight-wrapper"
            onMouseEnter={() => setHoveredId(primaryFindingId)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <mark
              className={`document-finding-mark ${cls}${isSelected ? " selected" : ""}`}
              data-finding-ids={part.findingIds.join(" ")}
              onClick={() => onSelect(primaryFindingId)}
              tabIndex={0}
              role="button"
              aria-label={`Finding: ${finding?.claim_text || part.text} (${cls})`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(primaryFindingId);
                }
              }}
            >
              {part.text}
            </mark>
            {hoveredId === primaryFindingId && finding && (
              <AnnotationTooltip finding={finding} onInspect={() => onSelect(primaryFindingId)} />
            )}
          </span>
        );
      })}
    </>
  );
}

// ============================================================================
// 1. PDF Viewer Component (Milestone 1)
// ============================================================================

function PdfViewer({
  file,
  content,
  findings,
  selectedFindingId,
  onSelectFinding,
  currentReview,
  onUpdateContent,
}: Omit<Props, "fileKey" | "name" | "type"> & { file: Blob }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pageLocations, setPageLocations] = useState<TextLocation[]>([]);
  const [error, setError] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editableText, setEditableText] = useState(content);

  const ranges = useMemo(
    () =>
      currentReview
        ? findings
            .filter((f) => isActionableFinding(f))
            .map((finding) => ({
              id: finding.finding_id,
              start: codePointToUtf16Offset(content, finding.start),
              end: codePointToUtf16Offset(content, finding.end),
              classification:
                finding.evidence_status === "CONTRADICTED" || finding.evidence_status === "CONFLICT"
                  ? "violation"
                  : finding.evidence_status === "NO_APPROVED_EVIDENCE"
                  ? "unsupported"
                  : "needshuman",
            }))
        : [],
    [content, currentReview, findings]
  );

  useEffect(() => {
    let active = true;
    let loadingTask: import("pdfjs-dist").PDFDocumentLoadingTask | undefined;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
        const pdf = await loadingTask.promise;
        if (!active) {
          await loadingTask.destroy();
          return;
        }
        pdfRef.current = pdf;
        setPageCount(pdf.numPages);
        const pageTexts: Array<{ index: number; text: string }> = [];
        for (let index = 1; index <= pdf.numPages; index += 1) {
          const page = await pdf.getPage(index);
          const textContent = await page.getTextContent();
          const text = textContent.items.map((item) => ("str" in item ? item.str : "")).filter(Boolean).join(" ").trim();
          if (text) pageTexts.push({ index, text });
        }
        if (active) setPageLocations(mapSequentialTextLocations(pageTexts, content, "\n\n"));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "This PDF could not be opened.");
      }
    })();
    return () => {
      active = false;
      pdfRef.current = null;
      void loadingTask?.destroy();
    };
  }, [content, file]);

  useEffect(() => {
    let active = true;
    let renderTask: import("pdfjs-dist").RenderTask | undefined;
    let textLayer: import("pdfjs-dist").TextLayer | undefined;
    (async () => {
      const pdf = pdfRef.current;
      const canvas = canvasRef.current;
      const textLayerContainer = textLayerRef.current;
      if (!pdf || !canvas || !textLayerContainer || !pageCount) return;
      try {
        const pdfjs = await import("pdfjs-dist");
        const page = await pdf.getPage(pageNumber);
        const scale = 1.15 * zoom;
        const viewport = page.getViewport({ scale });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        textLayerContainer.style.width = `${viewport.width}px`;
        textLayerContainer.style.height = `${viewport.height}px`;
        textLayerContainer.style.setProperty("--total-scale-factor", String(scale));
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("The browser could not render this PDF page.");
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        await renderTask.promise;
        if (!active) return;
        textLayerContainer.replaceChildren();
        const textContent = await page.getTextContent();
        textLayer = new pdfjs.TextLayer({ textContentSource: textContent, container: textLayerContainer, viewport });
        await textLayer.render();
        if (!active) return;
        const pageLocation = pageLocations.find((location) => location.index === pageNumber);
        if (!pageLocation) return;
        const items = textContent.items.filter((item) => "str" in item && Boolean(item.str));
        let localOffset = 0;
        const textDivs = textLayer.textDivs;
        let textDivIndex = 0;
        for (const item of items) {
          if (!("str" in item)) continue;
          const index = textDivIndex++;
          if (index >= textDivs.length) break;
          if (index > 0) localOffset += 1;
          const text = item.str;
          const div = textDivs[index];
          const pieces = splitTextAtFindings(text, pageLocation.start + localOffset, ranges);
          div.replaceChildren(
            ...pieces.map((piece) => {
              if (!piece.findingIds.length) return document.createTextNode(piece.text);
              const activeRange = ranges.find((r) => piece.findingIds.includes(r.id));
              const cls = activeRange?.classification ?? "unsupported";
              const isSelected = piece.findingIds.includes(selectedFindingId ?? "");
              const mark = document.createElement("mark");
              mark.className = `pdf-finding-mark ${cls}${isSelected ? " selected" : ""}`;
              mark.dataset.findingIds = piece.findingIds.join(" ");
              mark.textContent = piece.text;
              mark.title = `Click to inspect finding (${cls})`;
              return mark;
            })
          );
          localOffset += text.length;
        }
      } catch (cause) {
        if (active && !(cause instanceof Error && cause.name === "RenderingCancelledException")) {
          setError(cause instanceof Error ? cause.message : "This PDF page could not be displayed.");
        }
      }
    })();
    return () => {
      active = false;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [pageCount, pageLocations, pageNumber, ranges, selectedFindingId, zoom]);

  useEffect(() => {
    if (!selectedFindingId || !currentReview) return;
    const finding = findings.find((candidate) => candidate.finding_id === selectedFindingId);
    if (!finding) return;
    const start = codePointToUtf16Offset(content, finding.start);
    const location = pageLocations.find((candidate) => start >= candidate.start && start < candidate.end);
    if (location && pageNumber !== location.index) {
      const frame = window.requestAnimationFrame(() => setPageNumber(location.index));
      return () => window.cancelAnimationFrame(frame);
    }
  }, [content, currentReview, findings, pageLocations, pageNumber, selectedFindingId]);

  function selectFromPage(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-finding-ids]") : null;
    const id = target?.dataset.findingIds?.split(" ")[0];
    if (id) onSelectFinding(id);
  }

  function handleSaveEdit() {
    if (onUpdateContent && editableText !== content) {
      onUpdateContent(editableText);
    }
    setEditMode(false);
  }

  function handleExportRevised() {
    const blob = new Blob([editableText], { type: "text/plain;charset=utf-8" });
    const exportUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = exportUrl;
    link.download = "revised_document.txt";
    link.click();
    URL.revokeObjectURL(exportUrl);
  }

  return (
    <div className="pdf-reader" aria-label="PDF document viewer">
      {error ? (
        <p className="original-preview-message" role="alert">{error}</p>
      ) : (
        <>
          <div className="pdf-reader-toolbar">
            <button type="button" className="small-ghost" onClick={() => setPageNumber((v) => Math.max(1, v - 1))} disabled={pageNumber <= 1}>
              Previous
            </button>
            <label>
              Page{" "}
              <input
                aria-label="PDF page number"
                type="number"
                min={1}
                max={pageCount || 1}
                value={pageNumber}
                onChange={(e) => setPageNumber(Math.min(pageCount || 1, Math.max(1, Number(e.target.value) || 1)))}
              />{" "}
              of {pageCount || "…"}
            </label>
            <button type="button" className="small-ghost" onClick={() => setPageNumber((v) => Math.min(pageCount, v + 1))} disabled={pageNumber >= pageCount}>
              Next
            </button>
            <span className="pdf-toolbar-spacer" />
            <button aria-label="Zoom out" type="button" onClick={() => setZoom((v) => Math.max(0.7, Math.round((v - 0.1) * 10) / 10))} disabled={zoom <= 0.7}>
              −
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button aria-label="Zoom in" type="button" onClick={() => setZoom((v) => Math.min(1.8, Math.round((v + 0.1) * 10) / 10))} disabled={zoom >= 1.8}>
              ＋
            </button>
            <span className="pdf-toolbar-spacer" />
            <button type="button" className={`small-ghost ${editMode ? "active-tab" : ""}`} onClick={() => setEditMode(!editMode)}>
              {editMode ? "View PDF" : "Edit Text Layer"}
            </button>
            <button type="button" className="small-ghost" onClick={handleExportRevised}>
              Export Revised
            </button>
          </div>

          {editMode ? (
            <div className="editable-representation-layer">
              <div className="layer-header">
                <b>Editable Document Representation</b>
                <small>Edit extracted text or apply reviewer corrections. Original PDF remains preserved.</small>
              </div>
              <textarea
                className="editable-textarea"
                value={editableText}
                onChange={(e) => setEditableText(e.target.value)}
                rows={14}
              />
              <div className="layer-actions">
                <button type="button" className="primary-button" onClick={handleSaveEdit}>
                  Save & Re-anchor Highlights
                </button>
                <button type="button" className="small-ghost" onClick={() => setEditMode(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="pdf-page-scroll">
              <div className="pdf-page" onClick={selectFromPage}>
                <canvas ref={canvasRef} aria-label={`PDF page ${pageNumber}`} />
                <div className="textLayer" ref={textLayerRef} />
              </div>
            </div>
          )}

          <p className="document-location-note" aria-live="polite">
            Original PDF preserved. Selective highlights map to selectable text positions. Hover or click to inspect violations.
          </p>
        </>
      )}
    </div>
  );
}

// ============================================================================
// 2. DOCX Viewer Component (docx-preview + Structured Sections + Edit)
// ============================================================================

function DocxViewer({
  file,
  content,
  findings,
  selectedFindingId,
  onSelectFinding,
  currentReview,
  onUpdateContent,
}: Omit<Props, "fileKey" | "name" | "type"> & { file: Blob }) {
  const [activeTab, setActiveTab] = useState<"layout" | "sections" | "edit">("layout");
  const [blocks, setBlocks] = useState<DocBlock[]>([]);
  const [error, setError] = useState("");
  const [layoutRendered, setLayoutRendered] = useState(false);
  const [editableText, setEditableText] = useState(content);
  const docxContainerRef = useRef<HTMLDivElement>(null);
  const paragraphRefs = useRef(new Map<number, HTMLElement>());

  const findingsMap = useMemo(() => new Map(findings.map((f) => [f.finding_id, f])), [findings]);

  const ranges = useMemo(
    () =>
      currentReview
        ? findings
            .filter((f) => isActionableFinding(f))
            .map((finding) => ({
              id: finding.finding_id,
              start: codePointToUtf16Offset(content, finding.start),
              end: codePointToUtf16Offset(content, finding.end),
              classification:
                finding.evidence_status === "CONTRADICTED" || finding.evidence_status === "CONFLICT"
                  ? "violation"
                  : finding.evidence_status === "NO_APPROVED_EVIDENCE"
                  ? "unsupported"
                  : "needshuman",
            }))
        : [],
    [content, currentReview, findings]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const buffer = await file.arrayBuffer();
        if (buffer.byteLength < 4) {
          throw new Error("The file is empty (0 bytes).");
        }
        const header = new Uint8Array(buffer.slice(0, 4));
        const isZip = header[0] === 0x50 && header[1] === 0x4b;
        if (!isZip) {
          throw new Error("This file does not have a valid Word OpenXML (.docx) ZIP signature. It may be a legacy Word 97-2003 (.doc) binary file.");
        }

        // 1. High-fidelity rendering via docx-preview
        if (docxContainerRef.current) {
          try {
            const docx = await import("docx-preview");
            docxContainerRef.current.innerHTML = "";
            await docx.renderAsync(buffer, docxContainerRef.current, undefined, {
              className: "docx-preview-rendered",
              inWrapper: true,
              ignoreWidth: false,
              ignoreHeight: false,
              breakPages: true,
              renderHeaders: true,
              renderFooters: true,
            });
            if (active) setLayoutRendered(true);
          } catch (renderErr) {
            console.warn("docx-preview layout fallback:", renderErr);
            if (active) setActiveTab("sections");
          }
        }

        // 2. Extract structured paragraphs & tables for high-precision section view
        const { unzipSync } = await import("fflate");
        const archive = unzipSync(new Uint8Array(buffer), {
          filter: (entry) => entry.name === "word/document.xml" && entry.originalSize <= 10 * 1024 * 1024,
        });
        const xmlBytes = archive["word/document.xml"];
        if (xmlBytes) {
          const xml = new DOMParser().parseFromString(new TextDecoder().decode(xmlBytes), "application/xml");
          if (!xml.querySelector("parsererror")) {
            const paragraphElements = [...xml.getElementsByTagNameNS(wordNamespace, "p")];
            const paragraphTexts = paragraphElements
              .map((p) => [...p.getElementsByTagNameNS(wordNamespace, "t")].map((n) => n.textContent ?? "").join(""))
              .filter(Boolean);
            const locations = mapSequentialTextLocations(
              paragraphTexts.map((text, index) => ({ index, text })),
              content,
              "\n"
            );
            const locationByElement = new Map<Element, TextLocation>();
            let locationIndex = 0;
            for (const element of paragraphElements) {
              const text = [...element.getElementsByTagNameNS(wordNamespace, "t")].map((n) => n.textContent ?? "").join("");
              if (!text) continue;
              const location = locations[locationIndex++];
              if (location) locationByElement.set(element, location);
            }
            const renderChildren = (parent: Element): DocBlock[] =>
              [...parent.children].flatMap((child): DocBlock[] => {
                if (child.namespaceURI !== wordNamespace) return [];
                if (child.localName === "p") {
                  const location = locationByElement.get(child);
                  return location ? [{ type: "paragraph", location }] : [];
                }
                if (child.localName === "tbl") {
                  const rows = [...child.children]
                    .filter((el) => el.localName === "tr" && el.namespaceURI === wordNamespace)
                    .map((row) =>
                      [...row.children]
                        .filter((el) => el.localName === "tc" && el.namespaceURI === wordNamespace)
                        .map(renderChildren)
                    );
                  return [{ type: "table", rows }];
                }
                return [];
              });
            const body = xml.getElementsByTagNameNS(wordNamespace, "body")[0];
            if (body && active) setBlocks(renderChildren(body));
          }
        }
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Word document layout could not be displayed.");
          setActiveTab("sections");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [file, content]);

  useEffect(() => {
    if (!selectedFindingId || !currentReview) return;
    const finding = findings.find((candidate) => candidate.finding_id === selectedFindingId);
    if (!finding) return;
    const start = codePointToUtf16Offset(content, finding.start);
    const location = blocks
      .flatMap(function flatten(block): TextLocation[] {
        return block.type === "paragraph" ? [block.location] : block.rows.flatMap((r) => r.flatMap((c) => c.flatMap(flatten)));
      })
      .find((candidate) => start >= candidate.start && start < candidate.end);
    if (location) paragraphRefs.current.get(location.index)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [blocks, content, currentReview, findings, selectedFindingId]);

  function handleSaveEdit() {
    if (onUpdateContent && editableText !== content) {
      onUpdateContent(editableText);
    }
    setActiveTab("sections");
  }

  function handleExportDocx() {
    const docxBlob = generateDocxBlob(editableText);
    const exportUrl = URL.createObjectURL(docxBlob);
    const link = document.createElement("a");
    link.href = exportUrl;
    link.download = "revised_document.docx";
    link.click();
    URL.revokeObjectURL(exportUrl);
  }

  const renderBlocks = (items: DocBlock[], keyPrefix: string): React.ReactNode =>
    items.map((block, index) =>
      block.type === "paragraph" ? (
        <p
          key={`${keyPrefix}-p-${index}`}
          ref={(node) => {
            if (node) paragraphRefs.current.set(block.location.index, node);
          }}
          className="docx-paragraph"
          data-paragraph={block.location.index + 1}
        >
          <HighlightedText
            text={block.location.text}
            start={block.location.start}
            ranges={ranges}
            onSelect={onSelectFinding}
            selectedFindingId={selectedFindingId}
            findingsMap={findingsMap}
          />
        </p>
      ) : (
        <table key={`${keyPrefix}-table-${index}`} className="docx-table">
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{renderBlocks(cell, `${keyPrefix}-${index}-${rowIndex}-${cellIndex}`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    );

  return (
    <div className="docx-reading-view" aria-label="Word document view">
      <div className="viewer-toolbar-inline" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="format-badge docx">DOCX</span>
          <div className="viewer-mode-tabs">
            <button
              type="button"
              className={`viewer-tab-btn ${activeTab === "layout" ? "active" : ""}`}
              onClick={() => setActiveTab("layout")}
            >
              📄 Word Layout
            </button>
            <button
              type="button"
              className={`viewer-tab-btn ${activeTab === "sections" ? "active" : ""}`}
              onClick={() => setActiveTab("sections")}
            >
              📋 Structured Sections
            </button>
            <button
              type="button"
              className={`viewer-tab-btn ${activeTab === "edit" ? "active" : ""}`}
              onClick={() => setActiveTab("edit")}
            >
              ✏️ Edit Copy
            </button>
          </div>
        </div>

        <button type="button" className="small-ghost" onClick={handleExportDocx}>
          Export Revised DOCX
        </button>
      </div>

      {activeTab === "edit" ? (
        <div className="editable-representation-layer">
          <textarea
            className="editable-textarea"
            value={editableText}
            onChange={(e) => setEditableText(e.target.value)}
            rows={14}
          />
          <div className="layer-actions">
            <button type="button" className="primary-button" onClick={handleSaveEdit}>
              Apply & Re-anchor
            </button>
            <button type="button" className="small-ghost" onClick={() => setActiveTab("sections")}>
              Cancel
            </button>
          </div>
        </div>
      ) : activeTab === "layout" ? (
        <div className="docx-container-frame">
          <div ref={docxContainerRef} />
          {!layoutRendered && !error && (
            <p className="original-preview-message">Rendering Word layout…</p>
          )}
          {error && (
            <div className="legacy-format-banner">
              <span className="legacy-badge">NOTICE</span>
              <div className="legacy-info">
                <b>Layout notice: {error}</b>
                <p>Switched to structured section view below so all document text, headings, and tables remain accessible.</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="docx-sections-container">
          {blocks.length ? renderBlocks(blocks, "doc") : <p className="original-preview-message">Loading structured sections…</p>}
        </div>
      )}

      <p className="document-location-note">
        Word layout and paragraph structure preserved. Highlights map to verified claim locations. Source file preserved.
      </p>
    </div>
  );
}

// ============================================================================
// 3. PPTX Slide Viewer Component (Milestone 3)
// ============================================================================

function PptxViewer({
  content,
  findings,
  selectedFindingId,
  onSelectFinding,
  structuralData,
  onUpdateContent,
}: Omit<Props, "fileKey" | "name" | "type">) {
  const [currentSlide, setCurrentSlide] = useState(1);
  const [editMode, setEditMode] = useState(false);
  const [editableText, setEditableText] = useState(content);

  const slides: SlideData[] = useMemo(() => {
    if (structuralData?.slides && structuralData.slides.length > 0) {
      return structuralData.slides;
    }
    // Fallback: split content by slide headings
    const rawSlides = content.split(/Slide\s+(\d+)/i).filter(Boolean);
    const parsed: SlideData[] = [];
    for (let i = 0; i < rawSlides.length; i += 2) {
      const num = Number(rawSlides[i]) || Math.floor(i / 2) + 1;
      const text = rawSlides[i + 1] || "";
      parsed.push({
        slideNumber: num,
        title: `Slide ${num}`,
        text: text.trim(),
        elements: [{ id: `s-${num}-body`, type: "text", content: text.trim() }],
      });
    }
    return parsed.length > 0
      ? parsed
      : [{ slideNumber: 1, title: "Slide 1", text: content, elements: [{ id: "s-1", type: "text", content }] }];
  }, [content, structuralData]);

  const activeSlide = slides.find((s) => s.slideNumber === currentSlide) || slides[0];

  // Map findings that belong to this slide
  const slideFindings = findings.filter((f) => activeSlide.text.includes(f.claim_text));

  return (
    <div className="pptx-viewer-container" aria-label="PowerPoint presentation viewer">
      <div className="pptx-toolbar">
        <span className="format-badge pptx">PPTX</span>
        <div className="slide-selector">
          {slides.map((s) => {
            const hasIssue = findings.some((f) => s.text.includes(f.claim_text));
            return (
              <button
                key={s.slideNumber}
                type="button"
                className={`slide-pill ${currentSlide === s.slideNumber ? "active" : ""} ${hasIssue ? "issue" : ""}`}
                onClick={() => setCurrentSlide(s.slideNumber)}
              >
                Slide {s.slideNumber}
                {hasIssue && <span className="slide-issue-dot" title="Contains flagged issues" />}
              </button>
            );
          })}
        </div>
        <button type="button" className={`small-ghost ${editMode ? "active-tab" : ""}`} onClick={() => setEditMode(!editMode)}>
          {editMode ? "View Slide" : "Edit Slide Copy"}
        </button>
      </div>

      {editMode ? (
        <div className="editable-representation-layer">
          <textarea
            className="editable-textarea"
            value={editableText}
            onChange={(e) => setEditableText(e.target.value)}
            rows={12}
          />
          <div className="layer-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                if (onUpdateContent) onUpdateContent(editableText);
                setEditMode(false);
              }}
            >
              Save Slide Edits
            </button>
            <button type="button" className="small-ghost" onClick={() => setEditMode(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="pptx-slide-canvas">
          <div className="slide-card">
            <div className="slide-card-header">
              <span className="slide-badge">Slide {activeSlide.slideNumber}</span>
              <h4>{activeSlide.title || `Slide ${activeSlide.slideNumber}`}</h4>
            </div>
            <div className="slide-card-body">
              {activeSlide.elements.map((el) => (
                <div key={el.id} className="slide-element-box">
                  <p>{el.content}</p>
                </div>
              ))}
            </div>
          </div>

          {slideFindings.length > 0 && (
            <div className="slide-findings-tray">
              <b>Issues on Slide {activeSlide.slideNumber}:</b>
              <div className="slide-findings-chips">
                {slideFindings.map((f) => (
                  <button
                    key={f.finding_id}
                    type="button"
                    className={`slide-finding-chip ${f.evidence_status.toLowerCase()}${selectedFindingId === f.finding_id ? " selected" : ""}`}
                    onClick={() => onSelectFinding(f.finding_id)}
                  >
                    <span className="chip-badge">{f.category}</span>
                    <span>“{f.claim_text}”</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="document-location-note">
        Slide ordering and text elements preserved. Select a slide to inspect slide-specific findings.
      </p>
    </div>
  );
}

// ============================================================================
// 4. XLSX Spreadsheet Grid Viewer Component (Milestone 3)
// ============================================================================

function XlsxViewer({
  content,
  findings,
  selectedFindingId,
  onSelectFinding,
  structuralData,
  onUpdateContent,
}: Omit<Props, "fileKey" | "name" | "type">) {
  const [activeSheetIndex, setActiveSheetIndex] = useState(1);
  const [editCellRef, setEditCellRef] = useState<string | null>(null);
  const [cellEditValue, setCellEditValue] = useState("");

  const sheets: SheetData[] = useMemo(() => {
    if (structuralData?.sheets && structuralData.sheets.length > 0) {
      return structuralData.sheets;
    }
    // Fallback: parse tab-separated or newline text into a single sheet
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    const rows = lines.map((line, rIdx) => {
      const parts = line.split("\t");
      return {
        rowIndex: rIdx + 1,
        cells: parts.map((val, cIdx) => {
          const colLetter = String.fromCharCode(65 + Math.min(25, cIdx));
          return {
            colIndex: cIdx + 1,
            colLetter,
            cellRef: `${colLetter}${rIdx + 1}`,
            value: val.trim(),
          };
        }),
      };
    });
    return [{ sheetIndex: 1, sheetName: "Sheet 1", rows }];
  }, [content, structuralData]);

  const activeSheet = sheets.find((s) => s.sheetIndex === activeSheetIndex) || sheets[0];

  function getCellFinding(cellValue: string, cellRef: string): Finding | undefined {
    if (!cellValue) return undefined;
    return findings.find(
      (f) =>
        f.claim_text.includes(cellValue) ||
        cellValue.includes(f.claim_text) ||
        (f.claim_id && f.claim_id.includes(cellRef))
    );
  }

  function handleStartCellEdit(cellRef: string, initialVal: string, hasFormula?: boolean) {
    if (hasFormula) {
      alert("This cell contains a spreadsheet formula. Formulas are preserved and cannot be silently overwritten.");
      return;
    }
    setEditCellRef(cellRef);
    setCellEditValue(initialVal);
  }

  function handleSaveCellEdit() {
    if (!editCellRef) return;
    // Replace cell value in content
    const updated = content.replace(editCellRef, cellEditValue);
    if (onUpdateContent) onUpdateContent(updated);
    setEditCellRef(null);
  }

  return (
    <div className="xlsx-viewer-container" aria-label="Spreadsheet worksheet viewer">
      <div className="xlsx-toolbar">
        <span className="format-badge xlsx">XLSX</span>
        <div className="sheet-tabs">
          {sheets.map((sheet) => (
            <button
              key={sheet.sheetIndex}
              type="button"
              className={`sheet-tab ${activeSheetIndex === sheet.sheetIndex ? "active" : ""}`}
              onClick={() => setActiveSheetIndex(sheet.sheetIndex)}
            >
              {sheet.sheetName}
            </button>
          ))}
        </div>
      </div>

      <div className="spreadsheet-grid-wrapper">
        <table className="spreadsheet-grid">
          <thead>
            <tr>
              <th className="row-header-corner">#</th>
              {activeSheet.rows[0]?.cells.map((c) => (
                <th key={c.colIndex} className="col-header">
                  {c.colLetter}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeSheet.rows.map((row) => (
              <tr key={row.rowIndex}>
                <td className="row-header">{row.rowIndex}</td>
                {row.cells.map((cell) => {
                  const finding = getCellFinding(cell.value, cell.cellRef);
                  const isSelected = finding && selectedFindingId === finding.finding_id;
                  const visualClass = finding ? getAnnotationVisualClass(finding.evidence_status, finding.severity) : "";

                  return (
                    <td
                      key={cell.colIndex}
                      className={`grid-cell ${visualClass}${isSelected ? " selected" : ""}`}
                      onClick={() => {
                        if (finding) onSelectFinding(finding.finding_id);
                      }}
                      onDoubleClick={() => handleStartCellEdit(cell.cellRef, cell.value, Boolean(cell.formula))}
                      title={finding ? `${cell.cellRef}: ${finding.explanation}` : `${cell.cellRef}: ${cell.value}`}
                    >
                      {editCellRef === cell.cellRef ? (
                        <input
                          type="text"
                          className="cell-edit-input"
                          value={cellEditValue}
                          onChange={(e) => setCellEditValue(e.target.value)}
                          onBlur={handleSaveCellEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveCellEdit();
                            if (e.key === "Escape") setEditCellRef(null);
                          }}
                          autoFocus
                        />
                      ) : (
                        <>
                          <span className="cell-content">{cell.value}</span>
                          {finding && <span className="cell-ref-tag">{cell.cellRef}</span>}
                          {cell.formula && <span className="formula-tag">fx</span>}
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="document-location-note">
        Formulas preserved. Cells with issues are highlighted with cell coordinates (e.g. B2). Double-click a value cell to edit.
      </p>
    </div>
  );
}

// ============================================================================
// 5. Image & Poster Viewer Component (Milestone 2)
// ============================================================================

function ImageViewer({
  url,
  name,
  findings,
  selectedFindingId,
  onSelectFinding,
  content,
  structuralData,
  onUpdateContent,
}: {
  url: string;
  name: string;
  findings: Finding[];
  selectedFindingId: string | null;
  onSelectFinding: (findingId: string) => void;
  content: string;
  structuralData?: StructuralDocumentData;
  onUpdateContent?: (updatedContent: string) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState(1);
  const [viewTab, setViewTab] = useState<"poster" | "correction" | "extracted">("poster");
  const [hoveredFindingId, setHoveredFindingId] = useState<string | null>(null);
  const [correctionOverrides, setCorrectionOverrides] = useState<Record<string, string>>({});
  const [editableOcr, setEditableOcr] = useState(content);
  const [exportNotice, setExportNotice] = useState("");

  // Map findings to image bounding boxes using actual OCR word & line coordinates
  const annotations = useMemo(() => {
    return mapFindingsToAnnotations(findings, content, structuralData, "png");
  }, [findings, content, structuralData]);

  // Selective highlighting: only actionable findings with real measured bounding boxes
  const actionableAnnotations = useMemo(() => {
    return annotations.filter((ann) => ann.isActionable && ann.boundingBox);
  }, [annotations]);

  const findingsMap = useMemo(() => new Map(findings.map((f) => [f.finding_id, f])), [findings]);

  // Unplaced findings (cannot be established reliably to image coordinates)
  const unplacedCount = findings.filter((f) => isActionableFinding(f)).length - actionableAnnotations.length;

  function handleExportRevisedImage() {
    const img = imgRef.current;
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width || 1200;
    canvas.height = img.naturalHeight || img.height || 1600;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw original image at native resolution
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Overlay corrections
    let appliedCount = 0;
    for (const ann of actionableAnnotations) {
      if (!ann.boundingBox) continue;
      const text = correctionOverrides[ann.findingId] ?? ann.suggestedCorrection;
      if (!text) continue;

      const px = (ann.boundingBox.x / 100) * canvas.width;
      const py = (ann.boundingBox.y / 100) * canvas.height;
      const pw = (ann.boundingBox.width / 100) * canvas.width;
      const ph = (ann.boundingBox.height / 100) * canvas.height;

      // Draw replacement patch
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = Math.max(2, Math.round(canvas.width * 0.002));
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 8);
      ctx.fill();
      ctx.stroke();

      // Render replacement text
      ctx.fillStyle = "#1e293b";
      const fontSize = Math.max(14, Math.round(ph * 0.45));
      ctx.font = `600 ${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, px + pw / 2, py + ph / 2, pw - 12);
      appliedCount++;
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${name.replace(/\.[^/.]+$/, "")}_revised.png`;
      link.click();
      URL.revokeObjectURL(downloadUrl);
      setExportNotice(`Exported revised poster with ${appliedCount} correction overlay${appliedCount === 1 ? "" : "s"}. Original image preserved.`);
    }, "image/png");
  }

  return (
    <div className="image-viewer-container" aria-label="Image and poster review workspace">
      <div className="viewer-toolbar-inline">
        <div className="toolbar-left-group">
          <span className="format-badge image">POSTER</span>
          <span className="image-filename" title={name}>{name}</span>
          <span className="ocr-status-chip" title="OCR extraction performed locally in browser">
            <span className="status-dot green" />
            OCR Analyzed
          </span>
        </div>

        <div className="toolbar-right-group">
          <div className="zoom-controls" role="group" aria-label="Image zoom">
            <button
              type="button"
              className="zoom-btn"
              onClick={() => setZoom((z) => Math.max(0.6, Math.round((z - 0.2) * 10) / 10))}
              title="Zoom out"
              disabled={zoom <= 0.6}
            >
              −
            </button>
            <span className="zoom-level">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="zoom-btn"
              onClick={() => setZoom((z) => Math.min(2.0, Math.round((z + 0.2) * 10) / 10))}
              title="Zoom in"
              disabled={zoom >= 2.0}
            >
              +
            </button>
            {zoom !== 1 && (
              <button type="button" className="zoom-reset-btn" onClick={() => setZoom(1)}>
                Reset
              </button>
            )}
          </div>

          <div className="view-tab-buttons">
            <button
              type="button"
              className={`small-ghost ${viewTab === "poster" ? "active-tab" : ""}`}
              onClick={() => setViewTab("poster")}
            >
              🖼 Poster & Highlights
            </button>
            <button
              type="button"
              className={`small-ghost ${viewTab === "correction" ? "active-tab" : ""}`}
              onClick={() => setViewTab("correction")}
            >
              ✍ Correction & Export
            </button>
            <button
              type="button"
              className={`small-ghost ${viewTab === "extracted" ? "active-tab" : ""}`}
              onClick={() => setViewTab("extracted")}
            >
              📄 Extracted Copy
            </button>
          </div>
        </div>
      </div>

      {exportNotice && (
        <div className="export-success-banner" role="status">
          <span>✓ {exportNotice}</span>
          <button type="button" className="banner-dismiss" onClick={() => setExportNotice("")}>×</button>
        </div>
      )}

      {/* Mode 1: Main Original Poster View with Responsive Bounding Box Overlays */}
      {viewTab === "poster" && (
        <div className="image-viewport-scroll-area">
          <div
            className="image-overlay-wrapper"
            style={{
              width: `${zoom * 100}%`,
              transition: "width 0.15s ease",
            }}
          >
            <img
              ref={imgRef}
              className="original-image-responsive"
              src={url}
              alt={`Original poster: ${name}`}
            />

            {/* SVG/HTML Interactive Bounding Box Overlay */}
            <div className="bounding-box-layer" aria-label="Poster issue highlights">
              {actionableAnnotations.map((ann) => {
                const bbox = ann.boundingBox!;
                const isSelected = selectedFindingId === ann.findingId;
                const visualClass = getAnnotationVisualClass(ann.evidenceStatus, ann.severity);
                const finding = findingsMap.get(ann.findingId);

                return (
                  <div
                    key={ann.id}
                    className={`image-bounding-box ${visualClass}${isSelected ? " selected" : ""}`}
                    style={{
                      left: `${bbox.x}%`,
                      top: `${bbox.y}%`,
                      width: `${bbox.width}%`,
                      height: `${bbox.height}%`,
                    }}
                    onClick={() => onSelectFinding(ann.findingId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectFinding(ann.findingId);
                      }
                    }}
                    onMouseEnter={() => setHoveredFindingId(ann.findingId)}
                    onMouseLeave={() => setHoveredFindingId(null)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Flagged issue: ${ann.category} - ${ann.claimText}`}
                  >
                    <span className="bounding-box-badge">
                      {ann.category.replaceAll("_", " ")}
                    </span>
                    {hoveredFindingId === ann.findingId && finding && (
                      <AnnotationTooltip finding={finding} onInspect={() => onSelectFinding(ann.findingId)} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mode 2: Correction & Export (Honest Editing Workflow) */}
      {viewTab === "correction" && (
        <div className="image-correction-panel">
          <div className="panel-header">
            <div>
              <h3>Correction Overlay & Image Export</h3>
              <p>Apply context-preserving corrections over flagged poster regions. Generates a revised image export without modifying original source pixels.</p>
            </div>
            <button
              type="button"
              className="primary-button export-revised-btn"
              onClick={handleExportRevisedImage}
            >
              ⬇ Generate Revised Image Export (.png)
            </button>
          </div>

          <div className="correction-items-list">
            {actionableAnnotations.length === 0 ? (
              <p className="empty-notice">No actionable findings detected on this image.</p>
            ) : (
              actionableAnnotations.map((ann) => {
                const currentVal = correctionOverrides[ann.findingId] ?? ann.suggestedCorrection ?? "";
                return (
                  <div key={ann.id} className="correction-item-card">
                    <div className="item-meta">
                      <span className={`finding-cat ${ann.severity.toLowerCase()}`}>{ann.category}</span>
                      <span className="item-claim">&ldquo;{ann.claimText}&rdquo;</span>
                    </div>
                    <p className="item-explanation">{ann.explanation}</p>
                    <div className="replacement-row">
                      <label htmlFor={`replace-${ann.id}`}>Replacement Text Overlay:</label>
                      <input
                        id={`replace-${ann.id}`}
                        type="text"
                        className="replacement-input"
                        value={currentVal}
                        placeholder={ann.suggestedCorrection || "Enter replacement wording…"}
                        onChange={(e) =>
                          setCorrectionOverrides((prev) => ({ ...prev, [ann.findingId]: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <small className="honest-disclosure-note">
            Honest Workflow: Original image file is permanently preserved. Revised export applies styled text patches over detected bounding boxes.
          </small>
        </div>
      )}

      {/* Mode 3: Extracted Text Inspector (Secondary / Advanced) */}
      {viewTab === "extracted" && (
        <div className="editable-representation-layer">
          <div className="layer-header">
            <div>
              <b>Extracted OCR Copy (Internal Analysis Layer)</b>
              <small>OCR output used to detect claims and bounding boxes. The original image remains the primary view.</small>
            </div>
            <button
              type="button"
              className="small-ghost"
              onClick={() => {
                navigator.clipboard.writeText(editableOcr).catch(() => {});
                setExportNotice("Extracted text copied to clipboard.");
              }}
            >
              Copy Extracted Text
            </button>
          </div>
          <textarea
            className="editable-textarea"
            value={editableOcr}
            onChange={(e) => setEditableOcr(e.target.value)}
            rows={10}
          />
          <div className="layer-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                if (onUpdateContent) onUpdateContent(editableOcr);
                setViewTab("poster");
              }}
            >
              Save Text to Draft
            </button>
            <button type="button" className="small-ghost" onClick={() => setViewTab("poster")}>
              Return to Poster View
            </button>
          </div>
        </div>
      )}

      <div className="image-viewer-footer">
        <p className="document-location-note">
          Original poster layout, typography and colors preserved. {actionableAnnotations.length} issue{actionableAnnotations.length === 1 ? "" : "s"} highlighted with verified bounding boxes.
          {unplacedCount > 0 && ` (${unplacedCount} additional general finding${unplacedCount === 1 ? "" : "s"} in side panel)`}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// 6. Video & Reel Viewer Component (Milestone 4)
// ============================================================================

function VideoViewer({
  url,
  name,
  findings,
  selectedFindingId,
  onSelectFinding,
  content,
  structuralData,
  onUpdateContent,
}: {
  url: string;
  name: string;
  findings: Finding[];
  selectedFindingId: string | null;
  onSelectFinding: (findingId: string) => void;
  content: string;
  structuralData?: StructuralDocumentData;
  onUpdateContent?: (updatedContent: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [editTranscriptMode, setEditTranscriptMode] = useState(false);
  const [editableSubtitles, setEditableSubtitles] = useState(content);

  const segments: TranscriptSegment[] = useMemo(() => {
    if (structuralData?.transcriptSegments && structuralData.transcriptSegments.length > 0) {
      return structuralData.transcriptSegments;
    }
    // Fallback: 2 default sampled segments
    return [
      { id: "v-1", startSeconds: 0, endSeconds: 5, text: content.slice(0, 100), speaker: "Frame 1" },
      { id: "v-2", startSeconds: 5, endSeconds: 12, text: content.slice(100, 250), speaker: "Frame 2" },
    ];
  }, [content, structuralData]);

  function seekTo(seconds: number) {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play().catch(() => {});
    }
  }

  function handleExportSrt() {
    const srtContent = segments
      .map(
        (s, idx) =>
          `${idx + 1}\n00:00:${String(Math.floor(s.startSeconds)).padStart(2, "0")},000 --> 00:00:${String(
            Math.floor(s.endSeconds)
          ).padStart(2, "0")},000\n${s.text}\n`
      )
      .join("\n");
    const blob = new Blob([srtContent], { type: "text/plain;charset=utf-8" });
    const srtUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = srtUrl;
    link.download = `${name.replace(/\.[^/.]+$/, "")}_subtitles.srt`;
    link.click();
    URL.revokeObjectURL(srtUrl);
  }

  return (
    <div className="video-viewer-container" aria-label="Video and reel review workspace">
      <div className="viewer-toolbar-inline">
        <span className="format-badge video">VIDEO</span>
        <button
          type="button"
          className={`small-ghost ${editTranscriptMode ? "active-tab" : ""}`}
          onClick={() => setEditTranscriptMode(!editTranscriptMode)}
        >
          {editTranscriptMode ? "View Video" : "Edit Subtitles"}
        </button>
        <button type="button" className="small-ghost" onClick={handleExportSrt}>
          Export Subtitles (.srt)
        </button>
      </div>

      <div className="video-player-wrapper">
        <video
          ref={videoRef}
          className="original-video"
          src={url}
          controls
          onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
          onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
        />

        {/* Scrubber markers for findings */}
        {duration > 0 && (
          <div className="video-scrubber-track">
            {findings.map((f, i) => {
              const seg = segments.find((s) => s.text.includes(f.claim_text));
              const startSec = seg ? seg.startSeconds : (i * duration) / Math.max(1, findings.length);
              const percent = Math.min(100, Math.max(0, (startSec / duration) * 100));

              return (
                <button
                  key={f.finding_id}
                  type="button"
                  className={`scrubber-marker ${f.evidence_status.toLowerCase()}${selectedFindingId === f.finding_id ? " active" : ""}`}
                  style={{ left: `${percent}%` }}
                  onClick={() => {
                    seekTo(startSec);
                    onSelectFinding(f.finding_id);
                  }}
                  title={`Seek to ${Math.round(startSec)}s: ${f.claim_text}`}
                />
              );
            })}
          </div>
        )}
      </div>

      {editTranscriptMode ? (
        <div className="editable-representation-layer">
          <textarea
            className="editable-textarea"
            value={editableSubtitles}
            onChange={(e) => setEditableSubtitles(e.target.value)}
            rows={8}
          />
          <div className="layer-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                if (onUpdateContent) onUpdateContent(editableSubtitles);
                setEditTranscriptMode(false);
              }}
            >
              Save Subtitle Corrections
            </button>
            <button type="button" className="small-ghost" onClick={() => setEditTranscriptMode(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="video-transcript-tray">
          <b>Timestamped Keyframes & Spoken Segments:</b>
          <div className="transcript-segment-list">
            {segments.map((seg) => {
              const hasIssue = findings.some((f) => seg.text.includes(f.claim_text));
              const isCurrent = currentTime >= seg.startSeconds && currentTime <= seg.endSeconds;

              return (
                <div
                  key={seg.id}
                  className={`transcript-segment-card ${hasIssue ? "issue" : ""} ${isCurrent ? "current" : ""}`}
                  onClick={() => seekTo(seg.startSeconds)}
                >
                  <span className="segment-timestamp">
                    00:{String(Math.floor(seg.startSeconds)).padStart(2, "0")}
                  </span>
                  <p className="segment-text">{seg.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="document-location-note">
        Representative keyframes sampled across video duration. Click any segment or marker to seek to that timestamp.
      </p>
    </div>
  );
}

// ============================================================================
// 7. Audio Viewer Component (Milestone 5)
// ============================================================================

function AudioViewer({
  url,
  name,
  findings,
  selectedFindingId,
  onSelectFinding,
  content,
  structuralData,
  onUpdateContent,
}: {
  url: string;
  name: string;
  findings: Finding[];
  selectedFindingId: string | null;
  onSelectFinding: (findingId: string) => void;
  content: string;
  structuralData?: StructuralDocumentData;
  onUpdateContent?: (updatedContent: string) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [editMode, setEditMode] = useState(false);
  const [editableTranscript, setEditableTranscript] = useState(content);

  const segments = useMemo(() => {
    if (structuralData?.transcriptSegments && structuralData.transcriptSegments.length > 0) {
      return structuralData.transcriptSegments;
    }
    return [
      { id: "a-1", startSeconds: 0, endSeconds: 4, text: content.slice(0, 120), speaker: "Speaker 1" },
      { id: "a-2", startSeconds: 4, endSeconds: 10, text: content.slice(120), speaker: "Speaker 1" },
    ];
  }, [content, structuralData]);

  function seekTo(seconds: number) {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      audioRef.current.play().catch(() => {});
    }
  }

  return (
    <div className="audio-viewer-container" aria-label="Audio review workspace">
      <div className="viewer-toolbar-inline">
        <span className="format-badge audio">AUDIO</span>
        <span className="audio-filename">{name}</span>
        <button type="button" className={`small-ghost ${editMode ? "active-tab" : ""}`} onClick={() => setEditMode(!editMode)}>
          {editMode ? "View Audio" : "Edit Transcript"}
        </button>
      </div>

      <div className="audio-player-wrapper">
        <audio ref={audioRef} className="original-audio" src={url} controls />
      </div>

      {findings.length > 0 && (
        <div className="audio-findings-bar">
          <b>Flagged Audio Claims:</b>
          <div className="audio-finding-chips">
            {findings.map((f) => {
              const isSelected = selectedFindingId === f.finding_id;
              return (
                <button
                  key={f.finding_id}
                  type="button"
                  className={`audio-finding-chip ${isSelected ? "selected" : ""}`}
                  onClick={() => {
                    onSelectFinding(f.finding_id);
                    seekTo(0);
                  }}
                >
                  <span className="chip-cat">{f.category}</span>
                  <span className="chip-msg">{f.explanation}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {editMode ? (
        <div className="editable-representation-layer">
          <textarea
            className="editable-textarea"
            value={editableTranscript}
            onChange={(e) => setEditableTranscript(e.target.value)}
            rows={8}
          />
          <div className="layer-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                if (onUpdateContent) onUpdateContent(editableTranscript);
                setEditMode(false);
              }}
            >
              Save Transcript Edits
            </button>
            <button type="button" className="small-ghost" onClick={() => setEditMode(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="audio-transcript-tray">
          <b>Timestamped Spoken Segments:</b>
          <div className="transcript-segment-list">
            {segments.map((seg) => (
              <div key={seg.id} className="transcript-segment-card" onClick={() => seekTo(seg.startSeconds)}>
                <span className="segment-timestamp">00:{String(Math.floor(seg.startSeconds)).padStart(2, "0")}</span>
                <p className="segment-text">{seg.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="document-location-note">
        Original audio preserved. Spoken claims mapped to timestamped transcript segments. Click to seek.
      </p>
    </div>
  );
}

// ============================================================================
// 8. CSV Tabular Data Viewer
// ============================================================================

function CsvViewer({
  content,
  findings,
  selectedFindingId,
  onSelectFinding,
  currentReview,
}: Omit<Props, "fileKey" | "name" | "type">) {
  const [filterText, setFilterText] = useState("");
  const rows = useMemo(() => {
    return content
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, "")));
  }, [content]);

  const headers = rows[0] || [];
  const dataRows = rows.slice(1);

  const filteredRows = useMemo(() => {
    if (!filterText.trim()) return dataRows;
    const lower = filterText.toLowerCase();
    return dataRows.filter((r) => r.some((c) => c.toLowerCase().includes(lower)));
  }, [dataRows, filterText]);

  function handleExportCsv() {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const exportUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = exportUrl;
    link.download = "data.csv";
    link.click();
    URL.revokeObjectURL(exportUrl);
  }

  return (
    <div className="csv-table-wrapper" aria-label="CSV tabular data viewer">
      <div className="csv-toolbar">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="format-badge csv">CSV</span>
          <span style={{ fontSize: 11, color: "#64748b" }}>
            {dataRows.length} rows · {headers.length} columns
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="search"
            className="csv-search-input"
            placeholder="Search rows…"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
          <button type="button" className="small-ghost" onClick={handleExportCsv}>
            Export CSV
          </button>
        </div>
      </div>
      <table className="csv-grid">
        <thead>
          <tr>
            <th className="csv-row-num">#</th>
            {headers.map((h, i) => (
              <th key={i}>{h || `Col ${String.fromCharCode(65 + i)}`}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((row, rIdx) => (
            <tr key={rIdx}>
              <td className="csv-row-num">{rIdx + 1}</td>
              {row.map((cell, cIdx) => {
                const matched = currentReview
                  ? findings.find((f) => cell && (cell.includes(f.claim_text) || f.claim_text.includes(cell)))
                  : undefined;
                const isSelected = matched && matched.finding_id === selectedFindingId;
                return (
                  <td
                    key={cIdx}
                    style={
                      matched
                        ? {
                            background: isSelected ? "rgba(37, 99, 235, 0.2)" : "rgba(245, 158, 11, 0.15)",
                            borderBottom: "2px solid #f59e0b",
                            cursor: "pointer",
                          }
                        : undefined
                    }
                    onClick={() => {
                      if (matched) onSelectFinding(matched.finding_id);
                    }}
                  >
                    {cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// 9. Plain Text Document Viewer
// ============================================================================

function TxtViewer({
  content,
  findings,
  selectedFindingId,
  onSelectFinding,
  currentReview,
  onUpdateContent,
}: Omit<Props, "fileKey" | "name" | "type">) {
  const [editMode, setEditMode] = useState(false);
  const [editableText, setEditableText] = useState(content);
  const lines = useMemo(() => content.split(/\r?\n/), [content]);

  function handleExportTxt() {
    const blob = new Blob([editableText], { type: "text/plain;charset=utf-8" });
    const exportUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = exportUrl;
    link.download = "document.txt";
    link.click();
    URL.revokeObjectURL(exportUrl);
  }

  return (
    <div className="plain-text-wrapper" aria-label="Plain text viewer">
      <div className="viewer-toolbar-inline" style={{ display: "flex", justifyContent: "space-between", padding: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="format-badge txt">TXT</span>
          <button type="button" className={`small-ghost ${editMode ? "active-tab" : ""}`} onClick={() => setEditMode(!editMode)}>
            {editMode ? "View Lines" : "Edit Text"}
          </button>
        </div>
        <button type="button" className="small-ghost" onClick={handleExportTxt}>
          Export TXT
        </button>
      </div>

      {editMode ? (
        <div className="editable-representation-layer">
          <textarea
            className="editable-textarea"
            value={editableText}
            onChange={(e) => setEditableText(e.target.value)}
            rows={14}
          />
          <div className="layer-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                if (onUpdateContent) onUpdateContent(editableText);
                setEditMode(false);
              }}
            >
              Apply & Re-anchor
            </button>
            <button type="button" className="small-ghost" onClick={() => setEditMode(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: 12 }}>
          {lines.map((line, idx) => {
            const matched = currentReview
              ? findings.find((f) => line && f.claim_text && line.includes(f.claim_text))
              : undefined;
            const isSelected = matched && matched.finding_id === selectedFindingId;
            return (
              <div key={idx} className="plain-text-line">
                <span className="plain-text-gutter">{idx + 1}</span>
                <span
                  className="plain-text-code"
                  style={
                    matched
                      ? {
                          background: isSelected ? "rgba(37,99,235,0.18)" : "rgba(245,158,11,0.12)",
                          borderBottom: "2px solid #f59e0b",
                          cursor: "pointer",
                        }
                      : undefined
                  }
                  onClick={() => {
                    if (matched) onSelectFinding(matched.finding_id);
                  }}
                >
                  {line || "\u00A0"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 10. Markdown Rendered Document Viewer
// ============================================================================

function MarkdownViewer({
  content,
  findings,
  selectedFindingId,
  onSelectFinding,
  currentReview,
  onUpdateContent,
}: Omit<Props, "fileKey" | "name" | "type">) {
  const [editMode, setEditMode] = useState(false);
  const [editableText, setEditableText] = useState(content);
  const lines = useMemo(() => content.split(/\r?\n/), [content]);

  function handleExportMd() {
    const blob = new Blob([editableText], { type: "text/markdown;charset=utf-8" });
    const exportUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = exportUrl;
    link.download = "document.md";
    link.click();
    URL.revokeObjectURL(exportUrl);
  }

  return (
    <div className="markdown-rendered-view" aria-label="Markdown document viewer">
      <div className="viewer-toolbar-inline" style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="format-badge md">MD</span>
          <button type="button" className={`small-ghost ${editMode ? "active-tab" : ""}`} onClick={() => setEditMode(!editMode)}>
            {editMode ? "Rendered Preview" : "Edit Markdown"}
          </button>
        </div>
        <button type="button" className="small-ghost" onClick={handleExportMd}>
          Export Markdown
        </button>
      </div>

      {editMode ? (
        <div className="editable-representation-layer">
          <textarea
            className="editable-textarea"
            value={editableText}
            onChange={(e) => setEditableText(e.target.value)}
            rows={14}
          />
          <div className="layer-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                if (onUpdateContent) onUpdateContent(editableText);
                setEditMode(false);
              }}
            >
              Apply & Re-anchor
            </button>
            <button type="button" className="small-ghost" onClick={() => setEditMode(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="markdown-content">
          {lines.map((line, idx) => {
            const matched = currentReview
              ? findings.find((f) => line && f.claim_text && line.includes(f.claim_text))
              : undefined;
            const isSelected = matched && matched.finding_id === selectedFindingId;
            const isHeading = line.startsWith("#");
            const isListItem = line.trim().startsWith("- ") || line.trim().startsWith("* ");
            const isQuote = line.trim().startsWith(">");

            return (
              <div
                key={idx}
                style={{
                  fontWeight: isHeading ? 600 : "normal",
                  fontSize: isHeading ? (line.startsWith("##") ? "1.15em" : "1.3em") : "1em",
                  paddingLeft: isListItem ? 16 : isQuote ? 12 : 0,
                  borderLeft: isQuote ? "3px solid #cbd5e1" : "none",
                  margin: "4px 0",
                  background: matched ? (isSelected ? "rgba(37,99,235,0.18)" : "rgba(245,158,11,0.12)") : undefined,
                  borderBottom: matched ? "2px solid #f59e0b" : undefined,
                  cursor: matched ? "pointer" : "default",
                }}
                onClick={() => {
                  if (matched) onSelectFinding(matched.finding_id);
                }}
              >
                {line || "\u00A0"}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 11. Sanitized HTML Document Viewer
// ============================================================================

function HtmlViewer({
  content,
  findings: _findings,
  selectedFindingId: _selectedFindingId,
  onSelectFinding: _onSelectFinding,
  currentReview: _currentReview,
  onUpdateContent,
}: Omit<Props, "fileKey" | "name" | "type">) {
  const [editMode, setEditMode] = useState(false);
  const [editableText, setEditableText] = useState(content);

  const sanitizedHtml = useMemo(() => {
    return content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "<!-- script quarantined -->")
      .replace(/on\w+="[^"]*"/gi, "")
      .replace(/javascript:[^"']*/gi, "");
  }, [content]);

  function handleExportHtml() {
    const blob = new Blob([editableText], { type: "text/html;charset=utf-8" });
    const exportUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = exportUrl;
    link.download = "document.html";
    link.click();
    URL.revokeObjectURL(exportUrl);
  }

  return (
    <div className="html-sandbox-wrapper" aria-label="Sanitized HTML viewer">
      <div className="viewer-toolbar-inline" style={{ display: "flex", justifyContent: "space-between", padding: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="format-badge html">HTML</span>
          <button type="button" className={`small-ghost ${editMode ? "active-tab" : ""}`} onClick={() => setEditMode(!editMode)}>
            {editMode ? "Sanitized Preview" : "View Source"}
          </button>
        </div>
        <button type="button" className="small-ghost" onClick={handleExportHtml}>
          Export HTML
        </button>
      </div>

      {editMode ? (
        <div className="editable-representation-layer">
          <textarea
            className="editable-textarea"
            value={editableText}
            onChange={(e) => setEditableText(e.target.value)}
            rows={14}
          />
          <div className="layer-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                if (onUpdateContent) onUpdateContent(editableText);
                setEditMode(false);
              }}
            >
              Apply & Re-anchor
            </button>
            <button type="button" className="small-ghost" onClick={() => setEditMode(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          <iframe
            className="html-sandbox-frame"
            sandbox="allow-same-origin"
            srcDoc={sanitizedHtml}
            title="Sanitized HTML content"
          />
        </div>
      )}
      <p className="document-location-note">
        Sanitized HTML preview. External scripts and dangerous event handlers are quarantined for security.
      </p>
    </div>
  );
}

// ============================================================================
// 12. Rich Text Format (RTF) Document Viewer
// ============================================================================

function RtfViewer({
  content,
  findings,
  selectedFindingId,
  onSelectFinding,
  currentReview,
  onUpdateContent,
}: Omit<Props, "fileKey" | "name" | "type">) {
  const [editMode, setEditMode] = useState(false);
  const [editableText, setEditableText] = useState(content);

  function handleExportRtf() {
    const blob = new Blob([editableText], { type: "text/rtf;charset=utf-8" });
    const exportUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = exportUrl;
    link.download = "document.rtf";
    link.click();
    URL.revokeObjectURL(exportUrl);
  }

  return (
    <div className="docx-reading-view" aria-label="Rich text format viewer">
      <div className="viewer-toolbar-inline" style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="format-badge rtf">RTF</span>
          <button type="button" className={`small-ghost ${editMode ? "active-tab" : ""}`} onClick={() => setEditMode(!editMode)}>
            {editMode ? "View Formatted" : "Edit Copy"}
          </button>
        </div>
        <button type="button" className="small-ghost" onClick={handleExportRtf}>
          Export RTF
        </button>
      </div>

      {editMode ? (
        <div className="editable-representation-layer">
          <textarea
            className="editable-textarea"
            value={editableText}
            onChange={(e) => setEditableText(e.target.value)}
            rows={14}
          />
          <div className="layer-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                if (onUpdateContent) onUpdateContent(editableText);
                setEditMode(false);
              }}
            >
              Apply & Re-anchor
            </button>
            <button type="button" className="small-ghost" onClick={() => setEditMode(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          {content.split(/\r?\n/).map((para, idx) => {
            const matched = currentReview
              ? findings.find((f) => para && f.claim_text && para.includes(f.claim_text))
              : undefined;
            return (
              <p
                key={idx}
                className="docx-paragraph"
                style={
                  matched
                    ? {
                        background: matched.finding_id === selectedFindingId ? "rgba(37,99,235,0.18)" : "rgba(245,158,11,0.12)",
                        borderBottom: "2px solid #f59e0b",
                        cursor: "pointer",
                      }
                    : undefined
                }
                onClick={() => {
                  if (matched) onSelectFinding(matched.finding_id);
                }}
              >
                {para || "\u00A0"}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 13. Legacy Office Format Viewer (DOC, XLS, PPT)
// ============================================================================

function LegacyOfficeViewer({
  formatId,
  content,
  findings,
  selectedFindingId,
  onSelectFinding,
  currentReview,
}: Omit<Props, "fileKey" | "type"> & { formatId: string }) {
  const modernExt = formatId === "xls" ? ".xlsx" : formatId === "ppt" ? ".pptx" : ".docx";

  return (
    <div className="docx-reading-view" aria-label="Legacy office document viewer">
      <div className="legacy-format-banner">
        <span className="legacy-badge">LEGACY FORMAT</span>
        <div className="legacy-info">
          <b>Legacy Binary Office File ({formatId.toUpperCase()})</b>
          <p>
            This file uses legacy 97-2003 binary encoding. For full vector typography, tables, and styling,
            convert this document to modern {modernExt}. Extracted text and brand compliance findings are verified below.
          </p>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        {content.split(/\r?\n/).map((line, idx) => {
          const matched = currentReview
            ? findings.find((f) => line && f.claim_text && line.includes(f.claim_text))
            : undefined;
          return (
            <p
              key={idx}
              className="docx-paragraph"
              style={
                matched
                  ? {
                      background: matched.finding_id === selectedFindingId ? "rgba(37,99,235,0.18)" : "rgba(245,158,11,0.12)",
                      borderBottom: "2px solid #f59e0b",
                      cursor: "pointer",
                    }
                  : undefined
              }
              onClick={() => {
                if (matched) onSelectFinding(matched.finding_id);
              }}
            >
              {line || "\u00A0"}
            </p>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 14. Main Multimodal Original Document Host Component
// ============================================================================

export function OriginalDocument({
  fileKey,
  name,
  type,
  content,
  findings,
  selectedFindingId,
  onSelectFinding,
  currentReview,
  onUpdateContent,
  structuralData,
  directFile,
}: Props) {
  const [storedFile, setStoredFile] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const file = directFile || storedFile;
  const url = useMemo(() => {
    if (!file || typeof window === "undefined") return "";
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  useEffect(() => {
    if (directFile) return;
    let active = true;
    getOriginalDocument(fileKey)
      .then((original) => {
        if (!original) throw new Error("The saved original is unavailable in this browser.");
        if (active) setStoredFile(original);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load the saved original.");
      });
    return () => {
      active = false;
    };
  }, [fileKey, directFile]);

  const format = resolveFormat(name, type);

  return (
    <section className="original-preview" aria-label="Uploaded original document">
      <div className="original-preview-heading">
        <div className="heading-file-info">
          <span className={`format-badge ${format.formatId}`}>{format.displayName}</span>
          <b>{name}</b>
          <small>Original preserved securely</small>
        </div>
        {url && (
          <div className="heading-actions-bar">
            <a className="small-ghost" href={url} download={name}>
              Download Original
            </a>
          </div>
        )}
      </div>

      {error ? (
        <p className="original-preview-message" role="alert">
          {error} The extracted draft text is still available.
        </p>
      ) : !file && format.category !== "STRUCTURED_TEXT" ? (
        <p className="original-preview-message">Opening original file in format-aware viewer…</p>
      ) : format.capabilities.viewer === "PDF_CANVAS" && file ? (
        <PdfViewer
          file={file}
          content={content}
          findings={findings}
          selectedFindingId={selectedFindingId}
          onSelectFinding={onSelectFinding}
          currentReview={currentReview}
          onUpdateContent={onUpdateContent}
        />
      ) : format.capabilities.viewer === "DOCX_STRUCTURAL" && file ? (
        <DocxViewer
          file={file}
          content={content}
          findings={findings}
          selectedFindingId={selectedFindingId}
          onSelectFinding={onSelectFinding}
          currentReview={currentReview}
          onUpdateContent={onUpdateContent}
        />
      ) : format.capabilities.viewer === "PPTX_SLIDES" ? (
        <PptxViewer
          content={content}
          findings={findings}
          selectedFindingId={selectedFindingId}
          onSelectFinding={onSelectFinding}
          currentReview={currentReview}
          structuralData={structuralData}
          onUpdateContent={onUpdateContent}
        />
      ) : format.capabilities.viewer === "XLSX_GRID" ? (
        <XlsxViewer
          content={content}
          findings={findings}
          selectedFindingId={selectedFindingId}
          onSelectFinding={onSelectFinding}
          currentReview={currentReview}
          structuralData={structuralData}
          onUpdateContent={onUpdateContent}
        />
      ) : format.capabilities.viewer === "CSV_TABLE" ? (
        <CsvViewer
          content={content}
          findings={findings}
          selectedFindingId={selectedFindingId}
          onSelectFinding={onSelectFinding}
          currentReview={currentReview}
          onUpdateContent={onUpdateContent}
        />
      ) : format.capabilities.viewer === "IMAGE_OVERLAY" ? (
        <ImageViewer
          url={url}
          name={name}
          findings={findings}
          selectedFindingId={selectedFindingId}
          onSelectFinding={onSelectFinding}
          content={content}
          structuralData={structuralData}
          onUpdateContent={onUpdateContent}
        />
      ) : format.capabilities.viewer === "VIDEO_TIMELINE" ? (
        <VideoViewer
          url={url}
          name={name}
          findings={findings}
          selectedFindingId={selectedFindingId}
          onSelectFinding={onSelectFinding}
          content={content}
          structuralData={structuralData}
          onUpdateContent={onUpdateContent}
        />
      ) : format.capabilities.viewer === "AUDIO_TRANSCRIPT" ? (
        <AudioViewer
          url={url}
          name={name}
          findings={findings}
          selectedFindingId={selectedFindingId}
          onSelectFinding={onSelectFinding}
          content={content}
          structuralData={structuralData}
          onUpdateContent={onUpdateContent}
        />
      ) : format.capabilities.viewer === "MARKDOWN_RENDERED" ? (
        <MarkdownViewer
          content={content}
          findings={findings}
          selectedFindingId={selectedFindingId}
          onSelectFinding={onSelectFinding}
          currentReview={currentReview}
          onUpdateContent={onUpdateContent}
        />
      ) : format.capabilities.viewer === "HTML_SANITIZED" ? (
        <HtmlViewer
          content={content}
          findings={findings}
          selectedFindingId={selectedFindingId}
          onSelectFinding={onSelectFinding}
          currentReview={currentReview}
          onUpdateContent={onUpdateContent}
        />
      ) : format.capabilities.viewer === "PLAIN_TEXT" ? (
        <TxtViewer
          content={content}
          findings={findings}
          selectedFindingId={selectedFindingId}
          onSelectFinding={onSelectFinding}
          currentReview={currentReview}
          onUpdateContent={onUpdateContent}
        />
      ) : format.capabilities.viewer === "RTF_DOCUMENT" ? (
        <RtfViewer
          content={content}
          findings={findings}
          selectedFindingId={selectedFindingId}
          onSelectFinding={onSelectFinding}
          currentReview={currentReview}
          onUpdateContent={onUpdateContent}
        />
      ) : format.capabilities.viewer === "DOC_LEGACY" ||
        format.capabilities.viewer === "XLS_LEGACY" ||
        format.capabilities.viewer === "PPT_LEGACY" ? (
        <LegacyOfficeViewer
          name={name}
          formatId={format.formatId}
          content={content}
          findings={findings}
          selectedFindingId={selectedFindingId}
          onSelectFinding={onSelectFinding}
          currentReview={currentReview}
          onUpdateContent={onUpdateContent}
        />
      ) : (
        <TxtViewer
          content={content}
          findings={findings}
          selectedFindingId={selectedFindingId}
          onSelectFinding={onSelectFinding}
          currentReview={currentReview}
          onUpdateContent={onUpdateContent}
        />
      )}

      {currentReview && selectedFindingId && (
        <div className="selected-finding-banner" role="status">
          <small>ACTIVE INSPECTION:</small>
          <span>{findings.find((f) => f.finding_id === selectedFindingId)?.claim_text}</span>
        </div>
      )}
    </section>
  );
}
