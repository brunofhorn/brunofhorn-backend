type AnyObject = Record<string, unknown>;

const sessions: AnyObject[] = [];
const pageViews: AnyObject[] = [];
const pings: AnyObject[] = [];
const clicks: AnyObject[] = [];
const goals: AnyObject[] = [];
const adminSessions = new Set<string>();

let startedAt = new Date().toISOString();

function withTrackedAt(payload: AnyObject): AnyObject {
  return {
    ...payload,
    trackedAt: new Date().toISOString(),
  };
}

export function initDb() {
  sessions.length = 0;
  pageViews.length = 0;
  pings.length = 0;
  clicks.length = 0;
  goals.length = 0;
  adminSessions.clear();
  startedAt = new Date().toISOString();
}

export function trackSession(payload: AnyObject) {
  sessions.push(withTrackedAt(payload));
}

export function trackPageView(payload: AnyObject) {
  pageViews.push(withTrackedAt(payload));
}

export function trackPing(payload: AnyObject) {
  pings.push(withTrackedAt(payload));
}

export function trackClick(payload: AnyObject) {
  clicks.push(withTrackedAt(payload));
}

export function trackGoal(payload: AnyObject) {
  goals.push(withTrackedAt(payload));
}

export function getStats() {
  return {
    startedAt,
    totals: {
      sessions: sessions.length,
      pageViews: pageViews.length,
      pings: pings.length,
      clicks: clicks.length,
      goals: goals.length,
    },
  };
}

export function createAdminSession(token: string) {
  adminSessions.add(token);
}

export function verifyAdminToken(token: string) {
  return adminSessions.has(token);
}

export function logoutAdmin(token: string) {
  adminSessions.delete(token);
}
