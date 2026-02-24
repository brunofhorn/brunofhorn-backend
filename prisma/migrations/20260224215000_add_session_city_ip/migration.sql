ALTER TABLE "sessions" ADD COLUMN "city" TEXT;
ALTER TABLE "sessions" ADD COLUMN "ip_address" TEXT;

CREATE INDEX "sessions_city_idx" ON "sessions"("city");
