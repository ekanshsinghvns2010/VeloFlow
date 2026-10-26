
import type {
  WorkflowConnection,
  WorkflowDefinition,
  WorkflowNode,
} from "@veloflow/shared";

export type EngineNode = WorkflowNode & {
  kind: WorkflowNode["type"];
  data: WorkflowNode["parameters"];
};

export type EngineWorkflowDefinition = Omit<
  WorkflowDefinition,
  "nodes"
> & {
  nodes: EngineNode[];
};

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
  node: EngineNode;
  incoming: unknown[];
  input: unknown;
}

export interface EngineNodeResult {
  success: boolean;
  output?: unknown;
  error?: string;
}

export interface NodeHandler {
  kind: WorkflowNode["type"];
  displayName: string;
  description: string;
  execute(context: NodeContext): Promise<EngineNodeResult>;
}

export interface WorkflowPlan {
  definition: EngineWorkflowDefinition;
  nodesById: Map<string, EngineNode>;
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
