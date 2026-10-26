
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
  definition?: {
    nodes?: unknown[];
  };
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
        error instanceof Error ? error.message : "Refresh failed.",
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
        ...previous.filter((item) => item.id !== result.data.id),
      ]);
      setNewName("");
      setNewDescription("");
      setShowCreate(false);
      setNotice("Workflow draft created.");
    } catch (error) {
      Alert.alert(
        "Could not create workflow",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleWorkflow(workflow: Workflow) {
    const activating = workflow.status !== "ACTIVE";

    if (
      activating &&
      !(workflow.definition?.nodes?.length)
    ) {
      Alert.alert(
        "Workflow has no nodes",
        "Add and configure workflow nodes before activating it.",
      );
      return;
    }

    setBusy(true);

    try {
      const action = activating ? "activate" : "deactivate";

      const result = await api(
        `/api/${encodeURIComponent(workspaceId)}/workflows/${encodeURIComponent(workflow.id)}/${action}`,
        "POST",
        {},
      );

      if (result?.data) {
        setWorkflows((previous) =>
          previous.map((item) =>
            item.id === workflow.id
              ? { ...item, ...result.data }
              : item,
          ),
        );
      } else {
        await refresh();
      }

      setNotice(
        activating ? "Workflow activated." : "Workflow deactivated.",
      );
    } catch (error) {
      Alert.alert(
        "Unable to change workflow status",
        error instanceof Error ? error.message : "Unknown error",
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
    setNotice("Signed out.");
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {!token ? (
        <ScrollView contentContainerStyle={s.authPage}>
          <View style={s.logo}>
            <Text style={s.logoText}>V</Text>
          </View>

          <Text style={s.brand}>VeloFlow</Text>
          <Text style={s.muted}>
            Connect. Automate. Simplify.
          </Text>

          <View style={s.card}>
            <Text style={s.title}>
              {register ? "Create account" : "Welcome back"}
            </Text>

            <Text style={s.muted}>
              Sign in to manage your automation workspace.
            </Text>

            {register && (
              <Field
                label="Full name"
                value={name}
                onChangeText={setName}
                placeholder="Your name"
              />
            )}

            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
            />

            <Action
              title={
                busy
                  ? "Please wait…"
                  : register
                    ? "Create account"
                    : "Sign in"
              }
              disabled={busy}
              onPress={authenticate}
            />

            <Action
              title={
                register
                  ? "Already have an account? Sign in"
                  : "Create a new account"
              }
              secondary
              onPress={() => setRegister(!register)}
            />
          </View>

          <View style={s.card}>
            <Text style={s.title}>API connection</Text>
            <Text style={s.muted}>
              Use the HTTPS address of your deployed VeloFlow API.
            </Text>

            <Field
              label="API base URL"
              value={apiDraft}
              onChangeText={setApiDraft}
              placeholder="https://your-api.example.com"
              autoCapitalize="none"
              keyboardType="url"
            />

            <Action
              title="Save API URL"
              onPress={() => {
                setApiUrl(apiDraft.trim());
                setNotice("API URL set for this session.");
              }}
            />

            <Text style={s.small}>
              Do not add /api to the end of the base URL.
            </Text>
          </View>

          {!!notice && <Text style={s.notice}>{notice}</Text>}
        </ScrollView>
      ) : (
        <>
          <View style={s.header}>
            <View style={s.logoSmall}>
              <Text style={s.logoTextSmall}>V</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={s.headerTitle}>VeloFlow</Text>
              <Text style={s.small}>
                {workspaces.find((w) => w.id === workspaceId)?.name ??
                  "Your workspace"}
              </Text>
            </View>

            <Pressable onPress={refresh} style={s.refresh}>
              <Text style={s.refreshText}>↻</Text>
            </Pressable>
          </View>

          <View style={s.tabs}>
            <Tab
              title="Workflows"
              active={tab === "home"}
              onPress={() => setTab("home")}
            />
            <Tab
              title="Settings"
              active={tab === "settings"}
              onPress={() => setTab("settings")}
            />
          </View>

          <ScrollView contentContainerStyle={s.page}>
            {tab === "settings" ? (
              <>
                <Text style={s.pageTitle}>Settings</Text>

                <Field
                  label="API base URL"
                  value={apiDraft || apiUrl}
                  onChangeText={setApiDraft}
                  placeholder="https://your-api.example.com"
                  autoCapitalize="none"
                  keyboardType="url"
                />

                <Action
                  title="Update API URL"
                  onPress={() => {
                    setApiUrl(apiDraft.trim());
                    setNotice("API URL updated.");
                  }}
                />

                <Action
                  title="Sign out"
                  secondary
                  onPress={signOut}
                />
              </>
            ) : (
              <>
                <Text style={s.eyebrow}>YOUR AUTOMATION SPACE</Text>
                <Text style={s.pageTitle}>Workflows</Text>
                <Text style={s.muted}>
                  Create drafts and manage your connected workflows.
                </Text>

                <View style={s.metrics}>
                  <Metric
                    label="Total"
                    value={workflows.length}
                  />
                  <Metric
                    label="Active"
                    value={
                      workflows.filter((w) => w.status === "ACTIVE")
                        .length
                    }
                  />
                  <Metric
                    label="Drafts"
                    value={
                      workflows.filter((w) => w.status === "DRAFT")
                        .length
                    }
                  />
                </View>

                <Action
                  title="+  Create workflow"
                  onPress={() => setShowCreate(!showCreate)}
                />

                {showCreate && (
                  <View style={s.card}>
                    <Text style={s.title}>New workflow</Text>

                    <Field
                      label="Workflow name"
                      value={newName}
                      onChangeText={setNewName}
                      placeholder="Daily report"
                    />

                    <Field
                      label="Description"
                      value={newDescription}
                      onChangeText={setNewDescription}
                      placeholder="What should it do?"
                    />

                    <Action
                      title={busy ? "Saving…" : "Save draft"}
                      disabled={busy}
                      onPress={createWorkflow}
                    />

                    <Action
                      title="Cancel"
                      secondary
                      onPress={() => setShowCreate(false)}
                    />
                  </View>
                )}

                {busy && (
                  <ActivityIndicator
                    color={C.green}
                    style={{ margin: 18 }}
                  />
                )}

                {!workflows.length && !busy && (
                  <View style={s.card}>
                    <Text style={s.title}>No workflows yet</Text>
                    <Text style={s.muted}>
                      Create a draft to get started.
                    </Text>
                  </View>
                )}

                {workflows.map((workflow) => (
                  <View key={workflow.id} style={s.card}>
                    <Text style={s.workflowName}>
                      {workflow.name}
                    </Text>

                    <Text style={s.muted}>
                      {workflow.description || "No description"}
                    </Text>

                    <Text style={s.status}>
                      {workflow.status}
                    </Text>

                    <Text style={s.small}>
                      Version {workflow.version ?? 1} ·{" "}
                      {workflow.definition?.nodes?.length ?? 0} nodes
                    </Text>

                    <Action
                      title={
                        workflow.status === "ACTIVE"
                          ? "Deactivate"
                          : "Activate"
                      }
                      secondary
                      disabled={busy}
                      onPress={() => toggleWorkflow(workflow)}
                    />
                  </View>
                ))}
              </>
            )}

            {!!notice && <Text style={s.notice}>{notice}</Text>}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

function Field(props: any) {
  const { label, ...inputProps } = props;

  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        {...inputProps}
        placeholderTextColor="#75819b"
        style={s.input}
      />
    </View>
  );
}

function Action({
  title,
  onPress,
  disabled,
  secondary,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        s.action,
        secondary && s.actionSecondary,
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={s.actionText}>{title}</Text>
    </Pressable>
  );
}

function Tab({
  title,
  active,
  onPress,
}: {
  title: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.tab, active && s.tabActive]}
    >
      <Text style={{ color: active ? C.text : C.muted }}>
        {title}
      </Text>
    </Pressable>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <View style={s.metric}>
      <Text style={s.metricValue}>{value}</Text>
      <Text style={s.small}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  authPage: { padding: 22, paddingTop: 40, paddingBottom: 40 },
  logo: {
    width: 62,
    height: 62,
    borderRadius: 18,
    backgroundColor: C.purple,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  logoText: { color: "#fff", fontSize: 35, fontWeight: "900" },
  brand: { color: C.text, fontSize: 34, fontWeight: "900" },
  muted: { color: C.muted, fontSize: 14, lineHeight: 21, marginTop: 6 },
  small: { color: C.muted, fontSize: 12, marginTop: 8 },
  card: {
    backgroundColor: C.panel,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 17,
    marginTop: 16,
  },
  title: {
    color: C.text,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 5,
  },
  field: { marginTop: 15 },
  label: { color: C.muted, fontSize: 13, marginBottom: 7 },
  input: {
    backgroundColor: C.input,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: C.text,
    fontSize: 15,
  },
  action: {
    backgroundColor: C.purple,
    borderRadius: 11,
    padding: 14,
    alignItems: "center",
    marginTop: 13,
  },
  actionSecondary: {
    backgroundColor: "#202a43",
    borderWidth: 1,
    borderColor: C.border,
  },
  actionText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  notice: { color: C.green, marginTop: 15, lineHeight: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 12,
  },
  logoSmall: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: C.purple,
    alignItems: "center",
    justifyContent: "center",
  },
  logoTextSmall: { color: "#fff", fontSize: 24, fontWeight: "900" },
  headerTitle: { color: C.text, fontSize: 19, fontWeight: "900" },
  refresh: {
    backgroundColor: C.panel,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  refreshText: { color: C.text, fontSize: 22 },
  tabs: { flexDirection: "row", gap: 8, padding: 14 },
  tab: { padding: 11, borderRadius: 9 },
  tabActive: { backgroundColor: "#25264a" },
  page: { padding: 17, paddingBottom: 45 },
  eyebrow: {
    color: C.green,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  pageTitle: {
    color: C.text,
    fontSize: 29,
    fontWeight: "900",
    marginTop: 8,
  },
  metrics: { flexDirection: "row", gap: 9, marginVertical: 17 },
  metric: {
    flex: 1,
    backgroundColor: C.panel,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 13,
    padding: 12,
  },
  metricValue: { color: C.text, fontSize: 24, fontWeight: "900" },
  workflowName: {
    color: C.text,
    fontSize: 18,
    fontWeight: "800",
  },
  status: {
    color: C.green,
    marginTop: 12,
    fontSize: 12,
    fontWeight: "800",
  },
});
