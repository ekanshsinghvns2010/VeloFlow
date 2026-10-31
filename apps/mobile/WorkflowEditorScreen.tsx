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
  onSave?: (workflow: WorkflowDefinition) => void;
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

  function saveWorkflow() {
    onSave?.(workflow);

    Alert.alert(
      "Workflow ready",
      "The workflow data is ready to be saved through your API.",
    );
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
          onPress={saveWorkflow}
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