import { describe, expect, test } from "bun:test";
import { takeFrames } from "../src/sse";

describe("takeFrames", () => {
  test("extracts data from complete frames", () => {
    const { data, rest } = takeFrames('event: apps\ndata: {"a":1}\n\nevent: apps\ndata: {"a":2}\n\n');
    expect(data).toEqual(['{"a":1}', '{"a":2}']);
    expect(rest).toBe("");
  });

  test("ignores comment-only frames like heartbeats", () => {
    const { data } = takeFrames(": connected\n\n: ping\n\n");
    expect(data).toEqual([]);
  });

  test("keeps an unfinished frame for the next chunk", () => {
    const first = takeFrames('event: ports\ndata: {"po');
    expect(first.data).toEqual([]);
    const second = takeFrames(first.rest + 'rts":[]}\n\n');
    expect(second.data).toEqual(['{"ports":[]}']);
    expect(second.rest).toBe("");
  });

  test("handles a frame boundary split between chunks", () => {
    const first = takeFrames('data: {"x":1}\n');
    expect(first.data).toEqual([]);
    const second = takeFrames(first.rest + '\ndata: {"x":2}\n\n');
    expect(second.data).toEqual(['{"x":1}', '{"x":2}']);
  });

  test("joins multi-line data fields", () => {
    expect(takeFrames("data: line1\ndata: line2\n\n").data).toEqual(["line1\nline2"]);
  });

  test("survives a stream fed one character at a time", () => {
    const input = 'event: system\ndata: {"v":1}\n\n: ping\n\nevent: system\ndata: {"v":2}\n\n';
    const out: string[] = [];
    let buf = "";
    for (const ch of input) {
      const { data, rest } = takeFrames(buf + ch);
      buf = rest;
      out.push(...data);
    }
    expect(out).toEqual(['{"v":1}', '{"v":2}']);
  });
});
