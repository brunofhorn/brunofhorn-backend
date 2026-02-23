import { FastifyInstance } from "fastify";
import { healthRoutes } from "./health.route";

export async function registerRoutes(app: FastifyInstance) {
  await app.register(healthRoutes);
}