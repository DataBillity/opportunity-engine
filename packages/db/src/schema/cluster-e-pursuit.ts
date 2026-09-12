/**
 * Cluster E — Pursuit (Lanes B and C, shared)
 */
import {
  pgTable, uuid, text, timestamp, jsonb, boolean, integer, numeric,
} from "drizzle-orm/pg-core";
import { opportunity, classificationEnum, retentionClassEnum } from "./cluster-a-identity";
import { partner } from "./cluster-d-partners";
import { graphNode } from "./cluster-b-graph";

export const pursuitDocument = pgTable("pursuit_document", {
  id: uuid("id").primaryKey().defaultRandom(),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunity.id),
  docKind: text("doc_kind").notNull(), // solicitation | sow | scope_request
  documentId: uuid("document_id"),
  receivedVia: text("received_via"),
  addedAfterIntake: boolean("added_after_intake").default(false).notNull(),
  supersedesId: uuid("supersedes_id"),
  classification: classificationEnum("classification").default("internal").notNull(),
  retentionClass: retentionClassEnum("retention_class").default("standard").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const triageRun = pgTable("triage_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  pursuitDocumentId: uuid("pursuit_document_id").references(() => pursuitDocument.id),
  lane: text("lane").notNull(),
  decisionId: uuid("decision_id"),
  totalScore: integer("total_score"),
  thresholdApplied: integer("threshold_applied"),
  outcome: text("outcome"), // go | no_go | go_with_conditions
  conditions: text("conditions"),
  rationale: text("rationale"),
  graphVersion: text("graph_version"),
  weightsVersion: text("weights_version"),
  previousRunId: uuid("previous_run_id"),
  scoreDelta: integer("score_delta"),
  regressionReason: text("regression_reason"),
  runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const triageRequirement = pgTable("triage_requirement", {
  id: uuid("id").primaryKey().defaultRandom(),
  triageRunId: uuid("triage_run_id").notNull().references(() => triageRun.id),
  requirementText: text("requirement_text").notNull(),
  sectionRef: text("section_ref"),
  weight: integer("weight"),
  mappedNodeId: uuid("mapped_node_id"),
  mappedVia: text("mapped_via"), // consortium | partner | unmapped
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  gapId: uuid("gap_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const complianceMatrixItem = pgTable("compliance_matrix_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunity.id),
  requirementRef: text("requirement_ref"),
  responseSectionId: text("response_section_id"),
  status: text("status"),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const personnelRole = pgTable("personnel_role", {
  id: uuid("id").primaryKey().defaultRandom(),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunity.id),
  roleName: text("role_name").notNull(),
  source: text("source").notNull(), // named | inferred | manual
  inferredFromCapabilityId: uuid("inferred_from_capability_id"),
  required: boolean("required").default(true).notNull(),
  addedByUserId: uuid("added_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const personnelSlate = pgTable("personnel_slate", {
  id: uuid("id").primaryKey().defaultRandom(),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunity.id),
  personnelRoleId: uuid("personnel_role_id").references(() => personnelRole.id),
  decisionId: uuid("decision_id"),
  confirmedByUserId: uuid("confirmed_by_user_id"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  deviationFromRanking: text("deviation_from_ranking"),
  deviationReason: text("deviation_reason"),
  manuallyAddedPersonName: text("manually_added_person_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const slateCandidate = pgTable("slate_candidate", {
  id: uuid("id").primaryKey().defaultRandom(),
  slateId: uuid("slate_id").notNull().references(() => personnelSlate.id),
  personNodeId: uuid("person_node_id").notNull().references(() => graphNode.id),
  rank: integer("rank").notNull(),
  basis: jsonb("basis"),
  selected: boolean("selected").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const proposalSection = pgTable("proposal_section", {
  id: uuid("id").primaryKey().defaultRandom(),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunity.id),
  sectionRef: text("section_ref").notNull(),
  draftBody: text("draft_body"),
  decisionId: uuid("decision_id"),
  promptVersion: text("prompt_version"),
  modelVersion: text("model_version"),
  graphVersion: text("graph_version"),
  reviewStatus: text("review_status").default("draft").notNull(),
  reviewedBy: uuid("reviewed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const draftAssertion = pgTable("draft_assertion", {
  id: uuid("id").primaryKey().defaultRandom(),
  proposalSectionId: uuid("proposal_section_id").notNull().references(() => proposalSection.id),
  assertionText: text("assertion_text").notNull(),
  supportingNodeId: uuid("supporting_node_id"),
  supportingDocumentId: uuid("supporting_document_id"),
  status: text("status").notNull(), // supported | unsupported
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const teamingInstrument = pgTable("teaming_instrument", {
  id: uuid("id").primaryKey().defaultRandom(),
  opportunityId: uuid("opportunity_id"), // nullable per Amendment 3D
  partnerId: uuid("partner_id").notNull().references(() => partner.id),
  scope: text("scope").default("partner_wide").notNull(), // partner_wide | per_opportunity
  instrumentType: text("instrument_type"),
  documentId: uuid("document_id"),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  esignRef: text("esign_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const deliverable = pgTable("deliverable", {
  id: uuid("id").primaryKey().defaultRandom(),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunity.id),
  taskName: text("task_name").notNull(),
  assigneeUserId: uuid("assignee_user_id"),
  assigneePartnerId: uuid("assignee_partner_id"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  timezone: text("timezone"),
  status: text("status").default("pending").notNull(),
  escalationState: text("escalation_state"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const handoff = pgTable("handoff", {
  id: uuid("id").primaryKey().defaultRandom(),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunity.id),
  fromRegion: text("from_region").notNull(),
  toRegion: text("to_region").notNull(),
  handedAt: timestamp("handed_at", { withTimezone: true }).notNull(),
  notes: text("notes"),
  backupOwnerId: uuid("backup_owner_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Amendment 3C — Response action items (distinct from Gap Register)
export const responseActionItem = pgTable("response_action_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunity.id),
  kind: text("kind").notNull(), // resume_request | teaming_agreement | missing_info | other
  description: text("description").notNull(),
  expectedResponseType: text("expected_response_type").default("text").notNull(),
  relatedSectionRef: text("related_section_ref"),
  assignedPartnerId: uuid("assigned_partner_id"),
  assignedInternalUserId: uuid("assigned_internal_user_id"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  status: text("status").default("open").notNull(),
  gates: text("gates").array().default([]),
  responseContent: text("response_content"),
  responseDocumentId: uuid("response_document_id"),
  resolvedByUserId: uuid("resolved_by_user_id"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  relatedGapId: uuid("related_gap_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
