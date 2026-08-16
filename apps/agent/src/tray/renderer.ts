interface Device { id: string; name: string; createdAt: number; lastSeenAt: number }
interface Pairing { code: string; expiresAt: number; payload: string; qrSvg: string }
interface State {
  host: string;
  hostname: string;
  port: number;
  pairing: Pairing;
  devices: Device[];
}

interface HelmBridge {
  state(): Promise<State>;
  rotateCode(): Promise<{ code: string; expiresAt: number }>;
  revoke(id: string): Promise<{ ok: boolean }>;
  quit(): Promise<void>;
}

const helm: HelmBridge = (window as unknown as { helm: HelmBridge }).helm;

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]));
}

function activateSection(name: string) {
  document.querySelectorAll<HTMLElement>("main > section").forEach((s) => {
    s.hidden = s.id !== `section-${name}`;
  });
  document.querySelectorAll<HTMLButtonElement>("aside nav button").forEach((b) => {
    b.classList.toggle("active", b.dataset.section === name);
  });
}

async function render() {
  const s = await helm.state();

  document.getElementById("qr")!.innerHTML = s.pairing.qrSvg;
  document.getElementById("qrPayload")!.textContent = s.pairing.payload;
  document.getElementById("endpoint")!.textContent = `${s.host}:${s.port}`;
  document.getElementById("hostname")!.textContent = s.hostname;

  const list = document.getElementById("devices")!;
  if (s.devices.length === 0) {
    list.innerHTML = `<div class="empty">No devices paired yet</div>`;
    return;
  }
  list.innerHTML = s.devices
    .map(
      (d) => `
        <div class="row">
          <div>
            <div class="name">${escapeHtml(d.name)}</div>
            <div class="seen">last seen ${timeAgo(d.lastSeenAt)}</div>
          </div>
          <button class="danger" data-revoke="${d.id}">Revoke</button>
        </div>`,
    )
    .join("");
  list.querySelectorAll<HTMLButtonElement>("[data-revoke]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await helm.revoke(btn.dataset.revoke!);
      render();
    });
  });
}

document.querySelectorAll<HTMLButtonElement>("aside nav button").forEach((btn) => {
  btn.addEventListener("click", () => activateSection(btn.dataset.section!));
});

document.getElementById("rotate")!.addEventListener("click", async () => {
  await helm.rotateCode();
  render();
});

document.getElementById("quit")!.addEventListener("click", () => helm.quit());

render();
setInterval(render, 5000);
