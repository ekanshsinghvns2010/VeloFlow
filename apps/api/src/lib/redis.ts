import IORedis from "ioredis";
import { env } from "./env.js";

export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy(attempt) {
    return Math.min(attempt * 500, 5000);
  },
});

redisConnection.on("error", (error) => {
  console.error("VeloFlow Redis connection error:", error.message);
});