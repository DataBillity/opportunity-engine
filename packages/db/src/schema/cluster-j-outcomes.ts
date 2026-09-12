/**
 * Cluster J — Outcomes and Learning (Module LRN)
 */
import {
  pgTable, uuid, text, timestamp, jsonb, boolean, integer, numeric,
} from "drizzle-orm/pg-core";
import { opportunity, classificationEnum, retentionClassEnum } from "./cluster-a-identity";
import { decision } from "./cluster-g-governance";

// Append-only — re-scores are appended, never overwritten (SCORE-08)
export const scoreRun = pgTable("score_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectType: text("subject_type").notNull(), // lead | account
  subjectId: uuid("subject_id").notNull(),
  decisionId: uuid("decision_id"),
  total: integer("total").notNull(),
  capabilityAlignment: integer("capability_alignment"), // 40
  intentTiming: integer("intent_timing"), // 35
  accountValueFit: integer("account_value_fit"), // 25
  inboundIntentUplift: integer("inbound_intent_uplift"),
  weightsVersion: text("weights_version"),
  graphVersion: text("graph_version"),
  modelVersion: text("model_version"),
  promptVersion: text("prompt_version"),
  evidenceRefs: jsonb("evidence_refs"),
  runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const scoreOverride = pgTable("score_override", {
  id: uuid("id").primaryKey().defaultRandom(),
  scoreRunId: uuid("score_run_id").notNull().references(() => scoreRun.id),
  overriddenBy: uuid("overridden_by").notNull(),
  newValue: integer("new_value").notNull(),
  qualitativeNote: text("qualitative_note"),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Append-only
export const outcome = pgTable("outcome", {
  id: uuid("id").primaryKey().defaultRandom(),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunity.id),
  result: text("result").notNull(), // won | lost | withdrawn
  finalPrice: text("final_price"),
  competitors: text("competitors"),
  partnerContribution: jsonb("partner_contribution"),
  reasonCodes: text("reason_codes").array().default([]),
  proposedNodeIds: text("proposed_node_ids").array().default([]),
  closedAt: timestamp("closed_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const weightsVersion = pgTable("weights_version", {
  id: uuid("id").primaryKey().defaultRandom(),
  modelKey: text("model_key").notNull(),
  version: text("version").notNull(),
  weights: jsonb("weights").notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  changedBy: uuid("changed_by"),
  rationale: text("rationale"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const draftEditDelta = pgTable("draft_edit_delta", {
  id: uuid("id").primaryKey().defaultRandom(),
  draftRef: uuid("draft_ref").notNull(),
  draftKind: text("draft_kind").notNull(), // outreach | proposal_section
  disposition: text("disposition").notNull(), // sent_as_drafted | edited | discarded
  editDistance: integer("edit_distance"),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
