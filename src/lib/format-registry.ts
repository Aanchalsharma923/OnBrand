/**
 * OnBrand Master Format Registry & Binary Header Validator
 *
 * Implements binary magic number validation, format resolution, parser designations,
 * format-aware viewer components, editable representations, export targets,
 * and explicit format limitations.
 */

export type ViewerComponentId =
  | "PDF_CANVAS"
  | "DOCX_STRUCTURAL"
  | "DOC_LEGACY"
  | "PPTX_SLIDES"
  | "PPT_LEGACY"
  | "XLSX_GRID"
  | "XLS_LEGACY"
  | "CSV_TABLE"
  | "MARKDOWN_RENDERED"
  | "HTML_SANITIZED"
  | "RTF_DOCUMENT"
  | "PLAIN_TEXT"
  | "IMAGE_OVERLAY"
  | "VIDEO_TIMELINE"
  | "AUDIO_TRANSCRIPT"
  | "STRUCTURED_CODE";

export type FormatCategory =
  | "OFFICE_DOCUMENT"
  | "SPREADSHEET"
  | "PRESENTATION"
  | "IMAGE"
  | "VIDEO"
  | "AUDIO"
  | "STRUCTURED_TEXT";

export interface BinaryMagicSignature {
  name: string;
  offset?: number;
  bytes: number[];
  mask?: number[];
}

export interface FormatDefinition {
  formatId: string;
  displayName: string;
  category: FormatCategory;
  mimeTypes: string[];
  extensions: string[];
  magicSignatures?: BinaryMagicSignature[];
  maxSizeBytes: number;
  parserName: string;
  capabilities: {
    viewer: ViewerComponentId;
    inlineHighlights: boolean;
    boundingBoxes: boolean;
    timestampNavigation: boolean;
    cellCoordinates: boolean;
    slideNavigation: boolean;
    inlineEditing: boolean;
    exportFormats: string[];
  };
  editableRepresentation: string;
  limitations: string[];
}

export const FORMAT_REGISTRY: Record<string, FormatDefinition> = {
  // --------------------------------------------------------------------------
  // Priority 1 — Office & Documents
  // --------------------------------------------------------------------------
  pdf: {
    formatId: "pdf",
    displayName: "PDF Document",
    category: "OFFICE_DOCUMENT",
    mimeTypes: ["application/pdf"],
    extensions: ["pdf"],
    magicSignatures: [
      { name: "PDF", offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
    ],
    maxSizeBytes: 10 * 1024 * 1024,
    parserName: "PDF.js v6 with Page/TextLayer Extractor",
    capabilities: {
      viewer: "PDF_CANVAS",
      inlineHighlights: true,
      boundingBoxes: true,
      timestampNavigation: false,
      cellCoordinates: false,
      slideNavigation: false,
      inlineEditing: true,
      exportFormats: ["pdf", "txt", "md", "json_audit"],
    },
    editableRepresentation: "Structured text layer with page boundaries and character spans",
    limitations: [
      "Scanned or image-only PDFs require OCR extraction and do not support native vector text selection.",
      "Untagged PDFs emit accessibility warnings for missing logical structure trees.",
      "Maximum 20 pages processed in interactive preview canvas.",
    ],
  },

  docx: {
    formatId: "docx",
    displayName: "Word Document (DOCX)",
    category: "OFFICE_DOCUMENT",
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/zip",
      "application/x-zip-compressed",
    ],
    extensions: ["docx"],
    magicSignatures: [
      { name: "ZIP/OOXML", offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }, // PK\x03\x04
      { name: "ZIP/OOXML-Empty", offset: 0, bytes: [0x50, 0x4b, 0x05, 0x06] },
      { name: "ZIP/OOXML-Spanned", offset: 0, bytes: [0x50, 0x4b, 0x07, 0x08] },
    ],
    maxSizeBytes: 10 * 1024 * 1024,
    parserName: "docx-preview OpenXML Layout & fflate OOXML Structure Engine",
    capabilities: {
      viewer: "DOCX_STRUCTURAL",
      inlineHighlights: true,
      boundingBoxes: false,
      timestampNavigation: false,
      cellCoordinates: false,
      slideNavigation: false,
      inlineEditing: true,
      exportFormats: ["docx", "txt", "md", "json_audit"],
    },
    editableRepresentation: "Structured paragraphs, heading hierarchy, tables, and revised copy editor",
    limitations: [
      "Complex Word macro-enabled scripts (.docm) and external OLE objects are stripped during preview.",
      "Drawings and vector WordArt are checked for alt-text compliance; full 3D rendering is not simulated.",
    ],
  },

  doc: {
    formatId: "doc",
    displayName: "Legacy Word Document (DOC)",
    category: "OFFICE_DOCUMENT",
    mimeTypes: ["application/msword"],
    extensions: ["doc"],
    magicSignatures: [
      { name: "OLE CFBF", offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
    ],
    maxSizeBytes: 10 * 1024 * 1024,
    parserName: "Compound File Binary Format Stream Extractor",
    capabilities: {
      viewer: "DOC_LEGACY",
      inlineHighlights: true,
      boundingBoxes: false,
      timestampNavigation: false,
      cellCoordinates: false,
      slideNavigation: false,
      inlineEditing: true,
      exportFormats: ["docx", "txt", "md"],
    },
    editableRepresentation: "Extracted text with legacy formatting disclosure",
    limitations: [
      "Word 97-2003 binary format cannot be rendered with modern CSS grid/typography. Conversion to .docx is recommended.",
      "Embedded OLE controls and binary macros are quarantined.",
    ],
  },

  txt: {
    formatId: "txt",
    displayName: "Plain Text Document",
    category: "STRUCTURED_TEXT",
    mimeTypes: ["text/plain"],
    extensions: ["txt"],
    maxSizeBytes: 5 * 1024 * 1024,
    parserName: "UTF-8 Normalized Text Parser",
    capabilities: {
      viewer: "PLAIN_TEXT",
      inlineHighlights: true,
      boundingBoxes: false,
      timestampNavigation: false,
      cellCoordinates: false,
      slideNavigation: false,
      inlineEditing: true,
      exportFormats: ["txt", "md", "json_audit"],
    },
    editableRepresentation: "Direct line-indexed plain text editor with live finding jumper",
    limitations: [
      "Plain text files contain no font, color, or layout metadata.",
    ],
  },

  rtf: {
    formatId: "rtf",
    displayName: "Rich Text Format",
    category: "OFFICE_DOCUMENT",
    mimeTypes: ["application/rtf", "text/rtf"],
    extensions: ["rtf"],
    magicSignatures: [
      { name: "RTF", offset: 0, bytes: [0x7b, 0x5c, 0x72, 0x74, 0x66] }, // {\rtf
    ],
    maxSizeBytes: 5 * 1024 * 1024,
    parserName: "RTF Control Word Tokenizer",
    capabilities: {
      viewer: "RTF_DOCUMENT",
      inlineHighlights: true,
      boundingBoxes: false,
      timestampNavigation: false,
      cellCoordinates: false,
      slideNavigation: false,
      inlineEditing: true,
      exportFormats: ["rtf", "txt", "docx"],
    },
    editableRepresentation: "Rich text editor with paragraph formatting",
    limitations: [
      "Advanced RTF field codes and embedded OLE objects are rendered as static text.",
    ],
  },

  md: {
    formatId: "md",
    displayName: "Markdown Document",
    category: "STRUCTURED_TEXT",
    mimeTypes: ["text/markdown", "text/x-markdown"],
    extensions: ["md", "markdown"],
    maxSizeBytes: 5 * 1024 * 1024,
    parserName: "CommonMark / GFM Block Parser",
    capabilities: {
      viewer: "MARKDOWN_RENDERED",
      inlineHighlights: true,
      boundingBoxes: false,
      timestampNavigation: false,
      cellCoordinates: false,
      slideNavigation: false,
      inlineEditing: true,
      exportFormats: ["md", "txt", "html"],
    },
    editableRepresentation: "Markdown source editor with synchronized live formatted preview",
    limitations: [
      "Raw inline HTML script tags are sanitized for security.",
    ],
  },

  html: {
    formatId: "html",
    displayName: "HTML Document",
    category: "STRUCTURED_TEXT",
    mimeTypes: ["text/html"],
    extensions: ["html", "htm"],
    maxSizeBytes: 5 * 1024 * 1024,
    parserName: "Sanitized DOMParser with Script Isolation",
    capabilities: {
      viewer: "HTML_SANITIZED",
      inlineHighlights: true,
      boundingBoxes: false,
      timestampNavigation: false,
      cellCoordinates: false,
      slideNavigation: false,
      inlineEditing: true,
      exportFormats: ["html", "txt", "md"],
    },
    editableRepresentation: "Sanitized HTML source editor with live sandboxed preview",
    limitations: [
      "External script execution (<script>) is strictly blocked in compliance with Content Security Policy.",
      "External fonts and remote stylesheets are rendered under privacy sandbox rules.",
    ],
  },

  csv: {
    formatId: "csv",
    displayName: "CSV Table",
    category: "SPREADSHEET",
    mimeTypes: ["text/csv", "application/csv"],
    extensions: ["csv"],
    maxSizeBytes: 10 * 1024 * 1024,
    parserName: "RFC 4180 CSV Grid Parser",
    capabilities: {
      viewer: "CSV_TABLE",
      inlineHighlights: true,
      boundingBoxes: false,
      timestampNavigation: false,
      cellCoordinates: true,
      slideNavigation: false,
      inlineEditing: true,
      exportFormats: ["csv", "xlsx", "txt"],
    },
    editableRepresentation: "Interactive tabular grid with cell-coordinate navigation and column search",
    limitations: [
      "CSV has no multiple worksheet support or formula calculation engine.",
    ],
  },

  xlsx: {
    formatId: "xlsx",
    displayName: "Excel Spreadsheet (XLSX)",
    category: "SPREADSHEET",
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/zip",
    ],
    extensions: ["xlsx"],
    magicSignatures: [
      { name: "ZIP/OOXML", offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
    ],
    maxSizeBytes: 10 * 1024 * 1024,
    parserName: "OpenXML SpreadsheetML Sheet Parser",
    capabilities: {
      viewer: "XLSX_GRID",
      inlineHighlights: true,
      boundingBoxes: false,
      timestampNavigation: false,
      cellCoordinates: true,
      slideNavigation: false,
      inlineEditing: true,
      exportFormats: ["xlsx", "csv", "txt"],
    },
    editableRepresentation: "Multi-sheet workbook grid with coordinate finding badges (e.g. Sheet1:B4)",
    limitations: [
      "Formulas are preserved and never silently overwritten during cell content editing.",
      "VBA macros (.xlsm) and external SQL data connections are deactivated during preview.",
    ],
  },

  xls: {
    formatId: "xls",
    displayName: "Legacy Excel Spreadsheet (XLS)",
    category: "SPREADSHEET",
    mimeTypes: ["application/vnd.ms-excel"],
    extensions: ["xls"],
    magicSignatures: [
      { name: "OLE CFBF", offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
    ],
    maxSizeBytes: 10 * 1024 * 1024,
    parserName: "BIFF8 Binary Spreadsheet Extractor",
    capabilities: {
      viewer: "XLS_LEGACY",
      inlineHighlights: true,
      boundingBoxes: false,
      timestampNavigation: false,
      cellCoordinates: true,
      slideNavigation: false,
      inlineEditing: true,
      exportFormats: ["xlsx", "csv"],
    },
    editableRepresentation: "Tabular extracted grid with legacy workbook notice",
    limitations: [
      "Excel 97-2003 BIFF8 format. Upgrade to .xlsx is recommended for formula auditing.",
    ],
  },

  pptx: {
    formatId: "pptx",
    displayName: "PowerPoint Presentation (PPTX)",
    category: "PRESENTATION",
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/zip",
    ],
    extensions: ["pptx"],
    magicSignatures: [
      { name: "ZIP/OOXML", offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
    ],
    maxSizeBytes: 15 * 1024 * 1024,
    parserName: "PresentationML Slide-by-Slide Extractor",
    capabilities: {
      viewer: "PPTX_SLIDES",
      inlineHighlights: true,
      boundingBoxes: true,
      timestampNavigation: false,
      cellCoordinates: false,
      slideNavigation: true,
      inlineEditing: true,
      exportFormats: ["pptx", "txt", "md"],
    },
    editableRepresentation: "Slide-by-slide text frame editor with slide thumbnail navigation",
    limitations: [
      "Slide ordering and text content boxes are extracted.",
      "Complex 3D transitions and timed animations are omitted.",
    ],
  },

  ppt: {
    formatId: "ppt",
    displayName: "Legacy PowerPoint (PPT)",
    category: "PRESENTATION",
    mimeTypes: ["application/vnd.ms-powerpoint"],
    extensions: ["ppt"],
    magicSignatures: [
      { name: "OLE CFBF", offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
    ],
    maxSizeBytes: 15 * 1024 * 1024,
    parserName: "PowerPoint 97-2003 Binary Stream Extractor",
    capabilities: {
      viewer: "PPT_LEGACY",
      inlineHighlights: true,
      boundingBoxes: false,
      timestampNavigation: false,
      cellCoordinates: false,
      slideNavigation: true,
      inlineEditing: true,
      exportFormats: ["pptx", "txt"],
    },
    editableRepresentation: "Extracted slide notes and text content with legacy notice",
    limitations: [
      "PowerPoint 97-2003 binary format. Convert to .pptx for full visual rendering.",
    ],
  },

  // --------------------------------------------------------------------------
  // Priority 2 — Images & Visual Content
  // --------------------------------------------------------------------------
  image: {
    formatId: "image",
    displayName: "Image & Poster",
    category: "IMAGE",
    mimeTypes: [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "image/gif",
      "image/bmp",
      "image/tiff",
    ],
    extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff"],
    magicSignatures: [
      { name: "PNG", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
      { name: "JPEG", offset: 0, bytes: [0xff, 0xd8, 0xff] },
      { name: "GIF87a", offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] },
      { name: "GIF89a", offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] },
      { name: "BMP", offset: 0, bytes: [0x42, 0x4d] },
      { name: "TIFF-LE", offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00] },
      { name: "TIFF-BE", offset: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a] },
      { name: "WEBP", offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF header (checked with WEBP at offset 8)
    ],
    maxSizeBytes: 10 * 1024 * 1024,
    parserName: "Tesseract OCR & Canvas Pixel Geometry Engine",
    capabilities: {
      viewer: "IMAGE_OVERLAY",
      inlineHighlights: true,
      boundingBoxes: true,
      timestampNavigation: false,
      cellCoordinates: false,
      slideNavigation: false,
      inlineEditing: true,
      exportFormats: ["png", "jpg", "txt", "json_audit"],
    },
    editableRepresentation: "Preserved original visual poster with translucent bounding overlays and OCR search tray",
    limitations: [
      "Original pixels cannot be directly edited as native vector fonts without graphic regeneration.",
      "Contrast ratios on complex photographic backgrounds are marked as computational estimates.",
    ],
  },

  // --------------------------------------------------------------------------
  // Priority 3 — Media & Dynamic Content
  // --------------------------------------------------------------------------
  video: {
    formatId: "video",
    displayName: "Video & Reel",
    category: "VIDEO",
    mimeTypes: ["video/mp4", "video/webm", "video/quicktime"],
    extensions: ["mp4", "webm", "mov"],
    magicSignatures: [
      { name: "MP4/MOV", offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // 'ftyp'
      { name: "WEBM", offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] }, // EBML
    ],
    maxSizeBytes: 50 * 1024 * 1024,
    parserName: "HTML5 Media Pipeline & Canvas Frame Sampler",
    capabilities: {
      viewer: "VIDEO_TIMELINE",
      inlineHighlights: true,
      boundingBoxes: true,
      timestampNavigation: true,
      cellCoordinates: false,
      slideNavigation: false,
      inlineEditing: true,
      exportFormats: ["srt", "vtt", "txt", "json_audit"],
    },
    editableRepresentation: "Timestamped transcript segments with synchronized video playback and frame scrubbing",
    limitations: [
      "Keyframes are sampled up to 6 representative frames per video for visual inspection.",
      "Interactive video preview is optimized for clips up to 180 seconds in length.",
    ],
  },

  audio: {
    formatId: "audio",
    displayName: "Audio Recording",
    category: "AUDIO",
    mimeTypes: ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a", "audio/aac"],
    extensions: ["mp3", "wav", "m4a", "aac"],
    magicSignatures: [
      { name: "MP3-ID3", offset: 0, bytes: [0x49, 0x44, 0x33] }, // ID3
      { name: "WAV", offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
      { name: "M4A", offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // ftyp
    ],
    maxSizeBytes: 25 * 1024 * 1024,
    parserName: "Web Audio Context & Timestamped Speech Alignment",
    capabilities: {
      viewer: "AUDIO_TRANSCRIPT",
      inlineHighlights: true,
      boundingBoxes: false,
      timestampNavigation: true,
      cellCoordinates: false,
      slideNavigation: false,
      inlineEditing: true,
      exportFormats: ["srt", "txt", "json_audit"],
    },
    editableRepresentation: "Timestamped transcript cards synchronized with audio playback timeline",
    limitations: [
      "Timestamp navigation accuracy is tied to transcript chunk boundaries.",
      "Multitrack studio sessions are mixed down to a stereo master for review.",
    ],
  },

  structured_text: {
    formatId: "structured_text",
    displayName: "Structured Text & Code",
    category: "STRUCTURED_TEXT",
    mimeTypes: ["text/plain", "application/json"],
    extensions: ["json"],
    maxSizeBytes: 5 * 1024 * 1024,
    parserName: "JSON / Structured Text Parser",
    capabilities: {
      viewer: "STRUCTURED_CODE",
      inlineHighlights: true,
      boundingBoxes: false,
      timestampNavigation: false,
      cellCoordinates: true,
      slideNavigation: false,
      inlineEditing: true,
      exportFormats: ["json", "txt"],
    },
    editableRepresentation: "Syntax-highlighted structured text editor",
    limitations: [
      "Requires valid JSON syntax for tree inspection.",
    ],
  },
};

/**
 * Validates binary magic signatures from the beginning of a buffer.
 */
export function detectBinaryFormat(headerBytes: Uint8Array): string | null {
  if (headerBytes.length < 4) return null;

  // 1. Check PDF: %PDF
  if (
    headerBytes[0] === 0x25 &&
    headerBytes[1] === 0x50 &&
    headerBytes[2] === 0x44 &&
    headerBytes[3] === 0x46
  ) {
    return "pdf";
  }

  // 2. Check PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    headerBytes.length >= 8 &&
    headerBytes[0] === 0x89 &&
    headerBytes[1] === 0x50 &&
    headerBytes[2] === 0x4e &&
    headerBytes[3] === 0x47
  ) {
    return "image";
  }

  // 3. Check JPEG: FF D8 FF
  if (
    headerBytes[0] === 0xff &&
    headerBytes[1] === 0xd8 &&
    headerBytes[2] === 0xff
  ) {
    return "image";
  }

  // 4. Check GIF: GIF87a or GIF89a
  if (
    headerBytes.length >= 6 &&
    headerBytes[0] === 0x47 &&
    headerBytes[1] === 0x49 &&
    headerBytes[2] === 0x46 &&
    headerBytes[3] === 0x38
  ) {
    return "image";
  }

  // 5. Check BMP: BM
  if (headerBytes[0] === 0x42 && headerBytes[1] === 0x4d) {
    return "image";
  }

  // 6. Check TIFF: II* (little-endian) or MM* (big-endian)
  if (
    (headerBytes[0] === 0x49 && headerBytes[1] === 0x49 && headerBytes[2] === 0x2a && headerBytes[3] === 0x00) ||
    (headerBytes[0] === 0x4d && headerBytes[1] === 0x4d && headerBytes[2] === 0x00 && headerBytes[3] === 0x2a)
  ) {
    return "image";
  }

  // 7. Check RIFF containers: WEBP or WAV
  if (
    headerBytes.length >= 12 &&
    headerBytes[0] === 0x52 &&
    headerBytes[1] === 0x49 &&
    headerBytes[2] === 0x46 &&
    headerBytes[3] === 0x46
  ) {
    // RIFF....WEBP
    if (
      headerBytes[8] === 0x57 &&
      headerBytes[9] === 0x45 &&
      headerBytes[10] === 0x42 &&
      headerBytes[11] === 0x50
    ) {
      return "image";
    }
    // RIFF....WAVE
    if (
      headerBytes[8] === 0x57 &&
      headerBytes[9] === 0x41 &&
      headerBytes[10] === 0x56 &&
      headerBytes[11] === 0x45
    ) {
      return "audio";
    }
  }

  // 8. Check ZIP (PK\x03\x04): DOCX, PPTX, XLSX
  if (headerBytes[0] === 0x50 && headerBytes[1] === 0x4b && headerBytes[2] === 0x03 && headerBytes[3] === 0x04) {
    return "ZIP_PACKAGE";
  }

  // 9. Check OLE CFBF (D0 CF 11 E0 A1 B1 1A E1): DOC, XLS, PPT
  if (
    headerBytes.length >= 8 &&
    headerBytes[0] === 0xd0 &&
    headerBytes[1] === 0xcf &&
    headerBytes[2] === 0x11 &&
    headerBytes[3] === 0xe0 &&
    headerBytes[4] === 0xa1 &&
    headerBytes[5] === 0xb1 &&
    headerBytes[6] === 0x1a &&
    headerBytes[7] === 0xe1
  ) {
    return "OLE_LEGACY";
  }

  // 10. Check RTF: {\rtf
  if (
    headerBytes.length >= 5 &&
    headerBytes[0] === 0x7b &&
    headerBytes[1] === 0x5c &&
    headerBytes[2] === 0x72 &&
    headerBytes[3] === 0x74 &&
    headerBytes[4] === 0x66
  ) {
    return "rtf";
  }

  // 11. Check MP4 / MOV / M4A: 'ftyp' at offset 4
  if (
    headerBytes.length >= 8 &&
    headerBytes[4] === 0x66 &&
    headerBytes[5] === 0x74 &&
    headerBytes[6] === 0x79 &&
    headerBytes[7] === 0x70
  ) {
    if (headerBytes.length >= 12) {
      const brand = String.fromCharCode(headerBytes[8], headerBytes[9], headerBytes[10], headerBytes[11]);
      if (brand.startsWith("M4A") || brand.startsWith("mp42")) {
        return "audio";
      }
    }
    return "video";
  }

  // 12. Check WebM / Matroska: 1A 45 DF A3
  if (
    headerBytes[0] === 0x1a &&
    headerBytes[1] === 0x45 &&
    headerBytes[2] === 0xdf &&
    headerBytes[3] === 0xa3
  ) {
    return "video";
  }

  // 13. Check MP3 ID3: 'ID3'
  if (headerBytes[0] === 0x49 && headerBytes[1] === 0x44 && headerBytes[2] === 0x33) {
    return "audio";
  }

  // 14. Check MP3 sync word (FF FB or FF F3 or FF F2)
  if (
    headerBytes[0] === 0xff &&
    (headerBytes[1] === 0xfb || headerBytes[1] === 0xf3 || headerBytes[1] === 0xf2)
  ) {
    return "audio";
  }

  return null;
}

/**
 * Resolve format definition by binary inspection, filename, or MIME type.
 * Never relies on filename extension alone when header bytes are supplied.
 */
export function resolveFormat(
  filename: string,
  mimeType?: string,
  headerBytes?: Uint8Array
): FormatDefinition {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  // 1. Binary magic number detection when bytes are available
  if (headerBytes && headerBytes.length >= 4) {
    const detected = detectBinaryFormat(headerBytes);
    if (detected === "ZIP_PACKAGE") {
      // Differentiate ZIP-based Office OpenXML formats
      if (ext === "pptx") return FORMAT_REGISTRY.pptx;
      if (ext === "xlsx") return FORMAT_REGISTRY.xlsx;
      return FORMAT_REGISTRY.docx; // default OOXML
    }
    if (detected === "OLE_LEGACY") {
      if (ext === "xls") return FORMAT_REGISTRY.xls;
      if (ext === "ppt") return FORMAT_REGISTRY.ppt;
      return FORMAT_REGISTRY.doc;
    }
    if (detected && FORMAT_REGISTRY[detected]) {
      return FORMAT_REGISTRY[detected];
    }
  }

  // 2. Exact match by extension
  if (ext) {
    for (const format of Object.values(FORMAT_REGISTRY)) {
      if (format.extensions.includes(ext)) {
        return format;
      }
    }
  }

  // 3. Match by MIME type
  if (mimeType) {
    const cleanMime = mimeType.split(";")[0].trim().toLowerCase();
    for (const format of Object.values(FORMAT_REGISTRY)) {
      if (format.mimeTypes.includes(cleanMime)) {
        return format;
      }
    }
  }

  // 4. Default fallback to plain text
  return FORMAT_REGISTRY.txt;
}

/**
 * Validate whether a file upload is supported and meets size constraints.
 */
export function validateUploadFile(
  file: { name: string; size: number; type: string },
  headerBytes?: Uint8Array
): {
  valid: boolean;
  format: FormatDefinition;
  error?: string;
} {
  const format = resolveFormat(file.name, file.type, headerBytes);

  if (file.size <= 0) {
    return {
      valid: false,
      format,
      error: `The file "${file.name}" is empty (0 bytes). Please upload a complete document.`,
    };
  }

  if (file.size > format.maxSizeBytes) {
    const mbLimit = Math.round(format.maxSizeBytes / (1024 * 1024));
    const mbUploaded = Math.round(file.size / (1024 * 1024));
    return {
      valid: false,
      format,
      error: `${format.displayName} files must be ${mbLimit} MB or smaller. (Uploaded: ${mbUploaded} MB)`,
    };
  }

  return { valid: true, format };
}
