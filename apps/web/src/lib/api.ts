const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ||
  "https://veloflow-api.onrender.com";

const ACCESS_TOKEN_KEY = "veloflow_access_token";
const REFRESH_TOKEN_KEY = "veloflow_refresh_token";
const USER_KEY = "veloflow_user";

export type ApiUser = {
  id: string;
  name: string;
  email: string;
};

export type ApiSession = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: ApiUser;
};

export type ApiWorkspace = {
  id: string;
  name: string;
  slug?: string;
  role: "owner" | "admin" | "editor" | "viewer";
};

export type ApiWorkflow = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  status: string;
  version: number;
  activeVersion?: number | null;
  createdAt: string;
  updatedAt: string;
  definition?: {
    id?: string;
    name: string;
    description?: string;
    nodes: unknown[];
    connections: unknown[];
    settings?: Record<string, unknown>;
    active?: boolean;
    version?: number;
  };
};

type ApiResponse<T> = {
  data: T;
  requestId?: string;
};

type WorkflowListResponse = {
  data: ApiWorkflow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function saveSession(session: ApiSession): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getStoredUser(): ApiUser | null {
  const value = localStorage.getItem(USER_KEY);

  if (!value) return null;

  try {
    return JSON.parse(value) as ApiUser;
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  authenticated = true,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  if (
    options.body &&
    typeof options.body === "string" &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  if (authenticated) {
    const token = getAccessToken();

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new ApiError(
      "Could not connect to VeloFlow. Check your internet connection and API deployment.",
      0,
      "NETWORK_ERROR",
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const result = (await response.json().catch(() => null)) as
    | {
        data?: unknown;
        error?: {
          code?: string;
          message?: string;
        };
        message?: string;
      }
    | null;

  if (!response.ok) {
    throw new ApiError(
      result?.error?.message ||
        result?.message ||
        `Request failed with status ${response.status}.`,
      response.status,
      result?.error?.code,
    );
  }

  if (result === null) {
    throw new ApiError(
      "The VeloFlow API returned an invalid JSON response.",
      response.status,
      "INVALID_RESPONSE",
    );
  }

  return result as T;
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
}): Promise<ApiSession> {
  const result = await request<ApiResponse<ApiSession>>(
    "/api/auth/register",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    false,
  );

  saveSession(result.data);
  return result.data;
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<ApiSession> {
  const result = await request<ApiResponse<ApiSession>>(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    false,
  );

  saveSession(result.data);
  return result.data;
}

export async function refreshSession(): Promise<ApiSession> {
  const refreshToken = getRefreshToken();

  if (!refreshToken) {
    clearSession();
    throw new ApiError("Please log in again.", 401, "NO_REFRESH_TOKEN");
  }

  try {
    const result = await request<ApiResponse<ApiSession>>(
      "/api/auth/refresh",
      {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      },
      false,
    );

    saveSession(result.data);
    return result.data;
  } catch (error) {
    clearSession();
    throw error;
  }
}

export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();

  try {
    if (refreshToken) {
      await request(
        "/api/auth/logout",
        {
          method: "POST",
          body: JSON.stringify({ refreshToken }),
        },
        false,
      );
    }
  } finally {
    clearSession();
  }
}
export async function getCurrentUser(): Promise<ApiUser> {
  const result = await request<ApiResponse<{ user: ApiUser }>>(
    "/api/auth/me",
  );

  return result.data.user;
}

export async function getWorkspaces(): Promise<ApiWorkspace[]> {
  const result = await request<ApiResponse<ApiWorkspace[]>>(
    "/api/workspaces",
  );

  return result.data;
}

export async function createWorkspace(
  name: string,
): Promise<ApiWorkspace> {
  const result = await request<ApiResponse<ApiWorkspace>>(
    "/api/workspaces",
    {
      method: "POST",
      body: JSON.stringify({ name }),
    },
  );

  return result.data;
}

export async function getWorkflows(
  workspaceId: string,
): Promise<ApiWorkflow[]> {
  const result = await request<WorkflowListResponse>(
    `/api/${encodeURIComponent(workspaceId)}/workflows`,
  );

  return result.data;
}

export async function getWorkflow(
  workspaceId: string,
  workflowId: string,
): Promise<ApiWorkflow> {
  const result = await request<ApiResponse<ApiWorkflow>>(
    `/api/${encodeURIComponent(workspaceId)}/workflows/${encodeURIComponent(workflowId)}`,
  );

  return result.data;
}

export async function createWorkflow(
  workspaceId: string,
  input: {
    name: string;
    description?: string;
    definition?: ApiWorkflow["definition"];
  },
): Promise<ApiWorkflow> {
  const result = await request<ApiResponse<ApiWorkflow>>(
    `/api/${encodeURIComponent(workspaceId)}/workflows`,
    {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        description: input.description ?? "",
        ...(input.definition ? { definition: input.definition } : {}),
      }),
    },
  );

  return result.data;
}

export async function updateWorkflow(
  workspaceId: string,
  workflowId: string,
  input: {
    name?: string;
    description?: string;
    definition?: ApiWorkflow["definition"];
  },
): Promise<ApiWorkflow> {
  const result = await request<ApiResponse<ApiWorkflow>>(
    `/api/${encodeURIComponent(workspaceId)}/workflows/${encodeURIComponent(workflowId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );

  return result.data;
}

export type ApiExecution = {
  id: string;
  workflowId: string;
  workspaceId: string;
  status: string;
  mode?: string;
  input?: unknown;
  output?: unknown;
  error?: string | null;
  createdAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
};

export async function activateWorkflow(
  workspaceId: string,
  workflowId: string,
): Promise<ApiWorkflow> {
  const result = await request<ApiResponse<ApiWorkflow>>(
    `/api/${encodeURIComponent(workspaceId)}/workflows/${encodeURIComponent(workflowId)}/activate`,
    {
      method: "POST",
    },
  );

  return result.data;
}

export async function executeWorkflow(
  workspaceId: string,
  workflowId: string,
  input: unknown = {},
): Promise<ApiExecution> {
  const result = await request<ApiResponse<ApiExecution>>(
    `/api/${encodeURIComponent(workspaceId)}/workflows/${encodeURIComponent(workflowId)}/execute`,
    {
      method: "POST",
      body: JSON.stringify({ input }),
    },
  );

  return result.data;
}

export async function getExecution(
  workspaceId: string,
  executionId: string,
): Promise<ApiExecution> {
  const result = await request<ApiResponse<ApiExecution>>(
    `/api/${encodeURIComponent(workspaceId)}/executions/${encodeURIComponent(executionId)}`,
  );

  return result.data;
}
