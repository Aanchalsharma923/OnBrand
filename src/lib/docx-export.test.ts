import { describe, it, expect } from "vitest";
import { generateDocxBlob } from "./docx-export";
import { unzipSync } from "fflate";

describe("DOCX Export Generator", () => {
  it("generates a valid OpenXML Word (.docx) archive with ZIP magic bytes", async () => {
    const text = "Sample Foods Oat Bites\n100% Organic oats with zero preservatives.\nNew harvest recipe.";
    const blob = generateDocxBlob(text);

    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(blob.size).toBeGreaterThan(0);

    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Verify ZIP magic bytes PK\x03\x04
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);

    // Verify unzipSync parses package parts without throwing
    const archive = unzipSync(bytes);
    expect(archive["[Content_Types].xml"]).toBeDefined();
    expect(archive["_rels/.rels"]).toBeDefined();
    expect(archive["word/document.xml"]).toBeDefined();

    const docXml = new TextDecoder().decode(archive["word/document.xml"]);
    expect(docXml).toContain("Sample Foods Oat Bites");
    expect(docXml).toContain("100% Organic oats");
  });
});

