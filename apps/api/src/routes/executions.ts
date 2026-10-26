import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
getWorkspaceAccess,
canReadWorkspace,
canEditWorkspace,
} from "../lib/workflow-access.js";
import { startExecution } from "../engine/execution-service.js";

const executeSchema = z.object({
input: z.unknown().optional(),
});

const workspaceParamsSchema = z.object({
workspaceId: z.string().min(1).max(128),
});

const workflowParamsSchema = workspaceParamsSchema.extend({
workflowId: z.string().min(1).max(128),
});

const executionParamsSchema = workspaceParamsSchema.extend({
executionId: z.string().min(1).max(128),
});

const listQuerySchema = z.object({
page: z.coerce.number().int().min(1).default(1),
limit: z.coerce.number().int().min(1).max(100).default(20),
workflowId: z.string().min(1).max(128).optional(),
});

const executionRoutes: FastifyPluginAsync = async (app) => {
app.addHook("preHandler", app.authenticate);

app.post(
"/:workspaceId/workflows/:workflowId/execute",
async (request, reply) => {
const params = workflowParamsSchema.safeParse(request.params);
const body = executeSchema.safeParse(request.body ?? {});

  if (!params.success || !body.success) {
    return reply.code(400).send({
      success: false,
      error: "Invalid execution request.",
    });
  }

  const { workspaceId, workflowId } = params.data;
  const userId = request.authenticatedUser!.id;

  const access = await getWorkspaceAccess(
    workspaceId,
    userId,
  );

  if (!access || !canEditWorkspace(access)) {
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

    return reply.code(202).send({
      success: true,
      data: result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Execution could not be queued.";

    request.log.error(
      { err: error },
      "Workflow execution could not be queued",
    );

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
const params = workspaceParamsSchema.safeParse(request.params);
const query = listQuerySchema.safeParse(request.query);

  if (!params.success || !query.success) {
    return reply.code(400).send({
      success: false,
      error: "Invalid execution query.",
    });
  }

  const { workspaceId } = params.data;
  const userId = request.authenticatedUser!.id;

  const access = await getWorkspaceAccess(
    workspaceId,
    userId,
  );

  if (!access || !canReadWorkspace(access)) {
    return reply.code(404).send({
      success: false,
      error: "Workspace not found or access denied.",
    });
  }

  const { page, limit, workflowId } = query.data;

  const where = {
    workspaceId,
    ...(workflowId ? { workflowId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.execution.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        workflowId: true,
        status: true,
        mode: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
        durationMs: true,
        error: true,
      },
    }),
    prisma.execution.count({
      where,
    }),
  ]);

  return {
    success: true,
    data: {
      items,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
},

);

app.get(
"/:workspaceId/executions/:executionId",
async (request, reply) => {
const params = executionParamsSchema.safeParse(request.params);

  if (!params.success) {
    return reply.code(400).send({
      success: false,
      error: "Invalid execution ID.",
    });
  }

  const { workspaceId, executionId } = params.data;
  const userId = request.authenticatedUser!.id;

  const access = await getWorkspaceAccess(
    workspaceId,
    userId,
  );

  if (!access || !canReadWorkspace(access)) {
    return reply.code(404).send({
      success: false,
      error: "Workspace not found or access denied.",
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