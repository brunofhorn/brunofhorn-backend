import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";

type AnyObject = Record<string, unknown>;

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

async function ensureSession(sessionId: string, payload: AnyObject = {}) {
  const startTime = asDate(payload.startTime) ?? asDate(payload.timestamp) ?? new Date();
  const duration = asNumber(payload.duration) ?? 0;
  const lastPingTime = asDate(payload.lastPingTime) ?? asDate(payload.timestamp) ?? startTime;

  await prisma.session.upsert({
    where: { id: sessionId },
    update: {
      lastPingTime,
      duration,
      userAgent: asString(payload.userAgent),
      deviceType: asString(payload.deviceType),
      browser: asString(payload.browser),
      os: asString(payload.os),
      country: asString(payload.country),
    },
    create: {
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
}

export async function initDb() {
  await prisma.$connect();
}

export async function trackSession(payload: AnyObject) {
  const sessionId = resolveSessionId(payload);
  await ensureSession(sessionId, payload);
  return { sessionId };
}

export async function trackPageView(payload: AnyObject) {
  const sessionId = resolveSessionId(payload);
  await ensureSession(sessionId, payload);

  await prisma.pageView.create({
    data: {
      sessionId,
      path: asString(payload.path) ?? asString(payload.pagePath) ?? "/",
      timestamp: asDate(payload.timestamp) ?? new Date(),
      metadata: toJsonValue(payload),
    },
  });
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
}

export async function trackClick(payload: AnyObject) {
  const sessionId = resolveSessionId(payload);
  await ensureSession(sessionId, payload);

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
      timestamp: asDate(payload.timestamp) ?? new Date(),
      metadata: toJsonValue(payload),
    },
  });
}

export async function trackGoal(payload: AnyObject) {
  const maybeSessionId = asString(payload.sessionId) ?? asString(payload.session_id);

  if (maybeSessionId) {
    await ensureSession(maybeSessionId, payload);
  }

  await prisma.goal.create({
    data: {
      sessionId: maybeSessionId,
      name: asString(payload.name) ?? asString(payload.goalName) ?? "goal",
      value: asNumber(payload.value),
      path: asString(payload.path) ?? asString(payload.pagePath),
      timestamp: asDate(payload.timestamp) ?? new Date(),
      metadata: toJsonValue(payload),
    },
  });
}

export async function getStats() {
  const [sessions, pageViews, pings, clicks, goals] = await Promise.all([
    prisma.session.count(),
    prisma.pageView.count(),
    prisma.ping.count(),
    prisma.click.count(),
    prisma.goal.count(),
  ]);

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

export async function createAdminSession(token: string) {
  await prisma.adminSession.create({
    data: { id: token },
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
