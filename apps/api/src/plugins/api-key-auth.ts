import type { FastifyPluginAsync } from "fastify";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "../lib/prisma.js";

declare module "fastify" {
  interface FastifyRequest {
    apiKeyContext: {
      apiKeyId: string;
      workspaceId: string;
    } | null;
  }
}

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

const apiKeyAuthPlugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest("apiKeyContext", null);

  app.decorate("authenticateApiKey", async function (request, reply) {
    const header = request.headers.authorization;

    if (!header?.startsWith("Bearer ")) {
      return reply.code(401).send({
        success: false,
        error: "API key required.",
      });
    }

    const suppliedKey = header.slice(7).trim();

    if (!suppliedKey.startsWith("vfl_") || suppliedKey.length > 200) {
      return reply.code(401).send({
        success: false,
        error: "Invalid API key.",
      });
    }

    const prefix = suppliedKey.slice(0, 12);

    const candidates = await prisma.apiKey.findMany({
      where: {
        keyPrefix: prefix,
        revokedAt: null,
      },
      select: {
        id: true,
        workspaceId: true,
        keyHash: true,
      },
      take: 10,
    });

    const suppliedHash = Buffer.from(hashApiKey(suppliedKey), "hex");

    const matched = candidates.find((candidate) => {
      const storedHash = Buffer.from(candidate.keyHash, "hex");

      return (
        storedHash.length === suppliedHash.length &&
        timingSafeEqual(storedHash, suppliedHash)
      );
    });

    if (!matched) {
      return reply.code(401).send({
        success: false,
        error: "Invalid or revoked API key.",
      });
    }

    request.apiKeyContext = {
      apiKeyId: matched.id,
      workspaceId: matched.workspaceId,
    };

    await prisma.apiKey.update({
      where: { id: matched.id },
      data: { lastUsedAt: new Date() },
    });
  });
};

declare module "fastify" {
  interface FastifyInstance {
    authenticateApiKey: (
      request: import("fastify").FastifyRequest,
      reply: import("fastify").FastifyReply,
    ) => Promise<unknown>;
  }
}

export default apiKeyAuthPlugin;