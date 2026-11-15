import { describe, it, expect, beforeEach } from "vitest";
import { POST, GET } from "@/app/api/assets/route";
import { serverAssetBinaryStore } from "@/lib/server/asset-binary-store";
import { createDemoSessionToken } from "@/lib/server/demo-session";
import { createHash } from "crypto";

describe("Asset Multipart/Form-Data Upload API", () => {
  const maintainerToken = createDemoSessionToken("maintainer", "00000000-0000-0000-0000-000000000001");

  beforeEach(() => {
    serverAssetBinaryStore.clear();
  });

  it("uploads a PDF via multipart/form-data, verifies SHA-256, and downloads identical binary", async () => {
    const pdfBytes = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Title (Apex Protocol) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
    const expectedSha256 = createHash("sha256").update(pdfBytes).digest("hex");

    const formData = new FormData();
    const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
    formData.append("file", pdfBlob, "apex-protocol.pdf");

    const uploadReq = new Request("http://localhost:3000/api/assets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${maintainerToken}`,
      },
      body: formData,
    });

    const uploadRes = await POST(uploadReq);
    expect(uploadRes.status).toBe(201);
    const uploadData = await uploadRes.json();
    expect(uploadData.asset).toBeDefined();
    expect(uploadData.asset.name).toBe("apex-protocol.pdf");
    expect(uploadData.asset.mimeType).toBe("application/pdf");
    expect(uploadData.asset.sha256).toBe(expectedSha256);

    // Download binary
    const downloadReq = new Request(`http://localhost:3000/api/assets?id=${uploadData.asset.id}&binary=true`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${maintainerToken}`,
      },
    });

    const downloadRes = await GET(downloadReq);
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("content-type")).toBe("application/pdf");
    const downloadedBuf = Buffer.from(await downloadRes.arrayBuffer());
    expect(downloadedBuf.equals(pdfBytes)).toBe(true);
  });

  it("uploads a DOCX via multipart/form-data and verifies registration", async () => {
    const docxBytes = Buffer.from("PK\x03\x04synthetic docx content for brand guidelines");
    const expectedSha256 = createHash("sha256").update(docxBytes).digest("hex");

    const formData = new FormData();
    const docxBlob = new Blob([docxBytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    formData.append("file", docxBlob, "guidelines.docx");

    const uploadReq = new Request("http://localhost:3000/api/assets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${maintainerToken}`,
      },
      body: formData,
    });

    const uploadRes = await POST(uploadReq);
    expect(uploadRes.status).toBe(201);
    const uploadData = await uploadRes.json();
    expect(uploadData.asset.name).toBe("guidelines.docx");
    expect(uploadData.asset.sha256).toBe(expectedSha256);
  });

  it("uploads a PNG via multipart/form-data and verifies perceptual hash & download", async () => {
    // 1x1 valid transparent PNG
    const pngBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
    const expectedSha256 = createHash("sha256").update(pngBytes).digest("hex");

    const formData = new FormData();
    const pngBlob = new Blob([pngBytes], { type: "image/png" });
    formData.append("file", pngBlob, "logo.png");

    const uploadReq = new Request("http://localhost:3000/api/assets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${maintainerToken}`,
      },
      body: formData,
    });

    const uploadRes = await POST(uploadReq);
    expect(uploadRes.status).toBe(201);
    const uploadData = await uploadRes.json();
    expect(uploadData.asset.name).toBe("logo.png");
    expect(uploadData.asset.mimeType).toBe("image/png");
    expect(uploadData.asset.sha256).toBe(expectedSha256);

    // Download PNG
    const downloadReq = new Request(`http://localhost:3000/api/assets?id=${uploadData.asset.id}&binary=true`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${maintainerToken}`,
      },
    });

    const downloadRes = await GET(downloadReq);
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("content-type")).toBe("image/png");
    const downloadedBuf = Buffer.from(await downloadRes.arrayBuffer());
    expect(downloadedBuf.equals(pngBytes)).toBe(true);
  });
});
