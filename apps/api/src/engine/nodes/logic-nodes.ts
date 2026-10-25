import type { NodeHandler } from "../types.js";
import { getPath } from "../data.js";

function compare(
  actual: unknown,
  operator: string,
  expected: unknown,
): boolean {
  switch (operator) {
    case "equals":
      return actual === expected;

    case "not_equals":
      return actual !== expected;

    case "greater_than":
      return Number(actual) > Number(expected);

    case "greater_than_or_equal":
      return Number(actual) >= Number(expected);

    case "less_than":
      return Number(actual) < Number(expected);

    case "less_than_or_equal":
      return Number(actual) <= Number(expected);

    case "contains":
      return typeof actual === "string"
        ? actual.includes(String(expected ?? ""))
        : Array.isArray(actual) && actual.includes(expected);

    case "is_true":
      return actual === true;

    case "is_false":
      return actual === false;

    case "is_empty":
      return actual === null ||
        actual === undefined ||
        actual === "";

    case "is_not_empty":
      return actual !== null &&
        actual !== undefined &&
        actual !== "";

    default:
      throw new Error(`Unsupported condition operator: ${operator}`);
  }
}

export const conditionNode: NodeHandler = {
  kind: "condition",
  displayName: "Condition",
  description: "Evaluates a condition and returns a boolean result.",

  async execute(context) {
    const config = context.node.data ?? {};
    const property = String(config.property ?? "");
    const operator = String(config.operator ?? "equals");
    const expected = config.value;
    const actual = property
      ? getPath(context.input, property)
      : context.input;

    const result = compare(actual, operator, expected);

    return {
      success: true,
      output: {
        result,
        branch: result ? "true" : "false",
        value: context.input,
      },
    };
  },
};

export const switchNode: NodeHandler = {
  kind: "switch",
  displayName: "Switch",
  description: "Routes data to a named case or the default case.",

  async execute(context) {
    const config = context.node.data ?? {};
    const property = String(config.property ?? "");
    const value = property
      ? getPath(context.input, property)
      : context.input;

    const cases = Array.isArray(config.cases)
      ? config.cases
      : [];

    let selected = "default";

    for (const item of cases) {
      if (
        item !== null &&
        typeof item === "object" &&
        !Array.isArray(item)
      ) {
        const entry = item as Record<string, unknown>;

        if (value === entry.value) {
          selected = String(entry.name ?? entry.value);
          break;
        }
      }
    }

    return {
      success: true,
      output: {
        branch: selected,
        value: context.input,
      },
    };
  },
};