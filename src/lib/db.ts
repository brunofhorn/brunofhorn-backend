import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";
import { env } from "../config/env";

type AnyObject = Record<string, unknown>;
export type StatsPeriod = "day" | "week" | "month" | "year" | "custom";

export type StatsRangeInput = {
  period?: StatsPeriod;
  from?: string;
  to?: string;
};

type DateRange = {
  gte: Date;
  lte: Date;
};
type DailyMetricField = "sessions" | "pageViews" | "pings" | "clicks" | "goals";
export type ReportMetric = "sessions" | "pageViews" | "pings" | "clicks" | "goals";

const startedAt = new Date().toISOString();

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function asDate(value: unknown): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function resolveDateRange(input: StatsRangeInput = {}): DateRange | undefined {
  const now = new Date();
  const period = input.period;

  if (!period) {
    return undefined;
  }

  if (period === "custom") {
    const from = asDate(input.from);
    const to = asDate(input.to) ?? now;

    if (!from || from > to) {
      return undefined;
    }

    return { gte: from, lte: to };
  }

  const start = new Date(now);

  if (period === "day") {
    start.setDate(start.getDate() - 1);
  } else if (period === "week") {
    start.setDate(start.getDate() - 7);
  } else if (period === "month") {
    start.setMonth(start.getMonth() - 1);
  } else if (period === "year") {
    start.setFullYear(start.getFullYear() - 1);
  }

  return { gte: start, lte: now };
}

function resolveDateRangeOrAll(input: StatsRangeInput = {}): DateRange {
  return (
    resolveDateRange(input) ?? {
      gte: new Date("1970-01-01T00:00:00.000Z"),
      lte: new Date(),
    }
  );
}

function toUtcDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function toDailyWhere(range?: DateRange) {
  if (!range) {
    return undefined;
  }

  return {
    date: {
      gte: toUtcDateOnly(range.gte),
      lte: toUtcDateOnly(range.lte),
    },
  };
}

function resolveSessionId(payload: AnyObject): string {
  return (
    asString(payload.sessionId) ??
    asString(payload.session_id) ??
    asString(payload.id) ??
    randomUUID()
  );
}

function toJsonValue(payload: AnyObject): Prisma.InputJsonValue{
  return JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${key}`;
}

function verifyPassword(password: string, hashedPassword: string): boolean {
  const [salt, key] = hashedPassword.split(":");
  if (!salt || !key) {
    return false;
  }

  const derived = scryptSync(password, salt, 64);
  const stored = Buffer.from(key, "hex");

  if (stored.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(stored, derived);
}

async function incrementDailyMetric(metric: DailyMetricField, at: Date) {
  const day = toUtcDateOnly(at);

  await prisma.dailyStats.upsert({
    where: { date: day },
    update: {
      [metric]: { increment: 1 },
    },
    create: {
      date: day,
      sessions: metric === "sessions" ? 1 : 0,
      pageViews: metric === "pageViews" ? 1 : 0,
      pings: metric === "pings" ? 1 : 0,
      clicks: metric === "clicks" ? 1 : 0,
      goals: metric === "goals" ? 1 : 0,
    },
  });
}

async function ensureSession(sessionId: string, payload: AnyObject = {}) {
  const startTime = asDate(payload.startTime) ?? asDate(payload.timestamp) ?? new Date();
  const duration = asNumber(payload.duration) ?? 0;
  const lastPingTime = asDate(payload.lastPingTime) ?? asDate(payload.timestamp) ?? startTime;

  const existing = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true },
  });

  if (existing) {
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        lastPingTime,
        duration,
        userAgent: asString(payload.userAgent),
        deviceType: asString(payload.deviceType),
        browser: asString(payload.browser),
        os: asString(payload.os),
        country: asString(payload.country),
        city: asString(payload.city),
        ipAddress: asString(payload.ipAddress) ?? asString(payload.ip),
      },
    });

    return { created: false, startTime };
  }

  await prisma.session.create({
    data: {
      id: sessionId,
      startTime,
      lastPingTime,
      duration,
      userAgent: asString(payload.userAgent),
      deviceType: asString(payload.deviceType),
      browser: asString(payload.browser),
      os: asString(payload.os),
      country: asString(payload.country),
      city: asString(payload.city),
      ipAddress: asString(payload.ipAddress) ?? asString(payload.ip),
    },
  });

  return { created: true, startTime };
}

export async function initDb() {
  await prisma.$connect();

  if (env.adminEmail && env.adminPassword) {
    await upsertAdminUser(env.adminEmail, env.adminPassword);
  }
}

export async function trackSession(payload: AnyObject) {
  const sessionId = resolveSessionId(payload);
  const ensured = await ensureSession(sessionId, payload);

  if (ensured.created) {
    await incrementDailyMetric("sessions", ensured.startTime);
  }

  return { sessionId };
}

export async function trackPageView(payload: AnyObject) {
  const sessionId = resolveSessionId(payload);
  await ensureSession(sessionId, payload);
  const timestamp = asDate(payload.timestamp) ?? new Date();

  await prisma.pageView.create({
    data: {
      sessionId,
      path: asString(payload.path) ?? asString(payload.pagePath) ?? "/",
      timestamp,
      metadata: toJsonValue(payload),
    },
  });

  await incrementDailyMetric("pageViews", timestamp);
}

export async function trackPing(payload: AnyObject) {
  const sessionId = resolveSessionId(payload);
  await ensureSession(sessionId, payload);

  const timestamp = asDate(payload.timestamp) ?? new Date();
  const duration = asNumber(payload.duration) ?? 0;

  await prisma.ping.create({
    data: {
      sessionId,
      duration,
      pagePath: asString(payload.pagePath) ?? asString(payload.path),
      timestamp,
      metadata: toJsonValue(payload),
    },
  });

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      lastPingTime: timestamp,
      duration,
    },
  });

  await incrementDailyMetric("pings", timestamp);
}

export async function trackClick(payload: AnyObject) {
  const sessionId = resolveSessionId(payload);
  await ensureSession(sessionId, payload);
  const timestamp = asDate(payload.timestamp) ?? new Date();

  await prisma.click.create({
    data: {
      sessionId,
      elementTag: asString(payload.elementTag),
      elementId: asString(payload.elementId),
      elementClass: asString(payload.elementClass),
      elementText: asString(payload.elementText),
      x: asNumber(payload.x) ?? 0,
      y: asNumber(payload.y) ?? 0,
      pagePath: asString(payload.pagePath) ?? asString(payload.path) ?? "/",
      timestamp,
      metadata: toJsonValue(payload),
    },
  });

  await incrementDailyMetric("clicks", timestamp);
}

export async function trackGoal(payload: AnyObject) {
  const maybeSessionId = asString(payload.sessionId) ?? asString(payload.session_id);

  if (maybeSessionId) {
    await ensureSession(maybeSessionId, payload);
  }

  const timestamp = asDate(payload.timestamp) ?? new Date();
  await prisma.goal.create({
    data: {
      sessionId: maybeSessionId,
      name: asString(payload.name) ?? asString(payload.goalName) ?? "goal",
      value: asNumber(payload.value),
      path: asString(payload.path) ?? asString(payload.pagePath),
      timestamp,
      metadata: toJsonValue(payload),
    },
  });

  await incrementDailyMetric("goals", timestamp);
}

export async function getStats() {
  return getStatsByRange();
}

export async function getSessionsCount(rangeInput: StatsRangeInput = {}) {
  const range = resolveDateRange(rangeInput);
  const result = await prisma.dailyStats.aggregate({
    where: toDailyWhere(range),
    _sum: { sessions: true },
  });

  return result._sum.sessions ?? 0;
}

export async function getPageViewsCount(rangeInput: StatsRangeInput = {}) {
  const range = resolveDateRange(rangeInput);
  const result = await prisma.dailyStats.aggregate({
    where: toDailyWhere(range),
    _sum: { pageViews: true },
  });

  return result._sum.pageViews ?? 0;
}

export async function getPingsCount(rangeInput: StatsRangeInput = {}) {
  const range = resolveDateRange(rangeInput);
  const result = await prisma.dailyStats.aggregate({
    where: toDailyWhere(range),
    _sum: { pings: true },
  });

  return result._sum.pings ?? 0;
}

export async function getClicksCount(rangeInput: StatsRangeInput = {}) {
  const range = resolveDateRange(rangeInput);
  const result = await prisma.dailyStats.aggregate({
    where: toDailyWhere(range),
    _sum: { clicks: true },
  });

  return result._sum.clicks ?? 0;
}

export async function getGoalsCount(rangeInput: StatsRangeInput = {}) {
  const range = resolveDateRange(rangeInput);
  const result = await prisma.dailyStats.aggregate({
    where: toDailyWhere(range),
    _sum: { goals: true },
  });

  return result._sum.goals ?? 0;
}

export async function getStatsByRange(rangeInput: StatsRangeInput = {}) {
  // Keep these queries sequential in serverless environments to avoid
  // connection contention/hangs with pooled adapters.
  const sessions = await getSessionsCount(rangeInput);
  const pageViews = await getPageViewsCount(rangeInput);
  const pings = await getPingsCount(rangeInput);
  const clicks = await getClicksCount(rangeInput);
  const goals = await getGoalsCount(rangeInput);

  return {
    startedAt,
    totals: {
      sessions,
      pageViews,
      pings,
      clicks,
      goals,
    },
  };
}

export async function getReportOverview(rangeInput: StatsRangeInput = {}) {
  const range = resolveDateRange(rangeInput);
  const [sessions, pageViews, pings, clicks, goals, durationAgg] = await Promise.all([
    getSessionsCount(rangeInput),
    getPageViewsCount(rangeInput),
    getPingsCount(rangeInput),
    getClicksCount(rangeInput),
    getGoalsCount(rangeInput),
    prisma.session.aggregate({
      where: range
        ? {
            startTime: {
              gte: range.gte,
              lte: range.lte,
            },
          }
        : undefined,
      _avg: { duration: true },
      _max: { duration: true },
    }),
  ]);

  return {
    totals: {
      sessions,
      pageViews,
      pings,
      clicks,
      goals,
    },
    engagement: {
      clickThroughRate: pageViews > 0 ? Number((clicks / pageViews).toFixed(4)) : 0,
      goalsPerSession: sessions > 0 ? Number((goals / sessions).toFixed(4)) : 0,
      avgSessionDuration: Math.round(durationAgg._avg.duration ?? 0),
      maxSessionDuration: durationAgg._max.duration ?? 0,
    },
  };
}

export async function getReportTimeseries(
  rangeInput: StatsRangeInput = {},
  metric?: ReportMetric,
) {
  const rows = await prisma.dailyStats.findMany({
    where: toDailyWhere(resolveDateRange(rangeInput)),
    orderBy: { date: "asc" },
    select: {
      date: true,
      sessions: true,
      pageViews: true,
      pings: true,
      clicks: true,
      goals: true,
    },
  });

  if (metric) {
    return rows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      value: row[metric],
    }));
  }

  return rows.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    sessions: row.sessions,
    pageViews: row.pageViews,
    pings: row.pings,
    clicks: row.clicks,
    goals: row.goals,
  }));
}

export async function getReportTopLinks(rangeInput: StatsRangeInput = {}, limit = 20) {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const range = resolveDateRangeOrAll(rangeInput);

  const rows = await prisma.$queryRaw<
    Array<{ label: string | null; url: string | null; clicks: number }>
  >(
    Prisma.sql`
      SELECT
        COALESCE(NULLIF(c.metadata->>'label', ''), NULLIF(c.element_text, ''), NULLIF(c.element_id, ''), c.page_path) AS label,
        NULLIF(c.metadata->>'url', '') AS url,
        COUNT(*)::int AS clicks
      FROM clicks c
      WHERE c.timestamp >= ${range.gte} AND c.timestamp <= ${range.lte}
        AND COALESCE(c.metadata->>'kind', '') IN ('social', 'link-card')
      GROUP BY 1, 2
      ORDER BY clicks DESC
      LIMIT ${safeLimit}
    `,
  );

  return rows.map((row) => ({
    label: row.label ?? "unknown",
    url: row.url ?? null,
    clicks: Number(row.clicks),
  }));
}

export async function getReportTopSetupItems(rangeInput: StatsRangeInput = {}, limit = 20) {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const range = resolveDateRangeOrAll(rangeInput);

  const rows = await prisma.$queryRaw<Array<{ item: string | null; clicks: number }>>(
    Prisma.sql`
      SELECT
        COALESCE(NULLIF(c.metadata->>'label', ''), NULLIF(c.element_text, ''), 'unknown') AS item,
        COUNT(*)::int AS clicks
      FROM clicks c
      WHERE c.timestamp >= ${range.gte} AND c.timestamp <= ${range.lte}
        AND COALESCE(c.metadata->>'kind', '') = 'setup'
      GROUP BY 1
      ORDER BY clicks DESC
      LIMIT ${safeLimit}
    `,
  );

  return rows.map((row) => ({
    item: row.item ?? "unknown",
    clicks: Number(row.clicks),
  }));
}

export async function getReportBaseAccesses(rangeInput: StatsRangeInput = {}, basePath = "/") {
  const range = resolveDateRangeOrAll(rangeInput);

  const rows = await prisma.$queryRaw<Array<{ accesses: number }>>(
    Prisma.sql`
      SELECT COUNT(*)::int AS accesses
      FROM page_views p
      WHERE p.timestamp >= ${range.gte}
        AND p.timestamp <= ${range.lte}
        AND p.path = ${basePath}
    `,
  );

  return Number(rows[0]?.accesses ?? 0);
}

export async function getReportButtonClicks(rangeInput: StatsRangeInput = {}) {
  const range = resolveDateRangeOrAll(rangeInput);

  const rows = await prisma.$queryRaw<Array<{ clicks: number }>>(
    Prisma.sql`
      SELECT COUNT(*)::int AS clicks
      FROM clicks c
      WHERE c.timestamp >= ${range.gte}
        AND c.timestamp <= ${range.lte}
    `,
  );

  return Number(rows[0]?.clicks ?? 0);
}

export async function getReportPages(rangeInput: StatsRangeInput = {}, limit = 20) {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const range = resolveDateRangeOrAll(rangeInput);

  const rows = await prisma.$queryRaw<
    Array<{ path: string; views: number; sessions: number }>
  >(
    Prisma.sql`
      SELECT
        p.path AS path,
        COUNT(*)::int AS views,
        COUNT(DISTINCT p.session_id)::int AS sessions
      FROM page_views p
      WHERE p.timestamp >= ${range.gte} AND p.timestamp <= ${range.lte}
      GROUP BY p.path
      ORDER BY views DESC
      LIMIT ${safeLimit}
    `,
  );

  return rows.map((row) => ({
    path: row.path,
    views: Number(row.views),
    sessions: Number(row.sessions),
  }));
}

export async function getReportDevices(rangeInput: StatsRangeInput = {}) {
  const range = resolveDateRangeOrAll(rangeInput);

  const rows = await prisma.$queryRaw<Array<{ device: string; sessions: number }>>(
    Prisma.sql`
      SELECT
        CASE
          WHEN s.device_type IS NOT NULL AND s.device_type <> '' THEN LOWER(s.device_type)
          WHEN s.user_agent IS NULL OR s.user_agent = '' THEN 'unknown'
          WHEN s.user_agent ILIKE '%ipad%' OR s.user_agent ILIKE '%tablet%' THEN 'tablet'
          WHEN s.user_agent ILIKE '%mobile%' OR s.user_agent ILIKE '%android%' OR s.user_agent ILIKE '%iphone%' THEN 'mobile'
          ELSE 'desktop'
        END AS device,
        COUNT(*)::int AS sessions
      FROM sessions s
      WHERE s.start_time >= ${range.gte} AND s.start_time <= ${range.lte}
      GROUP BY 1
      ORDER BY sessions DESC
    `,
  );

  return rows.map((row) => ({
    device: row.device,
    sessions: Number(row.sessions),
  }));
}

export async function getReportTopDevice(rangeInput: StatsRangeInput = {}) {
  const devices = await getReportDevices(rangeInput);
  const top = devices[0];

  return top ?? { device: "unknown", sessions: 0 };
}

export async function getReportCities(rangeInput: StatsRangeInput = {}, limit = 20) {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const range = resolveDateRangeOrAll(rangeInput);

  const rows = await prisma.$queryRaw<Array<{ city: string; sessions: number }>>(
    Prisma.sql`
      SELECT
        COALESCE(NULLIF(s.city, ''), 'unknown') AS city,
        COUNT(*)::int AS sessions
      FROM sessions s
      WHERE s.start_time >= ${range.gte} AND s.start_time <= ${range.lte}
      GROUP BY 1
      ORDER BY sessions DESC
      LIMIT ${safeLimit}
    `,
  );

  return rows.map((row) => ({
    city: row.city,
    sessions: Number(row.sessions),
  }));
}

export async function getReportSessionDuration(rangeInput: StatsRangeInput = {}) {
  const range = resolveDateRangeOrAll(rangeInput);

  const stats = await prisma.$queryRaw<
    Array<{
      avgDuration: number | null;
      maxDuration: number | null;
      minDuration: number | null;
      sessions: number;
    }>
  >(
    Prisma.sql`
      SELECT
        ROUND(AVG(s.duration))::int AS "avgDuration",
        MAX(s.duration)::int AS "maxDuration",
        MIN(s.duration)::int AS "minDuration",
        COUNT(*)::int AS sessions
      FROM sessions s
      WHERE s.start_time >= ${range.gte} AND s.start_time <= ${range.lte}
    `,
  );

  const row = stats[0];
  return {
    avgDuration: Number(row?.avgDuration ?? 0),
    maxDuration: Number(row?.maxDuration ?? 0),
    minDuration: Number(row?.minDuration ?? 0),
    sessions: Number(row?.sessions ?? 0),
  };
}

export async function upsertAdminUser(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const passwordHash = hashPassword(password);

  return prisma.adminUser.upsert({
    where: { email: normalizedEmail },
    update: {
      passwordHash,
      isActive: true,
    },
    create: {
      email: normalizedEmail,
      passwordHash,
    },
  });
}

export async function verifyAdminCredentials(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);

  const adminUser = await prisma.adminUser.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      isActive: true,
    },
  });

  if (!adminUser || !adminUser.isActive) {
    return null;
  }

  const isPasswordValid = verifyPassword(password, adminUser.passwordHash);
  if (!isPasswordValid) {
    return null;
  }

  return { id: adminUser.id, email: adminUser.email };
}

export async function createAdminSession(token: string, adminUserId: number) {
  await prisma.adminSession.create({
    data: { id: token, adminUserId },
  });
}

export async function verifyAdminToken(token: string) {
  const session = await prisma.adminSession.findUnique({
    where: { id: token },
    select: { id: true },
  });

  return Boolean(session);
}

export async function logoutAdmin(token: string) {
  await prisma.adminSession.deleteMany({
    where: { id: token },
  });
}
