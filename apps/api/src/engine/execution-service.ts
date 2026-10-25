import { randomUUID } from "node:crypto";
import type { WorkflowDefinition } from "@veloflow/shared";
import { prisma } from "../lib/prisma.js";
import { runWorkflow } from "./runner.js";

export interface StartExecutionInput {
  workflowId: string;
  workspaceId: string;
  userId: string;
  input?: unknown;
}

export async function startExecution(
  input: StartExecutionInput,
) {
  const workflow = await prisma.workflow.findFirst({
    where: {
      id: input.workflowId,
      workspaceId: input.workspaceId,
      status: "ACTIVE",
    },
  });

  if (!workflow) {
    throw new Error(
      "Active workflow not found in this workspace.",
    );
  }

  const definition = workflow.definition as unknown as WorkflowDefinition;
  const executionId = randomUUID();

  const execution = await prisma.execution.create({
    data: {
      id: executionId,
      workflowId: workflow.id,
      workspaceId: workflow.workspaceId,
      triggeredById: input.userId,
      status: "RUNNING",
      input: JSON.parse(
        JSON.stringify(input.input ?? {}),
      ),
      startedAt: new Date(),
      nodeResults: [],
    },
  });

  try {
    const result = await runWorkflow(definition, {
      executionId,
      workflowId: workflow.id,
      workspaceId: workflow.workspaceId,
      userId: input.userId,
      input: input.input ?? {},
    });

    return {
      execution,
      result,
    };
  } catch (error) {
    await prisma.execution.update({
      where: { id: executionId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
    });

    throw error;
  }
}