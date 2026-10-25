import { Queue } from "bullmq";
import { redisConnection } from "../lib/redis.js";

export const EXECUTION_QUEUE_NAME = "veloflow-executions";

export interface ExecutionJobData {
  executionId: string;
  workflowId: string;
  workspaceId: string;
  userId: string;
  input: unknown;
}

export const executionQueue = new Queue<ExecutionJobData>(
  EXECUTION_QUEUE_NAME,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: {
        age: 60 * 60 * 24,
        count: 1000,
      },
      removeOnFail: {
        age: 60 * 60 * 24 * 7,
        count: 5000,
      },
    },
  },
);

export async function enqueueExecution(
  data: ExecutionJobData,
): Promise<string> {
  const job = await executionQueue.add("run-workflow", data, {
    jobId: data.executionId,
  });

  if (!job.id) {
    throw new Error("Could not create execution job.");
  }

  return job.id;
}