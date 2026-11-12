import { boolean, date, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const memberships = pgTable("memberships", {
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  userId: text("user_id").notNull(),
  role: varchar("role", { length: 20 }).notNull(),
  displayName: text("display_name").notNull(),
}, (table) => [primaryKey({ columns: [table.organizationId, table.userId] })]);

export const profiles = pgTable("profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().unique(),
  email: text("email"),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sources = pgTable("sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  sourceKey: text("source_key").notNull(),
  title: text("title").notNull(),
  kind: varchar("kind", { length: 32 }).notNull(),
  authority: integer("authority").notNull(),
  version: integer("version").notNull().default(1),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  approvalState: varchar("approval_state", { length: 24 }).notNull(),
  channels: jsonb("channels").$type<string[]>().notNull(),
  owner: text("owner").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [unique("sources_organization_source_key_version_key").on(table.organizationId, table.sourceKey, table.version)]);

export const facts = pgTable("facts", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  sourceId: uuid("source_id").references(() => sources.id).notNull(),
  subject: text("subject").notNull(),
  attribute: text("attribute").notNull(),
  value: text("value").notNull(),
  unit: text("unit"),
  statement: text("statement").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const drafts = pgTable("drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  title: text("title").notNull(),
  channel: varchar("channel", { length: 32 }).notNull(),
  product: text("product").notNull(),
  audience: text("audience").notNull(),
  publicationDate: date("publication_date").notNull(),
  currentVersion: integer("current_version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const draftVersions = pgTable("draft_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  draftId: uuid("draft_id").references(() => drafts.id).notNull(),
  version: integer("version").notNull(),
  content: text("content").notNull(),
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [unique("draft_versions_organization_draft_version_key").on(table.organizationId, table.draftId, table.version)]);

export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  draftId: uuid("draft_id").references(() => drafts.id).notNull(),
  draftVersionId: uuid("draft_version_id").references(() => draftVersions.id).notNull(),
  draftHash: varchar("draft_hash", { length: 64 }).notNull(),
  sourceSnapshotHash: varchar("source_snapshot_hash", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  modelProvider: text("model_provider"),
  modelVersion: text("model_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const findings = pgTable("findings", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  reviewId: uuid("review_id").references(() => reviews.id).notNull(),
  claimText: text("claim_text").notNull(),
  // Half-open Unicode code-point offsets into the immutable original draft text.
  startOffset: integer("start_offset").notNull(),
  endOffset: integer("end_offset").notNull(),
  category: varchar("category", { length: 40 }).notNull(),
  evidenceStatus: varchar("evidence_status", { length: 40 }).notNull(),
  severity: varchar("severity", { length: 16 }).notNull(),
  blockingForReview: boolean("blocking_for_review").notNull(),
  explanation: text("explanation").notNull(),
  evidence: jsonb("evidence").$type<unknown[]>().notNull(),
  suggestion: text("suggestion"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const comments = pgTable("comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  reviewId: uuid("review_id").references(() => reviews.id).notNull(),
  authorId: text("author_id").notNull(),
  body: text("body").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const decisions = pgTable("decisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  reviewId: uuid("review_id").references(() => reviews.id).notNull(),
  draftHash: varchar("draft_hash", { length: 64 }).notNull(),
  sourceSnapshotHash: varchar("source_snapshot_hash", { length: 64 }).notNull(),
  decision: varchar("decision", { length: 32 }).notNull(),
  decidedBy: text("decided_by").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const assets = pgTable("assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  phash: text("phash").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  approvalState: varchar("approval_state", { length: 24 }).notNull().default("APPROVED"),
  allowedUsage: text("allowed_usage"),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const contentAssets = pgTable("content_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  filename: text("filename").notNull(),
  mimeType: varchar("mime_type", { length: 120 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  storageRef: text("storage_ref").notNull(),
  processingStatus: varchar("processing_status", { length: 32 }).notNull().default("PENDING"),
  extractionStatus: varchar("extraction_status", { length: 32 }).notNull().default("DIRECT"),
  qualityMetadata: jsonb("quality_metadata").$type<Record<string, unknown>>().notNull().default({}),
  extractedText: text("extracted_text").notNull().default(""),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const processingJobs = pgTable("processing_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  assetId: uuid("asset_id").references(() => contentAssets.id).notNull(),
  jobType: varchar("job_type", { length: 32 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("PENDING"),
  progressPercent: integer("progress_percent").notNull().default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const extractedPages = pgTable("extracted_pages", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  assetId: uuid("asset_id").references(() => contentAssets.id).notNull(),
  pageNumber: integer("page_number").notNull(),
  text: text("text").notNull(),
  wordBoxes: jsonb("word_boxes").$type<unknown[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const mediaFrames = pgTable("media_frames", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  assetId: uuid("asset_id").references(() => contentAssets.id).notNull(),
  frameIndex: integer("frame_index").notNull(),
  timestampSeconds: text("timestamp_seconds").notNull(),
  ocrText: text("ocr_text"),
  wordBoxes: jsonb("word_boxes").$type<unknown[]>().notNull().default([]),
  dominantColors: jsonb("dominant_colors").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const transcripts = pgTable("transcripts", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  assetId: uuid("asset_id").references(() => contentAssets.id).notNull(),
  durationSeconds: text("duration_seconds").notNull(),
  language: varchar("language", { length: 10 }).notNull().default("en"),
  fullText: text("full_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const transcriptSegments = pgTable("transcript_segments", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  transcriptId: uuid("transcript_id").references(() => transcripts.id).notNull(),
  startSeconds: text("start_seconds").notNull(),
  endSeconds: text("end_seconds").notNull(),
  speaker: text("speaker"),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const annotations = pgTable("annotations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  reviewId: uuid("review_id").references(() => reviews.id).notNull(),
  findingId: text("finding_id").notNull(),
  locationType: varchar("location_type", { length: 40 }).notNull(),
  category: varchar("category", { length: 40 }).notNull(),
  severity: varchar("severity", { length: 16 }).notNull(),
  evidenceStatus: varchar("evidence_status", { length: 40 }).notNull(),
  isActionable: boolean("is_actionable").notNull().default(true),
  coordinates: jsonb("coordinates").$type<Record<string, unknown>>().notNull().default({}),
  previewText: text("preview_text").notNull(),
  explanation: text("explanation").notNull(),
  suggestedCorrection: text("suggested_correction"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const exportedRevisions = pgTable("exported_revisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  draftId: uuid("draft_id").references(() => drafts.id).notNull(),
  version: integer("version").notNull(),
  format: varchar("format", { length: 32 }).notNull(),
  downloadUrl: text("download_url").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Aliases matching alternative naming conventions
export const reviewDecisions = decisions;
export const draft_versions = draftVersions;
export const audit_events = auditEvents;

// Inferred TypeScript types from Drizzle schema definitions
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type SourceRecord = typeof sources.$inferSelect;
export type NewSourceRecord = typeof sources.$inferInsert;
export type FactRecord = typeof facts.$inferSelect;
export type NewFactRecord = typeof facts.$inferInsert;
export type DraftRecord = typeof drafts.$inferSelect;
export type NewDraftRecord = typeof drafts.$inferInsert;
export type DraftVersionRecord = typeof draftVersions.$inferSelect;
export type NewDraftVersionRecord = typeof draftVersions.$inferInsert;
export type ReviewRecord = typeof reviews.$inferSelect;
export type NewReviewRecord = typeof reviews.$inferInsert;
export type FindingRecord = typeof findings.$inferSelect;
export type NewFindingRecord = typeof findings.$inferInsert;
export type CommentRecord = typeof comments.$inferSelect;
export type NewCommentRecord = typeof comments.$inferInsert;
export type DecisionRecord = typeof decisions.$inferSelect;
export type NewDecisionRecord = typeof decisions.$inferInsert;
export type AuditEventRecord = typeof auditEvents.$inferSelect;
export type NewAuditEventRecord = typeof auditEvents.$inferInsert;
export type AssetRecordDB = typeof assets.$inferSelect;
export type NewAssetRecordDB = typeof assets.$inferInsert;
export type ContentAssetRecord = typeof contentAssets.$inferSelect;
export type NewContentAssetRecord = typeof contentAssets.$inferInsert;
export type ProcessingJobRecord = typeof processingJobs.$inferSelect;
export type NewProcessingJobRecord = typeof processingJobs.$inferInsert;
export type AnnotationRecord = typeof annotations.$inferSelect;
export type NewAnnotationRecord = typeof annotations.$inferInsert;
