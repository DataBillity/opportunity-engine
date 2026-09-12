/**
 * Cluster B — Capability and Experience Graph (PRD §4.1)
 * One table, four types, discriminated. The spine of the platform.
 */
import {
  pgTable, uuid, text, timestamp, jsonb, boolean, integer, pgEnum,
} from "drizzle-orm/pg-core";
import { classificationEnum, retentionClassEnum } from "./cluster-a-identity";

export const nodeTypeEnum = pgEnum("node_type", [
  "capability", "experience", "credential", "person",
]);

export const ownershipEnum = pgEnum("ownership", ["consortium", "partner"]);

export const edgeTypeEnum = pgEnum("edge_type", [
  "delivered_by", "used_capability", "holds_credential",
  "worked_with", "covers_gap", "qualifies_for",
]);

export const graphNode = pgTable("graph_node", {
  id: uuid("id").primaryKey().defaultRandom(),
  nodeType: nodeTypeEnum("node_type").notNull(),
  label: text("label").notNull(),
  attributes: jsonb("attributes"),
  ownership: ownershipEnum("ownership").notNull(),
  owningMemberId: uuid("owning_member_id"),
  owningPartnerId: uuid("owning_partner_id"),
  maturity: text("maturity"),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validTo: timestamp("valid_to", { withTimezone: true }),
  classification: classificationEnum("classification").default("internal").notNull(),
  retentionClass: retentionClassEnum("retention_class").default("standard").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const graphEdge = pgTable("graph_edge", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromNodeId: uuid("from_node_id").notNull().references(() => graphNode.id),
  toNodeId: uuid("to_node_id").notNull().references(() => graphNode.id),
  edgeType: edgeTypeEnum("edge_type").notNull(),
  attributes: jsonb("attributes"),
  evidenceRef: text("evidence_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const nodeEvidence = pgTable("node_evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  nodeId: uuid("node_id").notNull().references(() => graphNode.id),
  documentId: uuid("document_id"),
  excerpt: text("excerpt"),
  extractedByDecisionId: uuid("extracted_by_decision_id"),
  approvedByUserId: uuid("approved_by_user_id"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const nodeVersion = pgTable("node_version", {
  id: uuid("id").primaryKey().defaultRandom(),
  nodeId: uuid("node_id").notNull().references(() => graphNode.id),
  versionNo: integer("version_no").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  changedBy: text("changed_by"),
  changeReason: text("change_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const graphSnapshot = pgTable("graph_snapshot", {
  id: uuid("id").primaryKey().defaultRandom(),
  graphVersion: text("graph_version").notNull().unique(),
  takenAt: timestamp("taken_at", { withTimezone: true }).defaultNow().notNull(),
  nodeCount: integer("node_count").notNull(),
  contentHash: text("content_hash").notNull(),
});

export const personNotice = pgTable("person_notice", {
  id: uuid("id").primaryKey().defaultRandom(),
  personNodeId: uuid("person_node_id").notNull().references(() => graphNode.id),
  noticeVersion: text("notice_version").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  channel: text("channel"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
