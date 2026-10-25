
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify";
import { prisma } from "../lib/prisma.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

declare module "fastify" {
  interface FastifyRequest {
    authenticatedUser: AuthenticatedUser | null;
  }
}

export async function registerAuthentication(
  app: FastifyInstance
): Promise<void> {
  app.decorateRequest("authenticatedUser", null);

  app.decorate(
    "authenticate",
    async function (
      request: FastifyRequest,
      reply: FastifyReply
    ): Promise<void> {
      try {
        await request.jwtVerify();
      } catch {
        await reply.code(401).send({
          error: {
            code: "UNAUTHORIZED",
            message: "A valid access token is required.",
            requestId: request.id
          }
        });
        return;
      }

      const claims = request.user as { sub?: string };

      if (!claims.sub) {
        await reply.code(401).send({
          error: {
            code: "INVALID_TOKEN",
            message: "The access token is invalid.",
            requestId: request.id
          }
        });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: claims.sub },
        select: {
          id: true,
          email: true,
          name: true,
          disabledAt: true
        }
      });

      if (!user || user.disabledAt) {
        await reply.code(401).send({
          error: {
            code: "ACCOUNT_UNAVAILABLE",
            message: "This account is unavailable.",
            requestId: request.id
          }
        });
        return;
      }

      request.authenticatedUser = {
        id: user.id,
        email: user.email,
        name: user.name
      };
    }
  );
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
}
