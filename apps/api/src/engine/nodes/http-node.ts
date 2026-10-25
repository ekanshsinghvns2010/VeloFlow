import type { NodeHandler } from "../types.js";
import { resolveExpression } from "../expression.js";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15000;

function validatePublicHttpUrl(value: string): URL {
  const url = new URL(value);

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only HTTP and HTTPS URLs are supported.");
  }

  if (url.username || url.password) {
    throw new Error("URLs containing credentials are not allowed.");
  }

  const hostname = url.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal"
  ) {
    throw new Error("Requests to local or metadata hosts are blocked.");
  }

  if (
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    hostname === "::1" ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    hostname.startsWith("fe80:")
  ) {
    throw new Error("Requests to private network addresses are blocked.");
  }

  return url;
}

export const httpRequestNode: NodeHandler = {
  kind: "http_request",
  displayName: "HTTP Request",
  description: "Makes an HTTP request to an external endpoint.",

  async execute(context) {
    const config = context.node.data ?? {};

    const rawUrl = resolveExpression(config.url, {
      input: context.input,
      variables: context.execution.variables,
    });

    if (typeof rawUrl !== "string" || rawUrl.length === 0) {
      throw new Error("HTTP Request requires a URL.");
    }

    const url = validatePublicHttpUrl(rawUrl);

    const method = String(config.method ?? "GET").toUpperCase();

    const allowedMethods = new Set([
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "HEAD",
    ]);

    if (!allowedMethods.has(method)) {
      throw new Error("Unsupported HTTP method.");
    }

    const headers =
      config.headers &&
      typeof config.headers === "object" &&
      !Array.isArray(config.headers)
        ? (config.headers as Record<string, string>)
        : {};

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

    const onAbort = () => controller.abort();

    if (context.execution.signal?.aborted) {
      clearTimeout(timeout);
      throw new Error("Workflow execution was cancelled.");
    }

    context.execution.signal?.addEventListener("abort", onAbort, {
      once: true,
    });

    try {
      const bodyValue = resolveExpression(config.body, {
        input: context.input,
        variables: context.execution.variables,
      });

      const response = await fetch(url, {
        method,
        headers: {
          Accept: "application/json, text/plain, */*",
          ...headers,
        },
        body:
          method === "GET" || method === "HEAD" || bodyValue == null
            ? undefined
            : typeof bodyValue === "string"
              ? bodyValue
              : JSON.stringify(bodyValue),
        redirect: "error",
        signal: controller.signal,
      });

      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          total += value.byteLength;

          if (total > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            throw new Error("HTTP response exceeded the 2 MB limit.");
          }

          chunks.push(value);
        }
      }

      const buffer = Buffer.concat(chunks);
      const text = buffer.toString("utf8");
      const contentType = response.headers.get("content-type") ?? "";

      let data: unknown = text;

      if (contentType.includes("application/json") && text.length > 0) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      return {
        success: response.ok,
        output: {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          data,
        },
        ...(!response.ok
          ? { error: `HTTP request failed with status ${response.status}.` }
          : {}),
      };
    } finally {
      clearTimeout(timeout);
      context.execution.signal?.removeEventListener("abort", onAbort);
    }
  },
};