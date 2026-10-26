import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { startExecution } from "../engine/execution-service.js";

const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

const webhookRoutes: FastifyPluginAsync = async (app) => {
app.post(
"/:workflowId/:webhookToken",
{
bodyLimit: MAX_WEBHOOK_BODY_BYTES,
},
async (request, reply) => {
const { workflowId, webhookToken } = request.params as {
workflowId: string;
webhookToken: string;
};

  if (
    !workflowId ||
    !webhookToken ||
    webhookToken.length < 32 ||
    webhookToken.length > 200
  ) {
    return reply.code(404).send({
      success: false,
      error: "Webhook not found.",
    });
  }

  const workflow = await prisma.workflow.findFirst({
    where: {
      id: workflowId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      workspaceId: true,
      workspace: {
        select: {
          createdById: true,
        },
      },
      definition: true,
    },
  });

  if (!workflow) {
    return reply.code(404).send({
      success: false,
      error: "Webhook not found.",
    });
  }

  const definition = workflow.definition as {
    webhookToken?: unknown;
    nodes?: Array<{ kind?: string }>;
  };

  if (
    typeof definition.webhookToken !== "string" ||
    definition.webhookToken !== webhookToken ||
    !definition.nodes?.some(
      (node) => node.kind === "webhook_trigger",
    )
  ) {
    return reply.code(404).send({
      success: false,
      error: "Webhook not found.",
    });
  }

  try {
    const result = await startExecution({
      workflowId: workflow.id,
      workspaceId: workflow.workspaceId,
      userId: workflow.workspace.createdById,
      input: {
        webhook: {
          id: randomUUID(),
          method: request.method,
          headers: {
            "content-type": request.headers["content-type"],
            "user-agent": request.headers["user-agent"],
          },
          body: request.body ?? null,
          receivedAt: new Date().toISOString(),
        },
      },
    });

    return reply.code(202).send({
      success: true,
      data: {
        executionId: result.executionId,
        status: result.status,
      },
    });
  } catch (error) {
    request.log.error(
      { err: error },
      "Webhook execution could not be queued",
    );

    return reply.code(503).send({
      success: false,
      error: "Workflow could not be queued.",
    });
  }
},

);
};

export default webhookRoutes;