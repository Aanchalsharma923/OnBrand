/**
 * OnBrand — Supabase Storage Layer for Persistent Binary Asset Storage
 *
 * Replaces the in-process `serverAssetBinaryStore` Map with a durable
 * Supabase Storage bucket so that binary assets survive serverless cold
 * starts, redeployments, and horizontal scale-out.
 *
 * Bucket: `onbrand-assets` (private, no public access, RLS disabled for
 * service-role key operations).
 *
 * Key layout: `{organizationId}/{assetId}/{filename}`
 * — The organizationId prefix ensures cross-tenant isolation at the storage
 *   layer independently of application-level access control.
 *
 * Security invariants:
 * 1. Only the service-role key (server-side only) may read or write binaries.
 * 2. `organizationId` is always derived from the verified TenantContext — it
 *    is never accepted from client-supplied headers for path construction.
 * 3. Cross-tenant retrieval is structurally impossible: a request for asset
 *    `A` belonging to org `X` will construct path `X/A/...` and cannot access
 *    any path under org `Y`.
 * 4. Signed URLs are time-limited (default 3600 s) and scoped to a single
 *    object path. They are never publicly listed.
 * 5. When storage is not configured, all operations degrade gracefully:
 *    upload returns null, download returns null, the caller falls back to the
 *    in-process buffer map for test/local compatibility.
 */

import { isSupabaseConfigured, getSupabaseAdmin } from "./supabase";

export const STORAGE_BUCKET = "onbrand-assets";

/**
 * Returns true when Supabase Storage is available.
 * Requires the same credentials as `isSupabaseConfigured()`.
 */
export function storageConfigured(): boolean {
  return isSupabaseConfigured();
}

/**
 * Uploads a binary asset to `{organizationId}/{assetId}/{filename}`.
 *
 * @returns The storage path on success, or null when storage is not configured.
 * @throws On Supabase storage error (non-configuration failures).
 */
export async function uploadAssetToStorage(
  organizationId: string,
  assetId: string,
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<string | null> {
  if (!storageConfigured()) return null;

  const path = `${organizationId}/${assetId}/${filename}`;
  const admin = getSupabaseAdmin();

  const { error } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: true, // Replace existing binary on re-upload (e.g., asset replacement flow)
    });

  if (error) {
    throw new Error(`Supabase Storage upload failed for ${path}: ${error.message}`);
  }

  return path;
}

/**
 * Downloads the binary for an asset owned by the given organization.
 *
 * Returns null when:
 *  - Storage is not configured.
 *  - The object does not exist (404 from Supabase).
 *
 * Throws on any other Supabase storage error.
 */
export async function downloadAssetFromStorage(
  organizationId: string,
  assetId: string,
  filename: string
): Promise<Buffer | null> {
  if (!storageConfigured()) return null;

  const path = `${organizationId}/${assetId}/${filename}`;
  const admin = getSupabaseAdmin();

  const { data, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .download(path);

  if (error) {
    // Object not found is a recoverable condition (404)
    if (
      error.message?.includes("Object not found") ||
      error.message?.includes("not found") ||
      (error as any).statusCode === 404 ||
      (error as any).status === 404
    ) {
      return null;
    }
    throw new Error(`Supabase Storage download failed for ${path}: ${error.message}`);
  }

  if (!data) return null;

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Creates a time-limited signed URL for a single object.
 * URL expires after `expiresInSeconds` (default 3600 = 1 hour).
 *
 * Returns null when storage is not configured.
 * Throws on Supabase error.
 */
export async function createSignedAssetUrl(
  organizationId: string,
  assetId: string,
  filename: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  if (!storageConfigured()) return null;

  const path = `${organizationId}/${assetId}/${filename}`;
  const admin = getSupabaseAdmin();

  const { data, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Supabase Storage signed URL creation failed for ${path}: ${error?.message ?? "no URL returned"}`
    );
  }

  return data.signedUrl;
}

/**
 * Permanently deletes the binary for a revoked asset.
 * No-op when storage is not configured.
 * Throws on Supabase error.
 */
export async function deleteAssetFromStorage(
  organizationId: string,
  assetId: string,
  filename: string
): Promise<void> {
  if (!storageConfigured()) return;

  const path = `${organizationId}/${assetId}/${filename}`;
  const admin = getSupabaseAdmin();

  const { error } = await admin.storage
    .from(STORAGE_BUCKET)
    .remove([path]);

  if (error) {
    throw new Error(`Supabase Storage delete failed for ${path}: ${error.message}`);
  }
}

/**
 * Checks whether a specific object exists in storage.
 * Returns false when storage is not configured.
 */
export async function assetExistsInStorage(
  organizationId: string,
  assetId: string,
  filename: string
): Promise<boolean> {
  if (!storageConfigured()) return false;

  try {
    const path = `${organizationId}/${assetId}/${filename}`;
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.storage
      .from(STORAGE_BUCKET)
      .list(`${organizationId}/${assetId}`, {
        search: filename,
        limit: 1,
      });
    if (error) return false;
    return Array.isArray(data) && data.some((f: { name: string }) => f.name === filename);
  } catch {
    return false;
  }
}
