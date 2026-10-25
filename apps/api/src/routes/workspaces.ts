
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const CreateWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(100)
});

const workspacesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (request) => {
    const user = request.authenticatedUser!;

    const memberships = await prisma.workspaceMember.findMany({
      where: {
        userId: user.id
      },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            updatedAt: true
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return {
      data: memberships.map((membership) => ({
        ...membership.workspace,
        role: membership.role.toLowerCase()
      }))
    };
  });

  app.post("/", async (request, reply) => {
    const parsed = CreateWorkspaceSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Workspace name must contain 2–100 characters."
        }
      });
    }

    const user = request.authenticatedUser!;
    const base = parsed.data.name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 36) || "workspace";

    const slug = `${base}-${crypto.randomUUID().slice(0, 8)}`;

    const workspace = await prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({
        data: {
          name: parsed.data.name,
          slug,
          createdById: user.id
        }
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: created.id,
          userId: user.id,
          role: "OWNER"
        }
      });

      await tx.auditLog.create({
        data: {
          workspaceId: created.id,
          actorId: user.id,
          action: "workspace.created",
          resource: "workspace",
          resourceId: created.id
        }
      });

      return created;
    });

    return reply.code(201).send({
      data: {
        ...workspace,
        role: "owner"
      }
    });
  });

  app.get("/:workspaceId", async (request, reply) => {
    const params = z.object({
      workspaceId: z.string().min(1).max(128)
    }).safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({
        error: {
          code: "INVALID_WORKSPACE_ID",
          message: "Invalid workspace ID."
        }
      });
    }

    const user = request.authenticatedUser!;

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: params.data.workspaceId,
          userId: user.id
        }
      },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });

    if (!membership) {
      return reply.code(404).send({
        error: {
          code: "WORKSPACE_NOT_FOUND",
          message: "Workspace not found."
        }
      });
    }

    return {
      data: {
        ...membership.workspace,
        role: membership.role.toLowerCase()
      }
    };
  });
};

export default workspacesRoutes;
