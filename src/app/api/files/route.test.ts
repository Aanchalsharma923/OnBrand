import { describe, it, expect } from "vitest";
import { POST, GET } from "./route";

describe("/api/files route", () => {
  it("stores and retrieves binary files with org scoping and SHA-256 hash", async () => {
    const fileContent = "Sample Foods Brand Asset Data";
    const fileBlob = new Blob([fileContent], { type: "text/plain" });
    const formData = new FormData();
    formData.append("file", fileBlob, "test-asset.txt");
    formData.append("key", "test-key-123");

    const postReq = new Request("http://localhost:3000/api/files", {
      method: "POST",
      headers: {
        "x-onbrand-role": "creator",
        "x-demo-role": "CREATOR",
        "x-demo-org": "org_alpha",
        "x-onbrand-tenant": "alpha",
      },
      body: formData,
    });

    const postRes = await POST(postReq);
    expect(postRes.status).toBe(201);
    const postData = await postRes.json();
    expect(postData.fileKey).toBe("test-key-123");
    expect(postData.filename).toBe("test-asset.txt");
    expect(postData.contentHash).toBeDefined();
    expect(postData.sizeBytes).toBe(fileContent.length);

    // Retrieve file as Alpha
    const getReq = new Request("http://localhost:3000/api/files?key=test-key-123", {
      method: "GET",
      headers: {
        "x-onbrand-role": "reviewer",
        "x-demo-role": "REVIEWER",
        "x-demo-org": "org_alpha",
        "x-onbrand-tenant": "alpha",
      },
    });

    const getRes = await GET(getReq);
    expect(getRes.status).toBe(200);
    const retrievedText = await getRes.text();
    expect(retrievedText).toBe(fileContent);
    expect(getRes.headers.get("X-Content-Hash")).toBe(postData.contentHash);

    // Negative security check: Org Beta attempts to access Org Alpha's file using the same key
    const betaGetReq = new Request("http://localhost:3000/api/files?key=test-key-123", {
      method: "GET",
      headers: {
        "x-onbrand-role": "reviewer",
        "x-demo-role": "REVIEWER",
        "x-demo-org": "org_beta",
        "x-onbrand-tenant": "beta",
      },
    });

    const betaGetRes = await GET(betaGetReq);
    expect(betaGetRes.status).toBe(404);
    const betaJson = await betaGetRes.json();
    expect(betaJson.error).toContain("File not found in this organization");
  });
});

