import { FastifyInstance, FastifyRequest } from "fastify";
import { trackClick, trackGoal, trackPageView, trackPing, trackSession } from "../lib/db";

type PayloadBody = {
  Body: Record<string, unknown>;
};

function headerString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    return typeof first === "string" && first.trim().length > 0 ? first.trim() : undefined;
  }

  return undefined;
}

function getClientIp(request: FastifyRequest) {
  const forwarded = headerString(request.headers["x-forwarded-for"]);
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = headerString(request.headers["x-real-ip"]);
  if (realIp) {
    return realIp;
  }

  return request.ip;
}

function withRequestContext(request: FastifyRequest, body: Record<string, unknown>) {
  const cityHeader =
    headerString(request.headers["cf-ipcity"]) ??
    headerString(request.headers["x-vercel-ip-city"]) ??
    headerString(request.headers["x-appengine-city"]);

  const countryHeader =
    headerString(request.headers["cf-ipcountry"]) ??
    headerString(request.headers["x-vercel-ip-country"]) ??
    headerString(request.headers["x-appengine-country"]);

  return {
    ...body,
    ipAddress: typeof body.ipAddress === "string" ? body.ipAddress : getClientIp(request),
    city: typeof body.city === "string" ? body.city : cityHeader,
    country: typeof body.country === "string" ? body.country : countryHeader,
  };
}

export async function trackRoutes(app: FastifyInstance) {
  app.post<PayloadBody>("/api/track/goal", async (request, reply) => {
    try {
      await trackGoal(withRequestContext(request, request.body));
      return { success: true };
    } catch (error) {
      request.log.error({ err: error }, "Error tracking goal");
      reply.status(500);
      return { error: "Failed to track goal" };
    }
  });

  app.post<PayloadBody>("/api/track/session", async (request, reply) => {
    try {
      await trackSession(withRequestContext(request, request.body));
      return { success: true };
    } catch (error) {
      request.log.error({ err: error }, "Error tracking session");
      reply.status(500);
      return { error: "Failed to track session" };
    }
  });

  app.post<PayloadBody>("/api/track/view", async (request, reply) => {
    try {
      await trackPageView(withRequestContext(request, request.body));
      return { success: true };
    } catch (error) {
      request.log.error({ err: error }, "Error tracking view");
      reply.status(500);
      return { error: "Failed to track view" };
    }
  });

  app.post<PayloadBody>("/api/track/ping", async (request, reply) => {
    try {
      await trackPing(withRequestContext(request, request.body));
      return { success: true };
    } catch (error) {
      request.log.error({ err: error }, "Error tracking ping");
      reply.status(500);
      return { error: "Failed to track ping" };
    }
  });

  app.post<PayloadBody>("/api/track/click", async (request, reply) => {
    try {
      await trackClick(withRequestContext(request, request.body));
      return { success: true };
    } catch (error) {
      request.log.error({ err: error }, "Error tracking click");
      reply.status(500);
      return { error: "Failed to track click" };
    }
  });
}
