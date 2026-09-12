/**
 * Cluster C — Capability Gap Register (PRD §4.3)
 */
import {
  pgTable, uuid, text, timestamp, integer, pgEnum,
} from "drizzle-orm/pg-core";
import { classificationEnum, retentionClassEnum } from "./cluster-a-identity";

export const gapCriticalityEnum = pgEnum("gap_criticality", [
  "pass_fail", "scored_preference", "nice_to_have",
]);

export const gapClosureRouteEnum = pgEnum("gap_closure_route", [
  "partner", "hire", "certify", "decline_to_compete",
]);

export const gap = pgTable("gap", {
  id: uuid("id").primaryKey().defaultRandom(),
  description: text("description").notNull(),
  normalizedKey: text("normalized_key").notNull(),
  criticality: gapCriticalityEnum("criticality").notNull(),
  demandFrequency: integer("demand_frequency").default(0).notNull(),
  revenueExposure: text("revenue_exposure"),
  closureDifficulty: text("closure_difficulty"),
  closureRoute: gapClosureRouteEnum("closure_route"),
  status: text("status").default("open").notNull(),
  classification: classificationEnum("classification").default("internal").notNull(),
  retentionClass: retentionClassEnum("retention_class").default("standard").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const gapEvidence = pgTable("gap_evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  gapId: uuid("gap_id").notNull().references(() => gap.id),
  sourceType: text("source_type").notNull(), // unmapped_requirement | no_go | loss_reason | capability_decline
  sourceRef: text("source_ref"),
  clientOrAgency: text("client_or_agency"),
  evaluationWeight: text("evaluation_weight"),
  observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const gapCoverage = pgTable("gap_coverage", {
  id: uuid("id").primaryKey().defaultRandom(),
  gapId: uuid("gap_id").notNull().references(() => gap.id),
  partnerId: uuid("partner_id").notNull(),
  tierAtAssessment: text("tier_at_assessment"),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
