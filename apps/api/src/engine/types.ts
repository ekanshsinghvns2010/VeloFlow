import type {
NodeExecutionResult,
WorkflowConnection,
WorkflowDefinition,
WorkflowNode,
} from "@veloflow/shared";

export interface ExecutionContext {
executionId: string;
workflowId: string;
workspaceId: string;
userId: string;
input: unknown;
variables: Record<string, unknown>;
credentials: Record<string, Record<string, unknown>>;
signal?: AbortSignal;
}

export interface NodeContext {
execution: ExecutionContext;
node: WorkflowNode;
incoming: unknown[];
input: unknown;
}

export interface NodeHandler {
kind: WorkflowNode["kind"];
displayName: string;
description: string;
execute(context: NodeContext): Promise<NodeExecutionResult>;
}

export interface WorkflowPlan {
definition: WorkflowDefinition;
nodesById: Map<string, WorkflowNode>;
incomingById: Map<string, WorkflowConnection[]>;
outgoingById: Map<string, WorkflowConnection[]>;
executionOrder: string[];
}

export interface EngineRunOptions {
executionId: string;
workflowId: string;
workspaceId: string;
userId: string;
input?: unknown;
credentials?: Record<string, Record<string, unknown>>;
signal?: AbortSignal;
}

export interface NodeRunRecord {
nodeId: string;
nodeName: string;
status: "running" | "succeeded" | "failed" | "skipped";
startedAt: string;
finishedAt?: string;
durationMs?: number;
input?: unknown;
output?: unknown;
error?: string;
}