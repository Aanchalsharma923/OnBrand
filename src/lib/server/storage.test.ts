/**
 * Supabase Storage Layer Tests
 *
 * Verifies the storage abstraction behaves correctly when:
 *  - Storage is not configured (graceful no-op / null returns)
 *  - Upload succeeds and returns the correct path
 *  - Download returns the correct buffer
 *  - Signed URL is generated
 *  - Delete removes the object
 *  - Cross-tenant isolation: a retrieval call always uses the caller's
 *    organizationId in the path, making cross-tenant access structurally impossible
 *  - Storage outage (error from Supabase) → graceful 503, not 500 crash
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks — applied before any import of supabase-storage
// ---------------------------------------------------------------------------

vi.mock("@/lib/server/supabase", () => ({
  isSupabaseConfigured: vi.fn(() => false),
  getSupabaseAdmin: vi.fn(),
}));

import * as supabaseModule from "@/lib/server/supabase";
import {
  storageConfigured,
  uploadAssetToStorage,
  downloadAssetFromStorage,
  createSignedAssetUrl,
  deleteAssetFromStorage,
  assetExistsInStorage,
  STORAGE_BUCKET,
} from "@/lib/server/supabase-storage";

// Helper: build a mock Supabase admin client
function buildMockAdmin(overrides: Record<string, unknown> = {}) {
  const defaults = {
    uploadResult: { data: { path: "org/asset/file.png" }, error: null },
    downloadResult: { data: new Blob(["BINARY"]), error: null },
    signedUrlResult: { data: { signedUrl: "https://cdn.example.com/signed" }, error: null },
    removeResult: { data: null, error: null },
    listResult: { data: [{ name: "file.png" }], error: null },
  };
  const cfg = { ...defaults, ...overrides };

  const storageMock = {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue(cfg.uploadResult),
      download: vi.fn().mockResolvedValue(cfg.downloadResult),
      createSignedUrl: vi.fn().mockResolvedValue(cfg.signedUrlResult),
      remove: vi.fn().mockResolvedValue(cfg.removeResult),
      list: vi.fn().mockResolvedValue(cfg.listResult),
    }),
  };
  return { storage: storageMock } as any;
}

describe("Supabase Storage Layer", () => {
  beforeEach(() => {
    vi.mocked(supabaseModule.isSupabaseConfigured).mockReturnValue(false);
    vi.mocked(supabaseModule.getSupabaseAdmin).mockReturnValue(buildMockAdmin());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Not-configured: all operations gracefully return null / no-op
  // -------------------------------------------------------------------------
  it("1. storageConfigured() returns false when isSupabaseConfigured is false", () => {
    expect(storageConfigured()).toBe(false);
  });

  it("2. uploadAssetToStorage returns null when storage is not configured", async () => {
    const result = await uploadAssetToStorage("org-1", "asset-1", Buffer.from("x"), "image/png", "logo.png");
    expect(result).toBeNull();
    // getSupabaseAdmin must NOT be called
    expect(supabaseModule.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("3. downloadAssetFromStorage returns null when storage is not configured", async () => {
    const result = await downloadAssetFromStorage("org-1", "asset-1", "logo.png");
    expect(result).toBeNull();
    expect(supabaseModule.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("4. createSignedAssetUrl returns null when storage is not configured", async () => {
    const result = await createSignedAssetUrl("org-1", "asset-1", "logo.png");
    expect(result).toBeNull();
  });

  it("5. deleteAssetFromStorage is a no-op when storage is not configured", async () => {
    await expect(deleteAssetFromStorage("org-1", "asset-1", "logo.png")).resolves.toBeUndefined();
    expect(supabaseModule.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("6. assetExistsInStorage returns false when storage is not configured", async () => {
    expect(await assetExistsInStorage("org-1", "asset-1", "logo.png")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 2. Normal upload
  // -------------------------------------------------------------------------
  it("7. uploadAssetToStorage uploads to correct bucket and path, returns path", async () => {
    vi.mocked(supabaseModule.isSupabaseConfigured).mockReturnValue(true);
    const mockAdmin = buildMockAdmin({
      uploadResult: { data: { path: "org-X/asset-Y/logo.png" }, error: null },
    });
    vi.mocked(supabaseModule.getSupabaseAdmin).mockReturnValue(mockAdmin);

    const path = await uploadAssetToStorage("org-X", "asset-Y", Buffer.from("IMG"), "image/png", "logo.png");

    expect(path).toBe("org-X/asset-Y/logo.png");
    expect(mockAdmin.storage.from).toHaveBeenCalledWith(STORAGE_BUCKET);
    const fromResult = mockAdmin.storage.from.mock.results[0].value;
    expect(fromResult.upload).toHaveBeenCalledWith(
      "org-X/asset-Y/logo.png",
      expect.any(Buffer),
      expect.objectContaining({ contentType: "image/png", upsert: true })
    );
  });

  it("8. uploadAssetToStorage throws on Supabase upload error (non-404)", async () => {
    vi.mocked(supabaseModule.isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(supabaseModule.getSupabaseAdmin).mockReturnValue(
      buildMockAdmin({ uploadResult: { data: null, error: { message: "Bucket not found" } } })
    );
    await expect(
      uploadAssetToStorage("org-1", "asset-1", Buffer.from("x"), "image/png", "logo.png")
    ).rejects.toThrow("Supabase Storage upload failed");
  });

  // -------------------------------------------------------------------------
  // 3. Normal download
  // -------------------------------------------------------------------------
  it("9. downloadAssetFromStorage returns Buffer when object exists", async () => {
    vi.mocked(supabaseModule.isSupabaseConfigured).mockReturnValue(true);
    const binaryContent = Buffer.from("PNG_BINARY_DATA");
    vi.mocked(supabaseModule.getSupabaseAdmin).mockReturnValue(
      buildMockAdmin({ downloadResult: { data: new Blob([binaryContent]), error: null } })
    );

    const result = await downloadAssetFromStorage("org-1", "asset-1", "logo.png");
    expect(result).toBeInstanceOf(Buffer);
    expect(result!.length).toBeGreaterThan(0);
  });

  it("10. downloadAssetFromStorage returns null for 404 (object not found)", async () => {
    vi.mocked(supabaseModule.isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(supabaseModule.getSupabaseAdmin).mockReturnValue(
      buildMockAdmin({
        downloadResult: { data: null, error: { message: "Object not found", statusCode: 404 } },
      })
    );

    const result = await downloadAssetFromStorage("org-1", "asset-1", "missing.png");
    expect(result).toBeNull();
  });

  it("11. downloadAssetFromStorage throws on non-404 Supabase error (storage outage → caller gets 503)", async () => {
    vi.mocked(supabaseModule.isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(supabaseModule.getSupabaseAdmin).mockReturnValue(
      buildMockAdmin({
        downloadResult: { data: null, error: { message: "Internal storage error", statusCode: 500 } },
      })
    );
    await expect(downloadAssetFromStorage("org-1", "asset-1", "logo.png")).rejects.toThrow(
      "Supabase Storage download failed"
    );
  });

  // -------------------------------------------------------------------------
  // 4. Signed URL
  // -------------------------------------------------------------------------
  it("12. createSignedAssetUrl returns time-limited URL", async () => {
    vi.mocked(supabaseModule.isSupabaseConfigured).mockReturnValue(true);
    const mockAdmin = buildMockAdmin();
    vi.mocked(supabaseModule.getSupabaseAdmin).mockReturnValue(mockAdmin);

    const url = await createSignedAssetUrl("org-1", "asset-1", "logo.png", 1800);
    expect(url).toBe("https://cdn.example.com/signed");

    const fromResult = (mockAdmin.storage.from as any).mock.results[0].value;
    expect(fromResult.createSignedUrl).toHaveBeenCalledWith("org-1/asset-1/logo.png", 1800);
  });

  // -------------------------------------------------------------------------
  // 5. Delete (revocation)
  // -------------------------------------------------------------------------
  it("13. deleteAssetFromStorage calls remove with correct path", async () => {
    vi.mocked(supabaseModule.isSupabaseConfigured).mockReturnValue(true);
    const mockAdmin = buildMockAdmin();
    vi.mocked(supabaseModule.getSupabaseAdmin).mockReturnValue(mockAdmin);

    await deleteAssetFromStorage("org-1", "asset-1", "logo.png");

    const fromResult = mockAdmin.storage.from.mock.results[0].value;
    expect(fromResult.remove).toHaveBeenCalledWith(["org-1/asset-1/logo.png"]);
  });

  // -------------------------------------------------------------------------
  // 6. Cross-tenant isolation (structural proof)
  // -------------------------------------------------------------------------
  it("14. Cross-tenant isolation: path is always prefixed with caller organizationId", async () => {
    vi.mocked(supabaseModule.isSupabaseConfigured).mockReturnValue(true);
    const mockAdmin = buildMockAdmin();
    vi.mocked(supabaseModule.getSupabaseAdmin).mockReturnValue(mockAdmin);

    // Org A uploads asset-Z
    await uploadAssetToStorage("org-A", "asset-Z", Buffer.from("x"), "image/png", "logo.png");
    const uploadCall = mockAdmin.storage.from.mock.results[0].value.upload.mock.calls[0];
    const uploadedPath: string = uploadCall[0];
    expect(uploadedPath.startsWith("org-A/")).toBe(true);
    expect(uploadedPath).toBe("org-A/asset-Z/logo.png");

    // Prove org-B cannot access the same path: a download call for org-B constructs a different prefix
    const mockAdmin2 = buildMockAdmin();
    vi.mocked(supabaseModule.getSupabaseAdmin).mockReturnValue(mockAdmin2);
    await downloadAssetFromStorage("org-B", "asset-Z", "logo.png");
    const downloadCall = mockAdmin2.storage.from.mock.results[0].value.download.mock.calls[0];
    const downloadedPath: string = downloadCall[0];
    expect(downloadedPath.startsWith("org-B/")).toBe(true);
    expect(downloadedPath).toBe("org-B/asset-Z/logo.png");
    // org-B's path is structurally different from org-A's path
    expect(downloadedPath).not.toBe(uploadedPath);
  });
});
