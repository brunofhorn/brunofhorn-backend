import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  getClicksCount,
  getGoalsCount,
  getPageViewsCount,
  getPingsCount,
  getSessionsCount,
  getStatsByRange,
  StatsPeriod,
  verifyAdminToken,
} from "../lib/db";

type StatsQuery = {
  period?: StatsPeriod;
  from?: string;
  to?: string;
};

function requireAuth(_request: FastifyRequest, _reply: FastifyReply) {
  // Authentication kept disabled to mirror existing behavior.
  return;
}

function parseStatsQuery(query: StatsQuery) {
  const allowedPeriods = new Set<StatsPeriod>(["day", "week", "month", "year", "custom"]);
  const period = query.period;

  if (period && !allowedPeriods.has(period)) {
    return { error: "Invalid period. Use day, week, month, year or custom." };
  }

  if (period === "custom" && !query.from) {
    return { error: "Custom period requires 'from' query parameter." };
  }

  return {
    period,
    from: query.from,
    to: query.to,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 8000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("Stats query timeout")), timeoutMs);
    }),
  ]);
}

function getErrorStatus(error: unknown): 500 | 504 {
  return error instanceof Error && error.message === "Stats query timeout" ? 504 : 500;
}

async function validateOptionalToken(request: FastifyRequest) {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    await verifyAdminToken(token);
  }
}

export async function statsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: StatsQuery }>("/api/stats/summary", { preHandler: requireAuth }, async (request, reply) => {
    try {
      await validateOptionalToken(request);

      const parsed = parseStatsQuery(request.query);
      if ("error" in parsed) {
        reply.status(400);
        return { error: parsed.error };
      }

      const stats = await withTimeout(getStatsByRange(parsed));

      return stats;
    } catch (error) {
      request.log.error({ err: error }, "Error fetching stats");
      reply.status(getErrorStatus(error));
      return { error: "Failed to fetch stats" };
    }
  });

  app.get<{ Querystring: StatsQuery }>("/api/stats/clicks", { preHandler: requireAuth }, async (request, reply) => {
    try {
      await validateOptionalToken(request);
      const parsed = parseStatsQuery(request.query);
      if ("error" in parsed) {
        reply.status(400);
        return { error: parsed.error };
      }

      const count = await withTimeout(getClicksCount(parsed));
      return { metric: "clicks", ...parsed, count };
    } catch (error) {
      request.log.error({ err: error }, "Error fetching clicks count");
      reply.status(getErrorStatus(error));
      return { error: "Failed to fetch clicks count" };
    }
  });

  app.get<{ Querystring: StatsQuery }>("/api/stats/accesses", { preHandler: requireAuth }, async (request, reply) => {
    try {
      await validateOptionalToken(request);
      const parsed = parseStatsQuery(request.query);
      if ("error" in parsed) {
        reply.status(400);
        return { error: parsed.error };
      }

      const count = await withTimeout(getPageViewsCount(parsed));
      return { metric: "accesses", ...parsed, count };
    } catch (error) {
      request.log.error({ err: error }, "Error fetching accesses count");
      reply.status(getErrorStatus(error));
      return { error: "Failed to fetch accesses count" };
    }
  });

  app.get<{ Querystring: StatsQuery }>("/api/stats/sessions", { preHandler: requireAuth }, async (request, reply) => {
    try {
      await validateOptionalToken(request);
      const parsed = parseStatsQuery(request.query);
      if ("error" in parsed) {
        reply.status(400);
        return { error: parsed.error };
      }

      const count = await withTimeout(getSessionsCount(parsed));
      return { metric: "sessions", ...parsed, count };
    } catch (error) {
      request.log.error({ err: error }, "Error fetching sessions count");
      reply.status(getErrorStatus(error));
      return { error: "Failed to fetch sessions count" };
    }
  });

  app.get<{ Querystring: StatsQuery }>("/api/stats/pings", { preHandler: requireAuth }, async (request, reply) => {
    try {
      await validateOptionalToken(request);
      const parsed = parseStatsQuery(request.query);
      if ("error" in parsed) {
        reply.status(400);
        return { error: parsed.error };
      }

      const count = await withTimeout(getPingsCount(parsed));
      return { metric: "pings", ...parsed, count };
    } catch (error) {
      request.log.error({ err: error }, "Error fetching pings count");
      reply.status(getErrorStatus(error));
      return { error: "Failed to fetch pings count" };
    }
  });

  app.get<{ Querystring: StatsQuery }>("/api/stats/goals", { preHandler: requireAuth }, async (request, reply) => {
    try {
      await validateOptionalToken(request);
      const parsed = parseStatsQuery(request.query);
      if ("error" in parsed) {
        reply.status(400);
        return { error: parsed.error };
      }

      const count = await withTimeout(getGoalsCount(parsed));
      return { metric: "goals", ...parsed, count };
    } catch (error) {
      request.log.error({ err: error }, "Error fetching goals count");
      reply.status(getErrorStatus(error));
      return { error: "Failed to fetch goals count" };
    }
  });
}
