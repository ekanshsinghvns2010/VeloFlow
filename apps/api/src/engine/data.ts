export function isPlainObject(
value: unknown,
): value is Record<string, unknown> {
if (value === null || typeof value !== "object") {
return false;
}

const prototype = Object.getPrototypeOf(value);
return prototype === Object.prototype || prototype === null;
}

export function asObject(
value: unknown,
): Record<string, unknown> {
return isPlainObject(value) ? value : { value };
}

export function getPath(
value: unknown,
path: string,
): unknown {
if (!path) return value;

return path
.replace(/[(\d+)]/g, ".$1")
.split(".")
.filter(Boolean)
.reduce<unknown>((current, key) => {
if (
current === null ||
current === undefined ||
(typeof current !== "object" &&
typeof current !== "string")
) {
return undefined;
}

  return (current as Record<string, unknown>)[key];
}, value);

}

export function setPath(
target: Record<string, unknown>,
path: string,
value: unknown,
): Record<string, unknown> {
const keys = path.split(".").filter(Boolean);

if (keys.length === 0) {
throw new Error("A non-empty property path is required.");
}

let current: Record<string, unknown> = target;

for (const key of keys.slice(0, -1)) {
const next = current[key];

if (!isPlainObject(next)) {
  current[key] = {};
}

current = current[key] as Record<string, unknown>;

}

current[keys[keys.length - 1]] = value;
return target;
}

export function deepClone<T>(value: T): T {
if (value === undefined) return value;
return JSON.parse(JSON.stringify(value)) as T;
}

export function interpolateString(
template: string,
scope: Record<string, unknown>,
): string {
return template.replace(
/{{\s*([^{}]+?)\s*}}/g,
(_match, expression: string) => {
const value = getPath(scope, expression.trim());

  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
},

);
}