
import { Redis } from "ioredis";
import { env } from "./env.js";

export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy: (attempt: number): number =>
    Math.min(attempt * 500, 5000),
});

redisConnection.on("error", (error: Error) => {
  console.error(
    "VeloFlow Redis connection error:",
    error.message,
  );
});
