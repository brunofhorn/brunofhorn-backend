CREATE TABLE "daily_stats" (
  "date" DATE NOT NULL,
  "sessions" INTEGER NOT NULL DEFAULT 0,
  "page_views" INTEGER NOT NULL DEFAULT 0,
  "pings" INTEGER NOT NULL DEFAULT 0,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "goals" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "daily_stats_pkey" PRIMARY KEY ("date")
);

INSERT INTO "daily_stats" ("date", "sessions", "created_at", "updated_at")
SELECT DATE_TRUNC('day', "start_time")::date, COUNT(*), NOW(), NOW()
FROM "sessions"
GROUP BY 1
ON CONFLICT ("date")
DO UPDATE SET
  "sessions" = "daily_stats"."sessions" + EXCLUDED."sessions",
  "updated_at" = NOW();

INSERT INTO "daily_stats" ("date", "page_views", "created_at", "updated_at")
SELECT DATE_TRUNC('day', "timestamp")::date, COUNT(*), NOW(), NOW()
FROM "page_views"
GROUP BY 1
ON CONFLICT ("date")
DO UPDATE SET
  "page_views" = "daily_stats"."page_views" + EXCLUDED."page_views",
  "updated_at" = NOW();

INSERT INTO "daily_stats" ("date", "pings", "created_at", "updated_at")
SELECT DATE_TRUNC('day', "timestamp")::date, COUNT(*), NOW(), NOW()
FROM "pings"
GROUP BY 1
ON CONFLICT ("date")
DO UPDATE SET
  "pings" = "daily_stats"."pings" + EXCLUDED."pings",
  "updated_at" = NOW();

INSERT INTO "daily_stats" ("date", "clicks", "created_at", "updated_at")
SELECT DATE_TRUNC('day', "timestamp")::date, COUNT(*), NOW(), NOW()
FROM "clicks"
GROUP BY 1
ON CONFLICT ("date")
DO UPDATE SET
  "clicks" = "daily_stats"."clicks" + EXCLUDED."clicks",
  "updated_at" = NOW();

INSERT INTO "daily_stats" ("date", "goals", "created_at", "updated_at")
SELECT DATE_TRUNC('day', "timestamp")::date, COUNT(*), NOW(), NOW()
FROM "goals"
GROUP BY 1
ON CONFLICT ("date")
DO UPDATE SET
  "goals" = "daily_stats"."goals" + EXCLUDED."goals",
  "updated_at" = NOW();
