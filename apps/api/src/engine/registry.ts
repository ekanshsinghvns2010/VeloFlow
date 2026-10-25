import type { NodeHandler } from "./types.js";

export class NodeRegistry {
private readonly handlers = new Map<string, NodeHandler>();

register(handler: NodeHandler): void {
if (this.handlers.has(handler.kind)) {
throw new Error("Node handler already registered: ${handler.kind}");
}

this.handlers.set(handler.kind, handler);

}

get(kind: string): NodeHandler | undefined {
return this.handlers.get(kind);
}

require(kind: string): NodeHandler {
const handler = this.get(kind);

if (!handler) {
  throw new Error(`Unsupported workflow node: ${kind}`);
}

return handler;

}

list(): Array<{
kind: string;
displayName: string;
description: string;
}> {
return [...this.handlers.values()].map((handler) => ({
kind: handler.kind,
displayName: handler.displayName,
description: handler.description,
}));
}

has(kind: string): boolean {
return this.handlers.has(kind);
}
}

export const nodeRegistry = new NodeRegistry();