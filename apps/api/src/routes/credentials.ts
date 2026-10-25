import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { encryptCredential } from "../lib/credential-crypto.js";
import {
  canEditWorkspace,
  canReadWorkspace,
} from "../lib/workflow-access.js";

const createCredentialSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.string().trim().min(1).max(80),
  data: z.record(z.string(), z.unknown()),
});

const updateCredentialSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

const credentialRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get("/:workspaceId/credentials", async (request, reply) => {
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

    const items = await prisma.credential.findMany({
      where: { workspaceId, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: items };
  });

  app.post("/:workspaceId/credentials", async (request, reply) => {
    const params = z.object({
      workspaceId: z.string().min(1),
    }).safeParse(request.params);

    const body = createCredentialSchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return reply.code(400).send({
        success: false,
        error: "Invalid credential request.",
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

    const credential = await prisma.credential.create({
      data: {
        id: randomUUID(),
        workspaceId,
        name: body.data.name,
        type: body.data.type,
        encryptedData: encryptCredential(body.data.data),
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        createdAt: true,
      },
    });

    return reply.code(201).send({
      success: true,
      data: credential,
    });
  });

  app.patch(
    "/:workspaceId/credentials/:credentialId",
    async (request, reply) => {
      const params = z.object({
        workspaceId: z.string().min(1),
        credentialId: z.string().min(1),
      }).safeParse(request.params);

      const body = updateCredentialSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({
          success: false,
          error: "Invalid credential update.",
        });
      }

      const { workspaceId, credentialId } = params.data;

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

      const existing = await prisma.credential.findFirst({
        where: {
          id: credentialId,
          workspaceId,
          status: "ACTIVE",
        },
        select: { id: true },
      });

      if (!existing) {
        return reply.code(404).send({
          success: false,
          error: "Credential not found.",
        });
      }

      const credential = await prisma.credential.update({
        where: { id: credentialId },
        data: {
          ...(body.data.name !== undefined
            ? { name: body.data.name }
            : {}),
          ...(body.data.data !== undefined
            ? { encryptedData: encryptCredential(body.data.data) }
            : {}),
        },
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          updatedAt: true,
        },
      });

      return { success: true, data: credential };
    },
  );

  app.delete(
    "/:workspaceId/credentials/:credentialId",
    async (request, reply) => {
      const params = z.object({
        workspaceId: z.string().min(1),
        credentialId: z.string().min(1),
      }).safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          success: false,
          error: "Invalid credential request.",
        });
      }

      const { workspaceId, credentialId } = params.data;

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

      const existing = await prisma.credential.findFirst({
        where: {
          id: credentialId,
          workspaceId,
          status: "ACTIVE",
        },
        select: { id: true },
      });

      if (!existing) {
        return reply.code(404).send({
          success: false,
          error: "Credential not found.",
        });
      }

      await prisma.credential.update({
        where: { id: credentialId },
        data: { status: "REVOKED" },
      });

      return { success: true, data: { revoked: true } };
    },
  );
};

export default credentialRoutes;