/**
 * OnBrand — Server-Side Ephemeral In-Memory Asset Binary Store
 *
 * Scoped by organizationId (`${organizationId}:${assetId}`).
 * Used for fast same-process retrieval, testing, and local fallback.
 */

export interface StoredAssetBinary {
  organizationId: string;
  assetId: string;
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

export const serverAssetBinaryStore = new Map<string, StoredAssetBinary>();
