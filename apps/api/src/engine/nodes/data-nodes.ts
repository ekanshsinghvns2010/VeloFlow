import type { NodeHandler } from "../types.js";
import { asObject, deepClone, getPath, setPath } from "../data.js";
import { resolveExpression } from "../expression.js";

export const setDataNode: NodeHandler = {
  kind: "set_data",
  displayName: "Set Data",
  description: "Creates or updates fields in the incoming data.",

  async execute(context) {
    const config = context.node.data ?? {};
    const source = asObject(deepClone(context.input));
    const fields = config.fields;

    if (
      fields === null ||
      typeof fields !== "object" ||
      Array.isArray(fields)
    ) {
      return { success: true, output: source };
    }

    for (const [key, value] of Object.entries(
      fields as Record<string, unknown>,
    )) {
      source[key] = resolveExpression(value, {
        input: context.input,
        variables: context.execution.variables,
        node: source,
        execution: {
          id: context.execution.executionId,
          workflowId: context.execution.workflowId,
        },
      });
    }

    return { success: true, output: source };
  },
};

export const transformNode: NodeHandler = {
  kind: "transform",
  displayName: "Transform",
  description: "Maps selected fields into a new object.",

  async execute(context) {
    const config = context.node.data ?? {};
    const mappings = config.mappings;

    if (
      mappings === null ||
      typeof mappings !== "object" ||
      Array.isArray(mappings)
    ) {
      return {
        success: true,
        output: deepClone(context.input),
      };
    }

    const output: Record<string, unknown> = {};

    for (const [target, sourcePath] of Object.entries(
      mappings as Record<string, unknown>,
    )) {
      if (typeof sourcePath === "string") {
        output[target] = resolveExpression(sourcePath, {
          input: context.input,
          variables: context.execution.variables,
          node: asObject(context.input),
        });
      } else {
        output[target] = resolveExpression(sourcePath, {
          input: context.input,
          variables: context.execution.variables,
          node: asObject(context.input),
        });
      }
    }

    return { success: true, output };
  },
};

export const filterNode: NodeHandler = {
  kind: "filter",
  displayName: "Filter",
  description: "Filters arrays using a configured property and value.",

  async execute(context) {
    const config = context.node.data ?? {};
    const property = String(config.property ?? "");
    const operator = String(config.operator ?? "equals");
    const expected = config.value;
    const input = context.input;

    if (!Array.isArray(input)) {
      return {
        success: true,
        output: [],
        error: "Filter input must be an array.",
      };
    }

    const output = input.filter((item) => {
      const actual = property ? getPath(item, property) : item;

      switch (operator) {
        case "equals":
          return actual === expected;
        case "not_equals":
          return actual !== expected;
        case "contains":
          return typeof actual === "string"
            ? actual.includes(String(expected ?? ""))
            : Array.isArray(actual) && actual.includes(expected);
        case "greater_than":
          return Number(actual) > Number(expected);
        case "less_than":
          return Number(actual) < Number(expected);
        case "is_empty":
          return actual === null ||
            actual === undefined ||
            actual === "";
        case "is_not_empty":
          return actual !== null &&
            actual !== undefined &&
            actual !== "";
        default:
          return false;
      }
    });

    return { success: true, output };
  },
};

export const mergeNode: NodeHandler = {
  kind: "merge",
  displayName: "Merge",
  description: "Combines incoming values into one output.",

  async execute(context) {
    const inputs = context.incoming;

    if (inputs.length === 0) {
      return { success: true, output: context.input ?? {} };
    }

    const objects = inputs.map(asObject);
    return {
      success: true,
      output: Object.assign({}, ...objects),
    };
  },
};

export const dataNodes: NodeHandler[] = [
  setDataNode,
  transformNode,
  filterNode,
  mergeNode,
];