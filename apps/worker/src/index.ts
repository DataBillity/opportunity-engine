/**
 * Worker entry point — Railway long-running service
 * Consumes BullMQ queues for orchestration (Layer 4)
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { logger } from "./runtime/logger";
import { QUEUE_NAMES } from "./runtime/queues";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error("REDIS_URL is required");
}

const port = Number(process.env.PORT) || 3000;

// family: 0 enables dual-stack lookup for Railway private hostnames
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  family: 0,
});

let redisReady = false;

connection.on("error", (err) => {
  redisReady = false;
  logger.error("Redis connection error", { err: err.message });
});

connection.on("ready", () => {
  redisReady = true;
  logger.info("Redis connected");
});

function healthStatus(): { ok: boolean; redis: boolean; queues: readonly string[] } {
  return { ok: redisReady, redis: redisReady, queues: QUEUE_NAMES };
}

function handleHealth(req: IncomingMessage, res: ServerResponse) {
  const path = req.url?.split("?")[0] ?? "/";
  if (req.method === "GET" && (path === "/health" || path === "/")) {
    const body = healthStatus();
    res.writeHead(body.ok ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
    return;
  }
  res.writeHead(404);
  res.end();
}

const healthServer = createServer(handleHealth);

const workers = QUEUE_NAMES.map(
  (queue) =>
    new Worker(
      queue,
      async (job) => {
        logger.info("job received", {
          queue,
          jobId: job.id,
          name: job.name,
        });
      },
      { connection, concurrency: 5 },
    ),
);

for (const worker of workers) {
  worker.on("failed", (job, err) => {
    logger.error("job failed", {
      queue: worker.name,
      jobId: job?.id,
      err: err.message,
    });
  });
}

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully...`);
  healthServer.close();
  await Promise.all(workers.map((worker) => worker.close()));
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

await connection.ping();
redisReady = true;

healthServer.listen(port, "0.0.0.0", () => {
  logger.info("Opportunity Engine Worker starting...", {
    port,
    databaseConfigured: Boolean(process.env.DATABASE_URL),
  });
  logger.info("Worker ready. Waiting for jobs...", { queues: QUEUE_NAMES });
});
