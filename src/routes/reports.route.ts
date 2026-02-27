import { FastifyInstance } from "fastify";
import {
  getReportBaseAccesses,
  getReportButtonClicks,
  getReportCities,
  getReportDevices,
  getReportOverview,
  getReportPages,
  getReportSessionDuration,
  getReportTopDevice,
  getReportTopSetupItems,
  getReportTimeseries,
  getReportTopLinks,
  ReportMetric,
  StatsPeriod,
  StatsRangeInput,
} from "../lib/db";

type ReportQuery = {
  period?: StatsPeriod;
  from?: string;
  to?: string;
  limit?: string;
  metric?: ReportMetric;
  path?: string;
};

type ReportPeriodResponse = StatsPeriod | "all";

function asDate(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function resolveRangeMeta(input: StatsRangeInput): {
  period: ReportPeriodResponse;
  from: string;
  to: string;
} {
  const now = new Date();
  const period = input.period;

  if (period === "custom") {
    const from = asDate(input.from) ?? new Date("1970-01-01T00:00:00.000Z");
    const to = asDate(input.to) ?? now;
    return { period, from: toIsoDate(from), to: toIsoDate(to) };
  }

  if (period) {
    const from = new Date(now);
    if (period === "day") {
      from.setDate(from.getDate() - 1);
    } else if (period === "week") {
      from.setDate(from.getDate() - 7);
    } else if (period === "month") {
      from.setMonth(from.getMonth() - 1);
    } else if (period === "year") {
      from.setFullYear(from.getFullYear() - 1);
    }

    return { period, from: toIsoDate(from), to: toIsoDate(now) };
  }

  return {
    period: "all",
    from: "1970-01-01",
    to: toIsoDate(now),
  };
}

function parseRangeQuery(query: ReportQuery): StatsRangeInput | { error: string } {
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

function parseLimit(value?: string, defaultValue = 20) {
  if (!value) {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.max(1, Math.min(Math.trunc(parsed), 100));
}

function parseMetric(value?: string): ReportMetric | null {
  if (!value) {
    return null;
  }

  const allowed = new Set<ReportMetric>(["sessions", "pageViews", "pings", "clicks", "goals"]);
  return allowed.has(value as ReportMetric) ? (value as ReportMetric) : null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 8000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("Reports query timeout")), timeoutMs);
    }),
  ]);
}

function reportErrorStatus(error: unknown): 500 | 504 {
  return error instanceof Error && error.message === "Reports query timeout" ? 504 : 500;
}

export async function reportsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: ReportQuery }>("/api/reports/base-accesses", async (request, reply) => {
    try {
      const parsed = parseRangeQuery(request.query);
      if ("error" in parsed) {
        reply.status(400);
        return { error: parsed.error };
      }
      const range = resolveRangeMeta(parsed);

      const path = request.query.path && request.query.path.trim().length > 0 ? request.query.path : "/";
      const count = await withTimeout(getReportBaseAccesses(parsed, path));
      return { period: range.period, from: range.from, to: range.to, path, count };
    } catch (error) {
      request.log.error({ err: error }, "Error fetching base accesses report");
      reply.status(reportErrorStatus(error));
      return { error: "Failed to fetch base accesses report" };
    }
  });

  app.get<{ Querystring: ReportQuery }>("/api/reports/button-clicks", async (request, reply) => {
    try {
      const parsed = parseRangeQuery(request.query);
      if ("error" in parsed) {
        reply.status(400);
        return { error: parsed.error };
      }
      const range = resolveRangeMeta(parsed);

      const count = await withTimeout(getReportButtonClicks(parsed));
      return { period: range.period, from: range.from, to: range.to, count };
    } catch (error) {
      request.log.error({ err: error }, "Error fetching button clicks report");
      reply.status(reportErrorStatus(error));
      return { error: "Failed to fetch button clicks report" };
    }
  });

  app.get<{ Querystring: ReportQuery }>("/api/reports/device-top", async (request, reply) => {
    try {
      const parsed = parseRangeQuery(request.query);
      if ("error" in parsed) {
        reply.status(400);
        return { error: parsed.error };
      }
      const range = resolveRangeMeta(parsed);

      const top = await withTimeout(getReportTopDevice(parsed));
      return { period: range.period, from: range.from, to: range.to, top };
    } catch (error) {
      request.log.error({ err: error }, "Error fetching top device report");
      reply.status(reportErrorStatus(error));
      return { error: "Failed to fetch top device report" };
    }
  });

  app.get<{ Querystring: ReportQuery }>("/api/reports/cities", async (request, reply) => {
    try {
      const parsed = parseRangeQuery(request.query);
      if ("error" in parsed) {
        reply.status(400);
        return { error: parsed.error };
      }
      const range = resolveRangeMeta(parsed);

      const limit = parseLimit(request.query.limit, 20);
      const rows = await withTimeout(getReportCities(parsed, limit));
      return { period: range.period, from: range.from, to: range.to, limit, rows };
    } catch (error) {
      request.log.error({ err: error }, "Error fetching cities report");
      reply.status(reportErrorStatus(error));
      return { error: "Failed to fetch cities report" };
    }
  });

  app.get<{ Querystring: ReportQuery }>("/api/reports/overview", async (request, reply) => {
    try {
      const parsed = parseRangeQuery(request.query);
      if ("error" in parsed) {
        reply.status(400);
        return { error: parsed.error };
      }
      const range = resolveRangeMeta(parsed);

      const data = await withTimeout(getReportOverview(parsed));
      return { period: range.period, from: range.from, to: range.to, ...data };
    } catch (error) {
      request.log.error({ err: error }, "Error fetching report overview");
      reply.status(reportErrorStatus(error));
      return { error: "Failed to fetch report overview" };
    }
  });

  app.get<{ Querystring: ReportQuery }>("/api/reports/timeseries", async (request, reply) => {
    try {
      const parsed = parseRangeQuery(request.query);
      if ("error" in parsed) {
        reply.status(400);
        return { error: parsed.error };
      }
      const range = resolveRangeMeta(parsed);

      const metric = parseMetric(request.query.metric);
      if (request.query.metric && !metric) {
        reply.status(400);
        return { error: "Invalid metric. Use sessions, pageViews, pings, clicks or goals." };
      }

      const data = await withTimeout(getReportTimeseries(parsed, metric ?? undefined));
      return {
        period: range.period,
        from: range.from,
        to: range.to,
        metric: metric ?? "all",
        points: data,
      };
    } catch (error) {
      request.log.error({ err: error }, "Error fetching report timeseries");
      reply.status(reportErrorStatus(error));
      return { error: "Failed to fetch report timeseries" };
    }
  });

  app.get<{ Querystring: ReportQuery }>("/api/reports/top-links", async (request, reply) => {
    try {
      const parsed = parseRangeQuery(request.query);
      if ("error" in parsed) {
        reply.status(400);
        return { error: parsed.error };
      }
      const range = resolveRangeMeta(parsed);

      const limit = parseLimit(request.query.limit, 20);
      const rows = await withTimeout(getReportTopLinks(parsed, limit));
      return { period: range.period, from: range.from, to: range.to, limit, rows };
    } catch (error) {
      request.log.error({ err: error }, "Error fetching top links report");
      reply.status(reportErrorStatus(error));
      return { error: "Failed to fetch top links report" };
    }
  });

  app.get<{ Querystring: ReportQuery }>("/api/reports/top-setup-items", async (request, reply) => {
    try {
      const parsed = parseRangeQuery(request.query);
      if ("error" in parsed) {
        reply.status(400);
        return { error: parsed.error };
      }
      const range = resolveRangeMeta(parsed);

      const limit = parseLimit(request.query.limit, 20);
      const rows = await withTimeout(getReportTopSetupItems(parsed, limit));
      return { period: range.period, from: range.from, to: range.to, limit, rows };
    } catch (error) {
      request.log.error({ err: error }, "Error fetching top setup items report");
      reply.status(reportErrorStatus(error));
      return { error: "Failed to fetch top setup items report" };
    }
  });

  app.get<{ Querystring: ReportQuery }>("/api/reports/pages", async (request, reply) => {
    try {
      const parsed = parseRangeQuery(request.query);
      if ("error" in parsed) {
        reply.status(400);
        return { error: parsed.error };
      }
      const range = resolveRangeMeta(parsed);

      const limit = parseLimit(request.query.limit, 20);
      const rows = await withTimeout(getReportPages(parsed, limit));
      return { period: range.period, from: range.from, to: range.to, limit, rows };
    } catch (error) {
      request.log.error({ err: error }, "Error fetching pages report");
      reply.status(reportErrorStatus(error));
      return { error: "Failed to fetch pages report" };
    }
  });

  app.get<{ Querystring: ReportQuery }>("/api/reports/devices", async (request, reply) => {
    try {
      const parsed = parseRangeQuery(request.query);
      if ("error" in parsed) {
        reply.status(400);
        return { error: parsed.error };
      }
      const range = resolveRangeMeta(parsed);

      const rows = await withTimeout(getReportDevices(parsed));
      return { period: range.period, from: range.from, to: range.to, rows };
    } catch (error) {
      request.log.error({ err: error }, "Error fetching devices report");
      reply.status(reportErrorStatus(error));
      return { error: "Failed to fetch devices report" };
    }
  });

  app.get<{ Querystring: ReportQuery }>("/api/reports/session-duration", async (request, reply) => {
    try {
      const parsed = parseRangeQuery(request.query);
      if ("error" in parsed) {
        reply.status(400);
        return { error: parsed.error };
      }
      const range = resolveRangeMeta(parsed);

      const data = await withTimeout(getReportSessionDuration(parsed));
      return { period: range.period, from: range.from, to: range.to, ...data };
    } catch (error) {
      request.log.error({ err: error }, "Error fetching session duration report");
      reply.status(reportErrorStatus(error));
      return { error: "Failed to fetch session duration report" };
    }
  });
}
