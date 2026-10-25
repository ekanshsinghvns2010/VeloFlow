import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  canReadWorkspace,
  canEditWorkspace,
} from "../lib/workflow-access.js";
import { startExecution } from "../engine/execution-service.js";

const executeSchema = z.object({
  input: z.unknown().optional(),
});

const executionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.post(
    "/:workspaceId/workflows/:workflowId/execute",
    async (request, reply) => {
      const params = z.object({
        workspaceId: z.string().min(1),
        workflowId: z.string().min(1),
      }).safeParse(request.params);

      const body = executeSchema.safeParse(request.body ?? {});

      if (!params.success || !body.success) {
        return reply.code(400).send({
          success: false,
          error: "Invalid execution request.",
        });
      }

      const { workspaceId, workflowId } = params.data;
      const userId = request.authenticatedUser.id;

      if (!(await canEditWorkspace(userId, workspaceId))) {
        return reply.code(403).send({
          success: false,
          error: "You do not have permission to execute workflows.",
        });
      }

      try {
        const result = await startExecution({
          workflowId,
          workspaceId,
          userId,
          input: body.data.input ?? {},
        });

        return reply.code(200).send({
          success: true,
          data: result,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Execution failed.";

        request.log.error({ err: error }, "Workflow execution failed");

        return reply.code(400).send({
          success: false,
          error: message,
        });
      }
    },
  );

  app.get(
    "/:workspaceId/executions",
    async (request, reply) => {
      const params = z.object({
        workspaceId: z.string().min(1),
      }).safeParse(request.params);

      const query = z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        workflowId: z.string().optional(),
      }).safeParse(request.query);

      if (!params.success || !query.success) {
        return reply.code(400).send({
          success: false,
          error: "Invalid execution query.",
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

      const where = {
        workspaceId,
        ...(query.data.workflowId
          ? { workflowId: query.data.workflowId }
          : {}),
      };

      const [items, total] = await Promise.all([
        prisma.execution.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (query.data.page - 1) * query.data.limit,
          take: query.data.limit,
          select: {
            id: true,
            workflowId: true,
            status: true,
            createdAt: true,
            startedAt: true,
            finishedAt: true,
            durationMs: true,
            error: true,
          },
        }),
        prisma.execution.count({ where }),
      ]);

      return {
        success: true,
        data: {
          items,
          page: query.data.page,
          limit: query.data.limit,
          total,
          pages: Math.ceil(total / query.data.limit),
        },
      };
    },
  );

  app.get(
    "/:workspaceId/executions/:executionId",
    async (request, reply) => {
      const params = z.object({
        workspaceId: z.string().min(1),
        executionId: z.string().min(1),
      }).safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          success: false,
          error: "Invalid execution ID.",
        });
      }

      const { workspaceId, executionId } = params.data;

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

      const execution = await prisma.execution.findFirst({
        where: {
          id: executionId,
          workspaceId,
        },
      });

      if (!execution) {
        return reply.code(404).send({
          success: false,
          error: "Execution not found.",
        });
      }

      return {
        success: true,
        data: execution,
      };
    },
  );
};

export default executionRoutes;