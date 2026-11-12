import { useEffect, useState } from "react";
import { reportStatus } from "./api";
import type { PairedHost } from "./store";

export type Topic = "apps" | "ports" | "system";

const RETRY_STEPS_MS = [1000, 2000, 5000, 10000];

// Reads the server's /events stream with fetch rather than EventSource, because
// EventSource can't send an Authorization header and the token would otherwise
// have to go in the URL.
async function readStream(
  host: PairedHost,
  topic: Topic,
  signal: AbortSignal,
  onOpen: () => void,
  onData: (json: string) => void,
): Promise<void> {
  const res = await fetch(`http://${host.host}:${host.port}/events?topics=${topic}`, {
    headers: { Authorization: `Bearer ${host.token}`, Accept: "text/event-stream" },
    signal,
  });
  reportStatus(res.status);
  if (!res.ok || !res.body) throw new Error(`live updates failed: ${res.status}`);
  onOpen();

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const data = frame
        .split("\n")
        .filter((l) => l.startsWith("data: "))
        .map((l) => l.slice(6))
        .join("\n");
      if (data) onData(data);
    }
  }
}

/**
 * Subscribes to one live topic for as long as the component is mounted and the
 * page is visible. Hidden pages drop the connection so the Mac stops collecting
 * for a phone that's in a pocket.
 */
export function useLive<T>(host: PairedHost, topic: Topic) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let controller: AbortController | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let disposed = false;

    const connect = () => {
      if (disposed || document.visibilityState !== "visible" || controller) return;
      const c = new AbortController();
      controller = c;
      readStream(
        host,
        topic,
        c.signal,
        () => {
          attempt = 0;
          setError(null);
        },
        (json) => setData(JSON.parse(json) as T),
      )
        .catch((e) => {
          if (!c.signal.aborted) setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (controller === c) controller = null;
          if (disposed || c.signal.aborted) return;
          const delay = RETRY_STEPS_MS[Math.min(attempt++, RETRY_STEPS_MS.length - 1)];
          retryTimer = setTimeout(connect, delay);
        });
    };

    const disconnect = () => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      controller?.abort();
      controller = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        attempt = 0;
        connect();
      } else {
        disconnect();
      }
    };

    setData(null);
    connect();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      disconnect();
    };
  }, [host.id, host.host, host.port, host.token, topic]);

  return { data, error };
}
