/**
 * Cluster A — Identity and Demand (PRD §4.2)
 * The entity-resolution anchor for every lane (I2).
 */
import {
  pgTable, uuid, text, timestamp, jsonb, boolean, integer, pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const channelEnum = pgEnum("channel", [
  "outbound", "web_form", "email", "referral", "event",
  "partner", "inbound_rfi", "bulk_list",
]);

export const laneEnum = pgEnum("lane", ["B", "C"]);

export const classificationEnum = pgEnum("classification", [
  "public", "internal", "confidential", "regulated",
]);

export const retentionClassEnum = pgEnum("retention_class", [
  "standard", "extended", "regulatory", "permanent",
]);

// The one identity (I2) — every lead, opportunity, and solicitation resolves here
export const account = pgTable("account", {
  id: uuid("id").primaryKey().defaultRandom(),
  normalizedDomain: text("normalized_domain"),
  legalName: text("legal_name").notNull(),
  registryId: text("registry_id"),
  registryAuthority: text("registry_authority"),
  sector: text("sector"),
  sizeBand: text("size_band"),
  country: text("country"),
  region: text("region"),
  ownerUserId: uuid("owner_user_id"),
  dualRoleFlag: boolean("dual_role_flag").default(false).notNull(),
  mergedIntoId: uuid("merged_into_id"),
  summary: text("summary"),
  classification: classificationEnum("classification").default("internal").notNull(),
  retentionClass: retentionClassEnum("retention_class").default("standard").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const accountAlias = pgTable("account_alias", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => account.id),
  aliasType: text("alias_type").notNull(), // domain | name | registry
  value: text("value").notNull(),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const accountMerge = pgTable("account_merge", {
  id: uuid("id").primaryKey().defaultRandom(),
  survivingId: uuid("surviving_id").notNull().references(() => account.id),
  mergedId: uuid("merged_id").notNull().references(() => account.id),
  matchScore: text("match_score"),
  features: jsonb("features"),
  decidedBy: text("decided_by"),
  decisionId: uuid("decision_id"),
  reversedAt: timestamp("reversed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Personal data — minimized at capture (GOV-08)
export const contact = pgTable("contact", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => account.id),
  fullName: text("full_name").notNull(),
  roleTitle: text("role_title"),
  seniorityBand: text("seniority_band"),
  email: text("email"),
  sourceRef: text("source_ref"),
  lawfulBasis: text("lawful_basis").notNull(),
  purposeTags: text("purpose_tags").array().notNull().default([]),
  consentRef: uuid("consent_ref"),
  consentExpiresAt: timestamp("consent_expires_at", { withTimezone: true }),
  suppressionFlag: boolean("suppression_flag").default(false).notNull(),
  retentionClass: retentionClassEnum("retention_class").default("standard").notNull(),
  classification: classificationEnum("classification").default("regulated").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// One board for every channel (I3, SCORE-06)
export const lead = pgTable("lead", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => account.id),
  channel: channelEnum("channel").notNull(),
  provenance: jsonb("provenance"),
  submittingPartnerId: uuid("submitting_partner_id"),
  intentEvidence: jsonb("intent_evidence"),
  currentScore: integer("current_score"),
  currentScoreRunId: uuid("current_score_run_id"),
  routingOutcome: text("routing_outcome"),
  routedToOwnerId: uuid("routed_to_owner_id"),
  firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
  slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
  declineReasonCode: text("decline_reason_code"),
  classification: classificationEnum("classification").default("internal").notNull(),
  retentionClass: retentionClassEnum("retention_class").default("standard").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const opportunity = pgTable("opportunity", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => account.id),
  name: text("name").notNull(),
  lane: laneEnum("lane").notNull(),
  subStatus: text("sub_status"),
  ownerUserId: uuid("owner_user_id"),
  triageRunId: uuid("triage_run_id"),
  anchorMethod: text("anchor_method"),
  anchorValue: text("anchor_value"),
  complianceFields: jsonb("compliance_fields"),
  solicitationRef: text("solicitation_ref"),
  typeLabel: text("type_label"),
  closeDate: timestamp("close_date", { withTimezone: true }),
  dueDate: timestamp("due_date", { withTimezone: true }),
  outcomeId: uuid("outcome_id"),
  classification: classificationEnum("classification").default("internal").notNull(),
  retentionClass: retentionClassEnum("retention_class").default("standard").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// DISC-11 as a table — an enriched value cannot exist without source and timestamp
export const enrichedField = pgTable("enriched_field", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectType: text("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  fieldName: text("field_name").notNull(),
  value: text("value"),
  sourceRef: text("source_ref").notNull(),
  sourceType: text("source_type").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  enteredByUserId: uuid("entered_by_user_id"),
  freshnessThresholdDays: integer("freshness_threshold_days"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Bulk list evaluation (DISC-13, Amendment 2)
export const sourceBatch = pgTable("source_batch", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  fileRef: uuid("file_ref"),
  rowCount: integer("row_count").notNull(),
  evaluatedCount: integer("evaluated_count").default(0).notNull(),
  uploadedBy: uuid("uploaded_by"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
});
