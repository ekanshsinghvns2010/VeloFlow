import { prisma } from "../lib/prisma.js";
import { redisConnection } from "../lib/redis.js";
import { createScheduleWorker } from "./schedule-worker.js";

const worker = createScheduleWorker();

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.info(`VeloFlow schedule worker stopping: ${signal}`);

  try {
    await worker.close();
    await redisConnection.quit();
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Schedule worker shutdown failed:", error);
    process.exit(1);
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

console.info("VeloFlow schedule worker started.");