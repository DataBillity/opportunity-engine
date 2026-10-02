/**
 * One workspace row per organization.
 * The id matches organization.id. Demonstration JSON is a private copy on that row,
 * not a shared tenant record.
 */
import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";

export const sharedWorkspace = pgTable("shared_workspace", {
  id: text("id").primaryKey(),
  organizations: jsonb("organizations").notNull(),
  pursuits: jsonb("pursuits").notNull(),
  partners: jsonb("partners").notNull(),
  graph: jsonb("graph").notNull(),
  plays: jsonb("plays").notNull().default(sql`'[]'::jsonb`),
  leadImports: jsonb("lead_imports").notNull().default(sql`'[]'::jsonb`),
  discovery: jsonb("discovery").notNull().default(sql`'[]'::jsonb`),
  revision: integer("revision").default(1).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
