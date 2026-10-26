
import {
  WorkflowDefinitionSchema,
  validateWorkflow,
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowNodeKind,
} from "./index.js";

export function createEmptyWorkflow(
  name = "Untitled workflow",
  description = "",
): WorkflowDefinition {
  return WorkflowDefinitionSchema.parse({
    name,
    description,
    nodes: [],
    connections: [],
    settings: {
      timezone: "UTC",
      saveExecutionData: true,
      timeoutMs: 30000,
      retryCount: 0,
    },
    active: false,
    version: 1,
  });
}

export function createWorkflowNode(
  type: WorkflowNodeKind,
  index: number,
): WorkflowNode {
  const names: Record<WorkflowNodeKind, string> = {
    manual_trigger: "Manual trigger",
    webhook_trigger: "Webhook trigger",
    schedule_trigger: "Schedule trigger",
    http_request: "HTTP request",
    code: "Code",
    condition: "Condition",
    switch: "Switch",
    merge: "Merge",
    delay: "Delay",
    set_data: "Set data",
    filter: "Filter",
    loop: "Loop",
    ai_prompt: "AI prompt",
    email: "Email",
    database: "Database",
    transform: "Transform",
  };

  return {
    id: `node_${Date.now().toString(36)}_${index.toString(36)}`,
    type,
    name: names[type],
    position: {
      x: 80 + (index % 3) * 260,
      y: 80 + Math.floor(index / 3) * 150,
    },
    parameters: {},
    disabled: false,
  };
}

export function connectWorkflowNodes(
  definition: WorkflowDefinition,
  sourceNodeId: string,
  targetNodeId: string,
): WorkflowDefinition {
  if (sourceNodeId === targetNodeId) {
    throw new Error("A node cannot connect to itself.");
  }

  if (!definition.nodes.some((node) => node.id === sourceNodeId)) {
    throw new Error("Source node not found.");
  }

  if (!definition.nodes.some((node) => node.id === targetNodeId)) {
    throw new Error("Target node not found.");
  }

  const exists = definition.connections.some(
    (edge) =>
      edge.sourceNodeId === sourceNodeId &&
      edge.targetNodeId === targetNodeId,
  );

  if (exists) return definition;

  return validateWorkflow({
    ...definition,
    connections: [
      ...definition.connections,
      {
        id: `edge_${Date.now().toString(36)}_${definition.connections.length}`,
        sourceNodeId,
        sourceOutput: "main",
        targetNodeId,
        targetInput: "main",
      },
    ],
  });
}

export function removeWorkflowNode(
  definition: WorkflowDefinition,
  nodeId: string,
): WorkflowDefinition {
  return validateWorkflow({
    ...definition,
    nodes: definition.nodes.filter((node) => node.id !== nodeId),
    connections: definition.connections.filter(
      (edge) =>
        edge.sourceNodeId !== nodeId &&
        edge.targetNodeId !== nodeId,
    ),
  });
}

export function validateWorkflowForEditor(
  definition: WorkflowDefinition,
): string[] {
  const errors: string[] = [];

  try {
    validateWorkflow(definition);
  } catch (error) {
    errors.push(
      error instanceof Error ? error.message : "Invalid workflow.",
    );
  }

  if (definition.nodes.length === 0) {
    errors.push("Add at least one node.");
  }

  const triggers: WorkflowNodeKind[] = [
    "manual_trigger",
    "webhook_trigger",
    "schedule_trigger",
  ];

  if (!definition.nodes.some((node) => triggers.includes(node.type))) {
    errors.push("Add a trigger node to start the workflow.");
  }

  return errors;
}
