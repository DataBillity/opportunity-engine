import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

export function createSql(url = process.env.DATABASE_URL!) {
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

export function createDb(url = process.env.DATABASE_URL!) {
  const sql = createSql(url);
  return { db: drizzle(sql, { schema }), sql };
}

