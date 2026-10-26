import { useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  Blocks,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Code2,
  Command,
  FolderKanban,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
  Workflow,
  Zap,
} from "lucide-react";

type WorkflowItem = {
  id: number;
  name: string;
  description: string;
  status: "Active" | "Draft";
  updated: string;
  nodes: number;
};

const initialWorkflows: WorkflowItem[] = [
  {
    id: 1,
    name: "Customer onboarding",
    description: "Welcome new customers and organize their details.",
    status: "Active",
    updated: "Today",
    nodes: 6,
  },
  {
    id: 2,
    name: "Form submission handler",
    description: "Process incoming forms and prepare responses.",
    status: "Draft",
    updated: "Yesterday",
    nodes: 4,
  },
  {
    id: 3,
    name: "Daily report",
    description: "Prepare a scheduled summary of important activity.",
    status: "Draft",
    updated: "2 days ago",
    nodes: 5,
  },
];

function App() {
  const [workflows, setWorkflows] =
    useState<WorkflowItem[]>(initialWorkflows);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("Overview");
  const [notice, setNotice] = useState("");

  const filteredWorkflows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return workflows.filter((workflow) => {
      const matchesSearch =
        workflow.name.toLowerCase().includes(query) ||
        workflow.description.toLowerCase().includes(query);

      const matchesTab =
        activeTab !== "Active workflows" ||
        workflow.status === "Active";

      return matchesSearch && matchesTab;
    });
  }, [workflows, search, activeTab]);

  function createWorkflow() {
    const id = Date.now();

    const workflow: WorkflowItem = {
      id,
      name: `Untitled workflow ${workflows.length + 1}`,
      description: "A new workflow ready to be configured.",
      status: "Draft",
      updated: "Just now",
      nodes: 0,
    };

    setWorkflows((current) => [workflow, ...current]);
    setActiveTab("Overview");
    setSearch("");
    setNotice("Workflow created. The visual editor is the next step.");
  }

  const activeCount = workflows.filter(
    (workflow) => workflow.status === "Active"
  ).length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="VeloFlow home">
          <span className="brand-icon">
            <Workflow size={23} />
          </span>
          <span className="brand-name">VeloFlow</span>
          <span className="brand-version">BETA</span>
        </a>

        <button
          className="workspace-switcher"
          onClick={() => setNotice("Workspace settings will be connected next.")}
        >
          <span className="workspace-avatar">V</span>
          <span className="workspace-copy">
            <strong>My workspace</strong>
            <small>Personal workspace</small>
          </span>
          <ChevronDown size={16} />
        </button>

        <div className="nav-label">WORKSPACE</div>

        <nav className="navigation">
          <button
            className={`nav-item ${activeTab === "Overview" ? "selected" : ""}`}
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
            <Workflow size={18} />
            <span>Workflows</span>
            <span className="nav-count">{workflows.length}</span>
          </button>

          <button
            className={`nav-item ${activeTab === "Executions" ? "selected" : ""}`}
            onClick={() => {
              setActiveTab("Executions");
              setNotice("Execution history will appear here when the API is connected.");
            }}
          >
            <Activity size={18} />
            <span>Executions</span>
          </button>

          <button
            className={`nav-item ${activeTab === "Credentials" ? "selected" : ""}`}
            onClick={() => {
              setActiveTab("Credentials");
              setNotice("Credential management will be connected to the API.");
            }}
          >
            <Blocks size={18} />
            <span>Credentials</span>
          </button>

          <button
            className={`nav-item ${activeTab === "API keys" ? "selected" : ""}`}
            onClick={() => {
              setActiveTab("API keys");
              setNotice("API key management will be connected to the API.");
            }}
          >
            <Code2 size={18} />
            <span>API keys</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <button
            className="nav-item"
            onClick={() => setNotice("Settings will be added in a later step.")}
          >
            <Settings size={18} />
            <span>Settings</span>
          </button>
          <button
            className="nav-item"
            onClick={() => setNotice("Help documentation is coming soon.")}
          >
            <CircleHelp size={18} />
            <span>Help & support</span>
          </button>

          <div className="sidebar-profile">
            <div className="profile-avatar">U</div>
            <div className="profile-copy">
              <strong>Workspace user</strong>
              <small>Personal plan</small>
            </div>
            <span className="online-dot" />
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
            <span className="keyboard-hint">
              <Command size={13} /> V
            </span>
            <button
              className="icon-button"
              aria-label="Help"
              onClick={() => setNotice("VeloFlow help center is coming soon.")}
            >
              <CircleHelp size={19} />
            </button>
            <div className="profile-avatar top-avatar">U</div>
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

            <button className="primary-button" onClick={createWorkflow}>
              <Plus size={18} />
              Create workflow
            </button>
          </section>

          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button
                onClick={() => setNotice("")}
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          )}

          <section className="stats-grid">
            <article className="stat-card">
              <div className="stat-top">
                <span>Total workflows</span>
                <span className="stat-icon purple">
                  <Workflow size={19} />
                </span>
              </div>
              <div className="stat-value">{workflows.length}</div>
              <div className="stat-foot">
                <FolderKanban size={14} />
                <span>Your automation projects</span>
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
                <span>Currently marked active</span>
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
                <span>Awaiting API connection</span>
              </div>
            </article>
          </section>

          <section className="workflow-section">
            <div className="section-heading">
              <div>
                <h2>Your workflows</h2>
                <p>Manage and organize your automations.</p>
              </div>

              <button className="secondary-button" onClick={createWorkflow}>
                <Plus size={16} />
                New workflow
              </button>
            </div>

            <div className="workflow-toolbar">
              <div className="tab-list">
                <button
                  className={activeTab === "Overview" ? "tab active-tab" : "tab"}
                  onClick={() => setActiveTab("Overview")}
                >
                  All workflows
                  <span>{workflows.length}</span>
                </button>
                <button
                  className={
                    activeTab === "Active workflows" ? "tab active-tab" : "tab"
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
                <article className="workflow-row" key={workflow.id}>
                  <div className="workflow-symbol">
                    <Workflow size={21} />
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
                    onClick={() =>
                      setNotice(
                        `Selected "${workflow.name}". The workflow editor will be implemented next.`
                      )
                    }
                  >
                    <ArrowRight size={18} />
                  </button>
                </article>
              ))}

              {filteredWorkflows.length === 0 && (
                <div className="empty-state">
                  <Search size={25} />
                  <strong>No workflows found</strong>
                  <p>Try another search or create a new workflow.</p>
                  <button className="secondary-button" onClick={createWorkflow}>
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
                VeloFlow is being built with a visual workflow editor,
                reusable credentials, execution tracking, and integrations.
              </p>
            </div>
            <div className="getting-started-decoration">
              <ArrowDownRight size={36} />
            </div>
          </section>

          <footer className="page-footer">
            <span>VeloFlow · Workflow automation</span>
            <span>Building your next automation, one node at a time.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;