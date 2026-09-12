/**
 * Cluster K — Operations
 */
import {
  pgTable, uuid, text, timestamp, jsonb, boolean, integer,
} from "drizzle-orm/pg-core";

// Unique on (source, submission_key) — the idempotency mechanism (I8, SOW-08)
export const jobSubmission = pgTable("job_submission", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull(),
  submissionKey: text("submission_key").notNull(),
  payloadHash: text("payload_hash"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  resultRef: text("result_ref"),
});

// Zero silent failures (NFR-REL-01)
export const deadLetter = pgTable("dead_letter", {
  id: uuid("id").primaryKey().defaultRandom(),
  queue: text("queue").notNull(),
  jobName: text("job_name").notNull(),
  payload: jsonb("payload"),
  error: text("error"),
  attempts: integer("attempts").default(0).notNull(),
  failedAt: timestamp("failed_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by"),
});

export const retentionPolicy = pgTable("retention_policy", {
  id: uuid("id").primaryKey().defaultRandom(),
  retentionClass: text("retention_class").notNull().unique(),
  categoryDescription: text("category_description"),
  rule: text("rule").notNull(),
  basis: text("basis"),
  purgeAfter: text("purge_after"),
  legalHoldSupported: boolean("legal_hold_supported").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  subjectType: text("subject_type"),
  subjectId: uuid("subject_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
});

// Content and Storage (Cluster I)
export const document = pgTable("document", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  store: text("store").notNull(), // workspace | r2
  storageRef: text("storage_ref"),
  contentHash: text("content_hash"),
  mime: text("mime"),
  classification: text("classification").default("internal").notNull(),
  retentionClass: text("retention_class").default("standard").notNull(),
  owningLane: text("owning_lane"),
  opportunityId: uuid("opportunity_id"),
  partnerId: uuid("partner_id"),
  uploadedBy: uuid("uploaded_by"),
  quarantineStatus: text("quarantine_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const documentAccessLog = pgTable("document_access_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull(),
  actorId: uuid("actor_id").notNull(),
  action: text("action").notNull(),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  ipHash: text("ip_hash"),
});
