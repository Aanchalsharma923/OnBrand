import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import {
  detectBinaryFormat,
  resolveFormat,
  validateUploadFile,
  FORMAT_REGISTRY,
} from "./format-registry";
import { generateDocxBlob } from "./docx-export";
import { unzipSync } from "fflate";

describe("Multi-Format Compatibility Test Suite", () => {
  describe("1. Binary Signature Detection (Magic Numbers)", () => {
    it("detects PDF binary magic numbers (%PDF)", () => {
      const pdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]);
      expect(detectBinaryFormat(pdfHeader)).toBe("pdf");
      expect(resolveFormat("doc.pdf", undefined, pdfHeader).capabilities.viewer).toBe("PDF_CANVAS");
    });

    it("detects ZIP packages (DOCX, PPTX, XLSX) and resolves specific OpenXML viewers", () => {
      const zipHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
      expect(detectBinaryFormat(zipHeader)).toBe("ZIP_PACKAGE");

      expect(resolveFormat("doc.docx", undefined, zipHeader).capabilities.viewer).toBe("DOCX_STRUCTURAL");
      expect(resolveFormat("deck.pptx", undefined, zipHeader).capabilities.viewer).toBe("PPTX_SLIDES");
      expect(resolveFormat("sheet.xlsx", undefined, zipHeader).capabilities.viewer).toBe("XLSX_GRID");
    });

    it("detects PNG magic bytes", () => {
      const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(detectBinaryFormat(pngHeader)).toBe("image");
      expect(resolveFormat("poster.png", undefined, pngHeader).capabilities.viewer).toBe("IMAGE_OVERLAY");
    });

    it("detects JPEG magic bytes", () => {
      const jpgHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
      expect(detectBinaryFormat(jpgHeader)).toBe("image");
      expect(resolveFormat("photo.jpg", undefined, jpgHeader).capabilities.viewer).toBe("IMAGE_OVERLAY");
    });

    it("detects WebP RIFF header", () => {
      const webpHeader = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]);
      expect(detectBinaryFormat(webpHeader)).toBe("image");
      expect(resolveFormat("graphic.webp", undefined, webpHeader).capabilities.viewer).toBe("IMAGE_OVERLAY");
    });

    it("detects WAV RIFF header", () => {
      const wavHeader = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
      ]);
      expect(detectBinaryFormat(wavHeader)).toBe("audio");
      expect(resolveFormat("voice.wav", undefined, wavHeader).capabilities.viewer).toBe("AUDIO_TRANSCRIPT");
    });

    it("detects MP4 video header (ftyp)", () => {
      const mp4Header = new Uint8Array([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
      ]);
      expect(detectBinaryFormat(mp4Header)).toBe("video");
      expect(resolveFormat("clip.mp4", undefined, mp4Header).capabilities.viewer).toBe("VIDEO_TIMELINE");
    });

    it("detects MP3 ID3 header", () => {
      const mp3Header = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]);
      expect(detectBinaryFormat(mp3Header)).toBe("audio");
      expect(resolveFormat("track.mp3", undefined, mp3Header).capabilities.viewer).toBe("AUDIO_TRANSCRIPT");
    });

    it("detects Legacy Office CFBF header (DOC, XLS, PPT)", () => {
      const oleHeader = new Uint8Array([
        0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
      ]);
      expect(detectBinaryFormat(oleHeader)).toBe("OLE_LEGACY");
      expect(resolveFormat("memo.doc", undefined, oleHeader).capabilities.viewer).toBe("DOC_LEGACY");
      expect(resolveFormat("sheet.xls", undefined, oleHeader).capabilities.viewer).toBe("XLS_LEGACY");
      expect(resolveFormat("slides.ppt", undefined, oleHeader).capabilities.viewer).toBe("PPT_LEGACY");
    });

    it("detects RTF header ({\\rtf)", () => {
      const rtfHeader = new Uint8Array([0x7b, 0x5c, 0x72, 0x74, 0x66, 0x31]);
      expect(detectBinaryFormat(rtfHeader)).toBe("rtf");
      expect(resolveFormat("memo.rtf", undefined, rtfHeader).capabilities.viewer).toBe("RTF_DOCUMENT");
    });
  });

  describe("2. Real Test Fixture Verification", () => {
    const fixturePath =
      "C:/Users/aanch/OneDrive/Desktop/Documents/We Code Coders hackathon/Oat_Bites_Short_Ad_Test (1).docx";

    it("verifies Oat_Bites_Short_Ad_Test.docx has valid ZIP magic bytes and extractable XML", () => {
      if (!existsSync(fixturePath)) return;

      const fileBytes = readFileSync(fixturePath);
      expect(fileBytes.length).toBe(36980);

      // Verify ZIP magic bytes PK\x03\x04
      expect(fileBytes[0]).toBe(0x50);
      expect(fileBytes[1]).toBe(0x4b);
      expect(fileBytes[2]).toBe(0x03);
      expect(fileBytes[3]).toBe(0x04);

      const headerBytes = new Uint8Array(fileBytes.subarray(0, 16));
      const format = resolveFormat("Oat_Bites_Short_Ad_Test (1).docx", undefined, headerBytes);
      expect(format.formatId).toBe("docx");
      expect(format.capabilities.viewer).toBe("DOCX_STRUCTURAL");

      // Verify unzipping document.xml body succeeds
      const archive = unzipSync(new Uint8Array(fileBytes), {
        filter: (entry) => entry.name === "word/document.xml",
      });
      expect(archive["word/document.xml"]).toBeDefined();
      const docXml = new TextDecoder().decode(archive["word/document.xml"]);
      expect(docXml).toContain("w:p");
    });
  });

  describe("3. Error and Constraint Handling", () => {
    it("rejects 0-byte empty file with helpful diagnostic", () => {
      const result = validateUploadFile({ name: "empty.docx", size: 0, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("empty (0 bytes)");
    });

    it("rejects oversized file with format-specific limit explanation", () => {
      const result = validateUploadFile({ name: "giant.docx", size: 12 * 1024 * 1024, type: "" });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be 10 MB or smaller");
    });
  });

  describe("4. Revised Document Export", () => {
    it("produces valid Word OpenXML (.docx) ZIP package from revised text", async () => {
      const revisedCopy = "Oat Bites New Formula\n100% whole grain rolled oats.\nApproved marketing claim.";
      const blob = generateDocxBlob(revisedCopy);

      expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      expect(blob.size).toBeGreaterThan(500);

      const buffer = await blob.arrayBuffer();
      const u8 = new Uint8Array(buffer);
      expect(u8[0]).toBe(0x50);
      expect(u8[1]).toBe(0x4b);

      const archive = unzipSync(u8);
      expect(archive["word/document.xml"]).toBeDefined();
      const docText = new TextDecoder().decode(archive["word/document.xml"]);
      expect(docText).toContain("Oat Bites New Formula");
      expect(docText).toContain("100% whole grain");
    });
  });
});

