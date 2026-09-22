/**
 * Shared operator workspace.
 * Pipeline leads, pursuits, partners, and the capability graph are one record
 * every signed-in operator reads. Search candidates are not stored here.
 */
import { pgTable, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";

export const sharedWorkspace = pgTable("shared_workspace", {
  id: text("id").primaryKey(),
  organizations: jsonb("organizations").notNull(),
  pursuits: jsonb("pursuits").notNull(),
  partners: jsonb("partners").notNull(),
  graph: jsonb("graph").notNull(),
  revision: integer("revision").default(1).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
