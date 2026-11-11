import { describe, expect, it } from "vitest";
import { assessOcrQuality, extractUploadedFile, videoSampleTimestamps } from "./file-extraction";

describe("OCR quality gate", () => {
  it("accepts clean readable text at high confidence", () => {
    expect(assessOcrQuality("Sample Foods Oat Bites\n6g protein per serving", 92).status).toBe("RELIABLE");
  });

  it("rejects empty and symbol-heavy poster output as review-ready", () => {
    expect(assessOcrQuality("", 0).status).toBe("UNREADABLE");
    const garbled = assessOcrQuality('v i Sample Foods : Py EID ——— po 4 J OZ Oat Bites /5, Hid J — ow v - = -at 9 arter JP', 31);
    expect(garbled.status).not.toBe("RELIABLE");
    expect(assessOcrQuality("7] pr. A cocoa oat snack SA for everyday moments F 4 yc pp Py a ©_/ gtarter Made with rE 4 gundle wholegrain oats", 73).status).toBe("NEEDS_PROOFREAD");
  });
});

describe("reel frame sampling", () => {
  it("samples at least three evenly spaced frames from short reels and caps long reels at six", () => {
    const shortReel = videoSampleTimestamps(12);
    const longReel = videoSampleTimestamps(180);

    expect(shortReel).toHaveLength(3);
    expect(shortReel[0]).toBeCloseTo(2);
    expect(shortReel[2]).toBeCloseTo(10);
    expect(longReel).toHaveLength(6);
    expect(longReel[0]).toBeCloseTo(15);
    expect(longReel[5]).toBeCloseTo(165);
  });

  it("does not create sample points for invalid video durations", () => {
    expect(videoSampleTimestamps(0)).toEqual([]);
    expect(videoSampleTimestamps(Number.NaN)).toEqual([]);
  });
});

describe("browser draft text extraction", () => {
  it.each([
    ["draft.txt", "Plain text draft."],
    ["draft.md", "# Markdown draft\nA second line."],
    ["draft.html", "<html><body><h1>HTML draft</h1></body></html>"],
  ])("reads supported text format %s", async (name, content) => {
    const file = new File([content], name);
    await expect(extractUploadedFile(file)).resolves.toBe(content);
  });

  it("normalizes line endings and surrounding whitespace", async () => {
    const file = new File(["\r\n  Draft copy. \r\n"], "draft.txt");
    await expect(extractUploadedFile(file)).resolves.toBe("Draft copy.");
  });

  it("rejects an empty text document", async () => {
    const file = new File(["  \n"], "empty.txt");
    await expect(extractUploadedFile(file)).rejects.toThrow("No readable text was found");
  });

  it("rejects unsupported formats with a useful message", async () => {
    const file = new File(["binary"], "draft.doc");
    await expect(extractUploadedFile(file)).rejects.toThrow("Supported files: DOCX/PPTX");
  });

  it("enforces the 10 MB source-file limit before parsing", async () => {
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.txt");
    await expect(extractUploadedFile(file)).rejects.toThrow("Files must be 10 MB or smaller");
  });

  it("enforces the separate 50 MB limit for video uploads before decoding", async () => {
    const file = new File([new Uint8Array(50 * 1024 * 1024 + 1)], "large-reel.mp4", { type: "video/mp4" });
    await expect(extractUploadedFile(file)).rejects.toThrow("Videos must be 50 MB or smaller");
  });

  it("enforces the extracted-text limit", async () => {
    const file = new File(["x".repeat(20_001)], "long.txt");
    await expect(extractUploadedFile(file)).rejects.toThrow("more than 20,000 characters");
  });
});
