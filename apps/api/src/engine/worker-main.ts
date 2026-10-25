import { prisma } from "../lib/prisma.js";
import { redisConnection } from "../lib/redis.js";
import { createExecutionWorker } from "./worker.js";

const worker = createExecutionWorker();

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.info(`VeloFlow worker shutting down: ${signal}`);

  try {
    await worker.close();
    await redisConnection.quit();
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Worker shutdown failed:", error);
    process.exit(1);
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

console.info("VeloFlow execution worker started.");