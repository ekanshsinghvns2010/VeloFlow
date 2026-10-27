import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Clock,
  Code,
  Database,
  GitBranch,
  Globe,
  Mail,
  Play,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Webhook,
  Zap,
} from "lucide-react";
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowNodeKind,
} from "@veloflow/shared";
import {
  connectWorkflowNodes,
  createEmptyWorkflow,
  createWorkflowNode,
  removeWorkflowNode,
} from "@veloflow/shared";
import {
  activateWorkflow,
  executeWorkflow,
  getExecution,
  getWorkflow,
  updateWorkflow,
} from "./lib/api";
import "./WorkflowEditor.css";

type Props = {
  workflowId: string;
  workspaceId: string;
  initialName: string;
  onBack: () => void;
  onSave: (name: string, nodeCount: number) => void;
};

const catalog: {
  type: WorkflowNodeKind;
  label: string;
  description: string;
  category: string;
  icon: typeof Zap;
}[] = [
  {
    type: "manual_trigger",
    label: "Manual trigger",
    description: "Start a workflow manually",
    category: "Triggers",
    icon: Play,
  },
  {
    type: "webhook_trigger",
    label: "Webhook",
    description: "Start when a URL receives a request",
    category: "Triggers",
    icon: Webhook,
  },
  {
    type: "schedule_trigger",
    label: "Schedule",
    description: "Start at a scheduled time",
    category: "Triggers",
    icon: Clock,
  },
  {
    type: "http_request",
    label: "HTTP Request",
    description: "Call an external API",
    category: "Network",
    icon: Globe,
  },
  {
    type: "condition",
    label: "Condition",
    description: "Choose a path based on a rule",
    category: "Logic",
    icon: GitBranch,
  },
  {
    type: "switch",
    label: "Switch",
    description: "Route data to different outputs",
    category: "Logic",
    icon: GitBranch,
  },
  {
    type: "set_data",
    label: "Set Data",
    description: "Create or change data fields",
    category: "Data",
    icon: Settings2,
  },
  {
    type: "transform",
    label: "Transform",
    description: "Transform incoming data",
    category: "Data",
    icon: Code,
  },
  {
    type: "filter",
    label: "Filter",
    description: "Keep matching data items",
    category: "Data",
    icon: GitBranch,
  },
  {
    type: "loop",
    label: "Loop",
    description: "Process a list of items",
    category: "Logic",
    icon: GitBranch,
  },
  {
    type: "delay",
    label: "Delay",
    description: "Wait before continuing",
    category: "Logic",
    icon: Clock,
  },
  {
    type: "ai_prompt",
    label: "AI Prompt",
    description: "Send a prompt to an AI provider",
    category: "AI",
    icon: Sparkles,
  },
  {
    type: "email",
    label: "Email",
    description: "Send an email",
    category: "Communication",
    icon: Mail,
  },
  {
    type: "database",
    label: "Database",
    description: "Run a database operation",
    category: "Storage",
    icon: Database,
  },
  {
    type: "code",
    label: "Code",
    description: "Run a code step",
    category: "Logic",
    icon: Code,
  },
  {
    type: "merge",
    label: "Merge",
    description: "Combine incoming data",
    category: "Logic",
    icon: GitBranch,
  },
];

const NODE_WIDTH = 220;
const NODE_HEIGHT = 88;

function readSavedDefinition(
  workflowId: string,
  name: string,
): WorkflowDefinition {
  const key = `veloflow-workflow-${workflowId}`;

  try {
    const saved = localStorage.getItem(key);

    if (saved) {
      const parsed = JSON.parse(saved) as WorkflowDefinition;

      if (
        Array.isArray(parsed.nodes) &&
        Array.isArray(parsed.connections)
      ) {
        return { ...parsed, name };
      }
    }
  } catch {
    // Ignore damaged local drafts.
  }

  return createEmptyWorkflow(name);
}

export default function WorkflowEditor({
  workflowId,
  workspaceId,
  initialName,
  onBack,
  onSave,
}: Props) {
  const [name, setName] = useState(initialName);
  const [definition, setDefinition] = useState<WorkflowDefinition>(
    () => readSavedDefinition(workflowId, initialName),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    definition.nodes[0]?.id ?? null,
  );
  const [search, setSearch] = useState("");
  const [showLibrary, setShowLibrary] = useState(true);
  const [notice, setNotice] = useState(
    "Add a trigger, then connect nodes to build your workflow.",
  );
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadWorkflow() {
      setLoading(true);

      try {
        const saved = await getWorkflow(workspaceId, workflowId);

        if (!active) return;

        const serverDefinition = saved.definition as
          | WorkflowDefinition
          | undefined;

        if (
          serverDefinition &&
          Array.isArray(serverDefinition.nodes) &&
          Array.isArray(serverDefinition.connections)
        ) {
          setName(saved.name || initialName);
          setDefinition({
            ...serverDefinition,
            name: saved.name || initialName,
          });
          setSelectedId(serverDefinition.nodes[0]?.id ?? null);
          setNotice("Workflow loaded from the server.");
        } else {
          const local = readSavedDefinition(
            workflowId,
            saved.name || initialName,
          );

          setName(saved.name || initialName);
          setDefinition(local);
          setSelectedId(local.nodes[0]?.id ?? null);
          setNotice("Ready to edit your workflow.");
        }
      } catch {
        if (!active) return;

        const local = readSavedDefinition(workflowId, initialName);

        setName(initialName);
        setDefinition(local);
        setSelectedId(local.nodes[0]?.id ?? null);
        setNotice(
          "Could not load the server version. You can still edit and retry saving.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadWorkflow();

    return () => {
      active = false;
    };
  }, [workspaceId, workflowId, initialName]);

  const selectedNode = definition.nodes.find(
    (node) => node.id === selectedId,
  );

  const visibleCatalog = useMemo(() => {
    const query = search.trim().toLowerCase();

    return catalog.filter(
      (item) =>
        item.label.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query),
    );
  }, [search]);

  function updateDefinition(next: WorkflowDefinition) {
    setDefinition(next);
  }

  function addNode(type: WorkflowNodeKind) {
    const node = createWorkflowNode(type, definition.nodes.length);

    const nextNode: WorkflowNode = {
      ...node,
      position: {
        x: 100 + (definition.nodes.length % 3) * 270,
        y: 90 + Math.floor(definition.nodes.length / 3) * 140,
      },
    };

    updateDefinition({
      ...definition,
      name,
      nodes: [...definition.nodes, nextNode],
    });

    setSelectedId(nextNode.id);
    setNotice(`${nextNode.name} added.`);
  }

  function deleteSelected() {
    if (!selectedId) return;

    updateDefinition(removeWorkflowNode(definition, selectedId));
    setSelectedId(null);
    setNotice("Node and its connections removed.");
  }

  function connectTo(targetId: string) {
    if (!connectFrom) {
      setConnectFrom(targetId);
      setNotice("Now select the node you want to connect to.");
      return;
    }

    try {
      const next = connectWorkflowNodes(
        definition,
        connectFrom,
        targetId,
      );

      updateDefinition(next);
      setNotice("Connection created.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not connect nodes.",
      );
    }

    setConnectFrom(null);
  }
  async function persistWorkflow(): Promise<WorkflowDefinition> {
    const next = { ...definition, name };

    await updateWorkflow(workspaceId, workflowId, {
      name,
      definition: next,
    });

    localStorage.setItem(
      `veloflow-workflow-${workflowId}`,
      JSON.stringify(next),
    );

    updateDefinition(next);
    onSave(name, next.nodes.length);

    return next;
  }

  async function saveWorkflow() {
    if (saving || executing) return;

    setSaving(true);

    try {
      await persistWorkflow();
      setNotice("Workflow saved to the server.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? `Save failed: ${error.message}`
          : "Save failed. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function testWorkflow() {
    if (saving || executing || loading) return;

    if (definition.nodes.length === 0) {
      setNotice("Add at least one node before testing this workflow.");
      return;
    }

    setExecuting(true);
    setExecutionId(null);

    try {
      setNotice("Saving workflow before execution...");
      await persistWorkflow();

      setNotice("Activating workflow...");
      await activateWorkflow(workspaceId, workflowId);

      setNotice("Starting workflow execution...");
      const started = await executeWorkflow(
        workspaceId,
        workflowId,
        {},
      );

      setExecutionId(started.id);
      setNotice(
        `Execution ${started.id} queued. Waiting for the worker...`,
      );

      const terminalStatuses = new Set([
        "SUCCEEDED",
        "SUCCESS",
        "COMPLETED",
        "FAILED",
        "CANCELLED",
      ]);

      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 1500);
        });

        const current = await getExecution(
          workspaceId,
          started.id,
        );

        const status = String(
          current.status || "UNKNOWN",
        ).toUpperCase();

        if (terminalStatuses.has(status)) {
          if (
            ["SUCCEEDED", "SUCCESS", "COMPLETED"].includes(status)
          ) {
            setNotice(
              `Workflow succeeded. Execution ID: ${started.id}`,
            );
          } else {
            const errorValue = current.error;

            const errorMessage =
              typeof errorValue === "string"
                ? errorValue
                : errorValue
                  ? JSON.stringify(errorValue)
                  : "No error details were returned.";

            setNotice(
              `Workflow ${status.toLowerCase()}: ${errorMessage}`,
            );
          }

          return;
        }

        setNotice(
          `Execution status: ${status}. Checking again...`,
        );
      }

      setNotice(
        `Execution ${started.id} is still running or queued. Check again in the execution history.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? `Test failed: ${error.message}`
          : "Test failed. Please check the API and execution worker.",
      );
    } finally {
      setExecuting(false);
    }
  }

  function updateSelected(changes: Partial<WorkflowNode>) {
    if (!selectedId) return;

    updateDefinition({
      ...definition,
      nodes: definition.nodes.map((node) =>
        node.id === selectedId
          ? { ...node, ...changes }
          : node,
      ),
    });
  }

  function updateParameter(key: string, value: string) {
    if (!selectedNode) return;

    updateSelected({
      parameters: {
        ...selectedNode.parameters,
        [key]: value,
      },
    });
  }

  function moveNode(
    event: React.PointerEvent<HTMLButtonElement>,
    node: WorkflowNode,
  ) {
    const startX = event.clientX;
    const startY = event.clientY;
    const originalX = node.position.x;
    const originalY = node.position.y;
    const element = event.currentTarget;

    element.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      setDefinition((current) => ({
        ...current,
        nodes: current.nodes.map((item) =>
          item.id === node.id
            ? {
                ...item,
                position: {
                  x: Math.max(0, originalX + dx),
                  y: Math.max(0, originalY + dy),
                },
              }
            : item,
        ),
      }));
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  const nodeIcon = (type: WorkflowNodeKind) => {
    const entry = catalog.find((item) => item.type === type);
    const Icon = entry?.icon ?? Zap;

    return <Icon size={18} />;
  };

  return (
    <div className="vf-editor">
      <header className="vf-editor-header">
        <button
          className="vf-icon-button"
          onClick={onBack}
          title="Back"
        >
          <ArrowLeft size={19} />
        </button>

        <div className="vf-editor-title">
          <input
            aria-label="Workflow name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={200}
          />
          <span>
            <span className="vf-draft-dot" />
            {loading ? "Loading..." : "Draft"} · {definition.nodes.length} nodes
          </span>
        </div>

        <div className="vf-editor-actions">
          <button
            className="vf-secondary-button"
            onClick={saveWorkflow}
            disabled={loading || saving || executing}
          >
            <Save size={16} />
            {saving ? "Saving..." : "Save"}
          </button>

          <button
            className="vf-primary-button"
            onClick={testWorkflow}
            disabled={loading || saving || executing}
          >
            <Play size={16} />
            {executing ? "Testing..." : "Test workflow"}
          </button>
        </div>
      </header>

      <div className="vf-editor-body">
        {showLibrary && (
          <aside className="vf-node-library">
            <div className="vf-panel-heading">
              <div>
                <strong>Node library</strong>
                <p>Choose a step to add</p>
              </div>

              <button
                className="vf-small-icon"
                onClick={() => setShowLibrary(false)}
                title="Hide node library"
              >
                ×
              </button>
            </div>

            <input
              className="vf-search"
              placeholder="Search nodes..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <div className="vf-catalog">
              {visibleCatalog.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    className="vf-catalog-item"
                    key={item.type}
                    onClick={() => addNode(item.type)}
                  >
                    <span
                      className={`vf-node-icon vf-${item.category.toLowerCase()}`}
                    >
                      <Icon size={17} />
                    </span>

                    <span className="vf-catalog-copy">
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>

                    <Plus size={15} />
                  </button>
                );
              })}

              {visibleCatalog.length === 0 && (
                <p className="vf-empty">No matching nodes.</p>
              )}
            </div>
          </aside>
        )}

        <main className="vf-canvas-area">
          <div className="vf-canvas-toolbar">
            {!showLibrary && (
              <button
                className="vf-secondary-button"
                onClick={() => setShowLibrary(true)}
              >
                <Plus size={15} /> Node library
              </button>
            )}

            <span>Canvas</span>
            <span className="vf-toolbar-spacer" />

            <button
              className="vf-secondary-button"
              onClick={() => setConnectFrom(null)}
            >
              Cancel connection
            </button>
          </div>
          <div className="vf-canvas-scroll">
            <div className="vf-canvas">
              <svg className="vf-connections" aria-hidden="true">
                {definition.connections.map((edge) => {
                  const source = definition.nodes.find(
                    (node) => node.id === edge.sourceNodeId,
                  );

                  const target = definition.nodes.find(
                    (node) => node.id === edge.targetNodeId,
                  );

                  if (!source || !target) return null;

                  const x1 = source.position.x + NODE_WIDTH;
                  const y1 = source.position.y + NODE_HEIGHT / 2;
                  const x2 = target.position.x;
                  const y2 = target.position.y + NODE_HEIGHT / 2;
                  const curve = Math.max(45, Math.abs(x2 - x1) / 2);

                  return (
                    <path
                      key={edge.id}
                      d={`M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`}
                      className="vf-edge"
                    />
                  );
                })}
              </svg>

              {definition.nodes.map((node) => (
                <article
                  key={node.id}
                  className={`vf-node ${
                    selectedId === node.id ? "vf-node-selected" : ""
                  } ${node.disabled ? "vf-node-disabled" : ""}`}
                  style={{
                    left: node.position.x,
                    top: node.position.y,
                    width: NODE_WIDTH,
                  }}
                >
                  <button
                    className="vf-node-main"
                    onClick={() => setSelectedId(node.id)}
                    onPointerDown={(event) => {
                      if (
                        event.button === 0 &&
                        event.target === event.currentTarget
                      ) {
                        moveNode(event, node);
                      }
                    }}
                  >
                    <span className="vf-node-symbol">
                      {nodeIcon(node.type)}
                    </span>

                    <span className="vf-node-labels">
                      <strong>{node.name}</strong>
                      <small>
                        {catalog.find((item) => item.type === node.type)
                          ?.label ?? node.type}
                      </small>
                    </span>

                    {node.disabled && (
                      <span className="vf-disabled-label">Off</span>
                    )}
                  </button>

                  <button
                    className={`vf-node-port vf-input-port ${
                      connectFrom === node.id ? "vf-port-armed" : ""
                    }`}
                    aria-label={`Connect from or to ${node.name}`}
                    title="Select this node to connect"
                    onClick={() => connectTo(node.id)}
                  />

                  <button
                    className="vf-node-port vf-output-port"
                    aria-label={`Connect from ${node.name}`}
                    title="Click to start a connection"
                    onClick={() => {
                      setConnectFrom(node.id);
                      setNotice(
                        `Choose the destination node for ${node.name}.`,
                      );
                    }}
                  />
                </article>
              ))}

              {definition.nodes.length === 0 && (
                <div className="vf-canvas-empty">
                  <div className="vf-empty-icon">
                    <Zap size={25} />
                  </div>

                  <h2>Start building your workflow</h2>
                  <p>
                    Add a trigger from the node library, then add and connect
                    actions.
                  </p>

                  {!showLibrary && (
                    <button
                      className="vf-primary-button"
                      onClick={() => setShowLibrary(true)}
                    >
                      <Plus size={16} /> Browse nodes
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="vf-status-bar">
            <span>
              <span className="vf-status-dot" />
              {loading ? "Loading workflow..." : "Editor ready"}
            </span>
            <span>{definition.nodes.length} nodes</span>
            <span>{definition.connections.length} connections</span>
          </div>

          {notice && (
            <div className="vf-notice" role="status">
              {notice}
              {executionId && (
                <div>
                  <small>Execution ID: {executionId}</small>
                </div>
              )}
            </div>
          )}
        </main>

        <aside className="vf-inspector">
          <div className="vf-panel-heading">
            <div>
              <strong>Node settings</strong>
              <p>Configure the selected step</p>
            </div>
            <Settings2 size={18} />
          </div>

          {!selectedNode ? (
            <div className="vf-inspector-empty">
              <Settings2 size={25} />
              <strong>No node selected</strong>
              <p>
                Select a node on the canvas to edit its settings.
              </p>
            </div>
          ) : (
            <div className="vf-inspector-content">
              <div className="vf-selected-type">
                <span className="vf-node-symbol">
                  {nodeIcon(selectedNode.type)}
                </span>

                <span>
                  <strong>{selectedNode.name}</strong>
                  <small>{selectedNode.type}</small>
                </span>
              </div>

              <label className="vf-field">
                <span>Node name</span>
                <input
                  value={selectedNode.name}
                  maxLength={120}
                  onChange={(event) =>
                    updateSelected({ name: event.target.value })
                  }
                />
              </label>

              <label className="vf-field">
                <span>Node type</span>
                <input value={selectedNode.type} readOnly />
              </label>

              <label className="vf-field">
                <span>Example parameter key</span>
                <input
                  placeholder="e.g. url, method, expression"
                  value={String(
                    selectedNode.parameters.parameterKey ?? "",
                  )}
                  onChange={(event) =>
                    updateParameter("parameterKey", event.target.value)
                  }
                />
              </label>

              <label className="vf-field">
                <span>Example parameter value</span>
                <textarea
                  rows={4}
                  placeholder="Enter a value for this node..."
                  value={String(
                    selectedNode.parameters.parameterValue ?? "",
                  )}
                  onChange={(event) =>
                    updateParameter("parameterValue", event.target.value)
                  }
                />
              </label>

              <label className="vf-toggle">
                <span>
                  <strong>Disable node</strong>
                  <small>Skip this step when executing</small>
                </span>

                <input
                  type="checkbox"
                  checked={selectedNode.disabled}
                  onChange={(event) =>
                    updateSelected({ disabled: event.target.checked })
                  }
                />
              </label>

              <button
                className="vf-danger-button"
                onClick={deleteSelected}
              >
                <Trash2 size={16} /> Delete node
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}