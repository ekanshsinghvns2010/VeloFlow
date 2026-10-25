
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import jwt from "@fastify/jwt";
import { randomUUID } from "node:crypto";
import { env, corsOrigins } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    redact: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-api-key']",
      "password",
      "passwordHash",
      "encryptedData",
      "token",
      "secret"
    ]
  },
  genReqId: () => randomUUID(),
  requestIdHeader: "x-request-id",
  trustProxy: env.NODE_ENV === "production",
  bodyLimit: 1024 * 1024
});

async function start(): Promise<void> {
  await app.register(helmet);

  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by CORS"), false);
    }
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again shortly."
      }
    })
  });

  await app.register(sensible);

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: "15m"
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    reply.header("x-content-type-options", "nosniff");
    reply.header("cache-control", "no-store");
    return payload;
  });

  app.get("/", async () => ({
    name: "VeloFlow API",
    description: "Workflow automation platform API",
    version: "1.0.0",
    status: "online",
    health: "/health",
    api: "/api/v1"
  }));

  app.get("/health", async (_request, reply) => {
    let database: "connected" | "disconnected" = "disconnected";

    try {
      await prisma.$queryRaw`SELECT 1`;
      database = "connected";
    } catch {
      database = "disconnected";
    }

    const healthy = database === "connected";

    return reply
      .code(healthy ? 200 : 503)
      .send({
        status: healthy ? "ok" : "degraded",
        service: "veloflow-api",
        timestamp: new Date().toISOString(),
        checks: {
          database
        }
      });
  });

  app.get("/api/v1/health", async () => ({
    data: {
      status: "ok",
      service: "veloflow-api",
      version: "1.0.0",
      timestamp: new Date().toISOString()
    },
    requestId: randomUUID()
  }));

  app.setNotFoundHandler(async (request, reply) => {
    return reply.code(404).send({
      error: {
        code: "NOT_FOUND",
        message: "The requested API endpoint was not found.",
        requestId: request.id
      }
    });
  });

  app.setErrorHandler(async (error, request, reply) => {
    request.log.error({
      err: error,
      requestId: request.id
    }, "Request failed");

    const statusCode =
      error.statusCode && error.statusCode >= 400 && error.statusCode < 600
        ? error.statusCode
        : 500;

    return reply.code(statusCode).send({
      error: {
        code: statusCode >= 500
          ? "INTERNAL_SERVER_ERROR"
          : "REQUEST_ERROR",
        message: statusCode >= 500
          ? "An unexpected server error occurred."
          : error.message,
        requestId: request.id
      }
    });
  });

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "Shutting down VeloFlow API");

    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, "Graceful shutdown failed");
      process.exit(1);
    }
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  await app.listen({
    port: env.PORT,
    host: env.HOST
  });
}

start().catch((error: unknown) => {
  app.log.fatal({ err: error }, "Failed to start VeloFlow API");
  process.exit(1);
});
