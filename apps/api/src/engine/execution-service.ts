import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { enqueueExecution } from "./queue.js";

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
select: {
id: true,
workspaceId: true,
},
});

if (!workflow) {
throw new Error(
"Active workflow not found in this workspace.",
);
}

const executionId = randomUUID();

await prisma.execution.create({
data: {
id: executionId,
workflowId: workflow.id,
workspaceId: workflow.workspaceId,
startedById: input.userId,
status: "QUEUED",
input: JSON.parse(
JSON.stringify(input.input ?? {}),
),
nodeResults: [],
},
});

try {
await enqueueExecution({
executionId,
workflowId: workflow.id,
workspaceId: workflow.workspaceId,
userId: input.userId,
input: input.input ?? {},
});
} catch (error) {
await prisma.execution.update({
where: {
id: executionId,
},
data: {
status: "FAILED",
finishedAt: new Date(),
error: JSON.stringify({
message: "Could not queue workflow execution.",
}),
},
});

throw error;

}

return {
executionId,
status: "QUEUED" as const,
};
}