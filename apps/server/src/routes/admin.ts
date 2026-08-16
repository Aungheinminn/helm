import { Elysia } from "elysia";
import { adminAuth } from "../auth";
import { listDevices, revokeDevice } from "../store";
import { getPairingCode, issuePairingCode } from "../pairing";
import { getLanIp, getHostName } from "../util/network";
import { config } from "../config";

export const adminRoutes = new Elysia({ prefix: "/_admin" })
  .use(adminAuth)
  .get("/state", async () => {
    const pairing = getPairingCode();
    const devices = (await listDevices()).map(({ token, ...rest }) => rest);
    return {
      host: getLanIp(),
      hostname: getHostName(),
      port: config.port,
      pairing,
      devices,
    };
  })
  .post("/pairing/rotate", () => issuePairingCode())
  .delete("/devices/:id", async ({ params }) => {
    await revokeDevice(params.id);
    return { ok: true };
  });
