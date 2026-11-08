import { describe, expect, it } from "vitest";
import { extractUploadedFile } from "./file-extraction";

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
    await expect(extractUploadedFile(file)).rejects.toThrow("Supported files: DOCX, text PDF");
  });

  it("enforces the 10 MB source-file limit before parsing", async () => {
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.txt");
    await expect(extractUploadedFile(file)).rejects.toThrow("Files must be 10 MB or smaller");
  });

  it("enforces the extracted-text limit", async () => {
    const file = new File(["x".repeat(20_001)], "long.txt");
    await expect(extractUploadedFile(file)).rejects.toThrow("more than 20,000 characters");
  });
});
