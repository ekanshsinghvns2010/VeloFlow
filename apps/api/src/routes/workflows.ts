
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  WorkflowDefinitionSchema,
  validateWorkflow
} from "@veloflow/shared";
import { prisma } from "../lib/prisma.js";
import {
  getWorkspaceAccess,
  canReadWorkspace,
  canEditWorkspace,
  denyWorkspaceAccess,
  denyPermission
} from "../lib/workflow-access.js";

const IdParamsSchema = z.object({
  workspaceId: z.string().min(1).max(128),
  workflowId: z.string().min(1).max(128)
});

const WorkspaceParamsSchema = z.object({
  workspaceId: z.string().min(1).max(128)
});

const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional()
});

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(""),
  definition: WorkflowDefinitionSchema.optional()
});

const UpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  definition: WorkflowDefinitionSchema.optional()
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field must be provided." }
);

function normalizeDefinition(
  definition: z.infer<typeof WorkflowDefinitionSchema>,
  name: string,
  description: string
) {
  return validateWorkflow({
    ...definition,
    name,
    description
  });
}

const workflowsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get("/:workspaceId/workflows", async (request, reply) => {
    const params = WorkspaceParamsSchema.safeParse(request.params);
    const query = ListQuerySchema.safeParse(request.query);

    if (!params.success || !query.success) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid workspace ID or list parameters."
        }
      });
    }

    const user = request.authenticatedUser!;
    const access = await getWorkspaceAccess(
      params.data.workspaceId,
      user.id
    );

    if (!access || !canReadWorkspace(access)) {
      return denyWorkspaceAccess(reply);
    }

    const { page, limit, search, status } = query.data;

    const where = {
      workspaceId: params.data.workspaceId,
      ...(status ? { status } : {}),
      ...(search
        ? {
            name: {
              contains: search,
              mode: "insensitive" as const
            }
          }
        : {})
    };

    const [items, total] = await prisma.$transaction([
      prisma.workflow.findMany({
        where,
        orderBy: {
          updatedAt: "desc"
        },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          version: true,
          activeVersion: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.workflow.count({ where })
    ]);

    return {
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  });

  app.post("/:workspaceId/workflows", async (request, reply) => {
    const params = WorkspaceParamsSchema.safeParse(request.params);
    const body = CreateSchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid workspace ID or workflow data.",
          details: body.success ? undefined : body.error.flatten()
        }
      });
    }

    const user = request.authenticatedUser!;
    const access = await getWorkspaceAccess(
      params.data.workspaceId,
      user.id
    );

    if (!access) {
      return denyWorkspaceAccess(reply);
    }

    if (!canEditWorkspace(access)) {
      return denyPermission(reply);
    }

    const name = body.data.name;
    const description = body.data.description;

    const suppliedDefinition = body.data.definition ?? {
      name,
      description,
      nodes: [],
      connections: [],
      settings: {},
      active: false,
      version: 1
    };

    let definition;

    try {
      definition = normalizeDefinition(
        suppliedDefinition,
        name,
        description
      );
    } catch (error) {
      return reply.code(400).send({
        error: {
          code: "INVALID_WORKFLOW_DEFINITION",
          message: error instanceof Error
            ? error.message
            : "The workflow definition is invalid."
        }
      });
    }

    const workflow = await prisma.$transaction(async (tx) => {
      const created = await tx.workflow.create({
        data: {
          workspaceId: params.data.workspaceId,
          name,
          description,
          status: "DRAFT",
          definition: JSON.parse(JSON.stringify({
            ...definition,
            id: undefined
          })),
          version: 1
        }
      });

      await tx.auditLog.create({
        data: {
          workspaceId: params.data.workspaceId,
          actorId: user.id,
          action: "workflow.created",
          resource: "workflow",
          resourceId: created.id
        }
      });

      return created;
    });

    return reply.code(201).send({
      data: workflow
    });
  });

  app.get("/:workspaceId/workflows/:workflowId", async (request, reply) => {
    const params = IdParamsSchema.safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid workflow or workspace ID."
        }
      });
    }

    const user = request.authenticatedUser!;
    const access = await getWorkspaceAccess(
      params.data.workspaceId,
      user.id
    );

    if (!access || !canReadWorkspace(access)) {
      return denyWorkspaceAccess(reply);
    }

    const workflow = await prisma.workflow.findFirst({
      where: {
        id: params.data.workflowId,
        workspaceId: params.data.workspaceId
      }
    });

    if (!workflow) {
      return reply.code(404).send({
        error: {
          code: "WORKFLOW_NOT_FOUND",
          message: "Workflow not found."
        }
      });
    }

    return {
      data: workflow
    };
  });

  app.patch("/:workspaceId/workflows/:workflowId", async (request, reply) => {
    const params = IdParamsSchema.safeParse(request.params);
    const body = UpdateSchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid workflow ID or update data."
        }
      });
    }

    const user = request.authenticatedUser!;
    const access = await getWorkspaceAccess(
      params.data.workspaceId,
      user.id
    );

    if (!access) {
      return denyWorkspaceAccess(reply);
    }

    if (!canEditWorkspace(access)) {
      return denyPermission(reply);
    }

    const existing = await prisma.workflow.findFirst({
      where: {
        id: params.data.workflowId,
        workspaceId: params.data.workspaceId
      }
    });

    if (!existing) {
      return reply.code(404).send({
        error: {
          code: "WORKFLOW_NOT_FOUND",
          message: "Workflow not found."
        }
      });
    }

    const name = body.data.name ?? existing.name;
    const description = body.data.description ?? existing.description;

    let definition: unknown = existing.definition;

    if (body.data.definition) {
      try {
        definition = normalizeDefinition(
          body.data.definition,
          name,
          description
        );
      } catch (error) {
        return reply.code(400).send({
          error: {
            code: "INVALID_WORKFLOW_DEFINITION",
            message: error instanceof Error
              ? error.message
              : "The workflow definition is invalid."
          }
        });
      }
    } else if (body.data.name || body.data.description !== undefined) {
      const parsedDefinition = WorkflowDefinitionSchema.safeParse(
        existing.definition
      );

      if (!parsedDefinition.success) {
        return reply.code(409).send({
          error: {
            code: "INVALID_STORED_DEFINITION",
            message: "The stored workflow definition needs repair before editing."
          }
        });
      }

      definition = normalizeDefinition(
        parsedDefinition.data,
        name,
        description
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.workflow.update({
        where: {
          id: existing.id
        },
        data: {
          name,
          description,
          definition: JSON.parse(JSON.stringify(definition)),
          version: {
            increment: 1
          },
          ...(existing.status === "ACTIVE"
            ? { activeVersion: { increment: 1 } }
            : {})
        }
      });

      await tx.auditLog.create({
        data: {
          workspaceId: params.data.workspaceId,
          actorId: user.id,
          action: "workflow.updated",
          resource: "workflow",
          resourceId: existing.id
        }
      });

      return result;
    });

    return {
      data: updated
    };
  });

  app.post("/:workspaceId/workflows/:workflowId/activate", async (request, reply) => {
    const params = IdParamsSchema.safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid workflow ID or workspace ID."
        }
      });
    }

    const user = request.authenticatedUser!;
    const access = await getWorkspaceAccess(
      params.data.workspaceId,
      user.id
    );

    if (!access) {
      return denyWorkspaceAccess(reply);
    }

    if (!canEditWorkspace(access)) {
      return denyPermission(reply);
    }

    const existing = await prisma.workflow.findFirst({
      where: {
        id: params.data.workflowId,
        workspaceId: params.data.workspaceId
      }
    });

    if (!existing) {
      return reply.code(404).send({
        error: {
          code: "WORKFLOW_NOT_FOUND",
          message: "Workflow not found."
        }
      });
    }

    const parsedDefinition = WorkflowDefinitionSchema.safeParse(
      existing.definition
    );

    if (!parsedDefinition.success) {
      return reply.code(400).send({
        error: {
          code: "INVALID_WORKFLOW_DEFINITION",
          message: "The saved workflow definition is invalid."
        }
      });
    }

    try {
      validateWorkflow(parsedDefinition.data);
    } catch (error) {
      return reply.code(400).send({
        error: {
          code: "INVALID_WORKFLOW_DEFINITION",
          message: error instanceof Error
            ? error.message
            : "The workflow definition is invalid."
        }
      });
    }

    if (parsedDefinition.data.nodes.length === 0) {
      return reply.code(400).send({
        error: {
          code: "EMPTY_WORKFLOW",
          message: "Add at least one node before activating a workflow."
        }
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.workflow.update({
        where: {
          id: existing.id
        },
        data: {
          status: "ACTIVE",
          activeVersion: existing.version
        }
      });

      await tx.auditLog.create({
        data: {
          workspaceId: params.data.workspaceId,
          actorId: user.id,
          action: "workflow.activated",
          resource: "workflow",
          resourceId: existing.id
        }
      });

      return result;
    });

    return {
      data: updated
    };
  });

  app.post("/:workspaceId/workflows/:workflowId/deactivate", async (request, reply) => {
    const params = IdParamsSchema.safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid workflow ID or workspace ID."
        }
      });
    }

    const user = request.authenticatedUser!;
    const access = await getWorkspaceAccess(
      params.data.workspaceId,
      user.id
    );

    if (!access) {
      return denyWorkspaceAccess(reply);
    }

    if (!canEditWorkspace(access)) {
      return denyPermission(reply);
    }

    const existing = await prisma.workflow.findFirst({
      where: {
        id: params.data.workflowId,
        workspaceId: params.data.workspaceId
      }
    });

    if (!existing) {
      return reply.code(404).send({
        error: {
          code: "WORKFLOW_NOT_FOUND",
          message: "Workflow not found."
        }
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.workflow.update({
        where: {
          id: existing.id
        },
        data: {
          status: "DRAFT",
          activeVersion: null
        }
      });

      await tx.auditLog.create({
        data: {
          workspaceId: params.data.workspaceId,
          actorId: user.id,
          action: "workflow.deactivated",
          resource: "workflow",
          resourceId: existing.id
        }
      });

      return result;
    });

    return {
      data: updated
    };
  });

  app.delete("/:workspaceId/workflows/:workflowId", async (request, reply) => {
    const params = IdParamsSchema.safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid workflow ID or workspace ID."
        }
      });
    }

    const user = request.authenticatedUser!;
    const access = await getWorkspaceAccess(
      params.data.workspaceId,
      user.id
    );

    if (!access) {
      return denyWorkspaceAccess(reply);
    }

    if (!canEditWorkspace(access)) {
      return denyPermission(reply);
    }

    const existing = await prisma.workflow.findFirst({
      where: {
        id: params.data.workflowId,
        workspaceId: params.data.workspaceId
      }
    });

    if (!existing) {
      return reply.code(404).send({
        error: {
          code: "WORKFLOW_NOT_FOUND",
          message: "Workflow not found."
        }
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          workspaceId: params.data.workspaceId,
          actorId: user.id,
          action: "workflow.deleted",
          resource: "workflow",
          resourceId: existing.id,
          metadata: {
            name: existing.name
          }
        }
      });

      await tx.workflow.delete({
        where: {
          id: existing.id
        }
      });
    });

    return reply.code(204).send();
  });
};

export default workflowsRoutes;
