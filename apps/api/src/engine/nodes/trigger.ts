import type { NodeHandler } from "../types.js";

export const manualTriggerNode: NodeHandler = {
  kind: "manual_trigger",
  displayName: "Manual Trigger",
  description: "Starts a workflow when a user runs it manually.",

  async execute(context) {
    return {
      success: true,
      output: context.execution.input ?? {},
    };
  },
};

export const webhookTriggerNode: NodeHandler = {
  kind: "webhook_trigger",
  displayName: "Webhook Trigger",
  description: "Starts a workflow from an incoming webhook.",

  async execute(context) {
    return {
      success: true,
      output: context.execution.input ?? {},
    };
  },
};

export const scheduleTriggerNode: NodeHandler = {
  kind: "schedule_trigger",
  displayName: "Schedule Trigger",
  description: "Starts a workflow from a configured schedule.",

  async execute(context) {
    return {
      success: true,
      output: context.execution.input ?? {},
    };
  },
};