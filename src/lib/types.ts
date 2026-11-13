/**
 * OnBrand Round 3 — Shared Interface Contracts & DTOs
 * Reference: PROJECT.md § 4 (Inter-Agent Programmatic Interface Contracts)
 *
 * NOTE: src/lib/onbrand.ts is under ABSOLUTE FREEZE.
 * This module defines and exports shared DTOs, repository interfaces, and service contracts
 * for inter-agent collaboration across Agents 1, 2, 3, 4, and 5.
 */

import type {
  Draft,
  Fact,
  Finding,
  Review,
  Source,
} from "./onbrand";

// Re-export core domain types from pure engine
export type {
  Role,
  EvidenceStatus,
  Severity,
  ExtractionReview,
  Source,
  Fact,
  Finding,
  FindingFilter,
  Draft,
  Review,
} from "./onbrand";

// ============================================================================
// 1. Contract 1: Architecture <-> Auth/DB/Tenancy/Retrieval (PROJECT.md § 4.1)
// ============================================================================

export type TenantRole =
  | "CREATOR"
  | "REVIEWER"
  | "MAINTAINER"
  | "creator"
  | "reviewer"
  | "maintainer";

export type ServerRole =
  | "creator"
  | "reviewer"
  | "maintainer"
  | "CREATOR"
  | "REVIEWER"
  | "MAINTAINER";

export interface VerifiedActor {
  userId: string;
  displayName?: string;
}

export interface TenantContext {
  organizationId: string;
  userId?: string;
  role: TenantRole;
  actor: VerifiedActor;
}

export interface ReviewDecision {
  state: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED" | "REOPENED";
  by?: string;
  at: string;
  draftHash: string;
  sourceSnapshotHash?: string;
  reason?: string;
}

declare module "@/lib/onbrand" {
  export interface ReviewDecision {
    state: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED" | "REOPENED";
    by?: string;
    at: string;
    draftHash: string;
    sourceSnapshotHash?: string;
    reason?: string;
  }
}

export interface AuditEvent {
  id?: string;
  organizationId?: string;
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export type AuditEventRecord = AuditEvent;

export interface AssetRecord {
  id: string;
  organizationId: string;
  name: string;
  fileType?: string;
  mimeType?: string;
  byteSize?: number;
  sha256: string;
  phash?: string;
  pHash?: string;
  url?: string;
  approvalState?: "APPROVED" | "PENDING_REVIEW" | "REJECTED" | string;
  allowedUsage?: string;
  uploadedBy?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface OnBrandRepository {
  // Knowledge Sources & Facts
  getSources(ctx: TenantContext): Promise<Source[]>;
  getSourceById(ctx: TenantContext, id: string): Promise<Source | null>;
  createSource(ctx: TenantContext, source: Omit<Source, "id">): Promise<Source>;
  updateSourceStatus(ctx: TenantContext, id: string, status: "APPROVED" | "REVOKED"): Promise<void>;
  searchFacts(ctx: TenantContext, query: string, channel: string, date: string): Promise<Fact[]>;

  // Drafts & Versioning
  getDrafts(ctx: TenantContext): Promise<Draft[]>;
  getDraftVersion(ctx: TenantContext, draftId: string, version: number): Promise<Draft | null>;
  saveDraftVersion(ctx: TenantContext, draft: Draft): Promise<{ draftId: string; version: number; hash?: string }>;

  // Reviews & Findings
  saveReview(ctx: TenantContext, review: Review): Promise<void>;
  getReviewByDraftVersion(
    ctx: TenantContext,
    draftVersionIdOrDraftId: string,
    version?: number
  ): Promise<Review | null>;

  // Governance Decisions & Audits
  recordDecision(ctx: TenantContext, reviewId: string, decision: ReviewDecision): Promise<void>;
  recordAuditEvent(ctx: TenantContext, event: AuditEvent): Promise<void>;
  getAuditLog(ctx: TenantContext, limit?: number): Promise<AuditEvent[]>;

  // Visual Asset Registry
  registerAsset(
    ctx: TenantContext,
    asset: AssetRecord | Omit<AssetRecord, "id" | "createdAt">
  ): Promise<AssetRecord>;
  getAssets(ctx: TenantContext): Promise<AssetRecord[]>;
}

// ============================================================================
// 2. Contract 2: Architecture <-> Hosted Semantic Verification (PROJECT.md § 4.2)
// ============================================================================

export type SemanticRelation =
  | "SUPPORTS"
  | "PARTIALLY_SUPPORTS"
  | "CONTRADICTS"
  | "INSUFFICIENT"
  | "NOT_RUN"
  | "DISAGREEMENT";

export interface SemanticResultItem {
  finding_id: string;
  relation: "SUPPORTS" | "PARTIALLY_SUPPORTS" | "CONTRADICTS" | "INSUFFICIENT";
  quote: string;
  explanation: string;
}

export interface SemanticVerification {
  state: "verified" | "needs-human" | "deterministic-preview";
  candidateCount: number;
  unresolvedCount: number;
  results?: SemanticResultItem[];
}

export interface ModelGateway {
  verifySemanticEvidence(
    review: Review,
    draft: Draft,
    sources: Source[],
    options?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<SemanticVerification>;

  checkRateLimit(sessionOrUserId: string): Promise<{
    allowed: boolean;
    remainingRequests: number;
    resetAt: string;
  }>;
}

// ============================================================================
// 3. Contract 3: Architecture <-> Visual Intelligence/UX (PROJECT.md § 4.3)
// ============================================================================

export interface LogoMatchResult {
  matchType: "EXACT" | "NEAR_VARIANT" | "NOT_IN_REGISTRY";
  matchedAssetId?: string;
  hammingDistance?: number;
}

export interface ContrastSampleResult {
  ratio: number;
  fgHex: string;
  bgHex: string;
  meetsAA: boolean;
  isEstimate: true;
}

export interface DominantPaletteResult {
  dominantColors: Array<{ hex: string; percentage: number }>;
  deviations: Array<{ hex: string; nearestToken: string; deltaE: number }>;
}

export interface VisualAnalysisEngine {
  matchLogo(
    imageBuffer: Buffer,
    registry: AssetRecord[]
  ): Promise<LogoMatchResult>;

  sampleBoundingBoxContrast(
    imageBuffer: Buffer,
    boundingBox: { x: number; y: number; width: number; height: number }
  ): Promise<ContrastSampleResult>;

  extractDominantPalette(
    imageBuffer: Buffer,
    brandTokens: Array<{ name: string; hex: string }>
  ): Promise<DominantPaletteResult>;

  inspectDocxAccessibility(docxBuffer: Buffer): Promise<Finding[]>;
  inspectPdfTagStructure(pdfBuffer: Buffer): Promise<Finding[]>;
}
