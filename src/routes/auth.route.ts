import { randomUUID } from "node:crypto";
import { FastifyInstance } from "fastify";
import { createAdminSession, logoutAdmin, verifyAdminCredentials } from "../lib/db";

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { email?: string; password?: string } }>("/api/auth/login", async (request, reply) => {
    const email = request.body?.email?.trim();
    const password = request.body?.password;

    if (!email || !password) {
      reply.status(400);
      return { error: "Email e senha sao obrigatorios." };
    }

    const admin = await verifyAdminCredentials(email, password);
    if (!admin) {
      reply.status(401);
      return { error: "Credenciais invalidas." };
    }

    const token = randomUUID();
    await createAdminSession(token, admin.id);

    return {
      token,
      user: {
        id: admin.id,
        email: admin.email,
      },
    };
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
