
import { z } from "zod";

export const WorkflowNodeKindSchema = z.enum([
  "manual_trigger",
  "webhook_trigger",
  "schedule_trigger",
  "http_request",
  "code",
  "condition",
  "switch",
  "merge",
  "delay",
  "set_data",
  "filter",
  "loop",
  "ai_prompt",
  "email",
  "database",
  "transform"
]);

export type WorkflowNodeKind = z.infer<
  typeof WorkflowNodeKindSchema
>;

export const PositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite()
});

export type Position = z.infer<typeof PositionSchema>;

export const WorkflowNodeSchema = z.object({
  id: z.string().min(1).max(128),
  type: WorkflowNodeKindSchema,
  name: z.string().min(1).max(120),
  position: PositionSchema,
  parameters: z.record(z.string(), z.unknown()).default({}),
  disabled: z.boolean().default(false)
});

export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

export const WorkflowConnectionSchema = z.object({
  id: z.string().min(1).max(128),
  sourceNodeId: z.string().min(1),
  sourceOutput: z.string().default("main"),
  targetNodeId: z.string().min(1),
  targetInput: z.string().default("main"),
  label: z.string().max(120).optional()
});

export type WorkflowConnection = z.infer<
  typeof WorkflowConnectionSchema
>;

export const WorkflowDefinitionSchema = z.object({
  id: z.string().min(1).max(128).optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  nodes: z.array(WorkflowNodeSchema).max(500),
  connections: z.array(WorkflowConnectionSchema).max(2000),
  settings: z.object({
    timezone: z.string().default("UTC"),
    saveExecutionData: z.boolean().default(true),
    timeoutMs: z.number().int().min(1000).max(3600000).default(300000),
    retryCount: z.number().int().min(0).max(10).default(0)
  }).default({}),
  active: z.boolean().default(false),
  version: z.number().int().positive().default(1)
});

export type WorkflowDefinition = z.infer<
  typeof WorkflowDefinitionSchema
>;

export const WorkflowStatusSchema = z.enum([
  "draft",
  "active",
  "archived"
]);

export type WorkflowStatus = z.infer<
  typeof WorkflowStatusSchema
>;

export const ExecutionStatusSchema = z.enum([
  "queued",
  "running",
  "waiting",
  "succeeded",
  "failed",
  "cancelled"
]);

export type ExecutionStatus = z.infer<
  typeof ExecutionStatusSchema
>;

export interface NodeExecutionResult {
  nodeId: string;
  status: "succeeded" | "failed" | "skipped";
  input?: unknown;
  output?: unknown;
  error?: {
    code: string;
    message: string;
  };
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  results: NodeExecutionResult[];
  error?: {
    code: string;
    message: string;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export interface ApiSuccess<T> {
  data: T;
  requestId?: string;
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: "owner" | "admin" | "editor" | "viewer";
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const CreateWorkflowRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default("")
});

export const UpdateWorkflowRequestSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  definition: WorkflowDefinitionSchema.optional(),
  active: z.boolean().optional()
});

export const ExecuteWorkflowRequestSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
  mode: z.enum(["manual", "production", "test"]).default("manual")
});

export type CreateWorkflowRequest = z.infer<
  typeof CreateWorkflowRequestSchema
>;

export type UpdateWorkflowRequest = z.infer<
  typeof UpdateWorkflowRequestSchema
>;

export type ExecuteWorkflowRequest = z.infer<
  typeof ExecuteWorkflowRequestSchema
>;

export const NodeCatalogEntrySchema = z.object({
  type: WorkflowNodeKindSchema,
  displayName: z.string(),
  description: z.string(),
  category: z.enum([
    "triggers",
    "http",
    "logic",
    "data",
    "ai",
    "communication",
    "storage"
  ]),
  icon: z.string(),
  inputs: z.number().int().min(0),
  outputs: z.number().int().min(0),
  requiresCredentials: z.boolean().default(false)
});

export type NodeCatalogEntry = z.infer<
  typeof NodeCatalogEntrySchema
>;

export function validateWorkflow(
  input: unknown
): WorkflowDefinition {
  const workflow = WorkflowDefinitionSchema.parse(input);

  const nodeIds = new Set<string>();

  for (const node of workflow.nodes) {
    if (nodeIds.has(node.id)) {
      throw new Error(`Duplicate workflow node ID: ${node.id}`);
    }

    nodeIds.add(node.id);
  }

  const connectionIds = new Set<string>();

  for (const connection of workflow.connections) {
    if (connectionIds.has(connection.id)) {
      throw new Error(
        `Duplicate workflow connection ID: ${connection.id}`
      );
    }

    connectionIds.add(connection.id);

    if (!nodeIds.has(connection.sourceNodeId)) {
      throw new Error(
        `Connection ${connection.id} references missing source node ${connection.sourceNodeId}`
      );
    }

    if (!nodeIds.has(connection.targetNodeId)) {
      throw new Error(
        `Connection ${connection.id} references missing target node ${connection.targetNodeId}`
      );
    }
  }

  return workflow;
}
export * from "./workflow-editor";