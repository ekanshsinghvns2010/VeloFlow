
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import {
  createHash,
  randomBytes
} from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";

const RegisterSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128)
});

const LoginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128)
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(32).max(256)
});

const LogoutSchema = z.object({
  refreshToken: z.string().min(32).max(256)
});

const refreshLifetimeMs = 30 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

function createWorkspaceSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 36) || "workspace";

  return `${base}-${randomBytes(4).toString("hex")}`;
}

function safeUser(user: {
  id: string;
  email: string;
  name: string;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name
  };
}

async function issueSession(
  app: Parameters<FastifyPluginAsync>[0],
  user: { id: string; email: string; name: string }
) {
  const refreshToken = createRefreshToken();

  await prisma.refreshSession.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + refreshLifetimeMs)
    }
  });

  const accessToken = app.jwt.sign(
    { email: user.email },
    {
      sub: user.id,
      expiresIn: "15m"
    }
  );

  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresIn: 900
  };
}

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/register", async (request, reply) => {
    const parsed = RegisterSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Enter a valid name, email, and password of at least 12 characters."
        }
      });
    }

    const name = parsed.data.name;
    const email = parsed.data.email.toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });

    if (existing) {
      return reply.code(409).send({
        error: {
          code: "ACCOUNT_EXISTS",
          message: "An account with this email already exists."
        }
      });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);

    try {
      const user = await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            name,
            email,
            passwordHash
          },
          select: {
            id: true,
            email: true,
            name: true
          }
        });

        const workspace = await tx.workspace.create({
          data: {
            name: `${name}'s workspace`,
            slug: createWorkspaceSlug(name),
            createdById: createdUser.id
          }
        });

        await tx.workspaceMember.create({
          data: {
            workspaceId: workspace.id,
            userId: createdUser.id,
            role: "OWNER"
          }
        });

        await tx.auditLog.create({
          data: {
            workspaceId: workspace.id,
            actorId: createdUser.id,
            action: "account.registered",
            resource: "user",
            resourceId: createdUser.id
          }
        });

        return createdUser;
      });

      const session = await issueSession(app, user);

      return reply.code(201).send({
        data: {
          user: safeUser(user),
          ...session
        }
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2002"
      ) {
        return reply.code(409).send({
          error: {
            code: "ACCOUNT_EXISTS",
            message: "An account with this email already exists."
          }
        });
      }

      throw error;
    }
  });

  app.post("/login", async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Enter a valid email and password."
        }
      });
    }

    const email = parsed.data.email.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        disabledAt: true
      }
    });

    const passwordMatches = user
      ? await bcrypt.compare(parsed.data.password, user.passwordHash)
      : false;

    if (!user || !passwordMatches || user.disabledAt) {
      return reply.code(401).send({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "The email or password is incorrect."
        }
      });
    }

    const session = await issueSession(app, {
      id: user.id,
      email: user.email,
      name: user.name
    });

    return {
      data: {
        user: safeUser(user),
        ...session
      }
    };
  });

  app.post("/refresh", async (request, reply) => {
    const parsed = RefreshSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: "INVALID_REFRESH_TOKEN",
          message: "A valid refresh token is required."
        }
      });
    }

    const oldHash = hashToken(parsed.data.refreshToken);
    const newRefreshToken = createRefreshToken();
    const newHash = hashToken(newRefreshToken);
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.refreshSession.findUnique({
        where: { tokenHash: oldHash },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              disabledAt: true
            }
          }
        }
      });

      if (
        !session ||
        session.revokedAt ||
        session.expiresAt <= now ||
        session.user.disabledAt
      ) {
        return null;
      }

      const revoked = await tx.refreshSession.updateMany({
        where: {
          id: session.id,
          revokedAt: null,
          expiresAt: { gt: now }
        },
        data: {
          revokedAt: now
        }
      });

      if (revoked.count !== 1) {
        return null;
      }

      await tx.refreshSession.create({
        data: {
          userId: session.user.id,
          tokenHash: newHash,
          expiresAt: new Date(now.getTime() + refreshLifetimeMs)
        }
      });

      return session.user;
    });

    if (!result) {
      return reply.code(401).send({
        error: {
          code: "INVALID_REFRESH_TOKEN",
          message: "The refresh token is expired or invalid. Please log in again."
        }
      });
    }

    const accessToken = app.jwt.sign(
      { email: result.email },
      {
        sub: result.id,
        expiresIn: "15m"
      }
    );

    return {
      data: {
        user: safeUser(result),
        accessToken,
        refreshToken: newRefreshToken,
        tokenType: "Bearer",
        expiresIn: 900
      }
    };
  });

  app.post("/logout", async (request, reply) => {
    const parsed = LogoutSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: "INVALID_REFRESH_TOKEN",
          message: "A valid refresh token is required."
        }
      });
    }

    await prisma.refreshSession.updateMany({
      where: {
        tokenHash: hashToken(parsed.data.refreshToken),
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });

    return {
      data: {
        success: true,
        message: "Session revoked."
      }
    };
  });

  app.get(
    "/me",
    {
      preHandler: app.authenticate
    },
    async (request) => {
      return {
        data: {
          user: request.authenticatedUser
        }
      };
    }
  );
};

export default authRoutes;
