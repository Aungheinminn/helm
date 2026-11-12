import { Elysia, t } from "elysia";
import { deviceAuth } from "../auth";
import { listDevices, touchDevice } from "../store";
import { subscribe, TOPICS, type Topic } from "../live";

const HEARTBEAT_MS = 20_000;

export const eventsRoutes = new Elysia({ prefix: "/events" }).use(deviceAuth).get(
  "/",
  ({ query, device, request, status }) => {
    const wanted = query.topics.split(",").map((s) => s.trim());
    const bad = wanted.filter((w) => !TOPICS.includes(w as Topic));
    if (wanted.length === 0 || bad.length > 0) {
      return status(400, { error: `unknown topics: ${bad.join(",")}` });
    }

    const encoder = new TextEncoder();
    let cleanup = () => {};

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const send = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            cleanup();
          }
        };

        const unsubs = (wanted as Topic[]).map((topic) =>
          subscribe(topic, (tp, json) => send(`event: ${tp}\ndata: ${json}\n\n`)),
        );

        // The token is only checked when the stream opens, so the heartbeat also
        // re-checks it: revoking a phone in the tray cuts its live stream too.
        const heartbeat = setInterval(async () => {
          const stillPaired = (await listDevices()).some((d) => d.id === device.id);
          if (!stillPaired) {
            cleanup();
            return;
          }
          await touchDevice(device.id);
          send(": ping\n\n");
        }, HEARTBEAT_MS);

        cleanup = () => {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          unsubs.forEach((u) => u());
          try {
            controller.close();
          } catch {
            /* already closed by the client */
          }
        };

        request.signal.addEventListener("abort", () => cleanup());
        send(": connected\n\n");
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  },
  { query: t.Object({ topics: t.String() }) },
);
