/**
 * Worker entry point — Railway long-running service
 * Consumes BullMQ queues for orchestration (Layer 4)
 */
import { logger } from "./runtime/logger";

logger.info("Opportunity Engine Worker starting...");
logger.info("Queues: discovery, enrichment, scoring, intake, triage, drafting, deadlines, partners, rd, retention, health");

// Queue consumers are registered in the job modules
// The worker runs as a long-running process on Railway
// Idempotency is in Postgres, not Redis (SOW-08, NFR-REL-01)

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully...");
  process.exit(0);
});

logger.info("Worker ready. Waiting for jobs...");
