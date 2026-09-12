/**
 * Cluster H — Consent, Notice, and Contact Compliance
 */
import {
  pgTable, uuid, text, timestamp, boolean,
} from "drizzle-orm/pg-core";

export const dataCollectionAsset = pgTable("data_collection_asset", {
  id: uuid("id").primaryKey().defaultRandom(),
  assetType: text("asset_type").notNull(), // form | portal | widget
  name: text("name").notNull(),
  url: text("url"),
  purpose: text("purpose"),
  lawfulBasis: text("lawful_basis"),
  retentionClass: text("retention_class"),
  owningLane: text("owning_lane"),
  noticeVersion: text("notice_version"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const consentNotice = pgTable("consent_notice", {
  id: uuid("id").primaryKey().defaultRandom(),
  assetId: uuid("asset_id").notNull().references(() => dataCollectionAsset.id),
  version: text("version").notNull(),
  textContent: text("text_content").notNull(),
  textHash: text("text_hash"),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Append-only
export const consentRecord = pgTable("consent_record", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectType: text("subject_type").notNull(),
  subjectRef: text("subject_ref").notNull(),
  noticeId: uuid("notice_id"),
  noticeVersion: text("notice_version"),
  givenAt: timestamp("given_at", { withTimezone: true }).notNull(),
  basis: text("basis"),
  source: text("source"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const suppression = pgTable("suppression", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchType: text("match_type").notNull(), // email | domain | account
  valueHash: text("value_hash").notNull(),
  reason: text("reason"),
  addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  source: text("source"),
  permanent: boolean("permanent").default(false).notNull(),
});
