
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Activity,
  ArrowRight,
  Blocks,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Code2,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  Settings,
  Workflow as WorkflowIcon,
  Zap,
} from "lucide-react";

import WorkflowEditor from "./WorkflowEditor";
import {
  ApiError,
  clearSession,
  createWorkflow,
  getAccessToken,
  getStoredUser,
  getCurrentUser,
  getWorkspaces,
  getWorkflows,
  login,
  logout,
  register,
} from "./lib/api";
import type {
  ApiUser,
  ApiWorkspace,
  ApiWorkflow,
} from "./lib/api";

type WorkflowItem = {
  id: string;
  name: string;
  description: string;
  status: "Active" | "Draft";
  updated: string;
  nodes: number;
};

function toWorkflowItem(workflow: ApiWorkflow): WorkflowItem {
  const definition = workflow.definition;

  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description || "No description yet.",
    status: workflow.status === "ACTIVE" ? "Active" : "Draft",
    updated: new Date(workflow.updatedAt).toLocaleString(),
    nodes: definition?.nodes?.length ?? 0,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) {
      return "Cannot reach the VeloFlow API. Check your internet connection and deployment.";
    }

    if (error.status === 401) {
      return "Your session expired. Please log in again.";
    }

    return error.message;
  }

  return error instanceof Error ? error.message : "Something went wrong.";
}

function App() {
  const [user, setUser] = useState<ApiUser | null>(() => getStoredUser());
  const [workspaces, setWorkspaces] = useState<ApiWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("Overview");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [editingWorkflow, setEditingWorkflow] =
    useState<WorkflowItem | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);

      const availableWorkspaces = await getWorkspaces();
      setWorkspaces(availableWorkspaces);

      if (availableWorkspaces.length === 0) {
        setWorkspaceId("");
        setWorkflows([]);
        setError("No workspace exists for this account yet.");
        return;
      }

      const selected =
        availableWorkspaces.find(
          (workspace) => workspace.id === workspaceId,
        ) ?? availableWorkspaces[0];

      if (!selected) {
        setWorkspaceId("");
        setWorkflows([]);
        setError("No workspace is available for this account.");
        return;
      }

      setWorkspaceId(selected.id);

      const items = await getWorkflows(selected.id);
      setWorkflows(items.map(toWorkflowItem));
    } catch (cause) {
      setError(errorMessage(cause));

      if (cause instanceof ApiError && cause.status === 401) {
        clearSession();
        setUser(null);
        setWorkspaces([]);
        setWorkflows([]);
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!getAccessToken()) {
      setLoading(false);
      setUser(null);
      return;
    }

    void loadDashboard();
  }, [loadDashboard]);

  async function handleAuthSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setAuthBusy(true);
    setError("");
    setNotice("");

    try {
      if (authMode === "register") {
        await register({
          name: authName.trim(),
          email: authEmail.trim(),
          password: authPassword,
        });
      } else {
        await login({
          email: authEmail.trim(),
          password: authPassword,
        });
      }

      setAuthPassword("");
      setUser(getStoredUser());
      await loadDashboard();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    setError("");
    setNotice("");

    try {
      await logout();
    } catch {
      clearSession();
    }

    setUser(null);
    setWorkspaces([]);
    setWorkflows([]);
    setWorkspaceId("");
    setEditingWorkflow(null);
    setNotice("You have been logged out.");
  }

  async function handleCreateWorkflow() {
    if (!workspaceId || saving) {
      setError("Please wait for your workspace to finish loading.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const created = await createWorkflow(workspaceId, {
        name: `Untitled workflow ${workflows.length + 1}`,
        description: "",
      });

      const item = toWorkflowItem(created);

      setWorkflows((current) => [item, ...current]);
      setEditingWorkflow(item);
      setActiveTab("Overview");
      setSearch("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  const filteredWorkflows = workflows.filter((workflow) => {
    const query = search.trim().toLowerCase();

    const matchesSearch =
      workflow.name.toLowerCase().includes(query) ||
      workflow.description.toLowerCase().includes(query);

    const matchesTab =
      activeTab !== "Active workflows" || workflow.status === "Active";

    return matchesSearch && matchesTab;
  });

  const activeCount = workflows.filter(
    (workflow) => workflow.status === "Active",
  ).length;

  function handleEditorSave(name: string, nodeCount: number) {
    if (!editingWorkflow) return;

    setWorkflows((current) =>
      current.map((workflow) =>
        workflow.id === editingWorkflow.id
          ? {
              ...workflow,
              name,
              nodes: nodeCount,
              updated: "Just now",
            }
          : workflow,
      ),
    );

    setEditingWorkflow((current) =>
      current ? { ...current, name, nodes: nodeCount } : null,
    );

    setNotice(
      "The editor has updated its local draft. Permanent node saving is the next integration step.",
    );
  }

  if (!user) {
    return (
      <div className="app-shell" style={authShell}>
        <div style={authCard}>
          <div className="brand" style={{ marginBottom: 24 }}>
            <span className="brand-icon">
              <WorkflowIcon size={23} />
            </span>
            <span className="brand-name">VeloFlow</span>
            <span className="brand-version">BETA</span>
          </div>

          <h1 style={{ fontSize: 28, marginBottom: 8 }}>
            {authMode === "login"
              ? "Welcome back"
              : "Create your account"}
          </h1>

          <p style={{ color: "#777", marginBottom: 24 }}>
            {authMode === "login"
              ? "Log in to manage your workflows."
              : "Start building your own automations."}
          </p>

          {error && (
            <div className="notice" role="alert" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} style={formStyle}>
            {authMode === "register" && (
              <label style={labelStyle}>
                Full name
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  autoComplete="name"
                  value={authName}
                  onChange={(event) => setAuthName(event.target.value)}
                  placeholder="Your name"
                  style={inputStyle}
                />
              </label>
            )}

            <label style={labelStyle}>
              Email address
              <input
                required
                type="email"
                autoComplete="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Password
              <input
                required
                type="password"
                minLength={authMode === "register" ? 12 : 1}
                maxLength={128}
                autoComplete={
                  authMode === "register"
                    ? "new-password"
                    : "current-password"
                }
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                placeholder={
                  authMode === "register"
                    ? "At least 12 characters"
                    : "Your password"
                }
                style={inputStyle}
              />
            </label>

            {authMode === "register" && (
              <p style={{ color: "#777", fontSize: 12 }}>
                Use a password of at least 12 characters.
              </p>
            )}

            <button
              className="primary-button"
              type="submit"
              disabled={authBusy}
              style={{ justifyContent: "center", width: "100%" }}
            >
              {authBusy
                ? "Please wait..."
                : authMode === "login"
                  ? "Log in"
                  : "Create account"}
            </button>
          </form>

          <p style={{ marginTop: 22, color: "#777", textAlign: "center" }}>
            {authMode === "login"
              ? "New to VeloFlow? "
              : "Already have an account? "}
            <button
              type="button"
              onClick={() => {
                setAuthMode(
                  authMode === "login" ? "register" : "login",
                );
                setError("");
              }}
              style={textButtonStyle}
            >
              {authMode === "login"
                ? "Create an account"
                : "Log in"}
            </button>
          </p>
        </div>
      </div>
    );
  }

  if (editingWorkflow) {
    return (
      <WorkflowEditor
        key={editingWorkflow.id}
        workspaceId={workspaceId}
        workflowId={editingWorkflow.id}
        initialName={editingWorkflow.name}
        onBack={() => {
          setEditingWorkflow(null);
          void loadDashboard();
        }}
        onSave={handleEditorSave}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          aria-label="VeloFlow home"
          onClick={(event) => {
            event.preventDefault();
            setActiveTab("Overview");
          }}
        >
          <span className="brand-icon">
            <WorkflowIcon size={23} />
          </span>
          <span className="brand-name">VeloFlow</span>
          <span className="brand-version">BETA</span>
        </a>

        <button
          className="workspace-switcher"
          onClick={() => {
            if (workspaces.length > 1) {
              const currentIndex = workspaces.findIndex(
                (workspace) => workspace.id === workspaceId,
              );
              const next =
                workspaces[(currentIndex + 1) % workspaces.length];

              if (next) {
                setWorkspaceId(next.id);
              }
            } else {
              setNotice(
                workspaces[0]
                  ? `Current workspace: ${workspaces[0].name}`
                  : "No workspace available.",
              );
            }
          }}
        >
          <span className="workspace-avatar">
            {(
              workspaces.find((workspace) => workspace.id === workspaceId)
                ?.name || "V"
            )
              .slice(0, 1)
              .toUpperCase()}
          </span>

          <span className="workspace-copy">
            <strong>
              {workspaces.find((workspace) => workspace.id === workspaceId)
                ?.name || "My workspace"}
            </strong>
            <small>
              {workspaces.length > 1
                ? `${workspaces.length} workspaces · Switch workspace`
                : "Personal workspace"}
            </small>
          </span>
          <ChevronDown size={16} />
        </button>

        <div className="nav-label">WORKSPACE</div>

        <nav className="navigation">
          <button
            className={`nav-item ${
              activeTab === "Overview" ? "selected" : ""
            }`}
            onClick={() => setActiveTab("Overview")}
          >
            <LayoutDashboard size={18} />
            <span>Overview</span>
          </button>

          <button
            className={`nav-item ${
              activeTab === "Active workflows" ? "selected" : ""
            }`}
            onClick={() => setActiveTab("Active workflows")}
          >
            <WorkflowIcon size={18} />
            <span>Workflows</span>
            <span className="nav-count">{workflows.length}</span>
          </button>

          <button
            className={`nav-item ${
              activeTab === "Executions" ? "selected" : ""
            }`}
            onClick={() => {
              setActiveTab("Executions");
              setNotice("Execution history will be connected next.");
            }}
          >
            <Activity size={18} />
            <span>Executions</span>
          </button>

          <button
            className={`nav-item ${
              activeTab === "Credentials" ? "selected" : ""
            }`}
            onClick={() => {
              setActiveTab("Credentials");
              setNotice("Credential management will be connected next.");
            }}
          >
            <Blocks size={18} />
            <span>Credentials</span>
          </button>

          <button
            className={`nav-item ${
              activeTab === "API keys" ? "selected" : ""
            }`}
            onClick={() => {
              setActiveTab("API keys");
              setNotice("API key management will be connected next.");
            }}
          >
            <Code2 size={18} />
            <span>API keys</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <button
            className="nav-item"
            onClick={() =>
              setNotice("Workspace settings will be added next.")
            }
          >
            <Settings size={18} />
            <span>Settings</span>
          </button>

          <button
            className="nav-item"
            onClick={() =>
              setNotice("Help documentation is coming soon.")
            }
          >
            <CircleHelp size={18} />
            <span>Help &amp; support</span>
          </button>

          <div className="sidebar-profile">
            <div className="profile-avatar">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="profile-copy">
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
            <button
              className="row-action"
              aria-label="Log out"
              title="Log out"
              onClick={() => void handleLogout()}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <strong>{activeTab}</strong>
          </div>

          <div className="topbar-actions">
            <span className="keyboard-hint">VeloFlow</span>
            <div className="profile-avatar top-avatar">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-dot" />
                YOUR AUTOMATION SPACE
              </div>
              <h1>
                Build something <span>amazing.</span>
              </h1>
              <p className="welcome-description">
                Connect your tools, automate repetitive tasks, and let your
                workflows do the work.
              </p>
            </div>

            <button
              className="primary-button"
              onClick={() => void handleCreateWorkflow()}
              disabled={loading || saving || !workspaceId}
            >
              <Plus size={18} />
              {saving ? "Creating..." : "Create workflow"}
            </button>
          </section>

          {error && (
            <div className="notice" role="alert">
              <span>{error}</span>
              <button
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          )}

          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button
                onClick={() => setNotice("")}
                aria-label="Dismiss notice"
              >
                ×
              </button>
            </div>
          )}

          {loading ? (
            <section className="getting-started">
              <div className="getting-started-icon">
                <Clock3 size={23} />
              </div>
              <div className="getting-started-copy">
                <h3>Loading your workspace...</h3>
                <p>Connecting to the VeloFlow API.</p>
              </div>
            </section>
          ) : (
            <>
              <section className="stats-grid">
                <article className="stat-card">
                  <div className="stat-top">
                    <span>Total workflows</span>
                    <span className="stat-icon purple">
                      <WorkflowIcon size={19} />
                    </span>
                  </div>
                  <div className="stat-value">{workflows.length}</div>
                  <div className="stat-foot">
                    <FolderKanban size={14} />
                    <span>Saved in your workspace</span>
                  </div>
                </article>

                <article className="stat-card">
                  <div className="stat-top">
                    <span>Active workflows</span>
                    <span className="stat-icon green">
                      <Zap size={19} />
                    </span>
                  </div>
                  <div className="stat-value">{activeCount}</div>
                  <div className="stat-foot">
                    <CheckCircle2 size={14} />
                    <span>Currently active</span>
                  </div>
                </article>

                <article className="stat-card">
                  <div className="stat-top">
                    <span>Executions</span>
                    <span className="stat-icon blue">
                      <Activity size={19} />
                    </span>
                  </div>
                  <div className="stat-value">—</div>
                  <div className="stat-foot">
                    <Clock3 size={14} />
                    <span>Execution statistics coming next</span>
                  </div>
                </article>
              </section>

              <section className="workflow-section">
                <div className="section-heading">
                  <div>
                    <h2>Your workflows</h2>
                    <p>
                      These records are loaded from your VeloFlow backend.
                    </p>
                  </div>

                  <button
                    className="secondary-button"
                    onClick={() => void handleCreateWorkflow()}
                    disabled={saving || !workspaceId}
                  >
                    <Plus size={16} />
                    New workflow
                  </button>
                </div>

                <div className="workflow-toolbar">
                  <div className="tab-list">
                    <button
                      className={
                        activeTab === "Overview"
                          ? "tab active-tab"
                          : "tab"
                      }
                      onClick={() => setActiveTab("Overview")}
                    >
                      All workflows <span>{workflows.length}</span>
                    </button>

                    <button
                      className={
                        activeTab === "Active workflows"
                          ? "tab active-tab"
                          : "tab"
                      }
                      onClick={() => setActiveTab("Active workflows")}
                    >
                      Active
                    </button>
                  </div>

                  <label className="search-box">
                    <Search size={17} />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search workflows..."
                      aria-label="Search workflows"
                    />
                  </label>
                </div>

                <div className="workflow-list">
                  {filteredWorkflows.map((workflow) => (
                    <article
                      className="workflow-row"
                      key={workflow.id}
                    >
                      <div className="workflow-symbol">
                        <WorkflowIcon size={21} />
                      </div>

                      <div className="workflow-info">
                        <strong>{workflow.name}</strong>
                        <p>{workflow.description}</p>
                      </div>

                      <div className="workflow-node-count">
                        <Blocks size={15} />
                        {workflow.nodes} nodes
                      </div>

                      <div className="workflow-updated">
                        <Clock3 size={14} />
                        {workflow.updated}
                      </div>

                      <span
                        className={`status-pill ${
                          workflow.status === "Active"
                            ? "status-active"
                            : "status-draft"
                        }`}
                      >
                        <span />
                        {workflow.status}
                      </span>

                      <button
                        className="row-action"
                        aria-label={`Open ${workflow.name}`}
                        onClick={() => setEditingWorkflow(workflow)}
                      >
                        <ArrowRight size={18} />
                      </button>
                    </article>
                  ))}

                  {filteredWorkflows.length === 0 && (
                    <div className="empty-state">
                      <Search size={25} />
                      <strong>
                        {workflows.length === 0
                          ? "Your workspace is ready"
                          : "No workflows found"}
                      </strong>
                      <p>
                        {workflows.length === 0
                          ? "Create your first workflow to get started."
                          : "Try another search or create a new workflow."}
                      </p>
                      <button
                        className="secondary-button"
                        onClick={() => void handleCreateWorkflow()}
                        disabled={saving || !workspaceId}
                      >
                        <Plus size={16} />
                        Create workflow
                      </button>
                    </div>
                  )}
                </div>
              </section>

              <section className="getting-started">
                <div className="getting-started-icon">
                  <Zap size={23} />
                </div>
                <div className="getting-started-copy">
                  <span className="getting-started-label">NEXT STEP</span>
                  <h3>Your ideas, connected.</h3>
                  <p>
                    Your account, workspace, and workflow records now use the
                    backend. Next we'll connect the visual editor so every
                    node and connection is saved to your database.
                  </p>
                </div>
              </section>
            </>
          )}

          <footer className="page-footer">
            <span>VeloFlow · Workflow automation</span>
            <span>Signed in as {user.email}</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

const authShell = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
} as const;

const authCard = {
  width: "100%",
  maxWidth: 430,
  padding: 30,
  borderRadius: 18,
  background: "var(--card, #ffffff)",
  boxShadow: "0 12px 50px rgba(0,0,0,0.08)",
} as const;

const formStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 18,
} as const;

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontSize: 14,
  fontWeight: 600,
} as const;

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "12px 14px",
  borderRadius: 9,
  border: "1px solid #d8dce5",
  background: "transparent",
  font: "inherit",
  fontWeight: 400,
} as const;

const textButtonStyle = {
  border: 0,
  background: "transparent",
  color: "#6655d9",
  font: "inherit",
  fontWeight: 600,
  cursor: "pointer",
} as const;

export default App;
