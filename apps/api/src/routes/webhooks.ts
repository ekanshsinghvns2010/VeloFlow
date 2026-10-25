import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { startExecution } from "../engine/execution-service.js";

const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

const webhookRoutes: FastifyPluginAsync = async (app) => {
  app.post("/:workflowId/:webhookToken", async (request, reply) => {
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
        createdById: true,
        definition: true,
      },
    });

    if (!workflow) {
      return reply.code(404).send({
        success: false,
        error: "Webhook not found.",
      });
    }

    /*
     * The token comparison below assumes the token is stored in the
     * workflow definition. In production, store only a hash in a
     * dedicated webhook table and compare hashes in constant time.
     */
    const definition = workflow.definition as {
      webhookToken?: unknown;
      nodes?: Array<{ kind?: string }>;
    };

    if (
      typeof definition.webhookToken !== "string" ||
      definition.webhookToken !== webhookToken ||
      !definition.nodes?.some((node) => node.kind === "webhook_trigger")
    ) {
      return reply.code(404).send({
        success: false,
        error: "Webhook not found.",
      });
    }

    const contentLength = Number(request.headers["content-length"] ?? 0);

    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_WEBHOOK_BODY_BYTES
    ) {
      return reply.code(413).send({
        success: false,
        error: "Webhook payload is too large.",
      });
    }

    try {
      const result = await startExecution({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: workflow.createdById,
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
      request.log.error({ err: error }, "Webhook execution could not be queued");

      return reply.code(503).send({
        success: false,
        error: "Workflow could not be queued.",
      });
    }
  });
};

export default webhookRoutes;