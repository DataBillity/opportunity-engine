/**
 * Cluster D — Partners (Lane D)
 * partner is NEVER merged into account (PFIT-01)
 */
import {
  pgTable, uuid, text, timestamp, jsonb, boolean, integer,
} from "drizzle-orm/pg-core";
import { account, classificationEnum, retentionClassEnum } from "./cluster-a-identity";

export const partner = pgTable("partner", {
  id: uuid("id").primaryKey().defaultRandom(),
  legalEntityName: text("legal_entity_name").notNull(),
  country: text("country"),
  isIndividualOrOwnerOperated: boolean("is_individual_or_owner_operated").default(false).notNull(),
  tier: text("tier"), // Manually set, not scored (Amendment 3)
  tierApprovedBy: uuid("tier_approved_by"),
  status: text("status").default("active").notNull(),
  website: text("website"),
  repo: text("repo"),
  primaryContact: text("primary_contact"),
  classification: classificationEnum("classification").default("internal").notNull(),
  retentionClass: retentionClassEnum("retention_class").default("standard").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const partnerAccountLink = pgTable("partner_account_link", {
  id: uuid("id").primaryKey().defaultRandom(),
  partnerId: uuid("partner_id").notNull().references(() => partner.id),
  accountId: uuid("account_id").notNull().references(() => account.id),
  linkReason: text("link_reason"),
  conflictReviewStatus: text("conflict_review_status"),
  reviewedBy: uuid("reviewed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const partnerObligation = pgTable("partner_obligation", {
  id: uuid("id").primaryKey().defaultRandom(),
  partnerId: uuid("partner_id").notNull().references(() => partner.id),
  obligationType: text("obligation_type").notNull(), // agreement, insurance, certification, attestation
  reference: text("reference"),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const partnerUser = pgTable("partner_user", {
  id: uuid("id").primaryKey().defaultRandom(),
  partnerId: uuid("partner_id").notNull().references(() => partner.id),
  email: text("email").notNull(),
  accessScope: text("access_scope").default("task_only").notNull(), // task_only | self_service_roster
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
