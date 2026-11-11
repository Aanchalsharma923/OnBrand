const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
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
};

type OcrPass = { text: string; confidence: number; quality: OcrQuality };

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
  const xml = new DOMParser().parseFromString(new TextDecoder().decode(documentXml), "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("This Word document contains invalid text data and could not be read.");
  const paragraphs = [...xml.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "p")]
    .map((paragraph) => [...paragraph.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "t")]
      .map((text) => text.textContent ?? "").join(""))
    .filter(Boolean);
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
  const slides = slideNames.map((name, index) => {
    const xml = new DOMParser().parseFromString(new TextDecoder().decode(archive[name]), "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("This PowerPoint file contains invalid slide data.");
    const text = [...xml.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/main", "t")]
      .map((node) => node.textContent ?? "").filter(Boolean).join(" ");
    return text ? `Slide ${index + 1}\n${text}` : "";
  }).filter(Boolean);
  return limitText(slides.join("\n\n"));
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
  const sheets = sheetNames.map((name, index) => {
    const xml = new DOMParser().parseFromString(new TextDecoder().decode(archive[name]), "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("This spreadsheet contains invalid worksheet data.");
    const rows = [...xml.getElementsByTagNameNS("http://schemas.openxmlformats.org/spreadsheetml/2006/main", "row")].map((row) =>
      [...row.getElementsByTagNameNS("http://schemas.openxmlformats.org/spreadsheetml/2006/main", "c")].map((cell) => {
        const value = cell.getElementsByTagNameNS("http://schemas.openxmlformats.org/spreadsheetml/2006/main", "v")[0]?.textContent ?? "";
        if (cell.getAttribute("t") === "s") return sharedStrings[Number(value)] ?? "";
        if (cell.getAttribute("t") === "inlineStr") {
          return [...cell.getElementsByTagNameNS("http://schemas.openxmlformats.org/spreadsheetml/2006/main", "t")]
            .map((node) => node.textContent ?? "").join("");
        }
        return value;
      }).join("\t"));
    const content = rows.filter((row) => row.replace(/\t/g, "").trim()).join("\n");
    return content ? `Worksheet ${index + 1}\n${content}` : "";
  }).filter(Boolean);
  return limitText(sheets.join("\n\n"));
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
  const modes = passes > 1 ? ["11", "3"] : ["11"];
  let best: OcrPass | undefined;
  for (const mode of modes) {
    await worker.setParameters({ tessedit_pageseg_mode: mode as import("tesseract.js").PSM, preserve_interword_spaces: "1" });
    const recognized = await worker.recognize(image);
    const text = normalizeText(recognized.data.text);
    const quality = assessOcrQuality(text, recognized.data.confidence);
    const score = quality.confidence * 0.55 + quality.readableTokenRatio * 40 - quality.noisyCharacterRatio * 100;
    const bestScore = best ? best.quality.confidence * 0.55 + best.quality.readableTokenRatio * 40 - best.quality.noisyCharacterRatio * 100 : -Infinity;
    if (!best || score > bestScore) best = { text, confidence: quality.confidence, quality };
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
      if (recognized.text) pages.push(recognized.text);
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
  return { text, method: confidences.length ? "OCR" : "DIRECT", ocrQuality };
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
      return { text: result.text, method: "OCR", ocrQuality: result.quality };
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
      }
    }
    canvas.width = 0;
    canvas.height = 0;
    const text = normalizeText(output.join("\n\n"));
    if (text.length > MAX_TEXT_CHARS) throw new Error("This file contains more than 20,000 characters. Split it into smaller sections and upload one section at a time.");
    return { text, method: "OCR", ocrQuality: combineOcrQuality(text, confidences) };
  } finally {
    await worker?.terminate();
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
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
  const isVideo = ["mp4", "webm"].includes(extension ?? "");
  if (file.size > (isVideo ? MAX_VIDEO_BYTES : MAX_FILE_BYTES)) throw new Error(isVideo ? "Videos must be 50 MB or smaller." : "Files must be 10 MB or smaller.");
  if (extension === "docx") return { text: await extractDocx(file), method: "DIRECT" };
  else if (extension === "pptx") return { text: await extractPptx(file), method: "DIRECT" };
  else if (extension === "xlsx") return { text: await extractXlsx(file), method: "DIRECT" };
  else if (extension === "pdf") return await extractPdf(file, progress);
  else if (isVideo) return await extractVideo(file, progress);
  else if (["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"].includes(extension ?? "")) return await extractImage(file, progress);
  else if (["txt", "md", "markdown", "html", "htm", "csv"].includes(extension ?? "")) return { text: limitText(await file.text()), method: "DIRECT" };
  else throw new Error("Supported files: DOCX/PPTX, XLSX/CSV, text or scanned PDF, PNG/JPG/WebP images, MP4/WebM video, TXT, Markdown and HTML.");
}

export async function extractUploadedFile(file: File, progress: ExtractionProgress = () => {}) {
  const result = await extractUploadedFileDetailed(file, progress);
  return limitText(result.text);
}
