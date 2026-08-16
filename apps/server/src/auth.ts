import { Elysia } from "elysia";
import { findByToken, touchDevice, type Device } from "./store";
import { config } from "./config";

export const deviceAuth = new Elysia({ name: "deviceAuth" }).derive(
  { as: "scoped" },
  async ({ headers, status }): Promise<{ device: Device }> => {
    const header = headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) throw status(401, { error: "missing token" });
    const device = await findByToken(token);
    if (!device) throw status(401, { error: "invalid token" });
    await touchDevice(device.id);
    return { device };
  },
);

export const adminAuth = new Elysia({ name: "adminAuth" }).onBeforeHandle(
  { as: "scoped" },
  ({ headers, status }) => {
    const header = headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (token !== config.adminToken) return status(401, { error: "unauthorized" });
  },
);
