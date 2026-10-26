
import type { FastifyPluginAsync } from "fastify";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  getWorkspaceAccess,
  canEditWorkspace,
  canReadWorkspace,
} from "../lib/workflow-access.js";

const createKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
});

const workspaceParamsSchema = z.object({
  workspaceId: z.string().min(1).max(128),
});

const deleteParamsSchema = workspaceParamsSchema.extend({
  keyId: z.string().min(1).max(128),
});

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

const apiKeyRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get("/:workspaceId/api-keys", async (request, reply) => {
    const user = request.authenticatedUser;

    if (!user) {
      return reply.code(401).send({
        success: false,
        error: "Authentication required.",
      });
    }

    const params = workspaceParamsSchema.safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({
        success: false,
        error: "Invalid workspace ID.",
      });
    }

    const { workspaceId } = params.data;
    const access = await getWorkspaceAccess(workspaceId, user.id);

    if (!access || !canReadWorkspace(access)) {
      return reply.code(404).send({
        success: false,
        error: "Workspace not found or access denied.",
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
    const user = request.authenticatedUser;

    if (!user) {
      return reply.code(401).send({
        success: false,
        error: "Authentication required.",
      });
    }

    const params = workspaceParamsSchema.safeParse(request.params);
    const body = createKeySchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return reply.code(400).send({
        success: false,
        error: "Invalid API key request.",
      });
    }

    const { workspaceId } = params.data;
    const access = await getWorkspaceAccess(workspaceId, user.id);

    if (!access) {
      return reply.code(404).send({
        success: false,
        error: "Workspace not found or access denied.",
      });
    }

    if (!canEditWorkspace(access)) {
      return reply.code(403).send({
        success: false,
        error: "Workspace edit permission required.",
      });
    }

    // The plaintext secret is returned only once.
    const secret = `vfl_${randomBytes(32).toString("base64url")}`;
    const prefix = secret.slice(0, 12);

    const created = await prisma.apiKey.create({
      data: {
        id: randomUUID(),
        workspaceId,
        userId: user.id,
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
      const user = request.authenticatedUser;

      if (!user) {
        return reply.code(401).send({
          success: false,
          error: "Authentication required.",
        });
      }

      const params = deleteParamsSchema.safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          success: false,
          error: "Invalid API key request.",
        });
      }

      const { workspaceId, keyId } = params.data;
      const access = await getWorkspaceAccess(workspaceId, user.id);

      if (!access) {
        return reply.code(404).send({
          success: false,
          error: "Workspace not found or access denied.",
        });
      }

      if (!canEditWorkspace(access)) {
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
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });

      return {
        success: true,
        data: { revoked: true },
      };
    },
  );
};

export default apiKeyRoutes;
