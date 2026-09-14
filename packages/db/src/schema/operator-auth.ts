/**
 * Operator sign-in credentials and one-time password reset tokens.
 * Allowlist still comes from AUTH_USERNAME; hashes live here after a reset.
 */
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const operatorCredential = pgTable("operator_credential", {
  email: text("email").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  passwordUpdatedAt: timestamp("password_updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const passwordResetToken = pgTable("password_reset_token", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
