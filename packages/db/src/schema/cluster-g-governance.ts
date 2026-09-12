/**
 * Cluster G — Governance and AI (Module AIG, PRD §6)
 * Append-only, hash-chained decision log.
 */
import {
  pgTable, uuid, text, timestamp, jsonb, boolean, integer, numeric,
} from "drizzle-orm/pg-core";
import { classificationEnum, retentionClassEnum } from "./cluster-a-identity";

export const aiDecisionPoint = pgTable("ai_decision_point", {
  ref: text("ref").primaryKey(), // D1…Dn
  purpose: text("purpose").notNull(),
  lane: text("lane"),
  module: text("module"),
  subjectType: text("subject_type"),
  subjectIsIdentifiableIndividual: boolean("subject_is_identifiable_individual").default(false).notNull(),
  modelAndTechnique: text("model_and_technique"),
  inputsDescription: text("inputs_description"),
  outputType: text("output_type"),
  humanInvolvementPosture: text("human_involvement_posture"),
  legalCharacterization: text("legal_characterization"),
  noticeTextRef: text("notice_text_ref"),
  retentionClass: retentionClassEnum("retention_class").default("extended").notNull(),
  ownerUserId: uuid("owner_user_id"),
  dpoApprovedAt: timestamp("dpo_approved_at", { withTimezone: true }),
  legalApprovedAt: timestamp("legal_approved_at", { withTimezone: true }),
  enabled: boolean("enabled").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Append-only, hash-chained (AIG-03). UPDATE and DELETE revoked.
export const decision = pgTable("decision", {
  id: uuid("id").primaryKey().defaultRandom(),
  decisionPointRef: text("decision_point_ref").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: uuid("subject_id"),
  subjectIsIndividual: boolean("subject_is_individual").default(false).notNull(),
  inputs: jsonb("inputs"),
  modelVersion: text("model_version"),
  promptVersion: text("prompt_version"),
  graphVersion: text("graph_version"),
  weightsVersion: text("weights_version"),
  output: jsonb("output"),
  components: jsonb("components"),
  reviewerUserId: uuid("reviewer_user_id"),
  actionTaken: text("action_taken"),
  overrideFlag: boolean("override_flag").default(false).notNull(),
  overrideReason: text("override_reason"),
  retentionClass: retentionClassEnum("retention_class").default("extended").notNull(),
  prevHash: text("prev_hash"),
  rowHash: text("row_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const decisionReview = pgTable("decision_review", {
  id: uuid("id").primaryKey().defaultRandom(),
  decisionId: uuid("decision_id").notNull().references(() => decision.id),
  reviewerUserId: uuid("reviewer_user_id").notNull(),
  consideredOtherInformation: boolean("considered_other_information").default(false).notNull(),
  notes: text("notes"),
  authorityConfirmed: boolean("authority_confirmed").default(false).notNull(),
  outcome: text("outcome"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const riskAssessment = pgTable("risk_assessment", {
  id: uuid("id").primaryKey().defaultRandom(),
  decisionPointRef: text("decision_point_ref").notNull(),
  version: integer("version").notNull(),
  purpose: text("purpose"),
  informationCategories: text("information_categories"),
  logicDescription: text("logic_description"),
  benefits: text("benefits"),
  negativeImpacts: text("negative_impacts"),
  safeguards: text("safeguards"),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const subjectRequest = pgTable("subject_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectType: text("subject_type").notNull(),
  subjectRef: text("subject_ref").notNull(),
  requestType: text("request_type").notNull(), // access | explanation | correction | deletion | appeal
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
  outcome: text("outcome"),
  handledBy: uuid("handled_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const appeal = pgTable("appeal", {
  id: uuid("id").primaryKey().defaultRandom(),
  decisionId: uuid("decision_id").notNull().references(() => decision.id),
  raisedBy: text("raised_by").notNull(),
  raisedAt: timestamp("raised_at", { withTimezone: true }).notNull(),
  reviewerUserId: uuid("reviewer_user_id"),
  originalReviewerId: uuid("original_reviewer_id"),
  outcome: text("outcome"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const fairnessTestRun = pgTable("fairness_test_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  decisionPointRef: text("decision_point_ref").notNull(),
  runAt: timestamp("run_at", { withTimezone: true }).notNull(),
  cohortDefinition: text("cohort_definition"),
  aggregateOutcomes: jsonb("aggregate_outcomes"),
  finding: text("finding"),
  remediationRef: text("remediation_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const modelCall = pgTable("model_call", {
  id: uuid("id").primaryKey().defaultRandom(),
  decisionId: uuid("decision_id"),
  gatewayRef: text("gateway_ref"),
  vendor: text("vendor").notNull(),
  modelVersion: text("model_version"),
  promptVersion: text("prompt_version"),
  region: text("region"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  cost: numeric("cost", { precision: 10, scale: 6 }),
  latencyMs: integer("latency_ms"),
  redactionProfile: text("redaction_profile"),
  outcome: text("outcome"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
