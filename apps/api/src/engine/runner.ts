
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { WorkflowDefinition } from "@veloflow/shared";
import { prisma } from "../lib/prisma.js";
import { buildWorkflowPlan } from "./graph.js";
import { nodeRegistry } from "./registry.js";
import { registerCoreNodes } from "./nodes/index.js";
import type {
  EngineNode,
  EngineNodeResult,
  EngineRunOptions,
  ExecutionContext,
  NodeRunRecord,
} from "./types.js";

const MAX_NODES_PER_RUN = 200;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

export interface EngineRunResult {
  executionId: string;
  status: "SUCCEEDED" | "FAILED" | "CANCELLED";
  output: unknown;
  error?: string;
  nodeResults: NodeRunRecord[];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

function serializeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function outputSize(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? "null", "utf8");
  } catch {
    return MAX_OUTPUT_BYTES + 1;
  }
}

function selectConnections(
  node: EngineNode,
  connections: Array<{
    sourceNodeId: string;
    targetNodeId: string;
    sourceOutput?: string | null;
  }>,
  result: EngineNodeResult,
) {
  const outgoing = connections.filter(
    (connection) => connection.sourceNodeId === node.id,
  );

  if (node.type === "condition") {
    const output = result.output as
      | { branch?: string }
      | undefined;

    const branch = output?.branch;

    return outgoing.filter((connection) => {
      const handle = connection.sourceOutput;
      if (!handle) return branch === "true";
      return handle === branch;
    });
  }

  if (node.type === "switch") {
    const output = result.output as
      | { branch?: string }
      | undefined;

    const branch = output?.branch ?? "default";

    return outgoing.filter((connection) => {
      const handle = connection.sourceOutput;
      if (!handle) return branch === "default";
      return handle === branch;
    });
  }

  return outgoing;
}

function toPrismaJson(value: unknown) {
  if (value === undefined || value === null) {
    return Prisma.JsonNull;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function runWorkflow(
  definition: WorkflowDefinition,
  options: EngineRunOptions,
): Promise<EngineRunResult> {
  registerCoreNodes();

  const plan = buildWorkflowPlan(definition);

  if (plan.executionOrder.length > MAX_NODES_PER_RUN) {
    throw new Error(
      `Workflow exceeds the ${MAX_NODES_PER_RUN}-node execution limit.`,
    );
  }

  const startedAt = new Date();
  const startedClock = Date.now();
  const nodeResults: NodeRunRecord[] = [];
  const outputs = new Map<string, unknown>();
  const failedNodes = new Set<string>();

  const executionContext: ExecutionContext = {
    executionId: options.executionId,
    workflowId: options.workflowId,
    workspaceId: options.workspaceId,
    userId: options.userId,
    input: options.input ?? {},
    variables: {},
    credentials: options.credentials ?? {},
    signal: options.signal,
  };

  let status: EngineRunResult["status"] = "SUCCEEDED";
  let finalOutput: unknown = options.input ?? {};
  let failureMessage: string | undefined;

  const incomingIds = new Set<string>();

  for (const connections of plan.incomingById.values()) {
    for (const connection of connections) {
      incomingIds.add(connection.targetNodeId);
    }
  }

  const startNodes = plan.definition.nodes.filter(
    (node) => !incomingIds.has(node.id),
  );

  if (startNodes.length === 0 && plan.definition.nodes.length > 0) {
    throw new Error("Workflow has no starting node.");
  }

  const activeNodeIds = new Set(startNodes.map((node) => node.id));

  try {
    for (const nodeId of plan.executionOrder) {
      if (options.signal?.aborted) {
        status = "CANCELLED";
        failureMessage = "Execution cancelled.";
        break;
      }

      const node = plan.nodesById.get(nodeId);

      if (!node) {
        throw new Error(`Workflow node not found: ${nodeId}`);
      }

      if (!activeNodeIds.has(nodeId)) {
        nodeResults.push({
          nodeId,
          nodeName: node.name,
          status: "skipped",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        });
        continue;
      }

      const incomingConnections =
        plan.incomingById.get(nodeId) ?? [];

      const incomingValues = incomingConnections
        .filter((connection) => outputs.has(connection.sourceNodeId))
        .map((connection) => outputs.get(connection.sourceNodeId));

      const nodeInput =
        incomingValues.length === 0
          ? executionContext.input
          : incomingValues.length === 1
            ? incomingValues[0]
            : incomingValues;

      const handler = nodeRegistry.require(node.type);
      const nodeStartedAt = new Date();

      const record: NodeRunRecord = {
        nodeId,
        nodeName: node.name,
        status: "running",
        startedAt: nodeStartedAt.toISOString(),
        input: nodeInput,
      };

      nodeResults.push(record);

      try {
        const result = await handler.execute({
          execution: executionContext,
          node,
          incoming: incomingValues,
          input: nodeInput,
        });

        if (!result.success) {
          throw new Error(result.error ?? "Node execution failed.");
        }

        if (outputSize(result.output) > MAX_OUTPUT_BYTES) {
          throw new Error("Node output exceeds the 2 MB limit.");
        }

        outputs.set(nodeId, result.output);
        finalOutput = result.output;

        record.status = "succeeded";
        record.output = result.output;
        record.finishedAt = new Date().toISOString();
        record.durationMs = Date.now() - nodeStartedAt.getTime();

        const selectedConnections = selectConnections(
          node,
          plan.definition.connections,
          result,
        );

        for (const connection of selectedConnections) {
          activeNodeIds.add(connection.targetNodeId);
        }
      } catch (error) {
        record.status = "failed";
        record.error = serializeError(error);
        record.finishedAt = new Date().toISOString();
        record.durationMs = Date.now() - nodeStartedAt.getTime();

        failedNodes.add(nodeId);
        status = "FAILED";
        failureMessage =
          `Node "${node.name}" failed: ${serializeError(error)}`;
        break;
      }
    }
  } catch (error) {
    status = "FAILED";
    failureMessage = serializeError(error);
  }

  if (options.signal?.aborted && status !== "FAILED") {
    status = "CANCELLED";
    failureMessage = "Execution cancelled.";
  }

  if (failedNodes.size > 0) {
    status = "FAILED";
  }

  const finishedAt = new Date();

  const result: EngineRunResult = {
    executionId: options.executionId || randomUUID(),
    status,
    output: finalOutput,
    error: failureMessage,
    nodeResults,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: Date.now() - startedClock,
  };

  await prisma.execution.update({
    where: { id: options.executionId },
    data: {
      status: result.status,
      finishedAt,
      durationMs: result.durationMs,
      output: toPrismaJson(result.output),
      error: result.error === undefined
        ? Prisma.JsonNull
        : toPrismaJson(result.error),
      nodeResults: toPrismaJson(result.nodeResults),
    },
  });

  return result;
}
