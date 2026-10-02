/**
 * Organization tenancy.
 * Members of one organization share a workspace. Claude keys live in
 * organization_secret, encrypted by the app, never in the workspace JSON.
 */
import {
  pgTable, text, timestamp, boolean, integer, uuid, uniqueIndex, primaryKey,
} from "drizzle-orm/pg-core";

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  usesPlatformKey: boolean("uses_platform_key").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organizationMember = pgTable("organization_member", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull(),
  inviteTokenHash: text("invite_token_hash"),
  inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("organization_member_org_email_idx").on(table.organizationId, table.email),
]);

export const organizationSecret = pgTable("organization_secret", {
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  ciphertext: text("ciphertext").notNull(),
  keyVersion: integer("key_version").default(1).notNull(),
  lastFour: text("last_four").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.organizationId, table.kind] }),
]);
