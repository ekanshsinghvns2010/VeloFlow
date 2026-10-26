
import {
  validateWorkflow,
  type WorkflowDefinition,
  type WorkflowConnection,
} from "@veloflow/shared";
import type {
  EngineNode,
  EngineWorkflowDefinition,
  WorkflowPlan,
} from "./types.js";

export function buildWorkflowPlan(
  inputDefinition: WorkflowDefinition,
): WorkflowPlan {
  // validateWorkflow throws if the definition is invalid.
  const validated = validateWorkflow(inputDefinition);

  const definition: EngineWorkflowDefinition = {
    ...validated,
    nodes: validated.nodes.map((node) => ({
      ...node,
      kind: node.type,
      data: node.parameters,
    })),
  };

  const nodesById = new Map<string, EngineNode>();
  const incomingById = new Map<string, WorkflowConnection[]>();
  const outgoingById = new Map<string, WorkflowConnection[]>();

  for (const node of definition.nodes) {
    nodesById.set(node.id, node);
    incomingById.set(node.id, []);
    outgoingById.set(node.id, []);
  }

  for (const connection of definition.connections) {
    incomingById.get(connection.targetNodeId)?.push(connection);
    outgoingById.get(connection.sourceNodeId)?.push(connection);
  }

  const inDegree = new Map<string, number>();

  for (const node of definition.nodes) {
    inDegree.set(
      node.id,
      incomingById.get(node.id)?.length ?? 0,
    );
  }

  const queue = definition.nodes
    .filter((node) => (inDegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);

  const executionOrder: string[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift();

    if (currentId === undefined) {
      continue;
    }

    executionOrder.push(currentId);

    for (const connection of outgoingById.get(currentId) ?? []) {
      const targetId = connection.targetNodeId;
      const nextDegree = (inDegree.get(targetId) ?? 0) - 1;

      inDegree.set(targetId, nextDegree);

      if (nextDegree === 0) {
        queue.push(targetId);
      }
    }
  }

  if (executionOrder.length !== definition.nodes.length) {
    throw new Error(
      "Workflow contains a cycle. Cycles are not supported by this execution engine yet.",
    );
  }

  return {
    definition,
    nodesById,
    incomingById,
    outgoingById,
    executionOrder,
  };
}
