import { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    return {
      status: "ok",
      buildTag: "stats-debug-v1",
      timestamp: new Date().toISOString(),
    };
  });
}