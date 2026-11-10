"use client";
/* eslint-disable @next/next/no-img-element -- Local original media is displayed without site-image transformations. */

import { useEffect, useMemo, useRef, useState } from "react";
import { codePointToUtf16Offset, Finding } from "@/lib/onbrand";
import { mapSequentialTextLocations, splitTextAtFindings, TextLocation } from "@/lib/document-locations";
import { getOriginalDocument } from "@/lib/document-store";

type Props = {
  fileKey: string;
  name: string;
  type: string;
  content: string;
  findings: Finding[];
  selectedFindingId: string | null;
  onSelectFinding: (findingId: string) => void;
  currentReview: boolean;
};

type DocBlock = { type: "paragraph"; location: TextLocation } | { type: "table"; rows: DocBlock[][][] };
const wordNamespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function HighlightedText({ text, start, ranges, onSelect }: { text: string; start: number; ranges: Array<{ id: string; start: number; end: number }>; onSelect: (id: string) => void }) {
  return <>{splitTextAtFindings(text, start, ranges).map((part, index) => part.findingIds.length
    ? <mark key={index} className="document-finding-mark" data-finding-ids={part.findingIds.join(" ")} onClick={() => onSelect(part.findingIds[0])}>{part.text}</mark>
    : <span key={index}>{part.text}</span>)}</>;
}

function DocxViewer({ file, content, findings, selectedFindingId, onSelectFinding, currentReview }: Omit<Props, "fileKey" | "name" | "type"> & { file: Blob }) {
  const [blocks, setBlocks] = useState<DocBlock[]>([]);
  const [error, setError] = useState("");
  const paragraphRefs = useRef(new Map<number, HTMLElement>());
  const ranges = useMemo(() => currentReview ? findings.map((finding) => ({
    id: finding.finding_id,
    start: codePointToUtf16Offset(content, finding.start),
    end: codePointToUtf16Offset(content, finding.end),
  })) : [], [content, currentReview, findings]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { unzipSync } = await import("fflate");
        const archive = unzipSync(new Uint8Array(await file.arrayBuffer()), {
          filter: (entry) => entry.name === "word/document.xml" && entry.originalSize <= 5 * 1024 * 1024,
        });
        const xmlBytes = archive["word/document.xml"];
        if (!xmlBytes) throw new Error("The Word document body could not be opened.");
        const xml = new DOMParser().parseFromString(new TextDecoder().decode(xmlBytes), "application/xml");
        if (xml.querySelector("parsererror")) throw new Error("The Word document contains invalid XML.");
        const paragraphElements = [...xml.getElementsByTagNameNS(wordNamespace, "p")];
        const paragraphTexts = paragraphElements.map((paragraph) => [...paragraph.getElementsByTagNameNS(wordNamespace, "t")].map((node) => node.textContent ?? "").join("")).filter(Boolean);
        const locations = mapSequentialTextLocations(paragraphTexts.map((text, index) => ({ index, text })), content, "\n");
        const locationByElement = new Map<Element, TextLocation>();
        let locationIndex = 0;
        for (const element of paragraphElements) {
          const text = [...element.getElementsByTagNameNS(wordNamespace, "t")].map((node) => node.textContent ?? "").join("");
          if (!text) continue;
          const location = locations[locationIndex++];
          if (location) locationByElement.set(element, location);
        }
        const renderChildren = (parent: Element): DocBlock[] => [...parent.children].flatMap((child): DocBlock[] => {
          if (child.namespaceURI !== wordNamespace) return [];
          if (child.localName === "p") {
            const location = locationByElement.get(child);
            return location ? [{ type: "paragraph", location }] : [];
          }
          if (child.localName === "tbl") {
            const rows = [...child.children].filter((element) => element.localName === "tr" && element.namespaceURI === wordNamespace)
              .map((row) => [...row.children].filter((element) => element.localName === "tc" && element.namespaceURI === wordNamespace).map(renderChildren));
            return [{ type: "table", rows }];
          }
          return [];
        });
        const body = xml.getElementsByTagNameNS(wordNamespace, "body")[0];
        if (!body) throw new Error("The Word document has no readable body.");
        if (active) setBlocks(renderChildren(body));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "This Word file could not be displayed.");
      }
    })();
    return () => { active = false; };
  }, [content, file]);

  useEffect(() => {
    if (!selectedFindingId || !currentReview) return;
    const finding = findings.find((candidate) => candidate.finding_id === selectedFindingId);
    if (!finding) return;
    const start = codePointToUtf16Offset(content, finding.start);
    const location = blocks.flatMap(function flatten(block): TextLocation[] {
      return block.type === "paragraph" ? [block.location] : block.rows.flatMap((row) => row.flatMap((cell) => cell.flatMap(flatten)));
    }).find((candidate) => start >= candidate.start && start < candidate.end);
    if (location) paragraphRefs.current.get(location.index)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [blocks, content, currentReview, findings, selectedFindingId]);

  const renderBlocks = (items: DocBlock[], keyPrefix: string): React.ReactNode => items.map((block, index) => block.type === "paragraph"
    ? <p key={`${keyPrefix}-p-${index}`} ref={(node) => { if (node) paragraphRefs.current.set(block.location.index, node); }} className="docx-paragraph" data-paragraph={block.location.index + 1}>
      <HighlightedText text={block.location.text} start={block.location.start} ranges={ranges} onSelect={onSelectFinding} />
    </p>
    : <table key={`${keyPrefix}-table-${index}`} className="docx-table"><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{renderBlocks(cell, `${keyPrefix}-${index}-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody></table>);

  return <div className="docx-reading-view" aria-label="Word document reading view">
    {error ? <p className="original-preview-message">{error}</p> : blocks.length ? renderBlocks(blocks, "doc") : <p className="original-preview-message">Opening Word document…</p>}
    {!error && <p className="document-location-note">Word paragraph and table order are preserved. Page layout, pagination, typography and embedded images are not reproduced. Highlight locations appear only where extracted text matches.</p>}
  </div>;
}

function PdfViewer({ file, content, findings, selectedFindingId, onSelectFinding, currentReview }: Omit<Props, "fileKey" | "name" | "type"> & { file: Blob }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pageLocations, setPageLocations] = useState<TextLocation[]>([]);
  const [error, setError] = useState("");
  const locationNote = useMemo(() => {
    if (!selectedFindingId || !currentReview || !pageLocations.length) return "Finding highlights use selectable PDF text positions. Scanned/OCR-only passages are not shown as exact page annotations.";
    const finding = findings.find((candidate) => candidate.finding_id === selectedFindingId);
    if (!finding) return "Finding highlights use selectable PDF text positions. Scanned/OCR-only passages are not shown as exact page annotations.";
    const start = codePointToUtf16Offset(content, finding.start);
    return pageLocations.some((location) => start >= location.start && start < location.end)
      ? `Navigated to the source page for “${finding.claim_text}”. Highlighting is limited to selectable PDF text.`
      : "This finding could not be matched to selectable PDF text; it may come from OCR or extraction differences.";
  }, [content, currentReview, findings, pageLocations, selectedFindingId]);
  const ranges = useMemo(() => currentReview ? findings.map((finding) => ({
    id: finding.finding_id,
    start: codePointToUtf16Offset(content, finding.start),
    end: codePointToUtf16Offset(content, finding.end),
  })) : [], [content, currentReview, findings]);

  useEffect(() => {
    let active = true;
    let loadingTask: import("pdfjs-dist").PDFDocumentLoadingTask | undefined;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
        const pdf = await loadingTask.promise;
        if (!active) { await loadingTask.destroy(); return; }
        pdfRef.current = pdf;
        setPageCount(pdf.numPages);
        const pageTexts: Array<{ index: number; text: string }> = [];
        for (let index = 1; index <= pdf.numPages; index += 1) {
          const page = await pdf.getPage(index);
          const textContent = await page.getTextContent();
          const text = textContent.items.map((item) => "str" in item ? item.str : "").filter(Boolean).join(" ").trim();
          if (text) pageTexts.push({ index, text });
        }
        if (active) setPageLocations(mapSequentialTextLocations(pageTexts, content, "\n\n"));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "This PDF could not be opened.");
      }
    })();
    return () => { active = false; pdfRef.current = null; void loadingTask?.destroy(); };
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
        renderTask = page.render({ canvas, canvasContext: context, viewport, transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0] });
        await renderTask.promise;
        if (!active) return;
        textLayerContainer.replaceChildren();
        const textContent = await page.getTextContent();
        textLayer = new pdfjs.TextLayer({ textContentSource: textContent, container: textLayerContainer, viewport });
        await textLayer.render();
        if (!active) return;
        const pageLocation = pageLocations.find((location) => location.index === pageNumber);
        if (!pageLocation) {
          return;
        }
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
          div.replaceChildren(...pieces.map((piece) => {
            if (!piece.findingIds.length) return document.createTextNode(piece.text);
            const mark = document.createElement("mark");
            mark.className = `pdf-finding-mark${piece.findingIds.includes(selectedFindingId ?? "") ? " selected" : ""}`;
            mark.dataset.findingIds = piece.findingIds.join(" ");
            mark.textContent = piece.text;
            return mark;
          }));
          localOffset += text.length;
        }
      } catch (cause) {
        if (active && !(cause instanceof Error && cause.name === "RenderingCancelledException")) setError(cause instanceof Error ? cause.message : "This PDF page could not be displayed.");
      }
    })();
    return () => { active = false; renderTask?.cancel(); textLayer?.cancel(); };
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

  return <div className="pdf-reader" aria-label="PDF document viewer">
    {error ? <p className="original-preview-message" role="alert">{error}</p> : <>
      <div className="pdf-reader-toolbar"><button type="button" className="small-ghost" onClick={() => setPageNumber((value) => Math.max(1, value - 1))} disabled={pageNumber <= 1}>Previous</button><label>Page <input aria-label="PDF page number" type="number" min={1} max={pageCount || 1} value={pageNumber} onChange={(event) => setPageNumber(Math.min(pageCount || 1, Math.max(1, Number(event.target.value) || 1)))} /> of {pageCount || "…"}</label><button type="button" className="small-ghost" onClick={() => setPageNumber((value) => Math.min(pageCount, value + 1))} disabled={pageNumber >= pageCount}>Next</button><span className="pdf-toolbar-spacer" /><button aria-label="Zoom out" type="button" onClick={() => setZoom((value) => Math.max(.7, Math.round((value - .1) * 10) / 10))} disabled={zoom <= .7}>−</button><span>{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" type="button" onClick={() => setZoom((value) => Math.min(1.8, Math.round((value + .1) * 10) / 10))} disabled={zoom >= 1.8}>＋</button></div>
      <div className="pdf-page-scroll"><div className="pdf-page" onClick={selectFromPage}><canvas ref={canvasRef} aria-label={`PDF page ${pageNumber}`} /><div className="textLayer" ref={textLayerRef} /></div></div>
      <p className="document-location-note" aria-live="polite">{locationNote || "Finding highlights use selectable PDF text positions. Scanned/OCR-only passages are not shown as exact page annotations."}</p>
    </>}
  </div>;
}

export function OriginalDocument({ fileKey, name, type, content, findings, selectedFindingId, onSelectFinding, currentReview }: Props) {
  const [file, setFile] = useState<Blob | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    getOriginalDocument(fileKey).then((original) => {
      if (!original) throw new Error("The saved original is unavailable in this browser.");
      objectUrl = URL.createObjectURL(original);
      if (!active) { URL.revokeObjectURL(objectUrl); return; }
      setFile(original);
      setUrl(objectUrl);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load the saved original.");
    });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [fileKey]);

  const extension = name.toLowerCase().split(".").pop();
  const pdf = type === "application/pdf" || extension === "pdf";
  const docx = extension === "docx";
  const image = type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"].includes(extension ?? "");
  const video = type.startsWith("video/") || ["mp4", "webm"].includes(extension ?? "");

  return <section className="original-preview" aria-label="Uploaded original document">
    <div className="original-preview-heading"><div><b>Document review</b><small>{name} · original saved in this browser</small></div>{url && <a className="small-ghost" href={url} download={name}>Download original</a>}</div>
    {error ? <p className="original-preview-message" role="alert">{error} The extracted draft text is still available.</p> : !file ? <p className="original-preview-message">Opening original file…</p> : pdf ? <PdfViewer file={file} content={content} findings={findings} selectedFindingId={selectedFindingId} onSelectFinding={onSelectFinding} currentReview={currentReview} /> : docx ? <DocxViewer file={file} content={content} findings={findings} selectedFindingId={selectedFindingId} onSelectFinding={onSelectFinding} currentReview={currentReview} /> : image ? <><img className="original-image" src={url} alt={`Original image: ${name}`} /><p className="document-location-note">OCR text is available in the draft. Image-region coordinates were not retained, so findings are not highlighted on the image.</p></> : video ? <><video className="original-video" src={url} controls /><p className="document-location-note">Frame text is available in the draft. Sample timestamps and text-region coordinates were not retained, so findings are not highlighted on the video.</p></> : <div className="docx-reading-view"><pre>{content}</pre><p className="document-location-note">This format is shown as extracted text. Source page or paragraph coordinates are unavailable.</p></div>}
    {currentReview && selectedFindingId && !pdf && !docx && <p className="document-location-note">Selected finding: {findings.find((finding) => finding.finding_id === selectedFindingId)?.claim_text}</p>}
    {!currentReview && findings.length > 0 && <p className="document-location-note">The draft changed after this review. Run review again to refresh document highlights.</p>}
  </section>;
}
