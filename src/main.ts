import { buildApp } from "./server/app";
import { env } from "./config/env";
import { initDb } from "./lib/db";
import { registerRoutes } from "./routes";

async function start() {
  initDb();

  const app = buildApp();

  await registerRoutes(app);

  try {
    await app.listen({ host: env.host, port: env.port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
