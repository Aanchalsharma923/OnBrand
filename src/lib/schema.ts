import { boolean, date, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

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

export const sources = pgTable("sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  title: text("title").notNull(),
  kind: varchar("kind", { length: 32 }).notNull(),
  authority: integer("authority").notNull(),
  version: integer("version").notNull().default(1),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  channels: jsonb("channels").$type<string[]>().notNull(),
  owner: text("owner").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

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
});

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
