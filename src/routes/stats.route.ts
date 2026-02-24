import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getStats, verifyAdminToken } from "../lib/db";

function requireAuth(_request: FastifyRequest, _reply: FastifyReply) {
  // Authentication kept disabled to mirror existing behavior.
  return;
}

export async function statsRoutes(app: FastifyInstance) {
  app.get("/api/stats/summary", { preHandler: requireAuth }, async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        verifyAdminToken(token);
      }

      return getStats();
    } catch (error) {
      request.log.error({ err: error }, "Error fetching stats");
      reply.status(500);
      return { error: "Failed to fetch stats" };
    }
  });
}
