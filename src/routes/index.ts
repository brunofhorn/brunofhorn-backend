import { FastifyInstance } from "fastify";
import { authRoutes } from "./auth.route";
import { healthRoutes } from "./health.route";
import { reportsRoutes } from "./reports.route";
import { statsRoutes } from "./stats.route";
import { trackRoutes } from "./track.route";

export async function registerRoutes(app: FastifyInstance) {
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(trackRoutes);
  await app.register(statsRoutes);
  await app.register(reportsRoutes);
}
