import { Worker, type Job } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { redisConnection } from "../lib/redis.js";
import { startExecution } from "./execution-service.js";
import { SCHEDULE_QUEUE_NAME } from "./scheduler.js";

interface ScheduleJobData {
  workflowId: string;
}

async function processScheduledWorkflow(
  job: Job<ScheduleJobData>,
): Promise<void> {
  const workflow = await prisma.workflow.findFirst({
    where: {
      id: job.data.workflowId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      workspaceId: true,
      createdById: true,
    },
  });

  if (!workflow) return;

  await startExecution({
    workflowId: workflow.id,
    workspaceId: workflow.workspaceId,
    userId: workflow.createdById,
    input: {
      trigger: "schedule",
      scheduledAt: new Date().toISOString(),
    },
  });
}

export function createScheduleWorker() {
  const worker = new Worker<ScheduleJobData>(
    SCHEDULE_QUEUE_NAME,
    processScheduledWorkflow,
    {
      connection: redisConnection,
      concurrency: 5,
    },
  );

  worker.on("failed", (job, error) => {
    console.error(
      `Scheduled workflow failed: ${job?.data.workflowId}`,
      error.message,
    );
  });

  worker.on("error", (error) => {
    console.error("VeloFlow schedule worker error:", error);
  });

  return worker;
}