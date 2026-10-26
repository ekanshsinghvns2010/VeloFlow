
import { Prisma } from "@prisma/client";
import { Worker, type Job } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { redisConnection } from "../lib/redis.js";
import { runWorkflow } from "./runner.js";
import { registerCoreNodes } from "./nodes/index.js";
import {
  EXECUTION_QUEUE_NAME,
  type ExecutionJobData,
} from "./queue.js";
import type { WorkflowDefinition } from "@veloflow/shared";

registerCoreNodes();

async function processExecution(
  job: Job<ExecutionJobData>,
): Promise<void> {
  const {
    executionId,
    workflowId,
    workspaceId,
    userId,
    input,
  } = job.data;

  const execution = await prisma.execution.findFirst({
    where: {
      id: executionId,
      workflowId,
      workspaceId,
    },
  });

  if (!execution) {
    throw new Error(`Execution record not found: ${executionId}`);
  }

  if (execution.status === "CANCELLED") {
    return;
  }

  const workflow = await prisma.workflow.findFirst({
    where: {
      id: workflowId,
      workspaceId,
      status: "ACTIVE",
    },
  });

  if (!workflow) {
    await prisma.execution.update({
      where: { id: executionId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: { message: "Workflow is missing or no longer active." },
      },
    });

    return;
  }

  await prisma.execution.update({
    where: { id: executionId },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      error: Prisma.JsonNull,
    },
  });

  try {
    await runWorkflow(
      workflow.definition as unknown as WorkflowDefinition,
      {
        executionId,
        workflowId,
        workspaceId,
        userId,
        input,
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    await prisma.execution.update({
      where: { id: executionId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: { message },
      },
    });

    throw error;
  }
}

export function createExecutionWorker() {
  const worker = new Worker<ExecutionJobData>(
    EXECUTION_QUEUE_NAME,
    processExecution,
    {
      connection: redisConnection,
      concurrency: 5,
      limiter: {
        max: 30,
        duration: 60_000,
      },
    },
  );

  worker.on("completed", (job) => {
    console.info(`Execution job completed: ${job.id}`);
  });

  worker.on("failed", (job, error) => {
    console.error("Execution job failed:", job?.id, error.message);
  });

  worker.on("error", (error) => {
    console.error("VeloFlow execution worker error:", error);
  });

  return worker;
}
