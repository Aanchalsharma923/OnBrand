/**
 * OnBrand Extensible Format Registry
 * Reference: Section 2.I & Acceptance Tests
 *
 * Defines format validation, viewers, supported analysis capabilities,
 * editable representations, export workflows, and explicit limitations.
 */

export interface FormatDefinition {
  formatId: string;
  displayName: string;
  category: "DOCUMENT" | "PRESENTATION" | "SPREADSHEET" | "IMAGE" | "VIDEO" | "AUDIO" | "STRUCTURED_TEXT";
  mimeTypes: string[];
  extensions: string[];
  maxSizeBytes: number;
  capabilities: {
    viewer: "PDF_CANVAS" | "DOCX_STRUCTURAL" | "PPTX_SLIDES" | "XLSX_GRID" | "IMAGE_OVERLAY" | "VIDEO_TIMELINE" | "AUDIO_TRANSCRIPT" | "STRUCTURED_CODE";
    inlineHighlights: boolean;
    boundingBoxes: boolean;
    timestampNavigation: boolean;
    cellCoordinates: boolean;
    slideNavigation: boolean;
    inlineEditing: boolean;
    exportFormats: string[];
  };
  limitations: string[];
}

export const FORMAT_REGISTRY: Record<string, FormatDefinition> = {
  pdf: {
    formatId: "pdf",
    displayName: "PDF Document",
    category: "DOCUMENT",
    mimeTypes: ["application/pdf"],
    extensions: ["pdf"],
    maxSizeBytes: 10 * 1024 * 1024,
    capabilities: {
      viewer: "PDF_CANVAS",
      inlineHighlights: true,
      boundingBoxes: true,
      timestampNavigation: false,
      cellCoordinates: false,
      slideNavigation: false,
      inlineEditing: true,
      exportFormats: ["txt", "md", "json_audit"],
    },
    limitations: [
      "Scanned or flat image-based PDFs require OCR and lack vector text selection.",
      "Untagged PDFs emit accessibility warnings for missing logical structure trees.",
      "Maximum 20 pages processed in interactive preview.",
    ],
  },
  docx: {
    formatId: "docx",
    displayName: "Word Document",
    category: "DOCUMENT",
    mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    extensions: ["docx"],
    maxSizeBytes: 10 * 1024 * 1024,
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
    limitations: [
      "Embedded drawing markup is inspected for alternative text; complex vector shapes are not rendered.",
      "Strict paragraph and table structure is preserved; custom margins and printer layouts are not simulated.",
    ],
  },
  pptx: {
    formatId: "pptx",
    displayName: "PowerPoint Presentation",
    category: "PRESENTATION",
    mimeTypes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    extensions: ["pptx"],
    maxSizeBytes: 10 * 1024 * 1024,
    capabilities: {
      viewer: "PPTX_SLIDES",
      inlineHighlights: true,
      boundingBoxes: true,
      timestampNavigation: false,
      cellCoordinates: false,
      slideNavigation: true,
      inlineEditing: true,
      exportFormats: ["txt", "md", "json_audit"],
    },
    limitations: [
      "Slide ordering and text content boxes are extracted.",
      "Complex 3D animations and transitions are omitted.",
      "Embedded video or audio objects are inspected separately.",
    ],
  },
  xlsx: {
    formatId: "xlsx",
    displayName: "Excel Spreadsheet",
    category: "SPREADSHEET",
    mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    extensions: ["xlsx"],
    maxSizeBytes: 10 * 1024 * 1024,
    capabilities: {
      viewer: "XLSX_GRID",
      inlineHighlights: true,
      boundingBoxes: false,
      timestampNavigation: false,
      cellCoordinates: true,
      slideNavigation: false,
      inlineEditing: true,
      exportFormats: ["csv", "txt", "json_audit"],
    },
    limitations: [
      "Formulas are preserved and never silently overwritten during cell content editing.",
      "Pivot tables and external data connections are presented as cached values.",
    ],
  },
  image: {
    formatId: "image",
    displayName: "Image & Poster",
    category: "IMAGE",
    mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/bmp", "image/tiff"],
    extensions: ["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"],
    maxSizeBytes: 10 * 1024 * 1024,
    capabilities: {
      viewer: "IMAGE_OVERLAY",
      inlineHighlights: true,
      boundingBoxes: true,
      timestampNavigation: false,
      cellCoordinates: false,
      slideNavigation: false,
      inlineEditing: true,
      exportFormats: ["txt", "json_audit"],
    },
    limitations: [
      "Raster pixels cannot be directly edited as native vector font glyphs without regeneration.",
      "Contrast ratios on textured photographic backgrounds are marked as estimates.",
      "Local OCR confidence depends on image resolution and clarity.",
    ],
  },
  video: {
    formatId: "video",
    displayName: "Video & Reel",
    category: "VIDEO",
    mimeTypes: ["video/mp4", "video/webm", "video/quicktime"],
    extensions: ["mp4", "webm", "mov"],
    maxSizeBytes: 50 * 1024 * 1024,
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
    limitations: [
      "Keyframes are sampled up to 6 representative frames per video; full 60fps frame-by-frame rendering is not performed.",
      "Maximum video length is 180 seconds for interactive review.",
      "Requires browser-supported codecs (H.264/AAC, VP9/Opus).",
    ],
  },
  audio: {
    formatId: "audio",
    displayName: "Audio File",
    category: "AUDIO",
    mimeTypes: ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a"],
    extensions: ["mp3", "wav", "m4a"],
    maxSizeBytes: 25 * 1024 * 1024,
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
    limitations: [
      "Timestamp navigation depends on transcript segmentation.",
      "Audio is processed client-side or through local transcription; complex multitrack DAW sessions are not split.",
    ],
  },
  structured_text: {
    formatId: "structured_text",
    displayName: "Structured Text & Code",
    category: "STRUCTURED_TEXT",
    mimeTypes: ["text/plain", "text/markdown", "text/html", "text/csv", "application/json"],
    extensions: ["txt", "md", "markdown", "html", "htm", "csv", "json"],
    maxSizeBytes: 5 * 1024 * 1024,
    capabilities: {
      viewer: "STRUCTURED_CODE",
      inlineHighlights: true,
      boundingBoxes: false,
      timestampNavigation: false,
      cellCoordinates: true,
      slideNavigation: false,
      inlineEditing: true,
      exportFormats: ["txt", "md", "html", "json", "csv"],
    },
    limitations: [
      "Raw script tags in HTML drafts are sanitized and cannot execute in browser previews.",
      "CSV rows are validated for uniform column counts.",
    ],
  },
};

/**
 * Resolve format definition by filename or MIME type.
 */
export function resolveFormat(filename: string, mimeType?: string): FormatDefinition {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  // 1. Match by extension
  for (const format of Object.values(FORMAT_REGISTRY)) {
    if (format.extensions.includes(ext)) return format;
  }

  // 2. Match by MIME type
  if (mimeType) {
    const cleanMime = mimeType.split(";")[0].trim().toLowerCase();
    for (const format of Object.values(FORMAT_REGISTRY)) {
      if (format.mimeTypes.includes(cleanMime)) return format;
    }
  }

  // Fallback to structured text
  return FORMAT_REGISTRY.structured_text;
}

/**
 * Validate whether a file upload is supported.
 */
export function validateUploadFile(file: { name: string; size: number; type: string }): {
  valid: boolean;
  format?: FormatDefinition;
  error?: string;
} {
  const format = resolveFormat(file.name, file.type);
  if (file.size > format.maxSizeBytes) {
    const mbLimit = Math.round(format.maxSizeBytes / (1024 * 1024));
    return {
      valid: false,
      format,
      error: `${format.displayName} files must be ${mbLimit} MB or smaller. (Uploaded: ${Math.round(file.size / (1024 * 1024))} MB)`,
    };
  }
  return { valid: true, format };
}
