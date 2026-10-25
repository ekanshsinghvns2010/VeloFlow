
import type { FastifyReply } from "fastify";
import { prisma } from "./prisma.js";

export type WorkspaceAccess = {
  workspaceId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
};

export async function getWorkspaceAccess(
  workspaceId: string,
  userId: string
): Promise<WorkspaceAccess | null> {
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId
      }
    },
    select: {
      workspaceId: true,
      userId: true,
      role: true
    }
  });

  if (!membership) {
    return null;
  }

  return membership as WorkspaceAccess;
}

export function canReadWorkspace(
  access: WorkspaceAccess
): boolean {
  return [
    "OWNER",
    "ADMIN",
    "EDITOR",
    "VIEWER"
  ].includes(access.role);
}

export function canEditWorkspace(
  access: WorkspaceAccess
): boolean {
  return [
    "OWNER",
    "ADMIN",
    "EDITOR"
  ].includes(access.role);
}

export function canManageWorkspace(
  access: WorkspaceAccess
): boolean {
  return [
    "OWNER",
    "ADMIN"
  ].includes(access.role);
}

export async function denyWorkspaceAccess(
  reply: FastifyReply
) {
  return reply.code(404).send({
    error: {
      code: "WORKSPACE_NOT_FOUND",
      message: "Workspace not found or access denied."
    }
  });
}

export async function denyPermission(
  reply: FastifyReply
) {
  return reply.code(403).send({
    error: {
      code: "INSUFFICIENT_PERMISSIONS",
      message: "You do not have permission to perform this operation."
    }
  });
}
