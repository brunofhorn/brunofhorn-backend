import { randomUUID } from "node:crypto";
import { FastifyInstance } from "fastify";
import { createAdminSession, logoutAdmin } from "../lib/db";

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { password?: string } }>("/api/auth/login", async (request) => {
    const _password = request.body?.password;

    const token = randomUUID();
    await createAdminSession(token);

    return { token };
  });

  app.post("/api/auth/logout", async (request) => {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      await logoutAdmin(token);
    }

    return { success: true };
  });
}
