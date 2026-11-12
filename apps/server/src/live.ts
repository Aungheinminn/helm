// Shared live-update hub. Each topic's collector runs only while at least one
// client is subscribed, once per interval no matter how many clients there are,
// and subscribers only hear about it when the result actually changed.

export type Topic = "apps" | "ports" | "system";
export const TOPICS: readonly Topic[] = ["apps", "ports", "system"];

type Listener = (topic: Topic, json: string) => void;

type TopicState = {
  intervalMs: number;
  collect: () => Promise<unknown>;
  listeners: Set<Listener>;
  timer: ReturnType<typeof setInterval> | null;
  last: string | null;
  inFlight: boolean;
  rerun: boolean;
};

const topics = new Map<Topic, TopicState>();

export function registerTopic(
  topic: Topic,
  intervalMs: number,
  collect: () => Promise<unknown>,
): void {
  topics.set(topic, {
    intervalMs,
    collect,
    listeners: new Set(),
    timer: null,
    last: null,
    inFlight: false,
    rerun: false,
  });
}

async function tick(topic: Topic): Promise<void> {
  const s = topics.get(topic);
  if (!s || s.listeners.size === 0) return;
  // A slow lsof must not stack up overlapping runs; remember that a fresh
  // result was wanted and run once more when this one finishes.
  if (s.inFlight) {
    s.rerun = true;
    return;
  }
  s.inFlight = true;
  try {
    const json = JSON.stringify(await s.collect());
    if (json !== s.last && s.listeners.size > 0) {
      s.last = json;
      for (const l of s.listeners) l(topic, json);
    }
  } catch (e) {
    console.error(`live: ${topic} collect failed`, e);
  } finally {
    s.inFlight = false;
    if (s.rerun) {
      s.rerun = false;
      void tick(topic);
    }
  }
}

export function subscribe(topic: Topic, listener: Listener): () => void {
  const s = topics.get(topic);
  if (!s) throw new Error(`unknown topic ${topic}`);
  s.listeners.add(listener);
  if (s.last !== null) listener(topic, s.last);
  if (!s.timer) {
    s.timer = setInterval(() => void tick(topic), s.intervalMs);
    void tick(topic);
  }
  return () => {
    s.listeners.delete(listener);
    if (s.listeners.size === 0 && s.timer) {
      clearInterval(s.timer);
      s.timer = null;
      // Drop the cached value so the next subscriber after an idle gap gets a
      // fresh reading rather than whatever was true when everyone left.
      s.last = null;
    }
  };
}

// Call after an action that changes a topic's state so watchers see it now
// instead of on the next interval. Optional follow-up catches slow changes,
// like an app that takes a moment to show up in the process list.
export function refresh(topic: Topic, followUpMs?: number): void {
  void tick(topic);
  if (followUpMs) setTimeout(() => void tick(topic), followUpMs);
}
