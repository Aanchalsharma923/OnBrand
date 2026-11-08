const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 20_000;
const MAX_PDF_PAGES = 20;
const MAX_OCR_PIXELS = 25_000_000;

export type ExtractionProgress = (message: string) => void;

function limitText(text: string) {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new Error("No readable text was found in this file.");
  if (normalized.length > MAX_TEXT_CHARS) throw new Error("This file contains more than 20,000 characters. Split it into smaller sections and upload one section at a time.");
  return normalized;
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

async function createOcrWorker(progress: ExtractionProgress) {
  progress("Loading the local English text reader…");
  const { createWorker } = await import("tesseract.js");
  return createWorker("eng", 1, {
    logger: (event) => {
      if (event.status === "recognizing text") progress(`Reading image text… ${Math.round((event.progress ?? 0) * 100)}%`);
    },
  });
}

async function extractPdf(file: File, progress: ExtractionProgress) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  if (pdf.numPages > MAX_PDF_PAGES) {
    await loadingTask.destroy();
    throw new Error(`This PDF has ${pdf.numPages} pages. The demo supports up to ${MAX_PDF_PAGES} pages at a time.`);
  }
  const pages: string[] = [];
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
      const viewport = page.getViewport({ scale: 1.4 });
      const scale = Math.min(1, Math.sqrt(MAX_OCR_PIXELS / (viewport.width * viewport.height)));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width * scale));
      canvas.height = Math.max(1, Math.floor(viewport.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The browser could not prepare this PDF page for local OCR.");
      await page.render({ canvas, canvasContext: context, viewport: page.getViewport({ scale: 1.4 * scale }) }).promise;
      ocrWorker ??= await createOcrWorker(progress);
      const recognized = await ocrWorker.recognize(canvas);
      pages.push(recognized.data.text.trim());
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await ocrWorker?.terminate();
    await loadingTask.destroy();
  }
  return limitText(pages.filter(Boolean).join("\n\n"));
}

async function extractImage(file: File, progress: ExtractionProgress) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, Math.sqrt(MAX_OCR_PIXELS / (bitmap.width * bitmap.height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(bitmap.width * scale));
    canvas.height = Math.max(1, Math.floor(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The browser could not prepare this image for local OCR.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const worker = await createOcrWorker(progress);
    try {
      return limitText((await worker.recognize(canvas)).data.text);
    } finally {
      await worker.terminate();
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    bitmap.close();
  }
}

export async function extractUploadedFile(file: File, progress: ExtractionProgress = () => {}) {
  if (file.size > MAX_FILE_BYTES) throw new Error("Files must be 10 MB or smaller.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  let text: string;
  if (extension === "docx") text = await extractDocx(file);
  else if (extension === "pdf") text = await extractPdf(file, progress);
  else if (["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"].includes(extension ?? "")) text = await extractImage(file, progress);
  else if (["txt", "md", "markdown", "html", "htm"].includes(extension ?? "")) text = limitText(await file.text());
  else throw new Error("Supported files: DOCX, text PDF, PNG/JPG/WebP images, TXT, Markdown and HTML.");
  return limitText(text);
}
