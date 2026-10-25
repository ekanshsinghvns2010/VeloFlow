import { Queue } from "bullmq";
import { redisConnection } from "../lib/redis.js";

export const SCHEDULE_QUEUE_NAME = "veloflow-schedules";

export const scheduleQueue = new Queue(SCHEDULE_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: { age: 604800, count: 5000 },
  },
});

export async function registerWorkflowSchedule(
  workflowId: string,
  cronExpression: string,
): Promise<void> {
  const jobId = `schedule-${workflowId}`;

  await scheduleQueue.removeRepeatableByKey(
    (await scheduleQueue.getRepeatableJobs()).find(
      (job) => job.id === jobId,
    )?.key ?? "",
  ).catch(() => undefined);

  await scheduleQueue.add(
    "scheduled-workflow",
    { workflowId },
    {
      jobId,
      repeat: { pattern: cronExpression },
    },
  );
}

export async function removeWorkflowSchedule(
  workflowId: string,
): Promise<void> {
  const prefix = `schedule-${workflowId}`;

  const jobs = await scheduleQueue.getRepeatableJobs();

  for (const job of jobs) {
    if (job.id === prefix) {
      await scheduleQueue.removeRepeatableByKey(job.key);
    }
  }
}