import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import WorkflowEditorScreen from "./WorkflowEditorScreen";
import type { WorkflowDefinition } from "../../packages/shared/src";

const C = {
  bg: "#0b1020",
  panel: "#151d32",
  border: "#29334c",
  text: "#f8fafc",
  muted: "#a5afc8",
  purple: "#6658f5",
  green: "#83e1b0",
  input: "#0f172a",
};

type Workspace = {
  id: string;
  name: string;
  role?: string;
};

type Workflow = {
  id: string;
  name: string;
  description?: string;
  status: string;
  version?: number;
  definition?: WorkflowDefinition;
};

export default function App() {
  const [apiUrl, setApiUrl] = useState("");
  const [apiDraft, setApiDraft] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [register, setRegister] = useState(false);
  const [token, setToken] = useState("");

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);

  const [tab, setTab] = useState<"home" | "settings">("home");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const [editingWorkflow, setEditingWorkflow] =
    useState<Workflow | null>(null);

  const [editorLoading, setEditorLoading] = useState(false);

  async function api(
    path: string,
    method = "GET",
    body?: unknown,
  ) {
    const base = apiUrl.trim().replace(/\/+$/, "");

    if (!base || !/^https:\/\//i.test(base)) {
      throw new Error(
        "Enter your deployed HTTPS API URL in Settings first.",
      );
    }

    const response = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token
          ? { Authorization: `Bearer ${token}` }
          : {}),
      },
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body) }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        result?.error?.message ||
          result?.message ||
          `API request failed: ${response.status}`,
      );
    }

    return result;
  }

  async function loadWorkspaces() {
    const result = await api("/api/workspaces");
    const items: Workspace[] = result?.data ?? [];

    setWorkspaces(items);

    if (!items.length) {
      setWorkspaceId("");
      setWorkflows([]);
      setNotice("No workspace found for this account.");
      return;
    }

    const chosen =
      items.find((item) => item.id === workspaceId) ??
      items[0];

    if (!chosen) {
      setWorkspaceId("");
      setWorkflows([]);
      setNotice(
        "No usable workspace was returned by the server.",
      );
      return;
    }

    setWorkspaceId(chosen.id);

    const response = await api(
      `/api/${encodeURIComponent(chosen.id)}/workflows?limit=100`,
    );

    setWorkflows(response?.data ?? []);
    setNotice("");
  }

  useEffect(() => {
    if (!token || !apiUrl) return;

    loadWorkspaces().catch((error: Error) => {
      setNotice(error.message);
    });

    // Reload when the authenticated session or server changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, apiUrl]);

  async function authenticate() {
    setBusy(true);

    try {
      const result = await api(
        register ? "/api/auth/register" : "/api/auth/login",
        "POST",
        register
          ? {
              name: name.trim(),
              email: email.trim(),
              password,
            }
          : {
              email: email.trim(),
              password,
            },
      );

      const accessToken =
        result?.data?.accessToken ??
        result?.accessToken ??
        result?.data?.tokens?.accessToken;

      if (!accessToken) {
        throw new Error(
          "No access token returned. Check your backend authentication response.",
        );
      }

      setToken(accessToken);
      setNotice("Signed in. Loading your workspace…");
    } catch (error) {
      Alert.alert(
        register ? "Registration failed" : "Sign-in failed",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);

    try {
      await loadWorkspaces();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Refresh failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createWorkflow() {
    if (!newName.trim() || !workspaceId) {
      Alert.alert(
        "Missing information",
        "Enter a workflow name and select a workspace.",
      );
      return;
    }

    setBusy(true);

    try {
      const result = await api(
        `/api/${encodeURIComponent(workspaceId)}/workflows`,
        "POST",
        {
          name: newName.trim(),
          description: newDescription.trim(),
        },
      );

      if (!result?.data?.id) {
        throw new Error(
          "The server did not return the created workflow.",
        );
      }

      setWorkflows((previous) => [
        result.data,
        ...previous.filter(
          (item) => item.id !== result.data.id,
        ),
      ]);

      setNewName("");
      setNewDescription("");
      setShowCreate(false);
      setNotice("Workflow draft created.");
    } catch (error) {
      Alert.alert(
        "Could not create workflow",
        error instanceof Error
          ? error.message
          : "Unknown error",
      );
    } finally {
      setBusy(false);
    }
  }
  async function openWorkflow(workflow: Workflow) {
    if (!workspaceId) {
      Alert.alert("No workspace", "Select a workspace first.");
      return;
    }

    setEditorLoading(true);

    try {
      const result = await api(
        `/api/${encodeURIComponent(workspaceId)}/workflows/${encodeURIComponent(workflow.id)}`,
        "GET"
      );

      if (!result.data?.id || !result.data?.definition) {
        throw new Error("The workflow data is incomplete.");
      }

      setEditingWorkflow(result.data as Workflow);
    } catch (error) {
      Alert.alert(
        "Could not open workflow",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setEditorLoading(false);
    }
  }

  async function saveEditedWorkflow(
    definition: WorkflowDefinition
  ) {
    if (!workspaceId || !editingWorkflow) {
      throw new Error("No workflow is selected.");
    }

    const result = await api(
      `/api/${encodeURIComponent(workspaceId)}/workflows/${encodeURIComponent(editingWorkflow.id)}`,
      "PATCH",
      {
        name: editingWorkflow.name,
        description: editingWorkflow.description ?? "",
        definition,
      }
    );

    if (!result.data?.id) {
      throw new Error("The server did not return the saved workflow.");
    }

    const savedWorkflow = result.data as Workflow;

    setWorkflows((current) =>
      current.map((workflow) =>
        workflow.id === savedWorkflow.id
          ? savedWorkflow
          : workflow
      )
    );

    setEditingWorkflow(savedWorkflow);
  }

  async function toggleWorkflow(workflow: Workflow) {
    if (!workspaceId) {
      Alert.alert("No workspace", "Select a workspace first.");
      return;
    }

    const isActive = workflow.status === "ACTIVE";

    if (!isActive && !workflow.definition?.nodes?.length) {
      Alert.alert(
        "Workflow is empty",
        "Add at least one node before activating this workflow."
      );
      return;
    }

    setBusy(true);
    setNotice("");

    try {
      const action = isActive ? "deactivate" : "activate";

      const result = await api(
        `/api/${encodeURIComponent(workspaceId)}/workflows/${encodeURIComponent(workflow.id)}/${action}`,
        "POST"
      );

      if (!result.data?.id) {
        throw new Error("The server did not return the updated workflow.");
      }

      const updatedWorkflow = result.data as Workflow;

      setWorkflows((current) =>
        current.map((item) =>
          item.id === updatedWorkflow.id
            ? updatedWorkflow
            : item
        )
      );

      setNotice(
        isActive
          ? "Workflow deactivated."
          : "Workflow activated."
      );
    } catch (error) {
      Alert.alert(
        "Workflow update failed",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    setToken("");
    setWorkspaces([]);
    setWorkflows([]);
    setWorkspaceId("");
    setPassword("");
    setNotice("");
    setEditingWorkflow(null);
    setEditorLoading(false);
  }