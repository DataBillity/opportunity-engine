/**
 * One workspace per tenant.
 * A new tenant is provisioned with demonstration records for Search & Discovery,
 * the pipeline, the Partner network, opportunities, capability sources, and the archive.
 */
import { pgTable, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";

export const tenant = pgTable("tenant", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sharedWorkspace = pgTable("shared_workspace", {
  id: text("id").primaryKey(),
  organizations: jsonb("organizations").notNull(),
  pursuits: jsonb("pursuits").notNull(),
  partners: jsonb("partners").notNull(),
  graph: jsonb("graph").notNull(),
  plays: jsonb("plays").notNull().default([]),
  leadImports: jsonb("lead_imports").notNull().default([]),
  discovery: jsonb("discovery").notNull().default([]),
  revision: integer("revision").default(1).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
