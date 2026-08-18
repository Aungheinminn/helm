import { app, Tray, Menu, BrowserWindow, nativeImage, ipcMain, screen, dialog } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import QRCode from "qrcode";

const PORT = 8787;
const ADMIN_TOKEN = randomBytes(32).toString("base64url");
const BASE_URL = `http://127.0.0.1:${PORT}`;

let tray: Tray | null = null;
let configWindow: BrowserWindow | null = null;
let serverProc: ChildProcess | null = null;

app.dock?.hide();

app.whenReady().then(async () => {
  try {
    await startServer();
  } catch (err) {
    dialog.showErrorBox("Helm", `Failed to start server: ${String(err)}`);
    app.quit();
    return;
  }

  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle("⛵");
  tray.setToolTip("Helm");
  tray.on("click", () => toggleConfigWindow());
  tray.on("right-click", () => showContextMenu());

  registerIpc();
});

app.on("window-all-closed", () => {
  // stay running as a tray-only app
});

app.on("before-quit", stopServer);

async function startServer(): Promise<void> {
  const serverEntry = join(app.getAppPath(), "..", "server", "src", "index.ts");

  const staticDir = join(app.getAppPath(), "..", "remote", "dist");

  serverProc = spawn("bun", ["run", "--hot", serverEntry], {
    env: {
      ...process.env,
      HELM_PORT: String(PORT),
      HELM_ADMIN_TOKEN: ADMIN_TOKEN,
      HELM_DATA_DIR: join(homedir(), ".helm"),
      HELM_STATIC_DIR: staticDir,
    },
    stdio: ["ignore", "inherit", "inherit"],
  });

  serverProc.on("exit", (code) => {
    console.error(`helm server exited with code ${code}`);
    serverProc = null;
  });

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server didn't come up in 5s");
}

function stopServer() {
  if (!serverProc) return;
  serverProc.kill("SIGTERM");
  setTimeout(() => serverProc?.kill("SIGKILL"), 2000);
}

async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${ADMIN_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
}

function showContextMenu() {
  const menu = Menu.buildFromTemplate([
    { label: `Listening on port ${PORT}`, enabled: false },
    { type: "separator" },
    { label: "Open Helm…", click: () => toggleConfigWindow(true) },
    { type: "separator" },
    { label: "Quit Helm", click: () => app.quit() },
  ]);
  tray?.popUpContextMenu(menu);
}

function toggleConfigWindow(forceShow = false) {
  if (configWindow) {
    if (forceShow) {
      configWindow.show();
      configWindow.focus();
      return;
    }
    if (configWindow.isVisible()) {
      configWindow.hide();
    } else {
      configWindow.show();
      configWindow.focus();
    }
    return;
  }

  const disp = screen.getPrimaryDisplay();
  const width = 780;
  const height = 520;
  const x = Math.round(disp.workArea.x + (disp.workArea.width - width) / 2);
  const y = Math.round(disp.workArea.y + (disp.workArea.height - height) / 2);

  configWindow = new BrowserWindow({
    width,
    height,
    minWidth: 640,
    minHeight: 440,
    x,
    y,
    title: "Helm",
    titleBarStyle: "hiddenInset",
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  configWindow.loadFile(join(__dirname, "tray", "index.html"));
  configWindow.once("ready-to-show", () => configWindow?.show());
  configWindow.on("closed", () => {
    configWindow = null;
  });
}

function registerIpc() {
  ipcMain.handle("state", async () => {
    const res = await adminFetch("/_admin/state");
    if (!res.ok) throw new Error(`server /_admin/state ${res.status}`);
    const state = (await res.json()) as {
      host: string;
      hostname: string;
      port: number;
      pairing: { code: string; expiresAt: number };
      devices: Array<{ id: string; name: string; createdAt: number; lastSeenAt: number }>;
    };
    const payload = JSON.stringify({ host: state.host, port: state.port, code: state.pairing.code });
    const qrSvg = await QRCode.toString(payload, { type: "svg", margin: 1, width: 200 });
    return {
      ...state,
      pairing: { ...state.pairing, payload, qrSvg },
    };
  });

  ipcMain.handle("rotate-code", async () => {
    const res = await adminFetch("/_admin/pairing/rotate", { method: "POST" });
    return res.json();
  });

  ipcMain.handle("revoke", async (_e, id: string) => {
    await adminFetch(`/_admin/devices/${id}`, { method: "DELETE" });
    return { ok: true };
  });

  ipcMain.handle("quit", () => app.quit());
}
