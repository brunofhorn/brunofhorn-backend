import { FastifyInstance } from "fastify";
import {
  getClicksCount,
  getGoalsCount,
  getPageViewsCount,
  getPingsCount,
  getSessionsCount,
  getStatsByRange,
  StatsPeriod,
} from "../lib/db";

type StatsQuery = {
  period?: StatsPeriod;
  from?: string;
  to?: string;
};

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

export async function statsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: StatsQuery }>("/api/stats/summary", async (request, reply) => {
    try {
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

  app.get<{ Querystring: StatsQuery }>("/api/stats/clicks", async (request, reply) => {
    try {
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

  app.get<{ Querystring: StatsQuery }>("/api/stats/accesses", async (request, reply) => {
    try {
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

  app.get<{ Querystring: StatsQuery }>("/api/stats/sessions", async (request, reply) => {
    try {
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

  app.get<{ Querystring: StatsQuery }>("/api/stats/pings", async (request, reply) => {
    try {
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

  app.get<{ Querystring: StatsQuery }>("/api/stats/goals", async (request, reply) => {
    try {
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
