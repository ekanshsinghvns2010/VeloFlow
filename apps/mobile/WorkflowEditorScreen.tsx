import React, { useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Path, Circle } from "react-native-svg";

import {
  createEmptyWorkflow,
  createWorkflowNode,
  connectWorkflowNodes,
  removeWorkflowNode,
} from "../../packages/shared/src/workflow-editor";

import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowNodeKind,
} from "../../packages/shared/src";

const COLORS = {
  background: "#090B10",
  panel: "#11151D",
  panel2: "#171D28",
  border: "#252D3A",
  text: "#F4F7FB",
  muted: "#8994A6",

  purple: "#8B5CF6",
  purpleLight: "#A78BFA",
  green: "#34D399",
  blue: "#60A5FA",
  orange: "#FBBF24",
  red: "#FB7185",

  // Additional colors referenced by the editor styles
  warning: "#FBBF24",
  accent: "#8B5CF6",
  canvas: "#0C1017",
  iconBg: "#1B2230",
  success: "#34D399",
  dangerBg: "#3A1C27",
  danger: "#FB7185",
};

const NODE_TYPES: {
  type: WorkflowNodeKind;
  title: string;
  description: string;
  icon: string;
  color: string;
}[] = [
  {
    type: "manual_trigger",
    title: "Manual Trigger",
    description: "Start workflow manually",
    icon: "▶",
    color: COLORS.green,
  },
  {
    type: "webhook_trigger",
    title: "Webhook",
    description: "Start from an HTTP request",
    icon: "⌁",
    color: COLORS.green,
  },
  {
    type: "http_request",
    title: "HTTP Request",
    description: "Call an external API",
    icon: "↗",
    color: COLORS.blue,
  },
  {
    type: "condition",
    title: "Condition",
    description: "Branch based on a condition",
    icon: "◇",
    color: COLORS.orange,
  },
  {
    type: "code",
    title: "Code",
    description: "Run custom JavaScript",
    icon: "</>",
    color: COLORS.purpleLight,
  },
  {
    type: "set_data",
    title: "Set Data",
    description: "Create or update data",
    icon: "✎",
    color: COLORS.blue,
  },
  {
    type: "ai_prompt",
    title: "AI Prompt",
    description: "Run an AI prompt",
    icon: "✦",
    color: COLORS.purple,
  },
  {
    type: "email",
    title: "Email",
    description: "Send an email",
    icon: "✉",
    color: COLORS.orange,
  },
];

const NODE_WIDTH = 220;
const NODE_HEIGHT = 88;

type Props = {
  initialWorkflow?: WorkflowDefinition;
  onSave?: (workflow: WorkflowDefinition) => void | Promise<void>;
  onBack?: () => void;
};

export default function WorkflowEditorScreen({
  initialWorkflow,
  onSave,
  onBack,
}: Props) {
  const screenWidth = Dimensions.get("window").width;

  const [workflow, setWorkflow] = useState<WorkflowDefinition>(
    initialWorkflow ?? createEmptyWorkflow("My workflow"),
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    null,
  );

  const [connectingFrom, setConnectingFrom] = useState<string | null>(
    null,
  );

  const [showNodePanel, setShowNodePanel] = useState(false);

  const [activeTab, setActiveTab] = useState<
    "canvas" | "settings"
  >("canvas");

  const selectedNode = workflow.nodes.find(
    (node) => node.id === selectedNodeId,
  );

  const canvasWidth = Math.max(screenWidth - 24, 340);

  const canvasHeight = useMemo(() => {
    if (workflow.nodes.length === 0) return 620;

    const maxY = Math.max(
      ...workflow.nodes.map((node) => node.position.y),
    );

    return Math.max(620, maxY + 250);
  }, [workflow.nodes]);

  function addNode(type: WorkflowNodeKind) {
    const newNode = createWorkflowNode(
      type,
      workflow.nodes.length,
    );

    const lastNode = workflow.nodes[workflow.nodes.length - 1];

    if (lastNode) {
      newNode.position = {
        x: lastNode.position.x,
        y: lastNode.position.y + 150,
      };
    }

    setWorkflow((current) => ({
      ...current,
      nodes: [...current.nodes, newNode],
    }));

    setSelectedNodeId(newNode.id);
    setShowNodePanel(false);
  }

  function handleNodePress(node: WorkflowNode) {
    if (connectingFrom && connectingFrom !== node.id) {
      try {
        setWorkflow((current) =>
          connectWorkflowNodes(
            current,
            connectingFrom,
            node.id,
          ),
        );

        setConnectingFrom(null);
        setSelectedNodeId(node.id);
      } catch (error) {
        Alert.alert(
          "Connection failed",
          error instanceof Error
            ? error.message
            : "Unable to connect these nodes.",
        );
      }

      return;
    }

    setSelectedNodeId(node.id);
  }

  function startConnection() {
    if (!selectedNodeId) {
      Alert.alert("Select a node", "Tap a node first.");
      return;
    }

    setConnectingFrom(selectedNodeId);
    setSelectedNodeId(null);
  }

  function deleteSelectedNode() {
    if (!selectedNodeId) return;

    setWorkflow((current) =>
      removeWorkflowNode(current, selectedNodeId),
    );

    setSelectedNodeId(null);
    setConnectingFrom(null);
  }

  async function saveWorkflow() {
  if (!onSave) {
    Alert.alert(
      "Save unavailable",
      "No save handler is connected to this editor.",
    );
    return;
  }

  try {
    await onSave(workflow);

    Alert.alert(
      "Workflow saved",
      "Your workflow was successfully saved to VeloFlow.",
    );
  } catch (error) {
    Alert.alert(
      "Save failed",
      error instanceof Error
        ? error.message
        : "VeloFlow could not save this workflow. Check your connection and try again.",
    );
  }
}

  function getNodeColor(type: WorkflowNodeKind) {
    return (
      NODE_TYPES.find((item) => item.type === type)?.color ??
      COLORS.purple
    );
  }

  function getNodeIcon(type: WorkflowNodeKind) {
    return (
      NODE_TYPES.find((item) => item.type === type)?.icon ?? "◆"
    );
  }

  function getConnectionPath(
    source: WorkflowNode,
    target: WorkflowNode,
  ) {
    const startX = source.position.x + NODE_WIDTH / 2;
    const startY = source.position.y + NODE_HEIGHT;

    const endX = target.position.x + NODE_WIDTH / 2;
    const endY = target.position.y;

    const controlY = (startY + endY) / 2;

    return `M ${startX} ${startY}
      C ${startX} ${controlY},
        ${endX} ${controlY},
        ${endX} ${endY}`;
  }
  return (
    <View style={styles.container}>
      <StatusBar
        backgroundColor={COLORS.background}
        barStyle="light-content"
      />

      {/* TOP BAR */}
      <View style={styles.topBar}>
        <Pressable
          style={styles.backButton}
          onPress={onBack}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>

        <View style={styles.titleArea}>
          <Text style={styles.eyebrow}>WORKFLOW EDITOR</Text>

          <Text style={styles.workflowTitle} numberOfLines={1}>
            {workflow.name}
          </Text>
        </View>

        <View style={styles.draftBadge}>
          <View style={styles.draftDot} />
          <Text style={styles.draftText}>Draft</Text>
        </View>
      </View>

      {/* TOOLBAR */}
      <View style={styles.toolbar}>
        <Pressable
          style={[
            styles.toolbarTab,
            activeTab === "canvas" && styles.toolbarTabActive,
          ]}
          onPress={() => setActiveTab("canvas")}
        >
          <Text
            style={[
              styles.toolbarTabText,
              activeTab === "canvas" &&
                styles.toolbarTabTextActive,
            ]}
          >
            Canvas
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.toolbarTab,
            activeTab === "settings" &&
              styles.toolbarTabActive,
          ]}
          onPress={() => setActiveTab("settings")}
        >
          <Text
            style={[
              styles.toolbarTabText,
              activeTab === "settings" &&
                styles.toolbarTabTextActive,
            ]}
          >
            Settings
          </Text>
        </Pressable>

        <View style={{ flex: 1 }} />

        <Pressable
  style={styles.saveButton}
  onPress={() => {
    void saveWorkflow();
  }}
>
          <Text style={styles.saveButtonText}>Save</Text>
        </Pressable>
      </View>

      {activeTab === "canvas" ? (
        <>
          {/* CANVAS */}
          <View style={styles.canvasContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                width: canvasWidth,
              }}
            >
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                  height: canvasHeight,
                }}
              >
                <View
                  style={[
                    styles.canvas,
                    {
                      width: canvasWidth,
                      height: canvasHeight,
                    },
                  ]}
                >
                  {/* BACKGROUND GRID */}
                  <View
                    pointerEvents="none"
                    style={styles.grid}
                  />

                  {/* CONNECTION LINES */}
                  <Svg
                    pointerEvents="none"
                    width={canvasWidth}
                    height={canvasHeight}
                    style={StyleSheet.absoluteFill}
                  >
                    {workflow.connections.map((connection) => {
                      const source = workflow.nodes.find(
                        (node) =>
                          node.id === connection.sourceNodeId,
                      );

                      const target = workflow.nodes.find(
                        (node) =>
                          node.id === connection.targetNodeId,
                      );

                      if (!source || !target) return null;

                      return (
                        <React.Fragment key={connection.id}>
                          <Path
                            d={getConnectionPath(source, target)}
                            stroke={COLORS.purple}
                            strokeWidth={2.5}
                            fill="none"
                          />

                          <Circle
                            cx={
                              target.position.x +
                              NODE_WIDTH / 2
                            }
                            cy={target.position.y}
                            r={4}
                            fill={COLORS.purpleLight}
                          />
                        </React.Fragment>
                      );
                    })}
                  </Svg>

                  {/* WORKFLOW NODES */}
                  {workflow.nodes.map((node) => {
                    const selected =
                      selectedNodeId === node.id;

                    const connecting =
                      connectingFrom === node.id;

                    return (
                      <Pressable
                        key={node.id}
                        onPress={() => handleNodePress(node)}
                        style={[
                          styles.node,
                          {
                            left: node.position.x,
                            top: node.position.y,
                            borderColor: selected
                              ? COLORS.purpleLight
                              : connecting
                                ? COLORS.green
                                : COLORS.border,
                          },
                          selected && styles.nodeSelected,
                        ]}
                      >
                        <View
                          style={[
                            styles.nodeIcon,
                            {
                              backgroundColor:
                                getNodeColor(node.type) + "20",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.nodeIconText,
                              {
                                color: getNodeColor(node.type),
                              },
                            ]}
                          >
                            {getNodeIcon(node.type)}
                          </Text>
                        </View>

                        <View style={styles.nodeContent}>
                          <Text
                            style={styles.nodeName}
                            numberOfLines={1}
                          >
                            {node.name}
                          </Text>

                          <Text style={styles.nodeType}>
                            {node.type.replaceAll("_", " ")}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.nodeStatus,
                            {
                              backgroundColor:
                                connecting
                                  ? COLORS.green
                                  : COLORS.muted,
                            },
                          ]}
                        />
                      </Pressable>
                    );
                  })}

                  {/* EMPTY CANVAS */}
                  {workflow.nodes.length === 0 && (
                    <View style={styles.emptyCanvas}>
                      <View style={styles.emptyIcon}>
                        <Text style={styles.emptyIconText}>
                          +
                        </Text>
                      </View>

                      <Text style={styles.emptyTitle}>
                        Start building
                      </Text>

                      <Text style={styles.emptyDescription}>
                        Add a trigger node to begin your workflow.
                      </Text>

                      <Pressable
                        style={styles.emptyButton}
                        onPress={() => setShowNodePanel(true)}
                      >
                        <Text style={styles.emptyButtonText}>
                          + Add your first node
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </ScrollView>
            </ScrollView>

            {/* CANVAS FLOATING CONTROLS */}
            <View style={styles.canvasControls}>
              <Pressable
                style={styles.canvasControlButton}
                onPress={() => setShowNodePanel(true)}
              >
                <Text style={styles.canvasControlText}>＋</Text>
              </Pressable>
            </View>
          </View>
          {/* BOTTOM NODE ACTIONS */}
          <View style={styles.bottomPanel}>
            {connectingFrom ? (
              <View style={styles.connectionNotice}>
                <View style={styles.connectionNoticeDot} />

                <Text style={styles.connectionNoticeText}>
                  Choose another node to connect
                </Text>

                <Pressable
                  onPress={() => setConnectingFrom(null)}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              </View>
            ) : selectedNode ? (
              <>
                <View style={styles.selectedNodeInfo}>
                  <View
                    style={[
                      styles.selectedNodeIcon,
                      {
                        backgroundColor:
                          getNodeColor(selectedNode.type) + "20",
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: getNodeColor(selectedNode.type),
                        fontWeight: "800",
                      }}
                    >
                      {getNodeIcon(selectedNode.type)}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedNodeTitle}>
                      {selectedNode.name}
                    </Text>

                    <Text style={styles.selectedNodeSubtitle}>
                      Node selected
                    </Text>
                  </View>

                  <Pressable
                    style={styles.deleteButton}
                    onPress={deleteSelectedNode}
                  >
                    <Text style={styles.deleteButtonText}>
                      Delete
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.nodeActions}>
                  <Pressable
                    style={styles.connectButton}
                    onPress={startConnection}
                  >
                    <Text style={styles.connectButtonText}>
                      ⤷ Connect to another node
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.addButton}
                    onPress={() => setShowNodePanel(true)}
                  >
                    <Text style={styles.addButtonText}>
                      + Add node
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.bottomEmpty}>
                <Text style={styles.bottomEmptyText}>
                  Select a node to edit or connect it
                </Text>

                <Pressable
                  style={styles.addButton}
                  onPress={() => setShowNodePanel(true)}
                >
                  <Text style={styles.addButtonText}>
                    + Add node
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </>
      ) : (
        <View style={styles.settingsPage}>
          <Text style={styles.settingsTitle}>
            Workflow settings
          </Text>

          <Text style={styles.settingsDescription}>
            Configure workflow behavior here. More settings can
            be connected to your backend later.
          </Text>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsLabel}>
              Workflow name
            </Text>

            <Text style={styles.settingsValue}>
              {workflow.name}
            </Text>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsLabel}>
              Nodes
            </Text>

            <Text style={styles.settingsValue}>
              {workflow.nodes.length}
            </Text>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsLabel}>
              Connections
            </Text>

            <Text style={styles.settingsValue}>
              {workflow.connections.length}
            </Text>
          </View>
        </View>
      )}

      {/* ADD NODE PANEL */}
      {showNodePanel && (
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowNodePanel(false)}
          />

          <View style={styles.nodePanel}>
            <View style={styles.panelHandle} />

            <View style={styles.panelHeader}>
              <View>
                <Text style={styles.panelTitle}>
                  Add a node
                </Text>

                <Text style={styles.panelSubtitle}>
                  Choose an action for your workflow
                </Text>
              </View>

              <Pressable
                onPress={() => setShowNodePanel(false)}
              >
                <Text style={styles.closePanel}>×</Text>
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.nodeList}
            >
              {NODE_TYPES.map((item) => (
                <Pressable
                  key={item.type}
                  style={styles.nodeOption}
                  onPress={() => addNode(item.type)}
                >
                  <View
                    style={[
                      styles.nodeOptionIcon,
                      {
                        backgroundColor: item.color + "20",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.nodeOptionIconText,
                        { color: item.color },
                      ]}
                    >
                      {item.icon}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.nodeOptionTitle}>
                      {item.title}
                    </Text>

                    <Text style={styles.nodeOptionDescription}>
                      {item.description}
                    </Text>
                  </View>

                  <Text style={styles.nodeOptionArrow}>
                    ›
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  topBar: {
    minHeight: 76,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 12,
  },

  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.panel,
  },

  backText: {
    color: COLORS.text,
    fontSize: 25,
    lineHeight: 28,
  },

  titleArea: {
    flex: 1,
    minWidth: 0,
  },

  eyebrow: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 3,
  },

  workflowTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },

  draftBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: COLORS.panel,
  },

  draftDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.warning,
  },

  draftText: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "600",
  },

  toolbar: {
    height: 52,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  toolbarTab: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 9,
  },

  toolbarTabActive: {
    backgroundColor: COLORS.panel,
  },

  toolbarTabText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
  },

  toolbarTabTextActive: {
    color: COLORS.text,
  },

  saveButton: {
    marginLeft: "auto",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: COLORS.accent,
  },

  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },

  canvasContainer: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: COLORS.canvas,
  },

  canvas: {
    flex: 1,
    minHeight: 400,
    position: "relative",
  },

  grid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.45,
  },

  node: {
    position: "absolute",
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.panel,
  },

  nodeSelected: {
    borderColor: COLORS.accent,
    borderWidth: 1.5,
  },

  nodeIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.iconBg,
  },

  nodeIconText: {
    color: COLORS.accent,
    fontSize: 17,
    fontWeight: "800",
  },

  nodeContent: {
    flex: 1,
    minWidth: 0,
  },

  nodeName: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
  },

  nodeType: {
    color: COLORS.muted,
    fontSize: 10,
  },

  nodeStatus: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },

  emptyCanvas: {
    position: "absolute",
    top: "35%",
    left: 24,
    right: 24,
    alignItems: "center",
  },

  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.panel,
    marginBottom: 14,
  },

  emptyIconText: {
    color: COLORS.accent,
    fontSize: 25,
    fontWeight: "700",
  },

  emptyTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 7,
  },

  emptyDescription: {
    color: COLORS.muted,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 260,
    marginBottom: 16,
  },

  emptyButton: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
  },

  emptyButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },

  canvasControls: {
    position: "absolute",
    right: 14,
    top: 14,
    gap: 8,
  },

  canvasControlButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  canvasControlText: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "600",
  },

  bottomPanel: {
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },

  selectedNodeInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },

  selectedNodeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.iconBg,
  },

  selectedNodeTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },

  selectedNodeSubtitle: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 3,
  },

  deleteButton: {
    marginLeft: "auto",
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.dangerBg,
  },

  deleteButtonText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: "700",
  },

  nodeActions: {
    flexDirection: "row",
    gap: 9,
  },

  connectButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.panel,
  },

  connectButtonText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "700",
  },

  addButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
  },

  addButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },

  bottomEmpty: {
    alignItems: "center",
    gap: 10,
  },

  bottomEmptyText: {
    color: COLORS.muted,
    fontSize: 11,
    textAlign: "center",
  },

  connectionNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    padding: 10,
    borderRadius: 9,
    backgroundColor: COLORS.iconBg,
  },

  connectionNoticeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },

  connectionNoticeText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 11,
  },

  cancelText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
    padding: 8,
  },

  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },

  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.62)",
  },

  nodePanel: {
    maxHeight: "82%",
    paddingTop: 12,
    paddingHorizontal: 18,
    paddingBottom: 24,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  panelHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    backgroundColor: COLORS.muted,
    opacity: 0.5,
    marginBottom: 16,
  },

  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },

  panelTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
  },

  panelSubtitle: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 4,
  },

  closePanel: {
    marginLeft: "auto",
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.panel,
  },

  nodeList: {
    gap: 9,
    paddingBottom: 10,
  },

  nodeOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.panel,
  },

  nodeOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.iconBg,
  },

  nodeOptionIconText: {
    color: COLORS.accent,
    fontSize: 17,
    fontWeight: "800",
  },

  nodeOptionTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },

  nodeOptionDescription: {
    color: COLORS.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },

  nodeOptionArrow: {
    color: COLORS.muted,
    fontSize: 20,
    marginLeft: "auto",
  },

  settingsPage: {
    flex: 1,
    padding: 18,
    backgroundColor: COLORS.background,
  },

  settingsTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 8,
  },

  settingsDescription: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 20,
  },

  settingsCard: {
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.panel,
    marginBottom: 10,
  },

  settingsLabel: {
    color: COLORS.muted,
    fontSize: 11,
    marginBottom: 7,
  },

  settingsValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
});