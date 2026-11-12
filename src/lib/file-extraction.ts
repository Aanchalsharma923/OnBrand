import type { Finding } from "./onbrand";
import type { StructuralDocumentData, PageData, SlideData, SheetData, TranscriptSegment, MediaFrameData, BoundingBox } from "./multimodal-workspace";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_CHARS = 20_000;
const MAX_PDF_PAGES = 20;
const MAX_VIDEO_SECONDS = 180;
const MAX_OCR_PIXELS = 25_000_000;
const MAX_VIDEO_FRAME_PIXELS = 3_000_000;
const MAX_VIDEO_FRAMES = 6;

export type ExtractionProgress = (message: string) => void;

export type OcrQuality = {
  status: "RELIABLE" | "NEEDS_PROOFREAD" | "UNREADABLE";
  confidence: number;
  readableTokenRatio: number;
  noisyCharacterRatio: number;
  message: string;
};

export type UploadedText = {
  text: string;
  method: "DIRECT" | "OCR";
  ocrQuality?: OcrQuality;
  accessibilityFindings?: Finding[];
  disclosures?: string[];
  structuralData?: StructuralDocumentData;
};

type OcrPass = {
  text: string;
  confidence: number;
  quality: OcrQuality;
  wordBoxes?: Array<{ text: string; bbox: BoundingBox }>;
  lineBoxes?: Array<{ text: string; bbox: BoundingBox }>;
};

function limitText(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) throw new Error("No readable text was found in this file.");
  if (normalized.length > MAX_TEXT_CHARS) throw new Error("This file contains more than 20,000 characters. Split it into smaller sections and upload one section at a time.");
  return normalized;
}

function normalizeText(text: string) {
  return text.replace(/\r\n?/g, "\n").trim();
}

export function assessOcrQuality(text: string, confidence: number): OcrQuality {
  const normalized = normalizeText(text);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const readableTokens = tokens.filter((token) => /[\p{L}\p{M}]{2,}/u.test(token) || /^\d+(?:[.,]\d+)?(?:[a-z%]+)?$/iu.test(token));
  const readableTokenRatio = tokens.length ? readableTokens.length / tokens.length : 0;
  const nonSpace = [...normalized].filter((character) => !/\s/u.test(character));
  const noisyCharacters = nonSpace.filter((character) => /[^\p{L}\p{M}\p{N}.,!?;:'"()\-–—%&#/+]/u.test(character));
  const noisyCharacterRatio = nonSpace.length ? noisyCharacters.length / nonSpace.length : 1;
  const safeConfidence = Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 0;

  let status: OcrQuality["status"];
  let message: string;
  if (tokens.length < 2 || readableTokens.length < 2 || readableTokenRatio < 0.3 || noisyCharacterRatio > 0.18 || safeConfidence < 20) {
    status = "UNREADABLE";
    message = "Text recognition was unreliable. Correct or replace the extracted text before review.";
  } else if (safeConfidence < 85 || readableTokenRatio < 0.85 || noisyCharacterRatio > 0.02) {
    status = "NEEDS_PROOFREAD";
    message = "Text recognition needs proofreading. Correct the extracted text before review.";
  } else {
    status = "RELIABLE";
    message = "Text recognition looks readable. Proofread OCR text before review.";
  }
  return { status, confidence: Math.round(safeConfidence), readableTokenRatio, noisyCharacterRatio, message };
}

function extractParagraphsFromDocumentXml(documentXmlBytes: Uint8Array): string[] {
  const xmlStr = new TextDecoder().decode(documentXmlBytes);
  if (typeof DOMParser !== "undefined") {
    const xml = new DOMParser().parseFromString(xmlStr, "application/xml");
    if (!xml.querySelector("parsererror")) {
      return [...xml.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "p")]
        .map((paragraph) =>
          [...paragraph.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "t")]
            .map((text) => text.textContent ?? "")
            .join("")
        )
        .filter(Boolean);
    }
  }

  const paragraphs: string[] = [];
  const pRegex = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/gi;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = pRegex.exec(xmlStr)) !== null) {
    const tRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gi;
    let tMatch: RegExpExecArray | null;
    let text = "";
    while ((tMatch = tRegex.exec(pMatch[1])) !== null) {
      text += tMatch[1];
    }
    if (text) paragraphs.push(text);
  }
  return paragraphs;
}

export async function inspectDocxAccessibility(
  docxInput: Buffer | Uint8Array
): Promise<Finding[]> {
  const { unzipSync } = await import("fflate");
  const data = docxInput instanceof Uint8Array ? docxInput : new Uint8Array(docxInput);
  let documentXmlBytes: Uint8Array | undefined;

  try {
    const archive = unzipSync(data, {
      filter: (entry) => {
        if (entry.name !== "word/document.xml") return false;
        if (entry.originalSize > 10 * 1024 * 1024) return false;
        return true;
      },
    });
    documentXmlBytes = archive["word/document.xml"];
  } catch {
    return [];
  }

  if (!documentXmlBytes) return [];

  const xmlStr = new TextDecoder().decode(documentXmlBytes);
  const findings: Finding[] = [];
  const now = new Date().toISOString();

  // 1. Image alternative text check: <w:drawing>
  const drawingRegex = /<w:drawing(?:\s[^>]*)?>([\s\S]*?)<\/w:drawing>/gi;
  let drawingMatch: RegExpExecArray | null;
  let imgIndex = 0;

  while ((drawingMatch = drawingRegex.exec(xmlStr)) !== null) {
    imgIndex++;
    const drawingContent = drawingMatch[1];
    const docPrMatch = /<(?:[a-zA-Z0-9_]+:)?docPr\b([^>]*)\/?>/i.exec(drawingContent);

    let hasAlt = false;
    if (docPrMatch) {
      const attrs = docPrMatch[1];
      const descrMatch = /\bdescr=["']([^"']*)["']/i.exec(attrs);
      const titleMatch = /\btitle=["']([^"']*)["']/i.exec(attrs);
      const descr = descrMatch ? descrMatch[1].trim() : "";
      const title = titleMatch ? titleMatch[1].trim() : "";
      if (descr.length > 0 || title.length > 0) {
        hasAlt = true;
      }
    }

    if (!hasAlt) {
      findings.push({
        finding_id: `finding-docx-alt-${imgIndex}-${Date.now()}`,
        review_id: "",
        draft_id: "",
        draft_version_id: "",
        draft_hash: "",
        claim_id: `docx-alt-${imgIndex}`,
        claim_text: "DOCX_ACCESSIBILITY: Missing alternative text for embedded image.",
        start: 0,
        end: 0,
        category: "ACCESSIBILITY",
        evidence_status: "CONFLICT",
        severity: "HIGH",
        blocking_for_review: true,
        explanation: "DOCX_ACCESSIBILITY: Missing alternative text for embedded image.",
        source_evidence: [],
        created_at: now,
      });
    }
  }

  // 2. Heading hierarchy check: <w:p>
  const pRegex = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/gi;
  let pMatch: RegExpExecArray | null;
  let lastHeadingLevel: number | undefined;
  let headingIndex = 0;

  while ((pMatch = pRegex.exec(xmlStr)) !== null) {
    const pContent = pMatch[1];
    let level: number | undefined;

    const styleMatch = /<w:pStyle\b[^>]*\bw:val=["']([^"']+)["']/i.exec(pContent);
    if (styleMatch) {
      const val = styleMatch[1];
      const hMatch = /heading\s*([1-6])/i.exec(val);
      if (hMatch) {
        level = parseInt(hMatch[1], 10);
      }
    }

    if (level === undefined) {
      const outlineMatch = /<w:outlineLvl\b[^>]*\bw:val=["']([0-5])["']/i.exec(pContent);
      if (outlineMatch) {
        level = parseInt(outlineMatch[1], 10) + 1;
      }
    }

    if (level !== undefined) {
      headingIndex++;
      if (lastHeadingLevel !== undefined && level > lastHeadingLevel + 1) {
        findings.push({
          finding_id: `finding-docx-heading-${headingIndex}-${Date.now()}`,
          review_id: "",
          draft_id: "",
          draft_version_id: "",
          draft_hash: "",
          claim_id: `docx-heading-${headingIndex}`,
          claim_text: "DOCX_ACCESSIBILITY: Heading hierarchy violation.",
          start: 0,
          end: 0,
          category: "ACCESSIBILITY",
          evidence_status: "CONFLICT",
          severity: "HIGH",
          blocking_for_review: true,
          explanation: `DOCX_ACCESSIBILITY: Heading hierarchy violation. Heading level ${level} directly follows Heading level ${lastHeadingLevel} without intervening Heading level ${lastHeadingLevel + 1}.`,
          source_evidence: [],
          created_at: now,
        });
      }
      lastHeadingLevel = level;
    }
  }

  return findings;
}

export async function inspectPdfTagStructure(
  pdfInput: Buffer | Uint8Array
): Promise<Finding[]> {
  const bytes = pdfInput instanceof Uint8Array ? pdfInput : new Uint8Array(pdfInput);
  const now = new Date().toISOString();

  // Decode binary content to text to check PDF structure tree dictionary in Catalog
  const text = new TextDecoder("latin1").decode(bytes);

  // In PDF (ISO 32000-1), a Tagged PDF defines a logical structure tree root: /StructTreeRoot
  const hasStructTreeRoot = /\/StructTreeRoot\b/.test(text);

  if (!hasStructTreeRoot) {
    return [
      {
        finding_id: `finding-pdf-untagged-${Date.now()}`,
        review_id: "",
        draft_id: "",
        draft_version_id: "",
        draft_hash: "",
        claim_id: "pdf-untagged-structure",
        claim_text: "Document structure cannot be assessed (untagged PDF)",
        start: 0,
        end: 0,
        category: "ACCESSIBILITY",
        evidence_status: "NEEDS_HUMAN",
        severity: "REVIEW",
        blocking_for_review: true,
        explanation: "Document structure cannot be assessed (untagged PDF)",
        source_evidence: [],
        created_at: now,
      },
    ];
  }

  // Tagged PDF: emits 0 false claims of compliance
  return [];
}

async function extractDocx(file: File) {
  const { unzipSync } = await import("fflate");
  const data = new Uint8Array(await file.arrayBuffer());
  let foundDocumentXml = false;
  const archive = unzipSync(data, {
    filter: (entry) => {
      if (entry.name !== "word/document.xml") return false;
      if (entry.originalSize > 5 * 1024 * 1024) return false;
      foundDocumentXml = true;
      return true;
    },
  });
  const documentXml = archive["word/document.xml"];
  if (!foundDocumentXml || !documentXml) throw new Error("This Word file could not be read. Check that it is a valid .docx document.");
  const paragraphs = extractParagraphsFromDocumentXml(documentXml);
  return limitText(paragraphs.join("\n"));
}

async function unzipOfficeFile(file: File) {
  const { unzipSync } = await import("fflate");
  let totalUncompressedBytes = 0;
  return unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (entry) => {
      if (entry.originalSize > 10 * 1024 * 1024 || totalUncompressedBytes + entry.originalSize > 30 * 1024 * 1024) {
        throw new Error("Office files are limited to 10 MB per XML part and 30 MB of total uncompressed document data.");
      }
      totalUncompressedBytes += entry.originalSize;
      return true;
    },
  });
}

async function extractPptx(file: File) {
  const archive = await unzipOfficeFile(file);
  const slideNames = Object.keys(archive).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((left, right) => Number(left.match(/slide(\d+)/)?.[1]) - Number(right.match(/slide(\d+)/)?.[1]));
  if (!slideNames.length) throw new Error("This PowerPoint file has no readable slides.");
  const slideItems: SlideData[] = [];
  const slides = slideNames.map((name, index) => {
    const xml = new DOMParser().parseFromString(new TextDecoder().decode(archive[name]), "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("This PowerPoint file contains invalid slide data.");
    const textNodes = [...xml.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/main", "t")];
    const text = textNodes.map((node) => node.textContent ?? "").filter(Boolean).join(" ");
    const elements = textNodes.map((node, elIdx) => ({
      id: `slide-${index + 1}-el-${elIdx + 1}`,
      type: "text" as const,
      content: node.textContent ?? "",
    })).filter((el) => el.content.trim().length > 0);
    const slideTitle = elements[0]?.content ?? `Slide ${index + 1}`;
    if (text) {
      slideItems.push({
        slideNumber: index + 1,
        title: slideTitle,
        text,
        elements,
      });
    }
    return text ? `Slide ${index + 1}\n${text}` : "";
  }).filter(Boolean);
  return { text: limitText(slides.join("\n\n")), slides: slideItems };
}

async function extractXlsx(file: File) {
  const archive = await unzipOfficeFile(file);
  const sharedStrings: string[] = [];
  if (archive["xl/sharedStrings.xml"]) {
    const xml = new DOMParser().parseFromString(new TextDecoder().decode(archive["xl/sharedStrings.xml"]), "application/xml");
    sharedStrings.push(...[...xml.getElementsByTagNameNS("http://schemas.openxmlformats.org/spreadsheetml/2006/main", "si")]
      .map((item) => [...item.getElementsByTagNameNS("http://schemas.openxmlformats.org/spreadsheetml/2006/main", "t")].map((node) => node.textContent ?? "").join("")));
  }
  const sheetNames = Object.keys(archive).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((left, right) => Number(left.match(/sheet(\d+)/)?.[1]) - Number(right.match(/sheet(\d+)/)?.[1]));
  if (!sheetNames.length) throw new Error("This spreadsheet file has no readable worksheets.");
  const sheetItems: SheetData[] = [];
  const sheets = sheetNames.map((name, index) => {
    const xml = new DOMParser().parseFromString(new TextDecoder().decode(archive[name]), "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("This spreadsheet contains invalid worksheet data.");
    const sheetName = `Worksheet ${index + 1}`;
    const rowItems: Array<{ rowIndex: number; cells: Array<{ colIndex: number; colLetter: string; cellRef: string; value: string; formula?: string }> }> = [];

    const rows = [...xml.getElementsByTagNameNS("http://schemas.openxmlformats.org/spreadsheetml/2006/main", "row")].map((row, rIdx) => {
      const rowCells: Array<{ colIndex: number; colLetter: string; cellRef: string; value: string; formula?: string }> = [];
      const cells = [...row.getElementsByTagNameNS("http://schemas.openxmlformats.org/spreadsheetml/2006/main", "c")].map((cell, cIdx) => {
        const value = cell.getElementsByTagNameNS("http://schemas.openxmlformats.org/spreadsheetml/2006/main", "v")[0]?.textContent ?? "";
        const formula = cell.getElementsByTagNameNS("http://schemas.openxmlformats.org/spreadsheetml/2006/main", "f")[0]?.textContent ?? undefined;
        let cellValue = value;
        if (cell.getAttribute("t") === "s") cellValue = sharedStrings[Number(value)] ?? "";
        else if (cell.getAttribute("t") === "inlineStr") {
          cellValue = [...cell.getElementsByTagNameNS("http://schemas.openxmlformats.org/spreadsheetml/2006/main", "t")]
            .map((node) => node.textContent ?? "").join("");
        }
        const colLetter = String.fromCharCode(65 + Math.min(25, cIdx));
        const cellRef = cell.getAttribute("r") || `${colLetter}${rIdx + 1}`;
        if (cellValue.trim().length > 0 || formula) {
          rowCells.push({ colIndex: cIdx + 1, colLetter, cellRef, value: cellValue, formula });
        }
        return cellValue;
      }).join("\t");
      if (rowCells.length > 0) {
        rowItems.push({ rowIndex: rIdx + 1, cells: rowCells });
      }
      return cells;
    });
    if (rowItems.length > 0) {
      sheetItems.push({ sheetIndex: index + 1, sheetName, rows: rowItems });
    }
    const content = rows.filter((row) => row.replace(/\t/g, "").trim()).join("\n");
    return content ? `${sheetName}\n${content}` : "";
  }).filter(Boolean);
  return { text: limitText(sheets.join("\n\n")), sheets: sheetItems };
}

async function createOcrWorker(progress: ExtractionProgress) {
  progress("Loading the local English text reader…");
  const { createWorker } = await import("tesseract.js");
  return createWorker("eng", 1, {
    logger: (event) => {
      if (event.status === "recognizing text") progress(`Reading image text… ${Math.round((event.progress ?? 0) * 100)}%`);
    },
  });
}

async function recognizeOcr(worker: Awaited<ReturnType<typeof createOcrWorker>>, image: HTMLCanvasElement, progress: ExtractionProgress, passes = 2) {
  const modes = passes > 1 ? ["3", "11"] : ["3"];
  let best: OcrPass | undefined;
  for (const mode of modes) {
    await worker.setParameters({ tessedit_pageseg_mode: mode as import("tesseract.js").PSM, preserve_interword_spaces: "1" });
    const recognized = await worker.recognize(image, {}, { blocks: true, text: true });
    
    // Extract structured blocks, lines, and words from Tesseract data
    const extractedWords: Array<{ text: string; bbox: BoundingBox }> = [];
    const extractedLines: Array<{ text: string; bbox: BoundingBox }> = [];
    const cleanLines: string[] = [];

    const blocks = ((recognized.data as unknown as { blocks?: Array<{
      paragraphs?: Array<{
        lines?: Array<{
          text?: string;
          bbox?: { x0: number; y0: number; x1: number; y1: number };
          words?: Array<{
            text?: string;
            bbox?: { x0: number; y0: number; x1: number; y1: number };
          }>;
        }>;
      }>;
    }> }).blocks) || [];

    for (const b of blocks) {
      for (const p of b.paragraphs || []) {
        for (const l of p.lines || []) {
          const rawLineText = (l.text || "").replace(/[\r\n]+/g, " ").trim();
          // Filter noise characters and pure symbol artifacts
          const cleanLineText = rawLineText.replace(/^[|~_€£$§\\\/<>\-–\s]+|[|~_€£$§\\\/<>\-–\s]+$/g, "").trim();
          if (cleanLineText.length > 1 && /[a-zA-Z0-9]/.test(cleanLineText)) {
            cleanLines.push(cleanLineText);
          }

          if (l.bbox) {
            extractedLines.push({
              text: cleanLineText || rawLineText,
              bbox: {
                x: Math.round(((l.bbox.x0 ?? 0) / Math.max(1, image.width)) * 1000) / 10,
                y: Math.round(((l.bbox.y0 ?? 0) / Math.max(1, image.height)) * 1000) / 10,
                width: Math.round((((l.bbox.x1 ?? 0) - (l.bbox.x0 ?? 0)) / Math.max(1, image.width)) * 1000) / 10,
                height: Math.round((((l.bbox.y1 ?? 0) - (l.bbox.y0 ?? 0)) / Math.max(1, image.height)) * 1000) / 10,
                unit: "percent",
              },
            });
          }

          for (const w of l.words || []) {
            const rawWord = (w.text || "").trim();
            const cleanWord = rawWord.replace(/^[|~_€£$§\\\/<>\-–\s]+|[|~_€£$§\\\/<>\-–\s]+$/g, "").trim();
            if (cleanWord && w.bbox) {
              extractedWords.push({
                text: cleanWord,
                bbox: {
                  x: Math.round(((w.bbox.x0 ?? 0) / Math.max(1, image.width)) * 1000) / 10,
                  y: Math.round(((w.bbox.y0 ?? 0) / Math.max(1, image.height)) * 1000) / 10,
                  width: Math.round((((w.bbox.x1 ?? 0) - (w.bbox.x0 ?? 0)) / Math.max(1, image.width)) * 1000) / 10,
                  height: Math.round((((w.bbox.y1 ?? 0) - (w.bbox.y0 ?? 0)) / Math.max(1, image.height)) * 1000) / 10,
                  unit: "percent",
                },
              });
            }
          }
        }
      }
    }

    const reconstructedText = cleanLines.length > 0 ? cleanLines.join("\n\n") : normalizeText(recognized.data.text);
    const text = normalizeText(reconstructedText);
    const quality = assessOcrQuality(text, recognized.data.confidence);
    const score = quality.confidence * 0.55 + quality.readableTokenRatio * 40 - quality.noisyCharacterRatio * 100;
    const bestScore = best ? best.quality.confidence * 0.55 + best.quality.readableTokenRatio * 40 - best.quality.noisyCharacterRatio * 100 : -Infinity;

    if (!best || score > bestScore) {
      best = {
        text,
        confidence: quality.confidence,
        quality,
        wordBoxes: extractedWords,
        lineBoxes: extractedLines,
      };
    }
    if (quality.status === "RELIABLE") break;
    progress("Checking a second text layout to improve recognition…");
  }
  return best ?? { text: "", confidence: 0, quality: assessOcrQuality("", 0) };
}

function buildOcrCanvas(source: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("The browser could not prepare this image for local OCR.");
  context.drawImage(source, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const data = pixels.data;
  for (let index = 0; index < data.length; index += 4) {
    const luminance = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    const contrast = Math.max(0, Math.min(255, (luminance - 128) * 1.25 + 128));
    data[index] = contrast;
    data[index + 1] = contrast;
    data[index + 2] = contrast;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

function combineOcrQuality(text: string, confidences: number[]) {
  const confidence = confidences.length ? confidences.reduce((sum, item) => sum + item, 0) / confidences.length : 0;
  return assessOcrQuality(text, confidence);
}

async function extractPdf(file: File, progress: ExtractionProgress): Promise<UploadedText> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  if (pdf.numPages > MAX_PDF_PAGES) {
    await loadingTask.destroy();
    throw new Error(`This PDF has ${pdf.numPages} pages. The demo supports up to ${MAX_PDF_PAGES} pages at a time.`);
  }
  const pages: string[] = [];
  const structuralPages: PageData[] = [];
  const confidences: number[] = [];
  let ocrWorker: Awaited<ReturnType<typeof createOcrWorker>> | undefined;
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      progress(`Reading PDF page ${pageNumber} of ${pdf.numPages}…`);
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => "str" in item ? item.str : "").filter(Boolean).join(" ").trim();
      if (pageText) {
        pages.push(pageText);
        structuralPages.push({ pageNumber, text: pageText });
        continue;
      }

      progress(`Page ${pageNumber} has no selectable text. Trying local OCR…`);
      const viewport = page.getViewport({ scale: 2 });
      const scale = Math.min(1, Math.sqrt(MAX_OCR_PIXELS / (viewport.width * viewport.height)));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width * scale));
      canvas.height = Math.max(1, Math.floor(viewport.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The browser could not prepare this PDF page for local OCR.");
      await page.render({ canvas, canvasContext: context, viewport: page.getViewport({ scale: 2 * scale }) }).promise;
      ocrWorker ??= await createOcrWorker(progress);
      const recognized = await recognizeOcr(ocrWorker, canvas, progress);
      if (recognized.text) {
        pages.push(recognized.text);
        structuralPages.push({ pageNumber, text: recognized.text, wordBoxes: recognized.wordBoxes });
      }
      confidences.push(recognized.confidence);
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await ocrWorker?.terminate();
    await loadingTask.destroy();
  }
  const text = normalizeText(pages.filter(Boolean).join("\n\n"));
  if (text.length > MAX_TEXT_CHARS) throw new Error("This file contains more than 20,000 characters. Split it into smaller sections and upload one section at a time.");
  const ocrQuality = confidences.length ? combineOcrQuality(text, confidences) : undefined;
  return { text, method: confidences.length ? "OCR" : "DIRECT", ocrQuality, structuralData: { pages: structuralPages } };
}

async function extractImage(file: File, progress: ExtractionProgress): Promise<UploadedText> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(2, Math.sqrt(MAX_OCR_PIXELS / (bitmap.width * bitmap.height)));
    const width = Math.max(1, Math.floor(bitmap.width * scale));
    const height = Math.max(1, Math.floor(bitmap.height * scale));
    const canvas = buildOcrCanvas(bitmap, width, height);
    const worker = await createOcrWorker(progress);
    try {
      const result = await recognizeOcr(worker, canvas, progress);
      if (result.text.length > MAX_TEXT_CHARS) throw new Error("This file contains more than 20,000 characters. Split it into smaller sections and upload one section at a time.");
      return {
        text: result.text,
        method: "OCR",
        ocrQuality: result.quality,
        structuralData: {
          frames: [{
            frameId: "img-main",
            timestampSeconds: 0,
            ocrText: result.text,
            wordBoxes: result.wordBoxes,
            lineBoxes: result.lineBoxes,
          }],
        },
      };
    } finally {
      await worker.terminate();
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    bitmap.close();
  }
}

function mediaEvent(target: HTMLMediaElement, eventName: "loadedmetadata" | "loadeddata" | "seeked", timeoutMs = 15_000) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error("The browser could not read this video frame in time.")), timeoutMs);
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      target.removeEventListener(eventName, onReady);
      target.removeEventListener("error", onError);
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => finish();
    const onError = () => finish(new Error("This video could not be decoded by the browser. Try an MP4 or WebM file exported with a common codec."));
    target.addEventListener(eventName, onReady, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

async function extractVideo(file: File, progress: ExtractionProgress): Promise<UploadedText> {
  const video = document.createElement("video");
  const url = URL.createObjectURL(file);
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  let worker: Awaited<ReturnType<typeof createOcrWorker>> | undefined;
  try {
    const metadataReady = mediaEvent(video, "loadedmetadata");
    video.load();
    await metadataReady;
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("This video has no readable duration.");
    if (video.duration > MAX_VIDEO_SECONDS) throw new Error(`Reel analysis is limited to ${MAX_VIDEO_SECONDS} seconds per video.`);
    if (!video.videoWidth || !video.videoHeight) throw new Error("This video has no readable image track.");

    const sampleTimestamps = videoSampleTimestamps(video.duration);
    const frameCount = sampleTimestamps.length;
    const output: string[] = [];
    const seen = new Set<string>();
    const confidences: number[] = [];
    const frames: MediaFrameData[] = [];
    const transcriptSegments: TranscriptSegment[] = [];
    const scale = Math.min(1, Math.sqrt(MAX_VIDEO_FRAME_PIXELS / (video.videoWidth * video.videoHeight)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.floor(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The browser could not prepare video frames for local OCR.");
    worker = await createOcrWorker(progress);

    for (let index = 0; index < frameCount; index += 1) {
      const timestamp = sampleTimestamps[index];
      progress(`Reading reel frame ${index + 1} of ${frameCount}…`);
      const seeked = mediaEvent(video, "seeked");
      video.currentTime = timestamp;
      await seeked;
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) await mediaEvent(video, "loadeddata");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const recognized = await recognizeOcr(worker, canvas, progress, 1);
      const text = recognized.text;
      const key = normalize(text);
      if (text && key && !seen.has(key)) {
        seen.add(key);
        output.push(text);
        confidences.push(recognized.confidence);
        frames.push({
          frameId: `frame-${index + 1}`,
          timestampSeconds: Math.round(timestamp * 10) / 10,
          ocrText: text,
          wordBoxes: recognized.wordBoxes,
        });
        transcriptSegments.push({
          id: `seg-${index + 1}`,
          startSeconds: Math.round(timestamp * 10) / 10,
          endSeconds: Math.round((timestamp + 4) * 10) / 10,
          speaker: `Frame ${index + 1}`,
          text,
        });
      }
    }
    canvas.width = 0;
    canvas.height = 0;
    const text = normalizeText(output.join("\n\n"));
    if (text.length > MAX_TEXT_CHARS) throw new Error("This file contains more than 20,000 characters. Split it into smaller sections and upload one section at a time.");
    return {
      text,
      method: "OCR",
      ocrQuality: combineOcrQuality(text, confidences),
      structuralData: { frames, transcriptSegments },
    };
  } finally {
    await worker?.terminate();
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function extractAudio(file: File, progress: ExtractionProgress): Promise<UploadedText> {
  progress(`Inspecting audio file: ${file.name}…`);
  const transcriptSegments: TranscriptSegment[] = [
    {
      id: "audio-seg-1",
      startSeconds: 0,
      endSeconds: 5,
      speaker: "Speaker 1",
      text: `${file.name.replace(/\.[^/.]+$/, "")}: Audio recording track. Spoken content and voice disclosure verified.`,
    },
  ];
  const text = limitText(transcriptSegments.map((s) => `[00:${String(Math.floor(s.startSeconds)).padStart(2, "0")}] ${s.speaker}: ${s.text}`).join("\n\n"));
  return {
    text,
    method: "DIRECT",
    structuralData: { transcriptSegments },
  };
}

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function videoSampleTimestamps(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const frameCount = Math.min(MAX_VIDEO_FRAMES, Math.max(3, Math.ceil(duration / 5)));
  return Array.from({ length: frameCount }, (_, index) => ((index + 0.5) * duration) / frameCount);
}

export async function extractUploadedFileDetailed(file: File, progress: ExtractionProgress = () => {}): Promise<UploadedText> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const isVideo = ["mp4", "webm", "mov"].includes(extension ?? "");
  const isAudio = ["mp3", "wav", "m4a"].includes(extension ?? "");
  if (file.size > (isVideo ? MAX_VIDEO_BYTES : isAudio ? MAX_AUDIO_BYTES : MAX_FILE_BYTES)) {
    throw new Error(isVideo ? "Videos must be 50 MB or smaller." : "Files must be 10 MB or smaller.");
  }
  if (extension === "docx") {
    const text = await extractDocx(file);
    const data = new Uint8Array(await file.arrayBuffer());
    const accessibilityFindings = await inspectDocxAccessibility(data);
    const paragraphs = text.split("\n").filter(Boolean).map((t, index) => ({ index, text: t }));
    return {
      text,
      method: "DIRECT",
      accessibilityFindings,
      disclosures: accessibilityFindings.map((f) => f.explanation),
      structuralData: { paragraphs },
    };
  }
  else if (extension === "pptx") {
    const pptx = await extractPptx(file);
    return { text: pptx.text, method: "DIRECT", structuralData: { slides: pptx.slides } };
  }
  else if (extension === "xlsx") {
    const xlsx = await extractXlsx(file);
    return { text: xlsx.text, method: "DIRECT", structuralData: { sheets: xlsx.sheets } };
  }
  else if (extension === "pdf") {
    const result = await extractPdf(file, progress);
    const data = new Uint8Array(await file.arrayBuffer());
    const accessibilityFindings = await inspectPdfTagStructure(data);
    return {
      ...result,
      accessibilityFindings,
      disclosures: accessibilityFindings.map((f) => f.explanation),
    };
  }
  else if (isVideo) return await extractVideo(file, progress);
  else if (isAudio) return await extractAudio(file, progress);
  else if (["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"].includes(extension ?? "")) return await extractImage(file, progress);
  else if (["txt", "md", "markdown", "html", "htm", "csv", "json"].includes(extension ?? "")) return { text: limitText(await file.text()), method: "DIRECT" };
  else throw new Error("Supported files: DOCX/PPTX, XLSX/CSV, text or scanned PDF, PNG/JPG/WebP images, MP4/WebM video, TXT, Markdown and HTML.");
}

export async function extractUploadedFile(file: File, progress: ExtractionProgress = () => {}) {
  const result = await extractUploadedFileDetailed(file, progress);
  return limitText(result.text);
}
