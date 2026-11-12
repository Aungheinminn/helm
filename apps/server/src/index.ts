import { staticPlugin } from "@elysiajs/static";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createApp } from "./app";
import { config } from "./config";
import { applyLaunchSettings } from "./routes/system";

export type { App } from "./app";

const app = createApp();
applyLaunchSettings();

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
