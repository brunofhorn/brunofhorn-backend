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
