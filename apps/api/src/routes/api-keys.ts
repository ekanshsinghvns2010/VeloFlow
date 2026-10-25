import type { FastifyPluginAsync } from "fastify";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  canEditWorkspace,
  canReadWorkspace,
} from "../lib/workflow-access.js";

const createKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
});

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

const apiKeyRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get("/:workspaceId/api-keys", async (request, reply) => {
    const params = z.object({
      workspaceId: z.string().min(1),
    }).safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({
        success: false,
        error: "Invalid workspace ID.",
      });
    }

    const { workspaceId } = params.data;

    if (
      !(await canReadWorkspace(
        request.authenticatedUser.id,
        workspaceId,
      ))
    ) {
      return reply.code(403).send({
        success: false,
        error: "Workspace access denied.",
      });
    }

    const keys = await prisma.apiKey.findMany({
      where: { workspaceId, revokedAt: null },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: keys };
  });

  app.post("/:workspaceId/api-keys", async (request, reply) => {
    const params = z.object({
      workspaceId: z.string().min(1),
    }).safeParse(request.params);

    const body = createKeySchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return reply.code(400).send({
        success: false,
        error: "Invalid API key request.",
      });
    }

    const { workspaceId } = params.data;

    if (
      !(await canEditWorkspace(
        request.authenticatedUser.id,
        workspaceId,
      ))
    ) {
      return reply.code(403).send({
        success: false,
        error: "Workspace edit permission required.",
      });
    }

    // The full key is returned only once.
    const secret = `vfl_${randomBytes(32).toString("base64url")}`;
    const prefix = secret.slice(0, 12);

    const created = await prisma.apiKey.create({
      data: {
        id: randomUUID(),
        workspaceId,
        name: body.data.name,
        keyPrefix: prefix,
        keyHash: hashApiKey(secret),
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        createdAt: true,
      },
    });

    return reply.code(201).send({
      success: true,
      data: {
        ...created,
        key: secret,
        warning: "Copy this key now. It cannot be displayed again.",
      },
    });
  });

  app.delete(
    "/:workspaceId/api-keys/:keyId",
    async (request, reply) => {
      const params = z.object({
        workspaceId: z.string().min(1),
        keyId: z.string().min(1),
      }).safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          success: false,
          error: "Invalid API key request.",
        });
      }

      const { workspaceId, keyId } = params.data;

      if (
        !(await canEditWorkspace(
          request.authenticatedUser.id,
          workspaceId,
        ))
      ) {
        return reply.code(403).send({
          success: false,
          error: "Workspace edit permission required.",
        });
      }

      const existing = await prisma.apiKey.findFirst({
        where: {
          id: keyId,
          workspaceId,
          revokedAt: null,
        },
        select: { id: true },
      });

      if (!existing) {
        return reply.code(404).send({
          success: false,
          error: "API key not found.",
        });
      }

      await prisma.apiKey.update({
        where: { id: keyId },
        data: { revokedAt: new Date() },
      });

      return { success: true, data: { revoked: true } };
    },
  );
};

export default apiKeyRoutes;