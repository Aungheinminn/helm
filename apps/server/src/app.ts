import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { appsRoutes } from "./routes/apps";
import { portsRoutes } from "./routes/ports";
import { systemRoutes } from "./routes/system";
import { eventsRoutes } from "./routes/events";
import { pairRoutes } from "./routes/pair";
import { adminRoutes } from "./routes/admin";

export function createApp() {
  return new Elysia()
    .use(cors())
    .get("/health", () => ({ ok: true }))
    .use(appsRoutes)
    .use(portsRoutes)
    .use(systemRoutes)
    .use(eventsRoutes)
    .use(pairRoutes)
    .use(adminRoutes);
}

export type App = ReturnType<typeof createApp>;
