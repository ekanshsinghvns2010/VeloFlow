import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import jwt from "@fastify/jwt";
import { env } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";
import { registerAuthentication } from "./plugins/authenticate.js";
import authRoutes from "./routes/auth.js";
import workspaceRoutes from "./routes/workspaces.js";
import workflowRoutes from "./routes/workflows.js";
import executionRoutes from "./routes/executions.js";
import { registerCoreNodes } from "./engine/nodes/index.js";

async function buildServer() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
    trustProxy: env.NODE_ENV === "production",
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(helmet);

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || env.CORS_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Origin not allowed by CORS"), false);
      }
    },
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  await app.register(sensible);

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: "15m",
    },
  });

  registerAuthentication(app);
  registerCoreNodes();

  app.get("/health", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;

      return {
        success: true,
        status: "healthy",
        database: "connected",
      };
    } catch {
      return reply.code(503).send({
        success: false,
        status: "unhealthy",
        database: "disconnected",
      });
    }
  });

  await app.register(authRoutes, {
    prefix: "/api/auth",
  });

  await app.register(workspaceRoutes, {
    prefix: "/api/workspaces",
  });

  await app.register(workflowRoutes, {
    prefix: "/api",
  });

  await app.register(executionRoutes, {
    prefix: "/api/workspaces",
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "Request failed");

    if (reply.sent) return;

    const statusCode =
      error.statusCode && error.statusCode >= 400
        ? error.statusCode
        : 500;

    reply.code(statusCode).send({
      success: false,
      error:
        statusCode >= 500
          ? "An internal server error occurred."
          : error.message,
    });
  });

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}

async function main() {
  const app = await buildServer();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down VeloFlow API");

    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, "Shutdown failed");
      process.exit(1);
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });
  } catch (error) {
    app.log.error({ err: error }, "API startup failed");
    await app.close();
    process.exit(1);
  }
}

void main();