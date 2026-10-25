import { nodeRegistry } from "../registry.js";
import {
  manualTriggerNode,
  scheduleTriggerNode,
  webhookTriggerNode,
} from "./trigger.js";
import { dataNodes } from "./data-nodes.js";
import { conditionNode, switchNode } from "./logic-nodes.js";
import { httpRequestNode } from "./http-node.js";

let registered = false;

export function registerCoreNodes(): void {
  if (registered) return;

  const handlers = [
    manualTriggerNode,
    scheduleTriggerNode,
    webhookTriggerNode,
    ...dataNodes,
    conditionNode,
    switchNode,
    httpRequestNode,
  ];

  for (const handler of handlers) {
    nodeRegistry.register(handler);
  }

  registered = true;
}

export { nodeRegistry };