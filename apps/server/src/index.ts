import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { appsRoutes } from "./routes/apps";
import { portsRoutes } from "./routes/ports";
import { tmuxRoutes } from "./routes/tmux";
import { pairRoutes } from "./routes/pair";
import { adminRoutes } from "./routes/admin";
import { config } from "./config";

const app = new Elysia()
  .use(cors())
  .get("/health", () => ({ ok: true }))
  .use(appsRoutes)
  .use(portsRoutes)
  .use(tmuxRoutes)
  .use(pairRoutes)
  .use(adminRoutes);

if (config.staticDir && existsSync(join(config.staticDir, "index.html"))) {
  const indexPath = join(config.staticDir, "index.html");
  app
    .get("/", () => Bun.file(indexPath))
    .use(
      staticPlugin({
        assets: config.staticDir,
        prefix: "/",
        indexHTML: true,
      }),
    );
  console.log(`serving PWA from ${config.staticDir}`);
} else {
  console.log(`no PWA static dir; expected at ${config.staticDir ?? "<unset>"}`);
}

export type App = typeof app;

const server = app.listen(
  { port: config.port, hostname: "0.0.0.0" },
  ({ hostname, port }) => {
    console.log(`helm server ready on http://${hostname}:${port}`);
  },
);

const shutdown = () => {
  console.log("helm server shutting down");
  server.stop();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
