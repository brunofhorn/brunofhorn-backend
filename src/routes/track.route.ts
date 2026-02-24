import { FastifyInstance } from "fastify";
import { trackClick, trackGoal, trackPageView, trackPing, trackSession } from "../lib/db";

type PayloadBody = {
  Body: Record<string, unknown>;
};

export async function trackRoutes(app: FastifyInstance) {
  app.post<PayloadBody>("/api/track/goal", async (request, reply) => {
    try {
      trackGoal(request.body);
      return { success: true };
    } catch (error) {
      request.log.error({ err: error }, "Error tracking goal");
      reply.status(500);
      return { error: "Failed to track goal" };
    }
  });

  app.post<PayloadBody>("/api/track/session", async (request, reply) => {
    try {
      trackSession(request.body);
      return { success: true };
    } catch (error) {
      request.log.error({ err: error }, "Error tracking session");
      reply.status(500);
      return { error: "Failed to track session" };
    }
  });

  app.post<PayloadBody>("/api/track/view", async (request, reply) => {
    try {
      trackPageView(request.body);
      return { success: true };
    } catch (error) {
      request.log.error({ err: error }, "Error tracking view");
      reply.status(500);
      return { error: "Failed to track view" };
    }
  });

  app.post<PayloadBody>("/api/track/ping", async (request, reply) => {
    try {
      trackPing(request.body);
      return { success: true };
    } catch (error) {
      request.log.error({ err: error }, "Error tracking ping");
      reply.status(500);
      return { error: "Failed to track ping" };
    }
  });

  app.post<PayloadBody>("/api/track/click", async (request, reply) => {
    try {
      trackClick(request.body);
      return { success: true };
    } catch (error) {
      request.log.error({ err: error }, "Error tracking click");
      reply.status(500);
      return { error: "Failed to track click" };
    }
  });
}
