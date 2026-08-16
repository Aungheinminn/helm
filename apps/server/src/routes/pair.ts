import { Elysia, t } from "elysia";
import { addDevice } from "../store";
import { consumePairingCode } from "../pairing";
import { getHostName } from "../util/network";

export const pairRoutes = new Elysia({ prefix: "/pair" }).post(
  "/",
  async ({ body, status }) => {
    if (!consumePairingCode(body.code)) {
      return status(401, { error: "invalid or expired code" });
    }
    const device = await addDevice(body.name);
    return {
      token: device.token,
      deviceId: device.id,
      host: getHostName(),
    };
  },
  { body: t.Object({ code: t.String(), name: t.String() }) },
);
