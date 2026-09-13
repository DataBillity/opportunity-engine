import { resolve } from "path";
import { runLinkedInIngest } from "./jobs/linkedin-ingest";
import { logger } from "./runtime/logger";

const csvPath =
  process.argv[2] ??
  resolve(
    process.env.USERPROFILE ?? "",
    ".cursor/projects/c-Users-Lenovo-opportunity-engine/attachments/f97d5d2b-5aa7-4b50-92d2-76f10522aec3/Connections.csv",
  );

const databaseUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

logger.info("Starting LinkedIn Connections ETL", { csvPath });

const report = await runLinkedInIngest({ csvPath, databaseUrl });
console.log(JSON.stringify(report, null, 2));
