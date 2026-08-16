export type PairedHost = {
  id: string;
  name: string;
  host: string;
  port: number;
  token: string;
  addedAt: number;
};

const KEY = "helm.hosts";

export function loadHosts(): PairedHost[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PairedHost[]) : [];
  } catch {
    return [];
  }
}

export function saveHosts(hosts: PairedHost[]): void {
  localStorage.setItem(KEY, JSON.stringify(hosts));
}

export function addHost(host: PairedHost): void {
  const hosts = loadHosts();
  hosts.push(host);
  saveHosts(hosts);
}

export function removeHost(id: string): void {
  saveHosts(loadHosts().filter((h) => h.id !== id));
}

const ACTIVE_KEY = "helm.activeHost";
export function getActiveHostId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}
export function setActiveHostId(id: string | null): void {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}
