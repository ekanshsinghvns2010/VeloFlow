
import { getPath, interpolateString } from "./data.js";

export interface ExpressionScope {
  input?: unknown;
  variables?: Record<string, unknown>;
  node?: Record<string, unknown>;
  execution?: Record<string, unknown>;
}

export function resolveExpression(
  value: unknown,
  scope: ExpressionScope,
): unknown {
  if (typeof value === "string") {
    const exactMatch = value.match(/^{{\s*([^{}]+?)\s*}}$/);

    if (exactMatch) {
      const expression = exactMatch[1];

      if (expression === undefined) {
        return value;
      }

      return getPath(scope, expression.trim());
    }

    return interpolateString(
      value,
      scope as Record<string, unknown>,
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveExpression(item, scope));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveExpression(item, scope),
      ]),
    );
  }

  return value;
}
